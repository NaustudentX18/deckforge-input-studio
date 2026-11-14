"""DeckForge auto-profiler: identify connected hardware and map it automatically.

Why this exists
---------------
A device's USB ids are not enough. Researched against upstream SDL on
2026-11-14:

* SDL's ``controller_list.h`` classifies ``20bc:5500`` -- the id a
  CRKD-labelled unit actually reported -- as ``k_eControllerType_PS3Controller``,
  a plain PS3 pad. That id belongs to the ShanWan bridge chip, not to CRKD.
* SDL's ``gamecontrollerdb.txt`` contains **no** rhythm-guitar entries at all
  (zero matches for guitar / rock band / riffmaster).

So for exactly the hardware DeckForge cares most about, the authoritative
mainstream database is wrong or silent. Identity therefore comes from three
layers, strongest evidence first:

1. **Capability fingerprint** -- what inputs the device physically reports. A
   guitar has a solo-fret row and no analog sticks; a drum kit has neither; a
   fightstick has 8 face buttons and no sticks. This is measured, not assumed.
2. **Identity table** -- the vendored SDL list, used to name and classify
   gamepads the fingerprint cannot distinguish.
3. **Name heuristics** -- last resort, for vendor strings.

The generated profile is then compiled through the same Steam VDF compiler the
rest of the app uses, so "auto" produces a real, loadable Steam Input config
rather than a private format.
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from .device_catalog import ControllerFamily, find_family, mode_for_position

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).resolve().parent / "data"
_IDENTITY_PATH = _DATA_DIR / "controller_ids.json"

# evdev bus types that mean "not a real plugged-in controller".
_VIRTUAL_BUS = 0x06
_BLUETOOTH_BUS = 0x05
_USB_BUS = 0x03

# Sources that indicate a rhythm-guitar body. Measured on a CRKD Les Paul Pro:
# the solo strip shows up as BTN_C/BTN_Z/BTN_THUMB/BTN_THUMB2 and there are no
# analog sticks at all.
_GUITAR_SOLO_BUTTONS = {"BTN_C", "BTN_Z", "BTN_THUMB", "BTN_THUMB2", "BTN_BASE", "BTN_BASE2"}

# Face buttons that make something a "pad" rather than a guitar/stick.
_PAD_FACE_BUTTONS = {"BTN_SOUTH", "BTN_EAST", "BTN_NORTH", "BTN_WEST"}

_identities_cache: Optional[dict[str, Any]] = None


def load_identities() -> dict[str, Any]:
    """Load the vendored identity table once."""
    global _identities_cache
    if _identities_cache is None:
        try:
            _identities_cache = json.loads(_IDENTITY_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            logger.warning("Identity table unavailable (%s); continuing without it", exc)
            _identities_cache = {"identities": {}, "guid_mappings": {}}
    return _identities_cache


def lookup_identity(vendor_id: int, product_id: int) -> Optional[dict[str, Any]]:
    """SDL's classification for a USB vendor/product pair, if it knows it."""
    key = f"{vendor_id:04x}:{product_id:04x}"
    return load_identities().get("identities", {}).get(key)


# ===================================================================
# Capability fingerprint
# ===================================================================

@dataclass
class Fingerprint:
    """What a device physically reports, reduced to the facts that matter."""
    buttons: set[str] = field(default_factory=set)
    axes: set[str] = field(default_factory=set)
    has_sticks: bool = False
    has_dpad: bool = False
    has_triggers: bool = False
    has_hat: bool = False
    solo_frets: set[str] = field(default_factory=set)
    face_buttons: int = 0
    button_count: int = 0
    axis_count: int = 0
    # Keyboard/hotkey devices report KEY_* codes; controllers report BTN_*.
    # Without this the media keys on a laptop match the "solo fret" pattern,
    # because BTN_C/BTN_Z/BTN_THUMB are also keyboard-scan codes.
    key_codes: int = 0
    rel_axes: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "buttons": sorted(self.buttons),
            "axes": sorted(self.axes),
            "has_sticks": self.has_sticks,
            "has_dpad": self.has_dpad,
            "has_triggers": self.has_triggers,
            "has_hat": self.has_hat,
            "solo_frets": sorted(self.solo_frets),
            "face_buttons": self.face_buttons,
            "button_count": self.button_count,
            "axis_count": self.axis_count,
            "key_codes": self.key_codes,
        }


def _flatten_caps(capabilities: dict[str, Any]) -> tuple[set[str], set[str]]:
    """Pull button and axis names out of a DeviceInfo capability map.

    Handles both the normalised ``EV_KEY``/``EV_ABS`` keys and the numeric keys
    older evdev versions produce.
    """
    buttons: set[str] = set()
    axes: set[str] = set()
    key_codes = 0
    rel_axes = 0
    for key, values in (capabilities or {}).items():
        if not isinstance(values, (list, tuple, set)):
            continue
        text = str(key)
        if text in ("EV_REL", "2"):
            rel_axes = len(values)
            continue
        if text not in ("EV_KEY", "EV_ABS", "1", "3"):
            continue
        bucket = axes if text in ("EV_ABS", "3") else buttons
        for value in values:
            name = value if isinstance(value, str) else (
                value[0] if isinstance(value, tuple) and value else str(value)
            )
            if not isinstance(name, str):
                continue
            if bucket is buttons and name.startswith("KEY_"):
                key_codes += 1
                continue
            bucket.add(name)
    return buttons, axes, key_codes, rel_axes


def fingerprint_device(device: Any) -> Fingerprint:
    """Reduce a DeviceInfo to a Fingerprint."""
    caps = getattr(device, "capabilities", {}) or {}
    buttons, axes, key_codes, rel_axes = _flatten_caps(caps)

    # A real analog-stick pad exposes a complete left pair AND a right pair.
    # Checking for "any two" is not enough: the measured CRKD guitar reports
    # ABS_X/ABS_Y (whammy/tilt wiring) but no ABS_RX/ABS_RY, and was being
    # mistaken for a gamepad because of it.
    left_stick = {"ABS_X", "ABS_Y"} <= axes
    right_stick = {"ABS_RX", "ABS_RY"} <= axes
    return Fingerprint(
        buttons=buttons,
        axes=axes,
        has_sticks=left_stick and right_stick,
        has_dpad=any(b.startswith("BTN_DPAD_") for b in buttons),
        has_triggers=bool({"BTN_TL2", "BTN_TR2"} & buttons),
        has_hat=any(a.startswith("ABS_HAT") for a in axes),
        solo_frets=_GUITAR_SOLO_BUTTONS & buttons,
        face_buttons=len(_PAD_FACE_BUTTONS & buttons),
        button_count=len(buttons),
        axis_count=len(axes),
        key_codes=key_codes,
        rel_axes=rel_axes,
    )


# ===================================================================
# Device kinds
# ===================================================================

KIND_GUITAR = "guitar"
KIND_DRUMKIT = "drumkit"
KIND_FIGHTSTICK = "fightstick"
KIND_GAMEPAD = "gamepad"
KIND_MACROPAD = "macropad"
KIND_UNKNOWN = "unknown"


@dataclass
class Detection:
    """A device plus what DeckForge concluded about it, with the reasoning."""
    device_path: str
    name: str
    vendor_id: int
    product_id: int
    bus_type: str
    kind: str
    kind_confidence: float
    kind_reason: str
    sdl_type: Optional[str] = None
    steam_schema: str = "generic"
    fingerprint: Optional[Fingerprint] = None
    # True when the device looks like hardware Steam owns and we must not touch.
    reserved: bool = False
    # Built-in knowledge for this device, when we recognise the family.
    family_id: Optional[str] = None
    family_name: Optional[str] = None
    setup_notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "device_path": self.device_path,
            "name": self.name,
            "vendor_id": f"0x{self.vendor_id:04x}",
            "product_id": f"0x{self.product_id:04x}",
            "bus_type": self.bus_type,
            "kind": self.kind,
            "kind_confidence": round(self.kind_confidence, 2),
            "kind_reason": self.kind_reason,
            "sdl_type": self.sdl_type,
            "steam_schema": self.steam_schema,
            "reserved": self.reserved,
            "family_id": self.family_id,
            "family_name": self.family_name,
            "setup_notes": self.setup_notes,
            "fingerprint": self.fingerprint.to_dict() if self.fingerprint else None,
        }


def classify(fingerprint: Fingerprint, name: str, sdl_type: Optional[str],
             vendor_id: int, product_id: int) -> tuple[str, float, str]:
    """Decide what a device is, returning (kind, confidence, reason).

    Ordered by specificity: the fingerprints that only one kind can produce are
    checked before the generic pad fallback, so a guitar is never mistaken for a
    gamepad just because it also has four face buttons.
    """
    fp = fingerprint
    lower = (name or "").lower()

    # Pointing devices report REL_* movement (or announce themselves as mice).
    # They are never controller candidates, however many buttons they carry.
    if fp.rel_axes > 0 or "mouse" in lower or "touchpad" in lower:
        return KIND_UNKNOWN, 0.1, (
            f"pointing device ({fp.rel_axes} relative axes)"
        )

    # Not a game controller at all: keyboards, hotkey panels and power buttons
    # expose KEY_* codes but no BTN_* buttons and no gamepad axes. Reject before
    # any pattern matching, otherwise media keys look like a solo-fret row.
    looks_like_controller = (
        fp.axis_count > 0
        or fp.button_count > 0
        or fp.has_hat
        or fp.has_sticks
    )
    if not looks_like_controller:
        return KIND_UNKNOWN, 0.05, (
            f"no controller inputs ({fp.key_codes} key codes, no buttons or axes)"
        )

    # A full keyboard also emits BTN_C / BTN_Z / BTN_THUMB as media and scan
    # codes, so a large KEY_ count plus no hat axis means "keyboard", not guitar.
    if fp.key_codes >= 20 and not fp.has_hat:
        return KIND_UNKNOWN, 0.3, (
            f"keyboard-like device ({fp.key_codes} key codes, no hat axis); "
            "not a game controller"
        )

    # A rhythm guitar: solo-fret row, OR (no sticks AND a strum-shaped hat AND
    # several frets). The measured CRKD has both signals.
    if fp.solo_frets and not fp.has_sticks and fp.key_codes < 20:
        return KIND_GUITAR, 0.97, (
            f"solo-fret row present ({', '.join(sorted(fp.solo_frets))}) with no analog sticks"
        )
    if not fp.has_sticks and fp.has_hat and fp.face_buttons >= 3 and fp.button_count >= 6:
        return KIND_GUITAR, 0.75, (
            "no analog sticks, hat-based strum axis and multiple frets"
        )
    if any(k in lower for k in ("guitar", "les paul", "riffmaster", "x-plorer", "hero")):
        return KIND_GUITAR, 0.6, "product name indicates a guitar"

    # Drum kits report velocity-bearing notes over MIDI, or have no sticks and
    # no dpad but many buttons.
    if "drum" in lower or "midi" in lower:
        return KIND_DRUMKIT, 0.8, "MIDI / drum product name"

    # Fightsticks: 8+ distinct action buttons, no analog sticks.
    if not fp.has_sticks and fp.button_count >= 8 and not fp.solo_frets:
        return KIND_FIGHTSTICK, 0.7, (
            f"{fp.button_count} buttons and no analog sticks"
        )

    # Macropads present as keyboards: many keys, no axes, no face buttons.
    if (fp.axis_count == 0 and fp.face_buttons == 0 and not fp.has_dpad
            and 4 <= fp.button_count <= 40):
        return KIND_MACROPAD, 0.6, (
            f"small key grid ({fp.button_count} keys) with no axes or face buttons"
        )

    if sdl_type:
        return KIND_GAMEPAD, 0.9, f"SDL identifies this as {sdl_type}"
    if fp.face_buttons >= 4:
        return KIND_GAMEPAD, 0.7, "four face buttons and analog sticks"

    return KIND_UNKNOWN, 0.2, "no distinguishing capability pattern"


def detect_device(device: Any) -> Detection:
    """Classify one evdev device."""
    vendor = int(getattr(device, "vendor_id", 0) or 0)
    product = int(getattr(device, "product_id", 0) or 0)
    name = str(getattr(device, "name", "") or "")
    bus = str(getattr(device, "bus_type", "") or "")

    fp = fingerprint_device(device)
    identity = lookup_identity(vendor, product)
    sdl_type = identity.get("sdl_type") if identity else None
    schema = identity.get("steam_schema", "generic") if identity else "generic"

    family = find_family(vendor, product, name)
    kind, confidence, reason = classify(fp, name, sdl_type, vendor, product)

    # A recognised family outranks a capability guess. KeyJam (mode 9) makes this
    # guitar enumerate as a KEYBOARD, so the keyboard gate below would classify
    # real hardware as "not a controller" and refuse to profile it. The family
    # table knows what the device is; the fingerprint only knows how it looks
    # right now, in whatever mode the dial happens to be on.
    if family is not None:
        kind = family.kind
        confidence = max(confidence, 0.95)
        reason = (
            f"recognised as {family.display_name}"
            + (f" (currently presenting as {fp.key_codes and 'keyboard' or 'gamepad'})"
               if fp.key_codes else "")
        )

    # Steam's own virtual pads (the Deck's built-in controls, Steam Input
    # virtual devices) must never be silently remapped.
    reserved = (
        "valve" in name.lower()
        or bus == "virtual"
        or (vendor == 0x28DE)
        or (vendor == 0 and product in (0x0001, 0x0005))
    )

    return Detection(
        device_path=str(getattr(device, "path", "")),
        name=name,
        vendor_id=vendor,
        product_id=product,
        bus_type=bus,
        kind=kind,
        kind_confidence=confidence,
        kind_reason=reason,
        sdl_type=sdl_type,
        steam_schema=schema,
        fingerprint=fp,
        reserved=reserved,
        family_id=family.family_id if family else None,
        family_name=family.display_name if family else None,
        setup_notes=list(family.setup_notes) if family else [],
    )


# ===================================================================
# Auto profile generation
# ===================================================================

@dataclass
class AutoProfile:
    """The result of auto-profiling: a detection plus a ready-to-save template."""
    detection: Detection
    template: Any
    template_name: str
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "detection": self.detection.to_dict(),
            "template_name": self.template_name,
            "template_title": getattr(self.template, "title", ""),
            "notes": self.notes,
        }


# Game targets DeckForge knows how to build for, and the profile each expects.
_GAME_TARGETS = {
    "clone_hero": "Clone Hero",
    "yarg": "YARG",
    "gh3": "Guitar Hero III",
    "rock_band": "Rock Band",
}


def generate_profile(detection: Detection, target_game: str = "clone_hero") -> AutoProfile:
    """Build a starter template whose bindings match the detected device."""
    from .crkd_profiler import CRKDGuitarProfile, generate_crkd_template
    from .gp2040_profiler import GP2040GuitarProfile, generate_gp2040_template
    from .vdf_manager import VDFTemplate

    notes: list[str] = []
    game = _GAME_TARGETS.get(target_game.lower().replace(" ", "_"), "Clone Hero")
    slug = "".join(
        ch if ch.isalnum() else "_" for ch in (detection.name or detection.kind).lower()
    ).strip("_")
    while "__" in slug:
        slug = slug.replace("__", "_")
    slug = slug or "device"

    if detection.kind == KIND_GUITAR:
        profile = CRKDGuitarProfile()
        profile.device_path = detection.device_path
        profile.device_name = detection.name
        profile.vendor_id = detection.vendor_id
        profile.product_id = detection.product_id

        fp = detection.fingerprint
        if fp is not None:
            if fp.solo_frets:
                notes.append(
                    "Solo fret row detected; mapped through the back-grip slots "
                    "because Steam's schema has no solo-strip group."
                )
            if not fp.has_dpad and fp.has_hat:
                profile.strum_up = "ABS_HAT0Y_NEG"
                profile.strum_down = "ABS_HAT0Y_POS"
                notes.append("Strum bar is a hat axis, so it maps onto the d-pad group.")
            if "ABS_Z" in fp.axes and "ABS_RZ" not in fp.axes:
                profile.whammy_axis = "ABS_Z"
            profile.blueprint_id = "crkd_les_paul" if "crkd" in detection.name.lower() else "guitar"
        template = generate_crkd_template(profile, target_game=game)
        template.title = f"Auto · {detection.name or 'Guitar'} · {game}"

    elif detection.kind in (KIND_FIGHTSTICK, KIND_MACROPAD, KIND_UNKNOWN):
        # Generic button box: map buttons straight onto a standard pad so every
        # physical control does something predictable.
        template = _generic_button_template(detection, game)
        notes.append(
            f"No guitar layout applies ({detection.kind}); built a standard "
            "gamepad mapping for its buttons."
        )

    elif detection.kind == KIND_GAMEPAD:
        profile = GP2040GuitarProfile(is_xinput_mode=(detection.steam_schema == "xbox360"))
        template = generate_gp2040_template(profile, target_game=target_game)
        template.title = f"Auto · {detection.name or 'Gamepad'} · Standard"
        notes.append("Standard gamepad: passthrough mapping with Steam's own schema.")

    else:  # drumkit / anything unexpected
        template = _generic_button_template(detection, game)
        notes.append("No specialized layout; buttons mapped generically.")

    template.name = f"auto_{slug}_{target_game.lower()}"
    template.device_blueprint_id = detection.kind
    template.tags = ["auto", detection.kind]
    template.creator = "DeckForge Auto-Profiler"
    template.updated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    notes.append(
        f"Detected as {detection.kind} (confidence {detection.kind_confidence:.0%}) "
        f"from {detection.kind_reason}."
    )

    return AutoProfile(
        detection=detection,
        template=template,
        template_name=template.name,
        notes=notes,
    )


def _generic_button_template(detection: Detection, game: str) -> Any:
    """Fallback template: physical buttons to standard pad buttons in order."""
    from .vdf_manager import VDFTemplate

    fp = detection.fingerprint or Fingerprint()
    # Bind in evdev order so the result is predictable rather than arbitrary.
    order = [
        "BTN_SOUTH", "BTN_EAST", "BTN_NORTH", "BTN_WEST",
        "BTN_TL", "BTN_TR", "BTN_TL2", "BTN_TR2",
        "BTN_SELECT", "BTN_START",
        "BTN_DPAD_UP", "BTN_DPAD_DOWN", "BTN_DPAD_LEFT", "BTN_DPAD_RIGHT",
        "BTN_THUMBL", "BTN_THUMBR",
    ]
    outputs = [
        "BTN_A", "BTN_B", "BTN_Y", "BTN_X",
        "BTN_TL", "BTN_TR", "BTN_TL2", "BTN_TR2",
        "BTN_SELECT", "BTN_START",
        "BTN_DPAD_UP", "BTN_DPAD_DOWN", "BTN_DPAD_LEFT", "BTN_DPAD_RIGHT",
        "BTN_THUMBL", "BTN_THUMBR",
    ]
    bindings = []
    for source, target in zip(order, outputs):
        if source in fp.buttons:
            bindings.append({
                "id": f"auto_{source.lower()}",
                "label": f"{source} → {target}",
                "source": source,
                "sourceCode": source,
                "output": {"type": "gamepad", "code": target},
                "activator": {"type": "RegularPress"},
                "enabled": True,
            })

    return VDFTemplate(
        version=3,
        title=f"Auto · {detection.name or detection.kind} · {game}",
        description=(
            f"Auto-generated passthrough for {detection.name} "
            f"({detection.vendor_id:04x}:{detection.product_id:04x})."
        ),
        creator="DeckForge Auto-Profiler",
        controller_type=detection.steam_schema,
        action_sets=[{
            "id": "default_set",
            "name": "Default",
            "layers": [],
            "bindings": bindings,
        }],
    )


# ===================================================================
# Top-level entry points
# ===================================================================

def scan() -> list[Detection]:
    """Detect and classify every currently connected evdev device."""
    from .input_sniffer import discover_devices

    detections: list[Detection] = []
    for device in discover_devices():
        try:
            detections.append(detect_device(device))
        except Exception as exc:  # pragma: no cover - defensive
            logger.debug("Cannot classify %s: %s", getattr(device, "path", "?"), exc)
    # Most specific candidates first, reserved devices last.
    detections.sort(key=lambda d: (d.reserved, -d.kind_confidence))
    return detections


def best_candidate(detections: Optional[list[Detection]] = None) -> Optional[Detection]:
    """The device most worth auto-profiling: a guitar, else the best pad."""
    items = scan() if detections is None else detections
    usable = [d for d in items if not d.reserved]
    if not usable:
        return None
    # Only genuine game controllers are candidates. Keyboards, hotkey panels and
    # audio jacks can look controller-ish but auto-profiling them would produce a
    # meaningless Steam config bound to nothing.
    priority = {
        KIND_GUITAR: 0,
        KIND_DRUMKIT: 1,
        KIND_FIGHTSTICK: 2,
        KIND_GAMEPAD: 3,
        KIND_MACROPAD: 4,
    }
    candidates = [d for d in usable if d.kind in priority]
    if not candidates:
        return None
    candidates.sort(key=lambda d: (priority[d.kind], -d.kind_confidence))
    return candidates[0]


def auto_profile(target_game: str = "clone_hero", save: bool = False) -> Optional[dict[str, Any]]:
    """Detect the best connected device and build (optionally save) a profile."""
    candidate = best_candidate()
    if candidate is None:
        return None
    result = generate_profile(candidate, target_game=target_game)

    payload = result.to_dict()
    if save:
        from .vdf_manager import TemplateManager

        manager = TemplateManager()
        path = manager.save_template(result.template)
        compiled = manager.last_compile
        payload["saved"] = {
            "path": str(path),
            "applied": list(getattr(compiled, "applied", []) or []),
            "skipped": list(getattr(compiled, "skipped", []) or []),
            "steam": manager.steam_status(),
        }
    return payload

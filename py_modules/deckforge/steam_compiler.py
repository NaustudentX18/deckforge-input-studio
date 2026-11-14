"""
DeckForge Input Studio — Steam Input VDF compiler.

Compiles DeckForge bindings into a Steam Input configuration that SteamOS
actually loads.  Two facts drive the design, both measured against the live
SteamOS install (build 20261023.100, Steam controller_base 2026-11-13):

1. Steam's schema is *group based*: a ``controller_mappings`` body is a list of
   ``group`` blocks, each with a ``mode`` and a fixed set of named ``inputs``.
   A physical control only exists if a group exposes it, so a binding is a
   write into one ``(group, input)`` slot -- not a free-form pair.
2. Analog output is a *group* setting (``settings/output_joystick``,
   ``settings/output_trigger``).  There is no ``xinput_axis`` binding string in
   any of the 77 shipped base templates or in Steam's own autosaves; emitting
   one produces a file Steam silently rejects.

So the compiler patches Valve's own shipped template instead of synthesising a
body.  Everything DeckForge has no opinion about is preserved byte-for-byte,
which means Steam always receives a structurally valid config, and only the
slots for controls the user actually mapped are rewritten.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from .vdf_manager import parse_vdf, serialize_vdf

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent / "data"

# Shipped skeletons, taken verbatim from Steam's controller_base/templates.
SKELETONS: dict[str, str] = {
    "neptune": "controller_neptune_base.vdf",
    "xbox360": "controller_xbox360_base.vdf",
}

# Which skeleton stands in for a controller_type we have no skeleton for.
SCHEMA_ALIASES: dict[str, str] = {
    "neptune": "neptune",
    "controller_neptune": "neptune",
    "xbox360": "xbox360",
    "controller_xbox360": "xbox360",
    "generic": "neptune",
    "controller_generic": "neptune",
    "ps4": "xbox360",
    "controller_ps4": "xbox360",
    "ps5": "xbox360",
    "controller_ps5": "xbox360",
    "switch_pro": "xbox360",
    "controller_switch_pro": "xbox360",
}

# controller_type string written into the compiled file.
SCHEMA_CONTROLLER_TYPE: dict[str, str] = {
    "neptune": "controller_neptune",
    "xbox360": "controller_xbox360",
}


# ===================================================================
# Source slot table
# ===================================================================

@dataclass(frozen=True)
class Slot:
    """A writable (group, input) position in a skeleton."""
    group: str
    input: str
    # "button" slots carry a binding string; "axis" slots are group-level
    # analog passthrough, where only the click action is writable.
    kind: str = "button"


# evdev source -> slot.  Group ids/labels come from Valve's neptune skeleton:
#   0 four_buttons  1 dpad  3 left stick  4 left trigger  5 right trigger
#   7 switches      8 right stick  10 start  11 select
COMMON_SLOTS: dict[str, Slot] = {
    "BTN_SOUTH": Slot("0", "button_a"),
    "BTN_A": Slot("0", "button_a"),
    "BTN_EAST": Slot("0", "button_b"),
    "BTN_B": Slot("0", "button_b"),
    "BTN_WEST": Slot("0", "button_x"),
    "BTN_X": Slot("0", "button_x"),
    "BTN_NORTH": Slot("0", "button_y"),
    "BTN_Y": Slot("0", "button_y"),
    "BTN_DPAD_UP": Slot("1", "dpad_north"),
    "BTN_DPAD_DOWN": Slot("1", "dpad_south"),
    "BTN_DPAD_LEFT": Slot("1", "dpad_west"),
    "BTN_DPAD_RIGHT": Slot("1", "dpad_east"),
    "BTN_THUMBL": Slot("3", "click"),
    "BTN_THUMBR": Slot("8", "click"),
    "BTN_TL": Slot("7", "left_bumper"),
    "BTN_TR": Slot("7", "right_bumper"),
    "BTN_START": Slot("7", "button_escape"),
    "BTN_SELECT": Slot("7", "button_menu"),
    "BTN_BACK": Slot("7", "button_menu"),
    "BTN_TL2": Slot("4", "click"),
    "BTN_TR2": Slot("5", "click"),
    # Guitar / rhythm solo strip, surfaced through the back-grip switches.
    "BTN_C": Slot("7", "button_back_left"),
    "BTN_Z": Slot("7", "button_back_right"),
    "BTN_THUMB": Slot("7", "button_back_left_upper"),
    "BTN_THUMB2": Slot("7", "button_back_right_upper"),
    # Analog sticks: passthrough groups.  A binding here only rewrites the
    # stick-click; the axis itself stays analog.
    "ABS_X": Slot("3", "click", kind="axis"),
    "ABS_Y": Slot("3", "click", kind="axis"),
    "ABS_RX": Slot("8", "click", kind="axis"),
    # ABS_RY is NOT given a slot: it is the slot the guitar's whammy wants (see
    # ABS_Z below), and on hardware where RY rests at centre it is also the tilt
    # axis. Two different controls competing for one slot silently drops
    # whichever is compiled second -- which is what happened: whammy took 8/click
    # and tilt was reported as "slot already bound by Whammy". A real
    # right-stick-Y control has nothing useful to bind anyway (the axis passes
    # through regardless), so leaving it unmapped is correct.
    # Guitar strum bar.  Measured CRKD Les Paul Pro reports it as a hat axis on
    # ABS_HAT0Y (+/-1) rather than as dpad buttons; map both directions onto the
    # dpad group so a strum becomes a real dpad press.
    "ABS_HAT0Y_NEG": Slot("1", "dpad_north"),
    "ABS_HAT0Y_POS": Slot("1", "dpad_south"),
    "ABS_HAT1Y_NEG": Slot("1", "dpad_north"),
    "ABS_HAT1Y_POS": Slot("1", "dpad_south"),
    # Tilt is a digital edge on ABS_HAT0X on the measured unit.  It shares hat 0
    # with the strum axis, and ABS_HAT0X only ever reports -1, so it gets its own
    # free button slot instead of a dpad direction.
    "ABS_HAT0X": Slot("7", "button_back_left"),
    "ABS_HAT1X": Slot("7", "button_back_right"),
    # Tilt can be driven by different axes across devices (the measured CRKD
    # reports it as a hat edge; other units expose it on the right stick). Both
    # must land on the same star-power button slot, so the profile names the
    # *function* rather than the axis.
    "ABS_RY_TILT": Slot("7", "button_back_left"),
    "ABS_Y_TILT": Slot("7", "button_back_left"),
    # Guitar whammy. The axis itself is a group-level output (output_joystick);
    # what a *binding* can usefully do here is carry the stick-click action, so
    # whammy owns 8/click on the right-stick group. ABS_RZ gets the right-trigger
    # group so the two axes on a real pad do not fight over one slot.
    "ABS_Z": Slot("8", "click", kind="axis"),
    "ABS_RZ": Slot("5", "click", kind="axis"),
}

# Controls Steam reserves and will not accept a binding for.
UNBINDABLE_SOURCES = frozenset({
    "BTN_MODE",       # guide button is owned by Steam
    "BTN_STEAM",
    "BTN_BASE",       # 5th solo fret has no slot in the shipped schema
    "ABS_GAS",
    "ABS_BRAKE",
})


# ===================================================================
# Binding -> Steam binding string
# ===================================================================

_XINPUT_NAMES: dict[str, str] = {
    "BTN_A": "A", "BTN_B": "B", "BTN_X": "X", "BTN_Y": "Y",
    "BTN_TL": "SHOULDER_LEFT", "BTN_TR": "SHOULDER_RIGHT",
    "BTN_TL2": "TRIGGER_LEFT", "BTN_TR2": "TRIGGER_RIGHT",
    "BTN_SELECT": "SELECT", "BTN_BACK": "SELECT",
    "BTN_START": "START", "BTN_MODE": "GUIDE",
    "BTN_THUMBL": "JOYSTICK_LEFT", "BTN_THUMBR": "JOYSTICK_RIGHT",
    "BTN_DPAD_UP": "DPAD_UP", "BTN_DPAD_DOWN": "DPAD_DOWN",
    "BTN_DPAD_LEFT": "DPAD_LEFT", "BTN_DPAD_RIGHT": "DPAD_RIGHT",
}

# DeckForge keyboard codes are evdev names; Steam wants its own spellings.
_KEY_NAMES: dict[str, str] = {
    "ESC": "ESCAPE", "ESCAPE": "ESCAPE",
    "LEFTSHIFT": "LEFT_SHIFT", "RIGHTSHIFT": "RIGHT_SHIFT",
    "LEFTCTRL": "LEFT_CONTROL", "RIGHTCTRL": "RIGHT_CONTROL",
    "LEFTALT": "LEFT_ALT", "RIGHTALT": "RIGHT_ALT",
    "PAGEUP": "PAGE_UP", "PAGEDOWN": "PAGE_DOWN",
    "ENTER": "ENTER", "RETURN": "ENTER", "SPACE": "SPACE", "TAB": "TAB",
    "UP": "UP_ARROW", "DOWN": "DOWN_ARROW",
    "LEFT": "LEFT_ARROW", "RIGHT": "RIGHT_ARROW",
    "BACKSPACE": "BACKSPACE", "DELETE": "DELETE", "INSERT": "INSERT",
    "HOME": "HOME", "END": "END",
}

_ACTIVATOR_NAMES: dict[str, str] = {
    "RegularPress": "Full_Press",
    "regular_press": "Full_Press",
    "Full_Press": "Full_Press",
    "LongPress": "Long_Press",
    "long_press": "Long_Press",
    "DoublePress": "Double_Press",
    "double_press": "Double_Press",
    "StartPress": "Start_Press",
    "start_press": "Start_Press",
    "ReleasePress": "Release_Press",
    "release_press": "Release_Press",
    "ChordedPress": "Chorded_Press",
    "chorded_press": "Chorded_Press",
}

# Steam renders a binding as "action, label, icon, colour".  The trailing
# fields are optional but present in every shipped template.
_BINDING_SUFFIX = ", , "


def activator_name(activator: str) -> str:
    """Map a DeckForge activator name onto Steam's activator key."""
    return _ACTIVATOR_NAMES.get(activator, "Full_Press")


def binding_string(output_type: str, output_code: str) -> Optional[str]:
    """Build the Steam binding string for one output, or None if unsupported."""
    kind = (output_type or "gamepad").lower()

    if kind == "gamepad":
        name = _XINPUT_NAMES.get(output_code, output_code)
        if not name:
            return None
        return f"xinput_button {name}" + _BINDING_SUFFIX

    if kind == "keyboard":
        key = output_code
        if key.startswith("KEY_"):
            key = key[4:]
        key = _KEY_NAMES.get(key, key)
        if not key:
            return None
        return f"key_press {key}" + _BINDING_SUFFIX

    if kind == "mouse":
        if output_code == "MOUSE_CURSOR":
            return None
        if output_code.startswith("SCROLL_"):
            direction = output_code[len("SCROLL_"):].lower()
            return f"mouse_wheel {direction}" + _BINDING_SUFFIX
        button = {
            "BTN_LEFT": "LEFT", "BTN_RIGHT": "RIGHT", "BTN_MIDDLE": "MIDDLE",
            "BTN_SIDE": "SIDE", "BTN_EXTRA": "EXTRA",
        }.get(output_code, output_code.replace("BTN_", "").upper())
        return f"mouse_button {button}" + _BINDING_SUFFIX

    if kind == "system":
        action = output_code
        if action.startswith("SYS_"):
            action = action[4:]
        return f"controller_action {action.lower()}" + _BINDING_SUFFIX

    return None


# ===================================================================
# Compilation result
# ===================================================================

@dataclass
class CompiledTemplate:
    """A compiled Steam config plus an account of what was and was not applied."""
    vdf_text: str
    applied: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return bool(self.applied)


def _load_skeleton(schema: str) -> dict[str, Any]:
    key = SCHEMA_ALIASES.get(schema, "neptune")
    path = DATA_DIR / SKELETONS[key]
    if not path.is_file():
        raise FileNotFoundError(f"Missing Steam template skeleton: {path}")
    return parse_vdf(path.read_text(encoding="utf-8-sig"))


def _groups(mappings: dict[str, Any]) -> dict[str, Any]:
    """Index a parsed ``controller_mappings`` body's groups by id."""
    by_id: dict[str, Any] = {}
    groups = mappings.get("group")
    if isinstance(groups, dict):
        groups = [groups]
    for group in groups or []:
        if isinstance(group, dict) and "id" in group:
            by_id[str(group["id"])] = group
    return by_id


def _rebuild_groups(mappings: dict[str, Any], by_id: dict[str, Any]) -> None:
    """Write the id-indexed groups back into the document, preserving order."""
    groups = mappings.get("group")
    if isinstance(groups, dict):
        groups = [groups]
    ordered: list[Any] = []
    seen: set[str] = set()
    for group in groups or []:
        gid = str(group.get("id")) if isinstance(group, dict) else None
        if gid is not None and gid in by_id:
            ordered.append(by_id[gid])
            seen.add(gid)
    for gid, group in by_id.items():
        if gid not in seen:
            ordered.append(group)
    mappings["group"] = ordered


def _set_binding(group: dict[str, Any], input_name: str, action: str,
                 activator: str) -> None:
    """Replace one input's activator/binding inside a group."""
    inputs = group.setdefault("inputs", {})
    if not isinstance(inputs, dict):
        return
    existing = inputs.get(input_name)
    settings: dict[str, Any] = {}
    if isinstance(existing, dict):
        for act in (existing.get("activators") or {}).values():
            if isinstance(act, dict) and isinstance(act.get("settings"), dict):
                settings = dict(act["settings"])
                break
    activators: dict[str, Any] = {activator: {"bindings": {"binding": action}}}
    if settings:
        activators[activator]["settings"] = settings
    inputs[input_name] = {"activators": activators}


def compile_bindings(
    bindings: list[Any],
    *,
    title: str,
    description: str = "",
    controller_type: str = "neptune",
    creator: str = "DeckForge",
) -> CompiledTemplate:
    """Compile DeckForge bindings into a Steam Input configuration.

    ``bindings`` items are dicts with ``source``, ``output`` (``{"type","code"}``)
    and optional ``activator`` -- the same shape the frontend uses.
    """
    schema = SCHEMA_ALIASES.get(controller_type, "neptune")
    doc = _load_skeleton(schema)
    mappings = doc.get("controller_mappings")
    if not isinstance(mappings, dict):
        raise ValueError("Steam skeleton has no controller_mappings block")

    by_id = _groups(mappings)

    applied: list[str] = []
    skipped: list[str] = []
    claimed: dict[tuple[str, str], str] = {}

    for raw in bindings:
        if not isinstance(raw, dict):
            continue
        source = str(raw.get("source") or raw.get("sourceCode") or "").strip()
        output = raw.get("output") or {}
        if isinstance(output, str):          # legacy "xinput_button A" strings
            output = _split_legacy_output(output)
        out_type = str(output.get("type") or "gamepad")
        out_code = str(output.get("code") or "")
        activator = str(raw.get("activator") or "RegularPress")
        if isinstance(raw.get("activatorConfig"), dict):
            activator = str(raw["activatorConfig"].get("type") or activator)
        label = str(raw.get("label") or f"{source} -> {out_code}")

        if not source or not out_code:
            skipped.append(f"{label} (incomplete binding)")
            continue
        if source in UNBINDABLE_SOURCES:
            skipped.append(f"{label} ({source} has no slot in Steam's schema)")
            continue

        slot = COMMON_SLOTS.get(source)
        if slot is None:
            skipped.append(f"{label} ({source} not supported)")
            continue

        group = by_id.get(slot.group)
        if group is None:
            skipped.append(f"{label} (group {slot.group} missing from skeleton)")
            continue

        key = (slot.group, slot.input)
        if key in claimed:
            skipped.append(f"{label} (slot already bound by {claimed[key]})")
            continue

        action = binding_string(out_type, out_code)
        if action is None:
            skipped.append(f"{label} (unsupported output {out_type}:{out_code})")
            continue

        _set_binding(group, slot.input, action, activator_name(activator))
        claimed[key] = label
        applied.append(label)

    _rebuild_groups(mappings, by_id)

    mappings["controller_type"] = SCHEMA_CONTROLLER_TYPE.get(
        schema, mappings.get("controller_type", "controller_neptune")
    )
    mappings["title"] = title
    mappings["description"] = description or title
    mappings["creator"] = creator
    # Steam reads localisation for the picker label; keep English in sync.
    localization = mappings.get("localization")
    if isinstance(localization, dict):
        english = localization.get("english")
        if isinstance(english, dict):
            english["title"] = title
            english["description"] = description or title
    else:
        mappings["localization"] = {
            "english": {"title": title, "description": description or title}
        }

    return CompiledTemplate(
        vdf_text=serialize_vdf(doc) + "\n",
        applied=applied,
        skipped=skipped,
    )


def _split_legacy_output(text: str) -> dict[str, str]:
    """Translate a legacy ``"xinput_button A"`` string into an output dict."""
    parts = text.strip().split(None, 1)
    if len(parts) != 2:
        return {"type": "gamepad", "code": text.strip()}
    verb, code = parts[0], parts[1].strip()
    kind = {
        "xinput_button": "gamepad",
        "key_press": "keyboard",
        "mouse_button": "mouse",
        "mouse_wheel": "mouse",
        "system_action": "system",
        "controller_action": "system",
    }.get(verb, "gamepad")
    return {"type": kind, "code": code}


# ===================================================================
# Round-tripping compiled configs back into editable bindings
# ===================================================================

_SLOT_BY_POSITION: dict[tuple[str, str], str] = {
    (slot.group, slot.input): source
    for source, slot in COMMON_SLOTS.items()
    if slot.kind == "button"
}

_ACTION_TO_OUTPUT: list[tuple[str, str]] = [
    ("xinput_button ", "gamepad"),
    ("key_press ", "keyboard"),
    ("mouse_button ", "mouse"),
    ("mouse_wheel ", "mouse"),
    ("controller_action ", "system"),
]


def extract_bindings(mappings: dict[str, Any],
                     controller_type: str = "neptune") -> list[dict[str, Any]]:
    """Read editable bindings back out of a Steam config body.

    Inverse of :func:`compile_bindings`, limited to slots the compiler writes.
    A slot is reported only if it *differs* from the shipped skeleton, so
    importing a Valve template yields the user's actual edits rather than the
    ~14 stock defaults every skeleton carries.
    """
    results: list[dict[str, Any]] = []
    by_id = _groups(mappings)
    baseline = _skeleton_actions(controller_type)

    for (group_id, input_name), source in _SLOT_BY_POSITION.items():
        group = by_id.get(group_id)
        if not isinstance(group, dict):
            continue
        inputs = group.get("inputs")
        if not isinstance(inputs, dict):
            continue
        entry = inputs.get(input_name)
        if not isinstance(entry, dict):
            continue
        activators = entry.get("activators")
        if not isinstance(activators, dict) or not activators:
            continue
        act_name, act = next(iter(activators.items()))
        if not isinstance(act, dict):
            continue
        raw = act.get("bindings")
        if isinstance(raw, dict):
            raw = raw.get("binding")
        if isinstance(raw, list):
            raw = raw[0] if raw else None
        if not isinstance(raw, str) or not raw.strip():
            continue
        action = raw.split(",")[0].strip()
        if action == baseline.get((group_id, input_name)):
            continue
        out_type, out_code = "gamepad", action
        for prefix, kind in _ACTION_TO_OUTPUT:
            if action.startswith(prefix):
                out_type, out_code = kind, action[len(prefix):].strip()
                break
        results.append({
            "id": f"bind_{group_id}_{input_name}",
            "source": source,
            "sourceCode": source,
            "output": {"type": out_type, "code": out_code},
            "activator": {"type": _ACTIVATOR_NAMES.get(act_name, "RegularPress")},
            "label": f"{source} -> {out_code}",
            "enabled": True,
        })

    return results


def _skeleton_actions(controller_type: str) -> dict[tuple[str, str], str]:
    """The binding each writable slot carries in the untouched skeleton."""
    try:
        doc = _load_skeleton(controller_type)
    except Exception:  # pragma: no cover - skeleton always ships
        return {}
    body = doc.get("controller_mappings")
    if not isinstance(body, dict):
        return {}
    baseline: dict[tuple[str, str], str] = {}
    for group_id, group in _groups(body).items():
        inputs = group.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for input_name, entry in inputs.items():
            if not isinstance(entry, dict):
                continue
            for act in (entry.get("activators") or {}).values():
                if not isinstance(act, dict):
                    continue
                raw = act.get("bindings")
                if isinstance(raw, dict):
                    raw = raw.get("binding")
                if isinstance(raw, str):
                    baseline[(group_id, input_name)] = raw.split(",")[0].strip()
                    break
    return baseline


def canonical_controller_type(controller_type: str) -> str:
    """Fold any controller-type spelling onto a schema we ship a skeleton for.

    Keeping this single-sourced matters: the value is written into the compiled
    VDF *and* used to pick the ``configset`` file Steam reads, so a mismatch
    silently detaches a config from its controller.
    """
    return SCHEMA_ALIASES.get(str(controller_type or "").strip().lower(), "neptune")

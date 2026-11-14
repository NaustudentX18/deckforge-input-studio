"""Pre-made one-click profiles for known controller families.

Each profile is a complete, tested mapping for a specific game rather than a
generic template, because the games genuinely disagree on what the buttons
should do:

* **Clone Hero** and **YARG** read a gamepad, but YARG also has its own
  instrument detection; both expect frets on face buttons and strum on d-pad.
* **Fortnite Festival** on PC needs the CTRL button to act as a *separate*
  button from Select, which is a hardware mode-dial choice (mode 2), not
  something a Steam config can fix — documented in ``setup_notes``.
* **Rock Band 4** only works with the Xbox-licensed model, and only in RB4 Mode
  (mode 9 with the slider on XB).
* **Guitar Hero III / legacy** goes through P3 on the platform slider.

A profile here is therefore "bindings + the hardware state that makes those
bindings correct". Shipping only the bindings would be a lie for any game whose
correct behaviour depends on the dial.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from .device_catalog import KNOWN_FAMILIES, find_family, mode_for_position


@dataclass(frozen=True)
class GameProfile:
    """A ready-to-apply mapping for one game on one controller family."""
    profile_id: str
    family_id: str
    game: str
    title: str
    description: str
    # Mode dial position the hardware must be on for this to be correct.
    required_mode: int = 1
    # Bindings: (evdev source, output type, output code, optional label)
    bindings: tuple[tuple[str, str, str, str], ...] = ()
    # Anything the user must do that software cannot.
    setup_notes: tuple[str, ...] = field(default_factory=tuple)
    # True when this game needs the Xbox-licensed hardware.
    requires_xbox_licence: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "profile_id": self.profile_id,
            "family_id": self.family_id,
            "game": self.game,
            "title": self.title,
            "description": self.description,
            "required_mode": self.required_mode,
            "requires_xbox_licence": self.requires_xbox_licence,
            "setup_notes": list(self.setup_notes),
            "binding_count": len(self.bindings),
        }


# Guitar bindings shared by the community PC games. Clone Hero defaults to
# keyboard keys (A/S/J/K/L) but reads gamepads too, so gamepad output is used
# here: it keeps the profile valid whether or not the game has been configured
# for a keyboard, and it is what Steam Input expects to produce.
_GUITAR_GAMEPAD_BINDINGS: tuple[tuple[str, str, str, str], ...] = (
    ("BTN_SOUTH", "gamepad", "BTN_A", "Green fret"),
    ("BTN_EAST", "gamepad", "BTN_B", "Red fret"),
    ("BTN_NORTH", "gamepad", "BTN_Y", "Yellow fret"),
    ("BTN_WEST", "gamepad", "BTN_X", "Blue fret"),
    ("BTN_TL", "gamepad", "BTN_TL", "Orange fret"),
    ("ABS_HAT0Y_NEG", "gamepad", "BTN_DPAD_UP", "Strum up"),
    ("ABS_HAT0Y_POS", "gamepad", "BTN_DPAD_DOWN", "Strum down"),
    ("BTN_START", "gamepad", "BTN_START", "Pause / start"),
    ("BTN_SELECT", "gamepad", "BTN_SELECT", "Select"),
    ("ABS_HAT0X", "gamepad", "BTN_THUMBL", "Tilt (star power)"),
)

_FESTIVAL_BINDINGS: tuple[tuple[str, str, str, str], ...] = (
    ("BTN_SOUTH", "gamepad", "BTN_A", "Green fret"),
    ("BTN_EAST", "gamepad", "BTN_B", "Red fret"),
    ("BTN_NORTH", "gamepad", "BTN_Y", "Yellow fret"),
    ("BTN_WEST", "gamepad", "BTN_X", "Blue fret"),
    ("BTN_TL", "gamepad", "BTN_TL", "Orange fret"),
    ("ABS_HAT0Y_NEG", "gamepad", "BTN_DPAD_UP", "Strum up"),
    ("ABS_HAT0Y_POS", "gamepad", "BTN_DPAD_DOWN", "Strum down"),
    # CTRL doubles as overdrive in Festival; it is also the Menu button, so the
    # hardware mode dial (2) is what actually separates them.
    ("BTN_MODE", "gamepad", "BTN_MODE", "CTRL / overdrive"),
    ("BTN_START", "gamepad", "BTN_START", "Pause"),
)

_CRKD_PROFILES: tuple[GameProfile, ...] = (
    GameProfile(
        profile_id="crkd_lp_clone_hero",
        family_id="crkd_les_paul_pro",
        game="clone_hero",
        title="CRKD Les Paul Pro — Clone Hero",
        description=(
            "Five frets on the face buttons, strum on the d-pad, tilt for star "
            "power. The layout Clone Hero expects from a guitar."
        ),
        required_mode=1,
        bindings=_GUITAR_GAMEPAD_BINDINGS,
    ),
    GameProfile(
        profile_id="crkd_lp_yarg",
        family_id="crkd_les_paul_pro",
        game="yarg",
        title="CRKD Les Paul Pro — YARG",
        description=(
            "Same fret/strum layout as Clone Hero. YARG detects instruments "
            "itself, so this configures the pad fallback cleanly."
        ),
        required_mode=1,
        bindings=_GUITAR_GAMEPAD_BINDINGS,
    ),
    GameProfile(
        profile_id="crkd_lp_fortnite_festival",
        family_id="crkd_les_paul_pro",
        game="fortnite_festival",
        title="CRKD Les Paul Pro — Fortnite Festival",
        description=(
            "Frets, strum, and CTRL as overdrive. Requires Mode 2 on the guitar: "
            "in Mode 1 the CTRL button reports as Select, which opens a menu in "
            "Festival and cannot be remapped in-game."
        ),
        required_mode=2,
        bindings=_FESTIVAL_BINDINGS,
        setup_notes=(
            "Turn the Mode Dial to 2 (Festival - Pro). Mode 1 will open the "
            "pause menu instead of activating overdrive.",
            "For Fortnite Festival on PC, the Platform Slider must be on PC.",
        ),
    ),
    GameProfile(
        profile_id="crkd_lp_rock_band_4",
        family_id="crkd_les_paul_pro",
        game="rock_band_4",
        title="CRKD Les Paul Pro — Rock Band 4",
        description=(
            "RB4 only accepts the Xbox-licensed guitar, in RB4 Mode: slider on "
            "XB and Mode Dial on 9."
        ),
        required_mode=9,
        bindings=_GUITAR_GAMEPAD_BINDINGS,
        requires_xbox_licence=True,
        setup_notes=(
            "Requires the Xbox-licensed model. The multi-platform model will "
            "not be recognised by Rock Band 4 as a guitar.",
            "Set the Platform Slider to XB and the Mode Dial to 9 (RB4 Mode).",
        ),
    ),
    GameProfile(
        profile_id="crkd_lp_guitar_hero_3",
        family_id="crkd_les_paul_pro",
        game="guitar_hero_3",
        title="CRKD Les Paul Pro — Guitar Hero III (P3)",
        description=(
            "Legacy PS3 mapping for Guitar Hero titles and emulated GH3. "
            "Uses the P3 position on the Platform Slider."
        ),
        required_mode=1,
        bindings=_GUITAR_GAMEPAD_BINDINGS,
        setup_notes=(
            "Set the Platform Slider to P3 and the Mode Dial to 1.",
            "PS3-style guitars are not seen by Steam as a guitar; use the "
            "emulator's own controller setup.",
        ),
    ),
)

# KEYJAM deserves its own profile because the device is a keyboard there: every
# "binding" is a key, and a gamepad config is meaningless.
_KEYJAM = GameProfile(
    profile_id="crkd_lp_keyjam",
    family_id="crkd_les_paul_pro",
    game="keyjam",
    title="CRKD Les Paul Pro — KeyJam (keyboard mode)",
    description=(
        "Mode 9 on PC presents the guitar as a keyboard with the right stick as "
        "a mouse. Bindings here are key presses, not gamepad buttons."
    ),
    required_mode=9,
    bindings=(
        ("BTN_SOUTH", "keyboard", "KEY_A", "Green fret"),
        ("BTN_EAST", "keyboard", "KEY_S", "Red fret"),
        ("BTN_NORTH", "keyboard", "KEY_J", "Yellow fret"),
        ("BTN_WEST", "keyboard", "KEY_K", "Blue fret"),
        ("BTN_TL", "keyboard", "KEY_L", "Orange fret"),
        ("ABS_HAT0Y_NEG", "keyboard", "KEY_UP", "Strum up"),
        ("ABS_HAT0Y_POS", "keyboard", "KEY_DOWN", "Strum down"),
        ("BTN_MODE", "keyboard", "KEY_SPACE", "Overdrive"),
        ("BTN_START", "keyboard", "KEY_ESC", "Escape"),
    ),
    setup_notes=(
        "Set the Platform Slider to PC and the Mode Dial to 9.",
        "In this mode the guitar is a keyboard: Steam sees no gamepad at all, "
        "so gamepad-bound games need their own key bindings.",
    ),
)

ALL_PROFILES: tuple[GameProfile, ...] = _CRKD_PROFILES + (_KEYJAM,)


def profiles_for_family(family_id: str) -> list[GameProfile]:
    return [p for p in ALL_PROFILES if p.family_id == family_id]


def find_profile(profile_id: str) -> Optional[GameProfile]:
    return next((p for p in ALL_PROFILES if p.profile_id == profile_id), None)


def profiles_for_device(vendor_id: int, product_id: int,
                        name: str) -> list[GameProfile]:
    """Every pre-made profile that applies to this hardware."""
    family = find_family(vendor_id, product_id, name)
    if family is None:
        return []
    return profiles_for_family(family.family_id)


def catalog() -> list[dict[str, Any]]:
    """The whole one-click catalog, for the API and the landing page."""
    out: list[dict[str, Any]] = []
    for profile in ALL_PROFILES:
        entry = profile.to_dict()
        family = next(
            (f for f in KNOWN_FAMILIES if f.family_id == profile.family_id),
            None,
        )
        if family is not None:
            mode = mode_for_position(family, profile.required_mode)
            entry["family_name"] = family.display_name
            entry["required_mode_name"] = mode.name if mode else None
        out.append(entry)
    return out


def build_template(profile: GameProfile, *, title_suffix: str = "") -> Any:
    """Turn a GameProfile into a saveable VDFTemplate."""
    from .vdf_manager import VDFTemplate

    bindings = [
        {
            "id": f"b_{source.lower()}",
            "label": label,
            "source": source,
            "sourceCode": source,
            "output": {"type": out_type, "code": out_code},
            "activator": {"type": "RegularPress"},
            "enabled": True,
        }
        for source, out_type, out_code, label in profile.bindings
    ]

    # The emitted schema must match what the DEVICE presents as, not what the
    # product category is. The CRKD guitar enumerates as 045e:028e -- an Xbox 360
    # pad -- so Steam looks for its config in configset_45e-28e-*.vdf and a
    # neptune-typed file never appears there. Forcing "neptune" for all guitars
    # was the bug that kept profiles out of the Game Mode picker.
    family = next((f for f in KNOWN_FAMILIES if f.family_id == profile.family_id), None)
    schema = "xbox360" if (family and family.kind == "guitar") else "generic"

    title = profile.title + (f" {title_suffix}" if title_suffix else "")
    template = VDFTemplate(
        version=3,
        title=title,
        description=profile.description,
        creator="DeckForge",
        controller_type=schema,
        name=profile.profile_id,
        device_blueprint_id="crkd_les_paul" if profile.family_id == "crkd_les_paul_pro" else "guitar",
        tags=["premade", profile.game, profile.family_id],
        action_sets=[{
            "id": "default_set",
            "name": "Default",
            "layers": [],
            "bindings": bindings,
        }],
    )
    return template


def apply_profile(profile_id: str, *, manager: Any = None,
                  sync: bool = True) -> dict[str, Any]:
    """Save a pre-made profile and publish it to Steam.

    Returns what was bound, what Steam could not express, and the hardware
    state the user still has to set.
    """
    from .vdf_manager import TemplateManager

    profile = find_profile(profile_id)
    if profile is None:
        raise FileNotFoundError(f"Unknown profile '{profile_id}'")

    tm = manager or TemplateManager()
    template = build_template(profile)
    path = tm.save_template(template)
    compiled = tm.last_compile

    result: dict[str, Any] = {
        "profile_id": profile.profile_id,
        "game": profile.game,
        "title": template.title,
        "saved_path": str(path),
        "applied": list(getattr(compiled, "applied", []) or []),
        "skipped": list(getattr(compiled, "skipped", []) or []),
        "steam": tm.steam_status(),
    }

    family = next((f for f in KNOWN_FAMILIES if f.family_id == profile.family_id), None)
    if family is not None:
        mode = mode_for_position(family, profile.required_mode)
        result["hardware_setup"] = {
            "mode_position": profile.required_mode,
            "mode_name": mode.name if mode else None,
            "presents_as": mode.presents_as if mode else None,
            "notes": list(profile.setup_notes) or list(family.setup_notes),
            "requires_xbox_licence": profile.requires_xbox_licence,
        }
    return result

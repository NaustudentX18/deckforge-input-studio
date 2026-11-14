"""Built-in hardware knowledge: controller families DeckForge recognises natively.

This is not a guessbook. Every value here comes from a primary source, cited per
family, and where a value could not be confirmed it is marked ``unverified``
rather than invented. The distinction matters: a wrong binding is worse than a
missing one, because the user blames the game instead of the profile.

Sources
-------
CRKD Gibson Les Paul Pro Edition (CK25GM family), researched 2026-11-14:

* Official product page, ``crkd.gg/products/gibson-lp-blueberry-burst-pro-edition-xbox``
  -- mechanical frets, Hall Effect strum bar with haptic feedback, 8-button
  Navigation Hub (X/Y/A/B/LB/RB/LT/RT), 2 analog sticks, tilt sensor, ergonomic
  d-pad, Mode Dial (input preset switch), Platform Slider, 3.5 mm audio jack,
  RGB fret neck, 2.4 GHz + Bluetooth + wired.
* Official user guide (CRKD CK25GM, 11 pages) -- the mode dial map, platform
  slider values (PC / NS / AN / P3), and the physical control layout.
* TechRadar review (2025-09-07) -- CTRL button is the star-power button;
  d-pad is on the headstock; the right "knob" is the right stick; start is the
  click of the left dial.
* CRKD firmware v2.0 notes -- Mode 9 changes meaning with the platform slider
  (KeyJam on PC, RB4 on XB), and KeyJam maps the guitar as a *keyboard*, with
  the right thumbstick acting as a mouse.
* TheNathannator/PlasticBand (CC BY-SA 4.0), ``Docs/Instruments/5-Fret Guitar/
  Rock Band/{PS4,PS5,Xbox One}.md`` -- the community's authoritative peripheral
  documentation. It documents CRKD's *product* ids, which the product page does
  not publish. Note this documentation covers the CRKD Gibson SG neck; the Les
  Paul Pro uses the same CRKD id range.

  Ids seen on the actual unit are NOT all CRKD's own. A device captured on the
  Deck on 2026-11-13 enumerated as ``20bc:5500`` under the name "CRKD Gamepad",
  and an earlier revision of this file assumed that was CRKD's PC-mode id.

  That assumption does not hold up. ``20bc`` is registered to ShenZhen ShanWan
  (a USB bridge-chip vendor), ``20bc:5500`` is described in the usb.ids database
  as "Frostbite controller", and SDL classifies it as a *PS3* controller -- not
  as an Xbox-style pad. CRKD's own ids, per PlasticBand, are ``0351``/``3651``
  ("CRKD Guitar", Xbox-360 class).

  The likely reading is that the receiver bridge presents as ShanWan regardless
  of which CRKD mode is selected, but **that has not been verified** -- no
  capture has been taken with a recorded slider and dial position. So the ids
  are accepted, and the attribution is not asserted: the fingerprint decides
  what the device *is*, the id only says whether it might be this family.

  Do not infer the dial position from a ``20bc`` sighting.

* Whammy and tilt are full 8-bit axes over these reports (PlasticBand: whammy at
  byte offset 41, tilt at 42 on PS5; 45/46 on PS4), not the hat-shaped digital
  tilt this app originally assumed from a raw evdev dump.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass(frozen=True)
class ModePreset:
    """One position of the hardware's Mode Dial."""
    position: int
    name: str
    description: str
    # What the host actually sees in this position.
    presents_as: str
    # Game this position is intended for, if any.
    intended_for: str = ""
    # True when the position is user-programmable via the companion app.
    programmable: bool = False


@dataclass(frozen=True)
class ControllerFamily:
    """A known controller family and how to recognise and map it."""
    family_id: str
    display_name: str
    # USB ids measured or documented for this family. Empty means
    # "recognise by fingerprint / name only".
    vendor_ids: tuple[int, ...] = ()
    product_ids: tuple[int, ...] = ()
    name_patterns: tuple[str, ...] = ()
    kind: str = "guitar"
    source: str = ""
    # The mode dial, where the device has one.
    mode_presets: tuple[ModePreset, ...] = ()
    # Controls the device physically has, for the profile builder.
    has_solo_frets: bool = False
    has_tilt: bool = True
    has_whammy: bool = True
    has_sticks: bool = False
    has_nav_hub: bool = False
    # Things a user must do on the hardware for a profile to work.
    setup_notes: tuple[str, ...] = field(default_factory=tuple)

    def matches(self, vendor_id: int, product_id: int, name: str,
                usb_manufacturer: str = "", usb_product: str = "") -> bool:
        """Does this family describe the device?

        USB *string descriptors* are checked first and are the strongest signal,
        because a device can lie about its ids but rarely about its strings. The
        CRKD guitar presents as ``045e:028e`` -- a Microsoft Xbox 360 pad, and
        every one of those is in the wild -- while its descriptors still read
        manufacturer="CRKD", product="CRKD Guitar". Matching on ids alone would
        either miss the guitar entirely or claim every 360 pad is one.
        """
        haystack = " ".join(
            part for part in (usb_manufacturer, usb_product, name) if part
        ).lower()
        if usb_manufacturer or usb_product:
            if any(pattern in haystack for pattern in self.name_patterns):
                return True
        if self.vendor_ids and vendor_id in self.vendor_ids:
            if not self.product_ids or product_id in self.product_ids:
                return True
        return any(pattern in (name or "").lower() for pattern in self.name_patterns)


# ===================================================================
# CRKD Gibson Les Paul Pro Edition
# ===================================================================

CRKD_LES_PAUL_MODES: tuple[ModePreset, ...] = (
    ModePreset(1, "Guitar Controller Default",
               "Standard guitar mapping; the CTRL button reports as Select.",
               "gamepad", "Clone Hero, YARG, Rock Band 4"),
    ModePreset(2, "Festival - Pro",
               "Festival pro-mode mapping; remaps CTRL so pro mode works in Fortnite.",
               "gamepad", "Fortnite Festival (Pro)"),
    ModePreset(3, "Festival - Easy/Medium/Hard",
               "Festival mapping tuned for lower difficulties.",
               "gamepad", "Fortnite Festival (E/M/H)"),
    ModePreset(4, "Festival - Expert",
               "Festival mapping tuned for Expert.",
               "gamepad", "Fortnite Festival (Expert)"),
    ModePreset(5, "Programmable 5", "User slot, set via CRKD CTRL.",
               "gamepad", programmable=True),
    ModePreset(6, "Programmable 6", "User slot, set via CRKD CTRL.",
               "gamepad", programmable=True),
    ModePreset(7, "Programmable 7", "User slot, set via CRKD CTRL.",
               "gamepad", programmable=True),
    ModePreset(8, "Programmable 8", "User slot, set via CRKD CTRL.",
               "gamepad", programmable=True),
    ModePreset(9, "KEYJAM / RB4",
               "Platform-dependent: on PC it is KEYJAM (guitar acts as a "
               "keyboard + mouse); on Xbox it is RB4 Mode.",
               "keyboard", "Fortnite Festival via keyboard mapping, Rock Band 4 (XB)"),
)

CRKD_LES_PAUL = ControllerFamily(
    family_id="crkd_les_paul_pro",
    display_name="CRKD Gibson Les Paul Pro Edition",
    # Vendor ids this family has been seen as, or is documented as:
    #   0x0351 / 0x3651 -- CRKD's own ids (PlasticBand: PS4 1500/5500,
    #                     PS5 1600/5600, Xbox One 4161; SDL: 0x1000/0x2000/0x6000)
    #   0x20BC          -- ShenZhen ShanWan bridge; captured from a unit labelled
    #                     "CRKD Gamepad", but the vendor is ShanWan's, not
    #                     CRKD's. Accepted because the device appears as this,
    #                     never asserted as a CRKD id.
    #   0x2E95          -- CRKD's older documented range used by early profiles
    vendor_ids=(0x0351, 0x3651, 0x20BC, 0x2E95),
    product_ids=(
        0x1000, 0x2000, 0x6000,             # 0351/3651 per SDL ("CRKD Guitar")
        0x5500, 0x5600, 0x1500, 0x1600,     # 3651 range (PS4/PS5, wired + dongle)
        0x4161,                             # 3651 Xbox One
        0x0882, 0x0883, 0x0884, 0x0150, 0x0151,  # documented / legacy range
    ),
    name_patterns=("crkd guitar", "crkd gamepad", "crkd", "les paul"),
    kind="guitar",
    source=(
        "crkd.gg product page, CRKD CK25GM user guide, CRKD firmware v2.0 notes, "
        "and TheNathannator/PlasticBand peripheral documentation (CC BY-SA 4.0)"
    ),
    mode_presets=CRKD_LES_PAUL_MODES,
    has_solo_frets=False,   # the OG neck has no lower fret row; a Solo neck is sold separately
    has_tilt=True,   # 8-bit axis per PlasticBand (byte 42 PS5 / 46 PS4)
    has_whammy=True,  # 8-bit axis, 0x00 rest -> 0xFF fully pressed
    has_sticks=True,        # two Hall Effect sticks (nav hub + tone knob)
    has_nav_hub=True,
    setup_notes=(
        "Set the Platform Slider to PC for Steam Deck / PC use.",
        "Turn the Mode Dial to 1 for Guitar Controller Default (Clone Hero / YARG / RB4).",
        "Use Mode 2 for Fortnite Festival Pro — mode 1 maps CTRL to Select, "
        "which opens a menu and cannot be remapped in-game.",
        "Mode 9 is KEYJAM on PC: the guitar reports as a keyboard, not a gamepad, "
        "so a gamepad profile will not apply in that position.",
        "Tilt for star power can be disabled on the hardware (hold View 6 s); "
        "the third status LED stays Cyan while it is off.",
    ),
)


KNOWN_FAMILIES: tuple[ControllerFamily, ...] = (CRKD_LES_PAUL,)


def find_family(vendor_id: int, product_id: int, name: str,
                usb_manufacturer: str = "", usb_product: str = "") -> Optional[ControllerFamily]:
    """Match a device against the built-in families."""
    for family in KNOWN_FAMILIES:
        if family.matches(vendor_id, product_id, name, usb_manufacturer, usb_product):
            return family
    return None


def mode_for_position(family: ControllerFamily, position: int) -> Optional[ModePreset]:
    for mode in family.mode_presets:
        if mode.position == position:
            return mode
    return None


def presets_for_family(family: ControllerFamily) -> dict[str, Any]:
    """Describe a family and its modes for the API/UI."""
    return {
        "family_id": family.family_id,
        "display_name": family.display_name,
        "kind": family.kind,
        "source": family.source,
        "vendor_ids": [f"0x{v:04x}" for v in family.vendor_ids],
        "product_ids": [f"0x{p:04x}" for p in family.product_ids],
        "setup_notes": list(family.setup_notes),
        "modes": [
            {
                "position": m.position,
                "name": m.name,
                "description": m.description,
                "presents_as": m.presents_as,
                "intended_for": m.intended_for,
                "programmable": m.programmable,
            }
            for m in family.mode_presets
        ],
    }


def all_families() -> list[dict[str, Any]]:
    """Describe every known controller family."""
    return [presets_for_family(family) for family in KNOWN_FAMILIES]

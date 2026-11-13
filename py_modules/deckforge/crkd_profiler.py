"""
DeckForge Input Studio — CRKD NEO S Pro Guitar Auto-Profiler.

Detects CRKD NEO S Pro Guitar and related rhythm game hardware by vendor ID,
product ID, and input capability heuristics. Automatically calibrates whammy
and tilt axes, detects fret and strum button mappings, and generates optimized
Steam Input VDF templates for Clone Hero, YARG, Rock Band 4, and Guitar Hero III.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import evdev
from evdev import ecodes

from .calibration import TiltThresholdCalibrator, WhammyNormalizer
from .input_sniffer import DeviceInfo, discover_devices
from .vdf_manager import VDFTemplate

logger = logging.getLogger(__name__)

# Known CRKD and guitar controller hardware IDs
CRKD_VENDOR_ID = 0x2E95
CRKD_KNOWN_PIDS = {
    0x0880,  # CRKD NEO S Controller / Guitar Mode
    0x0881,  # CRKD Nitro Deck+
    0x0882,  # CRKD NEO S Pro Guitar edition
    0x0883,  # CRKD Les Paul Pro Model
    0x0884,  # CRKD Les Paul Pro (Wireless 2.4GHz)
    0x0885,  # CRKD Neo Classic
    0x0886,  # CRKD Pro Series Guitar
    0x0150,  # CRKD Les Paul Pro Edition
    0x0151,  # CRKD Les Paul Pro USB Mode
}

# Alternate vendor IDs for third-party guitars (RedOctane, Harmonix, PDP, etc.)
GUITAR_VENDOR_PIDS: set[tuple[int, int]] = {
    (0x1430, 0x4748),  # RedOctane Guitar Hero X-plorer
    (0x12BA, 0x0100),  # RedOctane PS3 Guitar Hero Les Paul
    (0x1430, 0x0719),  # Xbox 360 Wireless Les Paul Receiver
    (0x1BAD, 0x0002),  # Harmonix Rock Band Guitar (Xbox 360)
    (0x12BA, 0x0200),  # Harmonix Rock Band Guitar (PS3)
    (0x0E6F, 0x0170),  # PDP Riffmaster (Xbox)
    (0x0E6F, 0x0248),  # PDP Riffmaster (PlayStation)
}

GUITAR_NAME_PATTERNS = [
    "crkd",
    "les paul",
    "lespaul",
    "lp pro",
    "crkd pro",
    "guitar",
    "riffmaster",
    "x-plorer",
    "rock band",
    "guitar hero",
    "strum",
    "fret",
    "neo s",
]


@dataclass
class CRKDGuitarProfile:
    """Hardware profile and mapping configuration for a guitar controller."""
    device_path: str = ""
    device_name: str = "CRKD Les Paul Pro Model"
    vendor_id: int = CRKD_VENDOR_ID
    product_id: int = 0x0883
    blueprint_id: str = "crkd_les_paul"

    # Fret buttons mapped to evdev key codes (or code names)
    fret_green: str = "BTN_SOUTH"      # Green / A
    fret_red: str = "BTN_EAST"        # Red / B
    fret_yellow: str = "BTN_NORTH"    # Yellow / Y
    fret_blue: str = "BTN_WEST"       # Blue / X
    fret_orange: str = "BTN_TL"       # Orange / LB

    # Solo frets (high fret buttons near body)
    solo_frets: dict[str, str] = field(default_factory=lambda: {
        "solo_green": "BTN_C",
        "solo_red": "BTN_Z",
        "solo_yellow": "BTN_THUMB",
        "solo_blue": "BTN_THUMB2",
        "solo_orange": "BTN_BASE",
    })

    # Strum bar
    strum_up: str = "BTN_DPAD_UP"
    strum_down: str = "BTN_DPAD_DOWN"

    # Analog axes
    whammy_axis: str = "ABS_RZ"
    tilt_axis: str = "ABS_Y"

    # Les Paul Pro specific controls
    pickup_toggle: str = "BTN_MODE"     # Rhythm/Treble switch -> Star Power / Layer
    knob_vol_neck: str = "ABS_RX"       # Rotary knob 1
    knob_vol_bridge: str = "ABS_RY"     # Rotary knob 2
    knob_tone_neck: str = "ABS_Z"       # Rotary knob 3
    knob_tone_bridge: str = "ABS_RZ"    # Rotary knob 4

    # Navigation / Menu buttons
    dpad_up: str = "BTN_DPAD_UP"
    dpad_down: str = "BTN_DPAD_DOWN"
    dpad_left: str = "BTN_DPAD_LEFT"
    dpad_right: str = "BTN_DPAD_RIGHT"
    start_button: str = "BTN_START"
    select_button: str = "BTN_SELECT"
    star_power_button: str = "BTN_MODE"

    # Calibration parameters
    whammy_normalizer: WhammyNormalizer = field(default_factory=WhammyNormalizer)
    tilt_calibrator: TiltThresholdCalibrator = field(default_factory=TiltThresholdCalibrator)

    def to_dict(self) -> dict[str, Any]:
        return {
            "device_path": self.device_path,
            "device_name": self.device_name,
            "vendor_id": f"0x{self.vendor_id:04x}",
            "product_id": f"0x{self.product_id:04x}",
            "blueprint_id": self.blueprint_id,
            "fret_buttons": {
                "green": self.fret_green,
                "red": self.fret_red,
                "yellow": self.fret_yellow,
                "blue": self.fret_blue,
                "orange": self.fret_orange,
            },
            "solo_frets": self.solo_frets,
            "strum_bar": {
                "up": self.strum_up,
                "down": self.strum_down,
            },
            "whammy_axis": self.whammy_axis,
            "tilt_axis": self.tilt_axis,
            "pickup_toggle": self.pickup_toggle,
            "speed_knobs": {
                "vol_neck": self.knob_vol_neck,
                "vol_bridge": self.knob_vol_bridge,
                "tone_neck": self.knob_tone_neck,
                "tone_bridge": self.knob_tone_bridge,
            },
            "dpad": {
                "up": self.dpad_up,
                "down": self.dpad_down,
                "left": self.dpad_left,
                "right": self.dpad_right,
            },
            "start": self.start_button,
            "select": self.select_button,
            "star_power": self.star_power_button,
            "whammy_calibration": self.whammy_normalizer.to_dict(),
            "tilt_calibration": self.tilt_calibrator.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CRKDGuitarProfile":
        fb = data.get("fret_buttons", {})
        sb = data.get("strum_bar", {})
        dp = data.get("dpad", {})
        sk = data.get("speed_knobs", {})
        return cls(
            device_path=data.get("device_path", ""),
            device_name=data.get("device_name", "CRKD Les Paul Pro Model"),
            vendor_id=int(str(data.get("vendor_id", "0x2E95")), 16) if isinstance(data.get("vendor_id"), str) else int(data.get("vendor_id", CRKD_VENDOR_ID)),
            product_id=int(str(data.get("product_id", "0x0883")), 16) if isinstance(data.get("product_id"), str) else int(data.get("product_id", 0x0883)),
            blueprint_id=data.get("blueprint_id", "crkd_les_paul"),
            fret_green=fb.get("green", "BTN_SOUTH"),
            fret_red=fb.get("red", "BTN_EAST"),
            fret_yellow=fb.get("yellow", "BTN_NORTH"),
            fret_blue=fb.get("blue", "BTN_WEST"),
            fret_orange=fb.get("orange", "BTN_TL"),
            solo_frets=data.get("solo_frets", {}),
            strum_up=sb.get("up", "BTN_DPAD_UP"),
            strum_down=sb.get("down", "BTN_DPAD_DOWN"),
            whammy_axis=data.get("whammy_axis", "ABS_RZ"),
            tilt_axis=data.get("tilt_axis", "ABS_Y"),
            pickup_toggle=data.get("pickup_toggle", "BTN_MODE"),
            knob_vol_neck=sk.get("vol_neck", "ABS_RX"),
            knob_vol_bridge=sk.get("vol_bridge", "ABS_RY"),
            knob_tone_neck=sk.get("tone_neck", "ABS_Z"),
            knob_tone_bridge=sk.get("tone_bridge", "ABS_RZ"),
            dpad_up=dp.get("up", "BTN_DPAD_UP"),
            dpad_down=dp.get("down", "BTN_DPAD_DOWN"),
            dpad_left=dp.get("left", "BTN_DPAD_LEFT"),
            dpad_right=dp.get("right", "BTN_DPAD_RIGHT"),
            start_button=data.get("start", "BTN_START"),
            select_button=data.get("select", "BTN_SELECT"),
            star_power_button=data.get("star_power", "BTN_MODE"),
            whammy_normalizer=WhammyNormalizer.from_dict(data.get("whammy_calibration", {})),
            tilt_calibrator=TiltThresholdCalibrator.from_dict(data.get("tilt_calibration", {})),
        )


def is_crkd_or_guitar_device(dev: DeviceInfo) -> bool:
    """Check if a device matches CRKD vendor or guitar patterns."""
    if dev.vendor_id == CRKD_VENDOR_ID:
        return True
    if (dev.vendor_id, dev.product_id) in GUITAR_VENDOR_PIDS:
        return True
    name_lower = dev.name.lower()
    return any(p in name_lower for p in GUITAR_NAME_PATTERNS)


def auto_detect_crkd_les_paul() -> CRKDGuitarProfile:
    """Return a dedicated profile configured for the CRKD Les Paul Pro Model."""
    profile = auto_detect_crkd()
    profile.device_name = "CRKD Les Paul Pro Model"
    profile.blueprint_id = "crkd_les_paul"
    profile.product_id = 0x0883
    return profile


def auto_detect_crkd() -> CRKDGuitarProfile:
    """Scans connected devices and returns a fully mapped CRKDGuitarProfile.

    If an actual CRKD or guitar device is found, its capabilities are scanned
    and configured. Otherwise, a standard default profile is returned.
    """
    devices = discover_devices()
    matched_dev: Optional[DeviceInfo] = None

    for dev in devices:
        if is_crkd_or_guitar_device(dev):
            matched_dev = dev
            break

    profile = CRKDGuitarProfile()
    if matched_dev is None:
        logger.info("No physical CRKD / guitar controller detected. Using default profile.")
        return profile

    profile.device_path = matched_dev.path
    profile.device_name = matched_dev.name
    profile.vendor_id = matched_dev.vendor_id
    profile.product_id = matched_dev.product_id

    # Inspect capabilities to refine button and axis mappings
    caps = matched_dev.capabilities
    key_caps = set(caps.get("EV_KEY", []) + caps.get("1", []))
    abs_caps = set(caps.get("EV_ABS", []) + caps.get("3", []))

    # Fret auto-assignment based on present key codes
    if "BTN_SOUTH" in key_caps:
        profile.fret_green = "BTN_SOUTH"
        profile.fret_red = "BTN_EAST" if "BTN_EAST" in key_caps else "BTN_B"
        profile.fret_yellow = "BTN_NORTH" if "BTN_NORTH" in key_caps else "BTN_Y"
        profile.fret_blue = "BTN_WEST" if "BTN_WEST" in key_caps else "BTN_X"
        profile.fret_orange = "BTN_TL" if "BTN_TL" in key_caps else "BTN_TR"
    elif "BTN_1" in key_caps or "BTN_A" in key_caps:
        profile.fret_green = "BTN_A"
        profile.fret_red = "BTN_B"
        profile.fret_yellow = "BTN_X"
        profile.fret_blue = "BTN_Y"
        profile.fret_orange = "BTN_TL"

    # Strum assignment
    if "BTN_DPAD_UP" in key_caps and "BTN_DPAD_DOWN" in key_caps:
        profile.strum_up = "BTN_DPAD_UP"
        profile.strum_down = "BTN_DPAD_DOWN"
    elif "ABS_HAT0Y" in abs_caps:
        profile.strum_up = "ABS_HAT0Y_NEG"
        profile.strum_down = "ABS_HAT0Y_POS"

    # Whammy axis detection: typically ABS_RZ or ABS_Z
    if "ABS_RZ" in abs_caps:
        profile.whammy_axis = "ABS_RZ"
    elif "ABS_Z" in abs_caps:
        profile.whammy_axis = "ABS_Z"
    elif "ABS_RX" in abs_caps:
        profile.whammy_axis = "ABS_RX"

    # Tilt axis detection: typically ABS_Y or ABS_RY
    if "ABS_RY" in abs_caps:
        profile.tilt_axis = "ABS_RY"
    elif "ABS_Y" in abs_caps:
        profile.tilt_axis = "ABS_Y"

    # Match Les Paul Pro Model or specific guitar variant
    name_lower = matched_dev.name.lower()
    if "les paul" in name_lower or "lespaul" in name_lower or "lp pro" in name_lower or matched_dev.product_id in {0x0883, 0x0884, 0x0150, 0x0151}:
        profile.blueprint_id = "crkd_les_paul"
        profile.device_name = matched_dev.name if ("les paul" in name_lower or "crkd" in name_lower) else "CRKD Les Paul Pro Model"
    elif "neo s" in name_lower or matched_dev.product_id == 0x0882:
        profile.blueprint_id = "crkd_guitar"
        profile.device_name = "CRKD NEO S Pro Guitar"

    # Configure whammy normalizer and tilt calibrator defaults
    profile.whammy_normalizer = WhammyNormalizer(raw_min=-32768, raw_max=32767, rest_value=-32768)
    profile.tilt_calibrator = TiltThresholdCalibrator(activation_threshold=0.65)

    return profile


def generate_crkd_template(
    profile: CRKDGuitarProfile,
    target_game: str = "Clone Hero",
) -> VDFTemplate:
    """Generate an optimized Steam Input VDFTemplate for CRKD / guitar controllers.

    Supported target games:
    - "Clone Hero" / "clone_hero"
    - "YARG" / "yarg"
    - "Rock Band 4 (RPCS3)" / "rb4" / "rpcs3"
    - "Guitar Hero III (PCSX2)" / "gh3" / "pcsx2"
    """
    game_key = target_game.lower().replace(" ", "_").replace("(", "").replace(")", "")

    if "clone_hero" in game_key or "clone" in game_key:
        return _build_clone_hero_template(profile)
    elif "yarg" in game_key:
        return _build_yarg_template(profile)
    elif "rb4" in game_key or "rock_band" in game_key or "rpcs3" in game_key:
        return _build_rpcs3_template(profile)
    elif "gh3" in game_key or "guitar_hero" in game_key or "pcsx2" in game_key:
        return _build_pcsx2_template(profile)
    else:
        # Generic rhythm game template
        return _build_clone_hero_template(profile)


def _build_clone_hero_template(profile: CRKDGuitarProfile) -> VDFTemplate:
    """Clone Hero mapping: direct keyboard keys or standard XInput."""
    is_lp = profile.blueprint_id == "crkd_les_paul" or "les paul" in profile.device_name.lower()
    prefix = "CRKD Les Paul Pro" if is_lp else "CRKD Neo S"
    title = f"{prefix} - Clone Hero ({profile.device_name})"
    description = (
        f"Zero-latency profile for Clone Hero on {profile.device_name}. "
        "Frets mapped to standard keyboard keys (A, S, J, K, L) and strum to Up/Down arrows. "
        "Whammy on right stick Y, Star Power on Space & Pickup Toggle."
    )

    bindings = [
        {"name": "Green Fret", "input": profile.fret_green, "output": "key_press A", "mode": "RegularPress"},
        {"name": "Red Fret", "input": profile.fret_red, "output": "key_press S", "mode": "RegularPress"},
        {"name": "Yellow Fret", "input": profile.fret_yellow, "output": "key_press J", "mode": "RegularPress"},
        {"name": "Blue Fret", "input": profile.fret_blue, "output": "key_press K", "mode": "RegularPress"},
        {"name": "Orange Fret", "input": profile.fret_orange, "output": "key_press L", "mode": "RegularPress"},
        {"name": "Strum Up", "input": profile.strum_up, "output": "key_press UP_ARROW", "mode": "RegularPress"},
        {"name": "Strum Down", "input": profile.strum_down, "output": "key_press DOWN_ARROW", "mode": "RegularPress"},
        {"name": "Whammy", "input": profile.whammy_axis, "output": "xinput_axis RIGHT_Y", "mode": "Absolute"},
        {"name": "Tilt / Star Power", "input": profile.tilt_axis, "output": "key_press SPACE", "mode": "RegularPress"},
        {"name": "Start", "input": profile.start_button, "output": "key_press RETURN", "mode": "RegularPress"},
        {"name": "Select", "input": profile.select_button, "output": "key_press ESCAPE", "mode": "RegularPress"},
    ]

    if is_lp and profile.pickup_toggle:
        bindings.append({
            "name": "Pickup / Star Power Switch",
            "input": profile.pickup_toggle,
            "output": "key_press SPACE",
            "mode": "RegularPress",
        })

    action_sets = [{
        "name": "InGame",
        "title": "Clone Hero In-Game",
        "bindings": bindings,
    }]

    return VDFTemplate(
        version=3,
        title=title,
        description=description,
        creator="DeckForge CRKD Profiler",
        controller_type="neptune",
        group_source_bindings=bindings,
        action_sets=action_sets,
    )


def _build_yarg_template(profile: CRKDGuitarProfile) -> VDFTemplate:
    """YARG (Yet Another Rhythm Game) template with MIDI/gamepad bindings."""
    title = f"CRKD Neo S - YARG Pro ({profile.device_name})"
    description = (
        "Optimized YARG mapping with low-jitter mechanical fret polling, "
        "whammy half-axis normalization, and responsive tilt trigger."
    )

    bindings = [
        {"name": "Green Fret", "input": profile.fret_green, "output": "xinput_button A", "mode": "RegularPress"},
        {"name": "Red Fret", "input": profile.fret_red, "output": "xinput_button B", "mode": "RegularPress"},
        {"name": "Yellow Fret", "input": profile.fret_yellow, "output": "xinput_button Y", "mode": "RegularPress"},
        {"name": "Blue Fret", "input": profile.fret_blue, "output": "xinput_button X", "mode": "RegularPress"},
        {"name": "Orange Fret", "input": profile.fret_orange, "output": "xinput_button SHOULDER_LEFT", "mode": "RegularPress"},
        {"name": "Strum Up", "input": profile.strum_up, "output": "xinput_button DPAD_UP", "mode": "RegularPress"},
        {"name": "Strum Down", "input": profile.strum_down, "output": "xinput_button DPAD_DOWN", "mode": "RegularPress"},
        {"name": "Whammy Bar", "input": profile.whammy_axis, "output": "xinput_axis RIGHT_Y", "mode": "Absolute"},
        {"name": "Tilt Star Power", "input": profile.tilt_axis, "output": "xinput_button BACK", "mode": "RegularPress"},
        {"name": "Pause", "input": profile.start_button, "output": "xinput_button START", "mode": "RegularPress"},
    ]

    return VDFTemplate(
        version=3,
        title=title,
        description=description,
        creator="DeckForge CRKD Profiler",
        controller_type="neptune",
        group_source_bindings=bindings,
        action_sets=[{"name": "YARG_Default", "bindings": bindings}],
    )


def _build_rpcs3_template(profile: CRKDGuitarProfile) -> VDFTemplate:
    """Rock Band 4 / Guitar Hero on RPCS3 (PS3 emulation) mapping."""
    title = f"CRKD Neo S - Rock Band 4 (RPCS3)"
    description = (
        "PS3 Guitar controller emulated layout for RPCS3. "
        "Fret buttons mapped to L2/L1/R1/R2/X for native guitar detection."
    )

    bindings = [
        {"name": "Green Fret", "input": profile.fret_green, "output": "xinput_button TRIGGER_LEFT", "mode": "RegularPress"},
        {"name": "Red Fret", "input": profile.fret_red, "output": "xinput_button SHOULDER_LEFT", "mode": "RegularPress"},
        {"name": "Yellow Fret", "input": profile.fret_yellow, "output": "xinput_button SHOULDER_RIGHT", "mode": "RegularPress"},
        {"name": "Blue Fret", "input": profile.fret_blue, "output": "xinput_button TRIGGER_RIGHT", "mode": "RegularPress"},
        {"name": "Orange Fret", "input": profile.fret_orange, "output": "xinput_button A", "mode": "RegularPress"},
        {"name": "Strum Up", "input": profile.strum_up, "output": "xinput_button DPAD_UP", "mode": "RegularPress"},
        {"name": "Strum Down", "input": profile.strum_down, "output": "xinput_button DPAD_DOWN", "mode": "RegularPress"},
        {"name": "Whammy Bar", "input": profile.whammy_axis, "output": "xinput_axis RIGHT_X", "mode": "Absolute"},
        {"name": "Tilt Overdrive", "input": profile.tilt_axis, "output": "xinput_button BACK", "mode": "RegularPress"},
        {"name": "Start", "input": profile.start_button, "output": "xinput_button START", "mode": "RegularPress"},
    ]

    return VDFTemplate(
        version=3,
        title=title,
        description=description,
        creator="DeckForge CRKD Profiler",
        controller_type="neptune",
        group_source_bindings=bindings,
        action_sets=[{"name": "RPCS3_Guitar", "bindings": bindings}],
    )


def _build_pcsx2_template(profile: CRKDGuitarProfile) -> VDFTemplate:
    """Guitar Hero III on PCSX2 (PS2 emulation) mapping."""
    title = f"CRKD Neo S - Guitar Hero III (PCSX2)"
    description = (
        "PCSX2 DualShock 2 emulated mapping for Guitar Hero 1/2/3/Encore. "
        "Green=R2, Red=Circle, Yellow=Triangle, Blue=Cross, Orange=Square."
    )

    bindings = [
        {"name": "Green Fret (R2)", "input": profile.fret_green, "output": "xinput_button TRIGGER_RIGHT", "mode": "RegularPress"},
        {"name": "Red Fret (Circle)", "input": profile.fret_red, "output": "xinput_button B", "mode": "RegularPress"},
        {"name": "Yellow Fret (Triangle)", "input": profile.fret_yellow, "output": "xinput_button Y", "mode": "RegularPress"},
        {"name": "Blue Fret (Cross)", "input": profile.fret_blue, "output": "xinput_button A", "mode": "RegularPress"},
        {"name": "Orange Fret (Square)", "input": profile.fret_orange, "output": "xinput_button X", "mode": "RegularPress"},
        {"name": "Strum Up", "input": profile.strum_up, "output": "xinput_button DPAD_UP", "mode": "RegularPress"},
        {"name": "Strum Down", "input": profile.strum_down, "output": "xinput_button DPAD_DOWN", "mode": "RegularPress"},
        {"name": "Whammy Bar", "input": profile.whammy_axis, "output": "xinput_axis RIGHT_Y", "mode": "Absolute"},
        {"name": "Star Power (Select)", "input": profile.tilt_axis, "output": "xinput_button BACK", "mode": "RegularPress"},
        {"name": "Start", "input": profile.start_button, "output": "xinput_button START", "mode": "RegularPress"},
    ]

    return VDFTemplate(
        version=3,
        title=title,
        description=description,
        creator="DeckForge CRKD Profiler",
        controller_type="neptune",
        group_source_bindings=bindings,
        action_sets=[{"name": "PCSX2_GH3", "bindings": bindings}],
    )

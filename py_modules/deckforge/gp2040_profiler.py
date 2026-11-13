"""
DeckForge Input Studio — GP2040-CE / RP2040 Custom Guitar Auto-Profiler.

Detects custom Raspberry Pi RP2040, GP2040-CE firmware builds, Santroller,
and open-source 3D-printed guitar controllers (e.g., Riffstick, Polybar,
PicoFret). Automatically detects fret buttons, mechanical Cherry MX strum bar,
rotary/potentiometer whammy, and tilt switches to generate optimized Steam
Input VDF templates for Clone Hero and YARG.
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

# Raspberry Pi Foundation & GP2040-CE / OpenStick Hardware Identifiers
RASPBERRY_PI_VID = 0x2E8A

GP2040_KNOWN_PIDS: set[int] = {
    0x0003,  # Raspberry Pi Pico USB
    0x000A,  # Pico SDK generic gamepad
    0x0009,  # RP2040 CircuitPython / MicroPython HID
    0x0A00,  # GP2040-CE default gamepad mode
    0x0A01,  # GP2040-CE custom keyboard mode
    0x0A02,  # GP2040-CE MIDI controller mode
    0x1000,  # OpenStick community build
    0x1001,  # OpenStick guitar controller firmware
}

# Open-source / DIY controller USB signatures (Raspberry Pi, Arduino, Teensy)
DIY_GUITAR_VENDOR_PIDS: set[tuple[int, int]] = {
    (0x2E8A, 0x0003),  # Pico Default
    (0x2E8A, 0x000A),  # Pico SDK Gamepad
    (0x2E8A, 0x0A00),  # GP2040-CE standard
    (0x2341, 0x8036),  # Arduino Leonardo (Santroller/Ardwiino)
    (0x2341, 0x8037),  # Arduino Micro (Santroller)
    (0x16C0, 0x0486),  # Teensy USB Serial/Keyboard/Joystick
    (0x045E, 0x028E),  # Xbox 360 emulation mode (common GP2040-CE XInput mode)
}

GP2040_NAME_PATTERNS = [
    "gp2040",
    "gp2040-ce",
    "rp2040",
    "openstick",
    "riffstick",
    "picofret",
    "pico guitar",
    "santroller",
    "ardwiino",
    "polybar",
    "diy guitar",
    "pi pico",
]


@dataclass
class GP2040GuitarProfile:
    """Hardware profile and mapping configuration for a custom GP2040-CE / RP2040 guitar."""
    device_path: str = ""
    device_name: str = "GP2040-CE Custom Guitar"
    vendor_id: int = RASPBERRY_PI_VID
    product_id: int = 0x0A00
    is_xinput_mode: bool = True

    # Main fret buttons (Mechanical Cherry MX / Kailh switches)
    fret_green: str = "BTN_SOUTH"      # Green / A
    fret_red: str = "BTN_EAST"        # Red / B
    fret_yellow: str = "BTN_NORTH"    # Yellow / Y
    fret_blue: str = "BTN_WEST"       # Blue / X
    fret_orange: str = "BTN_TL"       # Orange / LB / L1

    # Solo fret row (higher neck section)
    solo_frets: dict[str, str] = field(default_factory=lambda: {
        "solo_green": "BTN_C",
        "solo_red": "BTN_Z",
        "solo_yellow": "BTN_THUMB",
        "solo_blue": "BTN_THUMB2",
        "solo_orange": "BTN_BASE",
    })

    # Mechanical dual-switch strum bar
    strum_up: str = "BTN_DPAD_UP"
    strum_down: str = "BTN_DPAD_DOWN"

    # Analog axes
    whammy_axis: str = "ABS_RZ"       # Rotary pot or spring lever
    tilt_axis: str = "ABS_Y"          # Accelerometer or analog tilt

    # Aux / Menu switches
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
    debounce_ms: int = 2              # Low debounce for fast mechanical switches

    def to_dict(self) -> dict[str, Any]:
        return {
            "device_path": self.device_path,
            "device_name": self.device_name,
            "vendor_id": f"0x{self.vendor_id:04x}",
            "product_id": f"0x{self.product_id:04x}",
            "is_xinput_mode": self.is_xinput_mode,
            "fret_green": self.fret_green,
            "fret_red": self.fret_red,
            "fret_yellow": self.fret_yellow,
            "fret_blue": self.fret_blue,
            "fret_orange": self.fret_orange,
            "solo_frets": self.solo_frets,
            "strum_up": self.strum_up,
            "strum_down": self.strum_down,
            "whammy_axis": self.whammy_axis,
            "tilt_axis": self.tilt_axis,
            "start_button": self.start_button,
            "select_button": self.select_button,
            "star_power_button": self.star_power_button,
            "debounce_ms": self.debounce_ms,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "GP2040GuitarProfile":
        vid = data.get("vendor_id", RASPBERRY_PI_VID)
        pid = data.get("product_id", 0x0A00)
        if isinstance(vid, str):
            vid = int(vid, 16) if vid.startswith("0x") else int(vid)
        if isinstance(pid, str):
            pid = int(pid, 16) if pid.startswith("0x") else int(pid)

        return cls(
            device_path=data.get("device_path", ""),
            device_name=data.get("device_name", "GP2040-CE Custom Guitar"),
            vendor_id=vid,
            product_id=pid,
            is_xinput_mode=data.get("is_xinput_mode", True),
            fret_green=data.get("fret_green", "BTN_SOUTH"),
            fret_red=data.get("fret_red", "BTN_EAST"),
            fret_yellow=data.get("fret_yellow", "BTN_NORTH"),
            fret_blue=data.get("fret_blue", "BTN_WEST"),
            fret_orange=data.get("fret_orange", "BTN_TL"),
            solo_frets=data.get("solo_frets", {}),
            strum_up=data.get("strum_up", "BTN_DPAD_UP"),
            strum_down=data.get("strum_down", "BTN_DPAD_DOWN"),
            whammy_axis=data.get("whammy_axis", "ABS_RZ"),
            tilt_axis=data.get("tilt_axis", "ABS_Y"),
            start_button=data.get("start_button", "BTN_START"),
            select_button=data.get("select_button", "BTN_SELECT"),
            star_power_button=data.get("star_power_button", "BTN_MODE"),
            debounce_ms=int(data.get("debounce_ms", 2)),
        )


def is_gp2040_device(dev: DeviceInfo) -> bool:
    """Return True if the DeviceInfo represents a GP2040-CE / RP2040 custom controller."""
    # 1. Vendor ID check
    if dev.vendor_id == RASPBERRY_PI_VID:
        return True

    # 2. Known DIY Vendor/Product ID pairs
    if (dev.vendor_id, dev.product_id) in DIY_GUITAR_VENDOR_PIDS:
        return True

    # 3. Name heuristics
    name_lower = dev.name.lower()
    for pattern in GP2040_NAME_PATTERNS:
        if pattern in name_lower:
            return True

    return False


def auto_detect_gp2040(
    devices: Optional[list[DeviceInfo]] = None,
) -> Optional[GP2040GuitarProfile]:
    """Scan connected input devices for a GP2040-CE or RP2040 custom controller.

    If found, inspect its capabilities to populate button and axis mappings.
    """
    dev_list = devices if devices is not None else discover_devices()

    for dev in dev_list:
        if not is_gp2040_device(dev):
            continue

        logger.info("Found GP2040-CE / RP2040 device: %s (%s)", dev.name, dev.path)
        profile = GP2040GuitarProfile(
            device_path=dev.path,
            device_name=dev.name,
            vendor_id=dev.vendor_id,
            product_id=dev.product_id,
        )

        caps = dev.capabilities
        key_caps = set(caps.get("EV_KEY", []))
        abs_caps = set(caps.get("EV_ABS", []))

        # Check for XInput vs Keyboard mode
        profile.is_xinput_mode = "BTN_SOUTH" in key_caps or "BTN_A" in key_caps

        # Auto-bind whammy axis
        for candidate_axis in ("ABS_RZ", "ABS_Z", "ABS_THROTTLE", "ABS_RX"):
            if candidate_axis in abs_caps:
                profile.whammy_axis = candidate_axis
                break

        # Auto-bind tilt axis
        for candidate_tilt in ("ABS_Y", "ABS_RY", "ABS_TILT_Y"):
            if candidate_tilt in abs_caps:
                profile.tilt_axis = candidate_tilt
                break

        return profile

    return None


def generate_gp2040_template(
    profile: Optional[GP2040GuitarProfile] = None,
    target_game: str = "clone_hero",
) -> VDFTemplate:
    """Generate a Steam Input VDFTemplate tailored for GP2040-CE / RP2040 guitar."""
    prof = profile or GP2040GuitarProfile()
    title_suffix = target_game.replace("_", " ").title()

    bindings: list[dict[str, Any]] = [
        # Frets
        {
            "name": "Green Fret",
            "source": prof.fret_green,
            "target": "xinput_button A" if prof.is_xinput_mode else "key A",
            "activator": "RegularPress",
        },
        {
            "name": "Red Fret",
            "source": prof.fret_red,
            "target": "xinput_button B" if prof.is_xinput_mode else "key S",
            "activator": "RegularPress",
        },
        {
            "name": "Yellow Fret",
            "source": prof.fret_yellow,
            "target": "xinput_button Y" if prof.is_xinput_mode else "key J",
            "activator": "RegularPress",
        },
        {
            "name": "Blue Fret",
            "source": prof.fret_blue,
            "target": "xinput_button X" if prof.is_xinput_mode else "key K",
            "activator": "RegularPress",
        },
        {
            "name": "Orange Fret",
            "source": prof.fret_orange,
            "target": "xinput_button LB" if prof.is_xinput_mode else "key L",
            "activator": "RegularPress",
        },
        # Strum Bar
        {
            "name": "Strum Up",
            "source": prof.strum_up,
            "target": "dpad UP" if prof.is_xinput_mode else "key UP_ARROW",
            "activator": "RegularPress",
        },
        {
            "name": "Strum Down",
            "source": prof.strum_down,
            "target": "dpad DOWN" if prof.is_xinput_mode else "key DOWN_ARROW",
            "activator": "RegularPress",
        },
        # Whammy
        {
            "name": "Whammy Bar",
            "source": prof.whammy_axis,
            "target": "right_stick_y" if prof.is_xinput_mode else "key SPACE",
            "activator": "RegularPress",
        },
        # Star Power / Tilt
        {
            "name": "Tilt / Star Power",
            "source": prof.tilt_axis,
            "target": "xinput_button BACK" if prof.is_xinput_mode else "key SPACE",
            "activator": "RegularPress",
        },
        # Aux buttons
        {
            "name": "Start",
            "source": prof.start_button,
            "target": "xinput_button START" if prof.is_xinput_mode else "key ESCAPE",
            "activator": "RegularPress",
        },
        {
            "name": "Select",
            "source": prof.select_button,
            "target": "xinput_button BACK" if prof.is_xinput_mode else "key ENTER",
            "activator": "RegularPress",
        },
    ]

    return VDFTemplate(
        version=3,
        title=f"DeckForge — GP2040-CE {title_suffix}",
        description=f"Zero-latency GP2040-CE / RP2040 custom guitar profile optimized for {title_suffix}.",
        creator="DeckForge Input Studio",
        controller_type="xbox360" if prof.is_xinput_mode else "generic",
        group_source_bindings=bindings,
    )

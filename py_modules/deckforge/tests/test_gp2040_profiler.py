"""
Unit & Integration Tests for GP2040-CE / RP2040 Custom Guitar Auto-Profiler.
"""

from deckforge.gp2040_profiler import (
    DIY_GUITAR_VENDOR_PIDS,
    GP2040_NAME_PATTERNS,
    RASPBERRY_PI_VID,
    GP2040GuitarProfile,
    auto_detect_gp2040,
    generate_gp2040_template,
    is_gp2040_device,
)
from deckforge.input_sniffer import DeviceInfo


def test_default_gp2040_profile():
    prof = GP2040GuitarProfile()
    assert prof.vendor_id == RASPBERRY_PI_VID
    assert prof.fret_green == "BTN_SOUTH"
    assert prof.fret_red == "BTN_EAST"
    assert prof.fret_yellow == "BTN_NORTH"
    assert prof.fret_blue == "BTN_WEST"
    assert prof.fret_orange == "BTN_TL"
    assert prof.strum_up == "BTN_DPAD_UP"
    assert prof.strum_down == "BTN_DPAD_DOWN"
    assert prof.debounce_ms == 2


def test_gp2040_profile_dict_roundtrip():
    prof = GP2040GuitarProfile(
        device_path="/dev/input/event12",
        device_name="Riffstick Custom Guitar",
        product_id=0x1001,
        debounce_ms=4,
    )
    d = prof.to_dict()
    assert d["device_name"] == "Riffstick Custom Guitar"
    assert d["debounce_ms"] == 4

    loaded = GP2040GuitarProfile.from_dict(d)
    assert loaded.device_name == prof.device_name
    assert loaded.product_id == prof.product_id
    assert loaded.debounce_ms == 4


def test_is_gp2040_device_matching():
    # Raspberry Pi VID
    pico = DeviceInfo(
        path="/dev/input/event5",
        name="Raspberry Pi Pico Gamepad",
        vendor_id=RASPBERRY_PI_VID,
        product_id=0x000A,
        serial="",
        phys="",
        uniq="",
        capabilities={},
        bus_type="usb",
    )
    assert is_gp2040_device(pico)

    # Name matching (e.g. custom GP2040-CE or Santroller)
    santroller = DeviceInfo(
        path="/dev/input/event6",
        name="Santroller Guitar Hero Controller",
        vendor_id=0x1234,
        product_id=0x5678,
        serial="",
        phys="",
        uniq="",
        capabilities={},
        bus_type="usb",
    )
    assert is_gp2040_device(santroller)

    # Unrelated device
    mouse = DeviceInfo(
        path="/dev/input/event7",
        name="Logitech Optical Mouse",
        vendor_id=0x046D,
        product_id=0xC077,
        serial="",
        phys="",
        uniq="",
        capabilities={},
        bus_type="usb",
    )
    assert not is_gp2040_device(mouse)


def test_auto_detect_gp2040():
    dev = DeviceInfo(
        path="/dev/input/event10",
        name="Riffstick GP2040-CE Guitar",
        vendor_id=RASPBERRY_PI_VID,
        product_id=0x0A00,
        serial="PICO123",
        phys="",
        uniq="",
        capabilities={
            "EV_KEY": ["BTN_SOUTH", "BTN_EAST", "BTN_NORTH", "BTN_WEST", "BTN_TL", "BTN_START", "BTN_SELECT"],
            "EV_ABS": ["ABS_RZ", "ABS_Y"],
        },
        bus_type="usb",
    )

    detected = auto_detect_gp2040([dev])
    assert detected is not None
    assert detected.device_name == "Riffstick GP2040-CE Guitar"
    assert detected.whammy_axis == "ABS_RZ"
    assert detected.tilt_axis == "ABS_Y"
    assert detected.is_xinput_mode is True


def test_generate_clone_hero_template():
    prof = GP2040GuitarProfile(is_xinput_mode=True)
    tpl = generate_gp2040_template(prof, target_game="clone_hero")
    assert "Clone Hero" in tpl.title
    assert tpl.controller_type == "xbox360"
    binding_names = [b["label"] for b in tpl.bindings()]
    assert "Green Fret" in binding_names
    assert "Strum Up" in binding_names
    assert "Whammy Bar" in binding_names
    assert "Tilt / Star Power" in binding_names


def test_generate_yarg_template():
    prof = GP2040GuitarProfile(is_xinput_mode=False)
    tpl = generate_gp2040_template(prof, target_game="yarg")
    assert "Yarg" in tpl.title
    assert tpl.controller_type == "neptune"

"""
Unit tests for CRKD NEO S Pro Guitar auto-profiler and template generator.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from deckforge.crkd_profiler import (
    CRKDGuitarProfile,
    auto_detect_crkd,
    auto_detect_crkd_les_paul,
    generate_crkd_template,
    is_crkd_or_guitar_device,
)
from deckforge.input_sniffer import DeviceInfo


class TestCRKDProfiler:
    def test_default_profile(self):
        profile = CRKDGuitarProfile()
        assert profile.vendor_id == 0x2E95
        assert profile.fret_green == "BTN_SOUTH"
        assert profile.whammy_axis == "ABS_RZ"
        assert profile.tilt_axis == "ABS_Y"
        d = profile.to_dict()
        assert "fret_buttons" in d
        assert d["fret_buttons"]["green"] == "BTN_SOUTH"

    def test_profile_roundtrip(self):
        p1 = CRKDGuitarProfile(
            device_name="Custom Guitar",
            fret_green="BTN_A",
            whammy_axis="ABS_Z",
        )
        d = p1.to_dict()
        p2 = CRKDGuitarProfile.from_dict(d)
        assert p2.device_name == "Custom Guitar"
        assert p2.fret_green == "BTN_A"
        assert p2.whammy_axis == "ABS_Z"

    def test_device_matching(self):
        crkd_dev = DeviceInfo(
            path="/dev/input/event4",
            name="CRKD NEO S Guitar Controller",
            vendor_id=0x2E95,
            product_id=0x0882,
            serial="",
            phys="",
            uniq="",
            capabilities={},
            bus_type="usb",
        )
        assert is_crkd_or_guitar_device(crkd_dev) is True

        other_dev = DeviceInfo(
            path="/dev/input/event0",
            name="Power Button",
            vendor_id=0x0000,
            product_id=0x0001,
            serial="",
            phys="",
            uniq="",
            capabilities={},
            bus_type="isa",
        )
        assert is_crkd_or_guitar_device(other_dev) is False

    @patch("deckforge.crkd_profiler.discover_devices")
    def test_auto_detect_crkd_with_mock_device(self, mock_discover):
        mock_dev = DeviceInfo(
            path="/dev/input/event5",
            name="CRKD NEO S Pro Guitar",
            vendor_id=0x2E95,
            product_id=0x0882,
            serial="SN999",
            phys="usb/input0",
            uniq="",
            capabilities={
                "EV_KEY": ["BTN_SOUTH", "BTN_EAST", "BTN_NORTH", "BTN_WEST", "BTN_TL", "BTN_DPAD_UP", "BTN_DPAD_DOWN"],
                "EV_ABS": ["ABS_RZ", "ABS_Y"],
            },
            bus_type="usb",
        )
        mock_discover.return_value = [mock_dev]

        profile = auto_detect_crkd()
        assert profile.device_path == "/dev/input/event5"
        assert profile.vendor_id == 0x2E95
        assert profile.fret_green == "BTN_SOUTH"
        assert profile.whammy_axis == "ABS_RZ"
        assert profile.tilt_axis == "ABS_Y"

    def test_generate_clone_hero_template(self):
        profile = CRKDGuitarProfile()
        tpl = generate_crkd_template(profile, target_game="Clone Hero")
        assert "Clone Hero" in tpl.title
        assert len(tpl.group_source_bindings) > 0
        outputs = [b["output"] for b in tpl.group_source_bindings]
        assert "key_press A" in outputs
        assert "key_press SPACE" in outputs

    def test_generate_yarg_template(self):
        profile = CRKDGuitarProfile()
        tpl = generate_crkd_template(profile, target_game="YARG")
        assert "YARG" in tpl.title
        outputs = [b["output"] for b in tpl.group_source_bindings]
        assert "xinput_button A" in outputs

    def test_generate_rpcs3_template(self):
        profile = CRKDGuitarProfile()
        tpl = generate_crkd_template(profile, target_game="Rock Band 4 (RPCS3)")
        assert "Rock Band 4" in tpl.title
        assert "RPCS3" in tpl.title

    def test_generate_pcsx2_template(self):
        profile = CRKDGuitarProfile()
        tpl = generate_crkd_template(profile, target_game="Guitar Hero III (PCSX2)")
        assert "Guitar Hero III" in tpl.title

    @patch("deckforge.crkd_profiler.discover_devices")
    def test_crkd_les_paul_pro_detection(self, mock_discover):
        mock_lp = DeviceInfo(
            path="/dev/input/event6",
            name="CRKD Les Paul Pro Model Wireless",
            vendor_id=0x2E95,
            product_id=0x0883,
            serial="LP-PRO-001",
            phys="usb/input1",
            uniq="",
            capabilities={
                "EV_KEY": ["BTN_SOUTH", "BTN_EAST", "BTN_NORTH", "BTN_WEST", "BTN_TL", "BTN_DPAD_UP", "BTN_DPAD_DOWN", "BTN_MODE"],
                "EV_ABS": ["ABS_RZ", "ABS_Y", "ABS_RX", "ABS_RY"],
            },
            bus_type="usb",
        )
        mock_discover.return_value = [mock_lp]

        profile = auto_detect_crkd()
        assert profile.blueprint_id == "crkd_les_paul"
        assert "Les Paul" in profile.device_name
        assert profile.product_id == 0x0883

    def test_auto_detect_crkd_les_paul_helper(self):
        profile = auto_detect_crkd_les_paul()
        assert profile.blueprint_id == "crkd_les_paul"
        assert "Les Paul" in profile.device_name
        assert profile.product_id == 0x0883

    def test_generate_les_paul_clone_hero_template(self):
        profile = auto_detect_crkd_les_paul()
        tpl = generate_crkd_template(profile, target_game="Clone Hero")
        assert "Les Paul" in tpl.title
        names = [b["name"] for b in tpl.group_source_bindings]
        assert "Pickup / Star Power Switch" in names

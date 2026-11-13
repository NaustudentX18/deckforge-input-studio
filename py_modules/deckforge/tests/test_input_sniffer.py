"""
Unit tests for DeckForge input sniffer and device discovery (with mocks).
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch
import pytest

from deckforge.input_sniffer import (
    DeviceInfo,
    _bus_type_name,
    _event_code_name,
    _normalize_axis,
    discover_devices,
)


class TestInputSnifferUtils:
    def test_bus_type_name_resolution(self):
        assert _bus_type_name(0x03) == "usb"
        assert _bus_type_name(0x05) == "bluetooth"
        assert "unknown" in _bus_type_name(0xFFFF)

    def test_event_code_name_resolution(self):
        # evdev.ecodes.EV_KEY is 1, BTN_SOUTH is 304
        name = _event_code_name(1, 304)
        assert "BTN_SOUTH" in name or "BTN_A" in name or name.startswith("BTN_")

        # Unknown code
        assert "UNKNOWN" in _event_code_name(999, 999)

    def test_normalize_axis(self):
        mock_absinfo = MagicMock()
        mock_absinfo.min = 0
        mock_absinfo.max = 255

        assert _normalize_axis(0, mock_absinfo) == 0.0
        assert _normalize_axis(255, mock_absinfo) == 1.0
        assert _normalize_axis(127, mock_absinfo) == pytest.approx(127 / 255, abs=0.01)

        # Zero range edge case
        mock_absinfo.min = 100
        mock_absinfo.max = 100
        assert _normalize_axis(100, mock_absinfo) == 0.0


class TestDeviceDiscoveryMock:
    @patch("deckforge.input_sniffer.evdev.list_devices")
    @patch("deckforge.input_sniffer.InputDevice")
    def test_discover_devices(self, mock_input_device_cls, mock_list_devices):
        mock_list_devices.return_value = ["/dev/input/event0", "/dev/input/event1"]

        # Mock device 0: Gamepad
        dev0 = MagicMock()
        dev0.path = "/dev/input/event0"
        dev0.name = "CRKD NEO S Guitar"
        dev0.info.vendor = 0x2E95
        dev0.info.product = 0x0882
        dev0.info.bustype = 0x03
        dev0.serial = "CRKD12345"
        dev0.phys = "usb-0000:00:14.0-1/input0"
        dev0.uniq = ""
        dev0.capabilities.return_value = {
            (1, "EV_KEY"): ["BTN_SOUTH", "BTN_EAST", "BTN_NORTH", "BTN_WEST"],
            (3, "EV_ABS"): [(0, MagicMock())],
        }

        # Mock device 1: Keyboard
        dev1 = MagicMock()
        dev1.path = "/dev/input/event1"
        dev1.name = "Standard Keyboard"
        dev1.info.vendor = 0x046D
        dev1.info.product = 0xC31C
        dev1.info.bustype = 0x03
        dev1.serial = ""
        dev1.phys = ""
        dev1.uniq = ""
        dev1.capabilities.return_value = {
            (1, "EV_KEY"): ["KEY_A", "KEY_B"],
        }

        mock_input_device_cls.side_effect = [dev0, dev1]

        devices = discover_devices()
        assert len(devices) == 2

        d0 = devices[0]
        assert d0.path == "/dev/input/event0"
        assert d0.name == "CRKD NEO S Guitar"
        assert d0.vendor_id == 0x2E95
        assert d0.product_id == 0x0882
        assert d0.bus_type == "usb"
        assert "EV_KEY" in d0.capabilities
        assert "BTN_SOUTH" in d0.capabilities["EV_KEY"]

        d1 = devices[1]
        assert d1.name == "Standard Keyboard"
        assert d1.vendor_id == 0x046D

    @patch("deckforge.input_sniffer.evdev.list_devices")
    @patch("deckforge.input_sniffer.InputDevice")
    def test_discover_devices_handles_permission_error(self, mock_input_device_cls, mock_list_devices):
        mock_list_devices.return_value = ["/dev/input/event0"]
        mock_input_device_cls.side_effect = PermissionError("Access denied")

        devices = discover_devices()
        assert devices == []

    def test_device_info_to_dict(self):
        info = DeviceInfo(
            path="/dev/input/event3",
            name="Test Controller",
            vendor_id=0x1234,
            product_id=0x5678,
            serial="SN123",
            phys="usb/input0",
            uniq="",
            capabilities={"EV_KEY": ["BTN_A"]},
            bus_type="usb",
        )
        d = info.to_dict()
        assert d["vendor_id"] == "0x1234"
        assert d["product_id"] == "0x5678"
        assert d["name"] == "Test Controller"
        assert d["path"] == "/dev/input/event3"

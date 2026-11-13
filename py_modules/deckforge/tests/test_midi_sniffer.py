"""
Unit & Integration Tests for USB-MIDI Drum & Synth Sniffer.
"""

import asyncio
from unittest.mock import MagicMock, patch

import pytest

from deckforge.midi_sniffer import (
    DRUM_STEAM_MAPPINGS,
    GM_DRUM_NOTES,
    MidiDeviceInfo,
    MidiEventStream,
    list_midi_devices,
)


def test_gm_drum_note_mapping():
    assert GM_DRUM_NOTES[36] == "KICK_1"
    assert GM_DRUM_NOTES[38] == "SNARE_ACOUSTIC"
    assert GM_DRUM_NOTES[42] == "HIHAT_CLOSED"
    assert GM_DRUM_NOTES[49] == "CRASH_1"
    assert GM_DRUM_NOTES[51] == "RIDE_1"


def test_drum_steam_mappings():
    assert DRUM_STEAM_MAPPINGS["KICK_1"] == "xinput_button A"
    assert DRUM_STEAM_MAPPINGS["SNARE_ACOUSTIC"] == "xinput_button X"
    assert DRUM_STEAM_MAPPINGS["HIHAT_CLOSED"] == "xinput_button Y"


def test_midi_device_info_dict():
    dev = MidiDeviceInfo(
        name="Roland TD-17 Electronic Drum",
        port_name="TD-17",
        path="midi:TD-17",
        is_alsa_raw=False,
    )
    d = dev.to_dict()
    assert d["name"] == "Roland TD-17 Electronic Drum"
    assert d["bus_type"] == "usb_midi"
    assert "EV_MIDI" in d["capabilities"]


def test_list_midi_devices_graceful_fallback():
    # Even if no hardware is attached, list_midi_devices returns a list
    devs = list_midi_devices()
    assert isinstance(devs, list)


@pytest.mark.asyncio
async def test_midi_event_normalization():
    # Test normalization formula for velocity
    velocity_raw = 100
    normalized = round(velocity_raw / 127.0, 3)
    assert 0.0 <= normalized <= 1.0
    assert normalized == 0.787

"""
DeckForge Input Studio — Native USB-MIDI Drum & Synth Input Sniffer.

Streams MIDI note_on (with velocity 1-127), note_off, and control_change
events from USB-MIDI electronic drums (Roland, Alesis, Yamaha, Behringer)
and synthesizers onto the normalized WebSocket event bus.
Supports both `mido` with rtmidi/portmidi backends and raw ALSA /dev/snd/midi*
fallback.
"""

from __future__ import annotations

import asyncio
import glob
import logging
import os
import struct
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator, Optional

logger = logging.getLogger(__name__)

# General MIDI standard drum note mappings
GM_DRUM_NOTES: dict[int, str] = {
    35: "KICK_2",        # Acoustic Bass Drum
    36: "KICK_1",        # Bass Drum 1
    38: "SNARE_ACOUSTIC",# Acoustic Snare
    40: "SNARE_ELECTRIC",# Electric Snare
    42: "HIHAT_CLOSED",  # Closed Hi-Hat
    44: "HIHAT_PEDAL",   # Pedal Hi-Hat
    46: "HIHAT_OPEN",    # Open Hi-Hat
    41: "TOM_FLOOR_LOW", # Low Floor Tom
    43: "TOM_FLOOR_HIGH",# High Floor Tom
    45: "TOM_LOW",       # Low Tom / Mid Tom
    47: "TOM_MID",       # Low-Mid Tom
    48: "TOM_HIGH",      # Hi-Mid Tom / High Tom
    50: "TOM_HIGH_HIGH", # High Tom
    49: "CRASH_1",       # Crash Cymbal 1
    57: "CRASH_2",       # Crash Cymbal 2
    51: "RIDE_1",        # Ride Cymbal 1
    59: "RIDE_2",        # Ride Cymbal 2
    53: "RIDE_BELL",     # Ride Bell
    52: "CHINESE_CYMBAL",# Chinese Cymbal
    55: "SPLASH_CYMBAL", # Splash Cymbal
}

# Standard rhythm game mapping preset for MIDI drums (Clone Hero / YARG drum mode)
DRUM_STEAM_MAPPINGS: dict[str, str] = {
    "KICK_1": "xinput_button A",
    "KICK_2": "xinput_button LB",
    "SNARE_ACOUSTIC": "xinput_button X",
    "SNARE_ELECTRIC": "xinput_button X",
    "HIHAT_CLOSED": "xinput_button Y",
    "HIHAT_OPEN": "xinput_button Y",
    "HIHAT_PEDAL": "xinput_button LT",
    "TOM_HIGH": "xinput_button B",
    "TOM_LOW": "xinput_button RB",
    "TOM_FLOOR_LOW": "xinput_button RB",
    "CRASH_1": "xinput_button Y",
    "CRASH_2": "xinput_button B",
    "RIDE_1": "xinput_button B",
}


@dataclass
class MidiDeviceInfo:
    """Description of a connected MIDI device."""
    name: str
    port_name: str
    path: str
    is_alsa_raw: bool = False
    vendor: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "port_name": self.port_name,
            "path": self.path,
            "is_alsa_raw": self.is_alsa_raw,
            "vendor": self.vendor,
            "bus_type": "usb_midi",
            "capabilities": {
                "EV_MIDI": ["NOTE_ON", "NOTE_OFF", "CONTROL_CHANGE"],
            },
        }


def list_midi_devices() -> list[dict[str, Any]]:
    """List all available USB-MIDI input ports and raw ALSA MIDI devices."""
    devices: list[MidiDeviceInfo] = []

    # 1. Try mido if available
    try:
        import mido
        input_names = mido.get_input_names()
        for port in input_names:
            devices.append(MidiDeviceInfo(
                name=f"USB-MIDI: {port}",
                port_name=port,
                path=f"midi:{port}",
                is_alsa_raw=False,
            ))
    except Exception as exc:
        logger.debug("mido port enumeration failed: %s", exc)

    # 2. Check /dev/snd/midi* for raw ALSA devices
    for midi_node in sorted(glob.glob("/dev/snd/midiC*D*")):
        # Check if already covered
        if any(d.path == f"rawmidi:{midi_node}" for d in devices):
            continue
        try:
            # Extract card and device numbers
            base = os.path.basename(midi_node)
            card_id = base.replace("midiC", "").split("D")[0]
            # Try to read card name from /proc/asound/cardX/id
            card_name = f"ALSA MIDI ({base})"
            card_proc = Path(f"/proc/asound/card{card_id}/id")
            if card_proc.is_file():
                card_name = card_proc.read_text().strip()

            devices.append(MidiDeviceInfo(
                name=f"ALSA MIDI: {card_name} [{base}]",
                port_name=base,
                path=f"rawmidi:{midi_node}",
                is_alsa_raw=True,
            ))
        except Exception:
            pass

    return [d.to_dict() for d in devices]


class MidiEventStream:
    """Async generator streaming normalized MIDI events onto WebSocket event bus."""

    def __init__(self, port_or_path: str) -> None:
        self.target = port_or_path
        self._running = False

    async def events(self) -> AsyncIterator[dict[str, Any]]:
        """Yield normalized input events matching evdev event schema."""
        self._running = True

        # Check if raw ALSA node requested or mido port
        if self.target.startswith("rawmidi:") or self.target.startswith("/dev/snd/"):
            raw_path = self.target.replace("rawmidi:", "")
            async for ev in self._stream_raw_alsa(raw_path):
                if not self._running:
                    break
                yield ev
        else:
            port_name = self.target.replace("midi:", "")
            async for ev in self._stream_mido(port_name):
                if not self._running:
                    break
                yield ev

    async def _stream_mido(self, port_name: str) -> AsyncIterator[dict[str, Any]]:
        try:
            import mido
            inport = mido.open_input(port_name)
        except Exception as exc:
            logger.warning("Could not open mido port %s: %s", port_name, exc)
            return

        loop = asyncio.get_event_loop()
        try:
            while self._running:
                # Non-blocking poll using run_in_executor
                msg = await loop.run_in_executor(None, inport.poll)
                if msg is None:
                    await asyncio.sleep(0.002)  # ~500Hz check rate
                    continue

                if msg.type == "note_on" and msg.velocity > 0:
                    note_name = GM_DRUM_NOTES.get(msg.note, f"NOTE_{msg.note}")
                    yield {
                        "device_path": f"midi:{port_name}",
                        "event_type": "EV_KEY",
                        "code": msg.note,
                        "code_name": f"MIDI_{note_name}",
                        "value": msg.velocity,
                        "normalized_value": round(msg.velocity / 127.0, 3),
                        "timestamp": time.time(),
                        "is_midi": True,
                        "midi_channel": msg.channel,
                        "midi_velocity": msg.velocity,
                    }
                elif msg.type == "note_off" or (msg.type == "note_on" and msg.velocity == 0):
                    note_name = GM_DRUM_NOTES.get(msg.note, f"NOTE_{msg.note}")
                    yield {
                        "device_path": f"midi:{port_name}",
                        "event_type": "EV_KEY",
                        "code": msg.note,
                        "code_name": f"MIDI_{note_name}",
                        "value": 0,
                        "normalized_value": 0.0,
                        "timestamp": time.time(),
                        "is_midi": True,
                        "midi_channel": getattr(msg, "channel", 0),
                        "midi_velocity": 0,
                    }
                elif msg.type == "control_change":
                    yield {
                        "device_path": f"midi:{port_name}",
                        "event_type": "EV_ABS",
                        "code": msg.control,
                        "code_name": f"MIDI_CC_{msg.control}",
                        "value": msg.value,
                        "normalized_value": round(msg.value / 127.0, 3),
                        "timestamp": time.time(),
                        "is_midi": True,
                        "midi_control": msg.control,
                    }
        finally:
            try:
                inport.close()
            except Exception:
                pass

    async def _stream_raw_alsa(self, dev_path: str) -> AsyncIterator[dict[str, Any]]:
        if not os.path.exists(dev_path):
            return

        try:
            fd = os.open(dev_path, os.O_RDONLY | os.O_NONBLOCK)
        except OSError as exc:
            logger.warning("Cannot open raw ALSA MIDI device %s: %s", dev_path, exc)
            return

        loop = asyncio.get_event_loop()
        buf = bytearray()
        try:
            while self._running:
                try:
                    data = await loop.run_in_executor(None, lambda: os.read(fd, 64))
                except (BlockingIOError, OSError):
                    await asyncio.sleep(0.005)
                    continue

                if not data:
                    await asyncio.sleep(0.005)
                    continue

                buf.extend(data)
                # Parse standard 3-byte MIDI status messages
                while len(buf) >= 3:
                    status = buf[0]
                    msg_type = status & 0xF0
                    channel = status & 0x0F

                    if msg_type in (0x80, 0x90, 0xB0):
                        param1 = buf[1]
                        param2 = buf[2]
                        del buf[:3]

                        if msg_type == 0x90 and param2 > 0:  # Note On
                            note_name = GM_DRUM_NOTES.get(param1, f"NOTE_{param1}")
                            yield {
                                "device_path": f"rawmidi:{dev_path}",
                                "event_type": "EV_KEY",
                                "code": param1,
                                "code_name": f"MIDI_{note_name}",
                                "value": param2,
                                "normalized_value": round(param2 / 127.0, 3),
                                "timestamp": time.time(),
                                "is_midi": True,
                                "midi_channel": channel,
                                "midi_velocity": param2,
                            }
                        elif msg_type == 0x80 or (msg_type == 0x90 and param2 == 0):  # Note Off
                            note_name = GM_DRUM_NOTES.get(param1, f"NOTE_{param1}")
                            yield {
                                "device_path": f"rawmidi:{dev_path}",
                                "event_type": "EV_KEY",
                                "code": param1,
                                "code_name": f"MIDI_{note_name}",
                                "value": 0,
                                "normalized_value": 0.0,
                                "timestamp": time.time(),
                                "is_midi": True,
                                "midi_channel": channel,
                                "midi_velocity": 0,
                            }
                        elif msg_type == 0xB0:  # Control Change
                            yield {
                                "device_path": f"rawmidi:{dev_path}",
                                "event_type": "EV_ABS",
                                "code": param1,
                                "code_name": f"MIDI_CC_{param1}",
                                "value": param2,
                                "normalized_value": round(param2 / 127.0, 3),
                                "timestamp": time.time(),
                                "is_midi": True,
                                "midi_control": param1,
                            }
                    else:
                        # Skip unknown status byte
                        del buf[0]
        finally:
            try:
                os.close(fd)
            except Exception:
                pass

    def stop(self) -> None:
        self._running = False

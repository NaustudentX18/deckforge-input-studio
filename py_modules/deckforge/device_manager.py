"""
DeckForge Input Studio — Device Manager adapter for Decky RPC.
"""

from __future__ import annotations

import logging
from typing import Any
import evdev

from .input_sniffer import DeviceInfo, discover_devices, _event_code_name, _normalize_axis

logger = logging.getLogger(__name__)


def enumerate_devices() -> list[DeviceInfo]:
    """Return all detected input devices with capabilities."""
    return discover_devices()


class SimpleEvent:
    def __init__(self, data: dict[str, Any]) -> None:
        self.data = data

    def to_dict(self) -> dict[str, Any]:
        return self.data


def read_events(device_path: str, max_events: int = 50) -> list[SimpleEvent]:
    """Read recent available events from *device_path*."""
    events: list[SimpleEvent] = []
    try:
        dev = evdev.InputDevice(device_path)
        raw_events = dev.read()
        for ev in raw_events:
            if ev.type == evdev.ecodes.EV_SYN:
                continue
            events.append(SimpleEvent({
                "device_path": device_path,
                "event_type": evdev.ecodes.EV.get(ev.type, f"EV_{ev.type}"),
                "code": ev.code,
                "code_name": _event_code_name(ev.type, ev.code),
                "value": ev.value,
                "timestamp": ev.timestamp(),
            }))
            if len(events) >= max_events:
                break
        dev.close()
    except (BlockingIOError, OSError):
        pass
    return events

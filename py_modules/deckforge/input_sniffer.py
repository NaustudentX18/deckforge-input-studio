"""
DeckForge Input Studio — Real-Time Hardware Discovery & Live Input Streamer.

Uses evdev and pyudev to enumerate connected HID/XInput/DirectInput/Bluetooth/
USB-MIDI devices, stream live input events at 60 Hz+, detect "press any button"
gestures, and monitor hotplug connect/disconnect events.
"""

from __future__ import annotations

import asyncio
import glob
import logging
import os
import time
from dataclasses import dataclass, field
from enum import IntEnum
from pathlib import Path
from typing import Any, AsyncIterator, Callable, Optional

import evdev
from evdev import InputDevice, InputEvent as EvdevInputEvent, categorize, ecodes
import pyudev

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Bus types (from linux/input.h)
# ---------------------------------------------------------------------------

class BusType(IntEnum):
    """Linux input bus types."""
    USB = 0x03
    HIL = 0x04
    BLUETOOTH = 0x05
    VIRTUAL = 0x06
    ISA = 0x10
    I8042 = 0x11
    XTKBD = 0x12
    RS232 = 0x13
    GAMEPORT = 0x14
    PARPORT = 0x15
    AMIGA = 0x16
    ADB = 0x17
    I2C = 0x18
    HOST = 0x19
    GSC = 0x1A
    ATARI = 0x1B
    SPI = 0x1C
    RMI = 0x1D
    CEC = 0x1E
    INTEL_ISHTP = 0x1F


def _bus_type_name(bus_id: int) -> str:
    """Return a human-readable bus type name."""
    try:
        return BusType(bus_id).name.lower()
    except ValueError:
        return f"unknown_0x{bus_id:04x}"


# ---------------------------------------------------------------------------
# DeviceInfo
# ---------------------------------------------------------------------------

@dataclass
class DeviceInfo:
    """Full description of a connected input device."""
    path: str
    name: str
    vendor_id: int
    product_id: int
    serial: str
    phys: str
    uniq: str
    capabilities: dict[str, list[str]]
    bus_type: str
    by_id_path: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "name": self.name,
            "vendor_id": f"0x{self.vendor_id:04x}",
            "product_id": f"0x{self.product_id:04x}",
            "serial": self.serial,
            "phys": self.phys,
            "uniq": self.uniq,
            "capabilities": self.capabilities,
            "bus_type": self.bus_type,
            "by_id_path": self.by_id_path,
        }


def _resolve_by_id(device_path: str) -> Optional[str]:
    """Find the /dev/input/by-id/ symlink that points to *device_path*."""
    by_id_dir = Path("/dev/input/by-id")
    if not by_id_dir.is_dir():
        return None
    real_target = os.path.realpath(device_path)
    for link in by_id_dir.iterdir():
        if os.path.realpath(str(link)) == real_target:
            return str(link)
    return None


def _capability_map(device: InputDevice) -> dict[str, list[str]]:
    """Build a human-readable capability map from an evdev device."""
    caps: dict[str, list[str]] = {}
    raw_caps = device.capabilities(verbose=True)
    for (ev_type_code, ev_type_name), events in raw_caps.items():
        names: list[str] = []
        for item in events:
            if isinstance(item, tuple):
                # (code, AbsInfo) for EV_ABS
                code_info = item[0]
            else:
                code_info = item
            if isinstance(code_info, tuple):
                names.append(code_info[0] if isinstance(code_info[0], str) else str(code_info[0]))
            elif isinstance(code_info, str):
                names.append(code_info)
            else:
                names.append(str(code_info))
        caps[ev_type_name if isinstance(ev_type_name, str) else str(ev_type_name)] = names
    return caps


def discover_devices() -> list[DeviceInfo]:
    """Enumerate all evdev input devices and return their full descriptions."""
    devices: list[DeviceInfo] = []
    for path in sorted(evdev.list_devices()):
        try:
            dev = InputDevice(path)
        except (OSError, PermissionError) as exc:
            logger.debug("Cannot open %s: %s", path, exc)
            continue
        try:
            info_obj = dev.info
            vendor_id = info_obj.vendor
            product_id = info_obj.product
            bus_id = info_obj.bustype
        except Exception:
            vendor_id = 0
            product_id = 0
            bus_id = 0
        devices.append(DeviceInfo(
            path=dev.path,
            name=dev.name or "",
            vendor_id=vendor_id,
            product_id=product_id,
            serial=getattr(dev, "serial", "") or "",
            phys=dev.phys or "",
            uniq=dev.uniq or "",
            capabilities=_capability_map(dev),
            bus_type=_bus_type_name(bus_id),
            by_id_path=_resolve_by_id(dev.path),
        ))
        dev.close()
    return devices


# ---------------------------------------------------------------------------
# InputEventStream — async generator for live input events
# ---------------------------------------------------------------------------

def _normalize_axis(value: int, absinfo: evdev.AbsInfo) -> float:
    """Normalize an axis value from [absinfo.min .. absinfo.max] to [0.0 .. 1.0]."""
    total_range = absinfo.max - absinfo.min
    if total_range == 0:
        return 0.0
    return max(0.0, min(1.0, (value - absinfo.min) / total_range))


def _event_code_name(ev_type: int, code: int) -> str:
    """Return the symbolic name for an event code, e.g. 'BTN_SOUTH'."""
    # Check ecodes.bytype first (handles both KEY and BTN for EV_KEY, etc.)
    try:
        type_dict = ecodes.bytype.get(ev_type)
        if type_dict is not None and code in type_dict:
            names = type_dict[code]
            if isinstance(names, (list, tuple)) and names:
                # Prefer BTN_SOUTH / BTN_EAST or first element
                for n in names:
                    if "SOUTH" in n or "EAST" in n or "NORTH" in n or "WEST" in n:
                        return n
                return names[0]
            elif isinstance(names, str):
                return names
    except Exception:
        pass

    type_map = {
        ecodes.EV_KEY: ecodes.KEY,
        ecodes.EV_REL: ecodes.REL,
        ecodes.EV_ABS: ecodes.ABS,
        ecodes.EV_MSC: ecodes.MSC,
        ecodes.EV_SW: ecodes.SW,
        ecodes.EV_LED: ecodes.LED,
        ecodes.EV_SND: ecodes.SND,
    }
    mapping = type_map.get(ev_type)
    if mapping is None:
        return f"UNKNOWN_{ev_type}_{code}"
    name = mapping.get(code)
    if name is None:
        return f"CODE_{code}"
    if isinstance(name, list):
        return name[0]
    return name


class InputEventStream:
    """Async generator that reads from an evdev device and yields normalized
    InputEvent dicts at 60 Hz+.

    Usage::

        stream = InputEventStream("/dev/input/event5")
        async for event in stream:
            print(event)
    """

    def __init__(self, device_path: str) -> None:
        self.device_path = device_path
        self._device: Optional[InputDevice] = None

    async def _open(self) -> InputDevice:
        if self._device is None:
            self._device = InputDevice(self.device_path)
        return self._device

    def close(self) -> None:
        if self._device is not None:
            try:
                self._device.close()
            except Exception:
                pass
            self._device = None

    async def _read_events(self) -> AsyncIterator[dict[str, Any]]:
        device = await self._open()
        abs_info_cache: dict[int, evdev.AbsInfo] = {}
        # Pre-cache absinfo for all ABS axes
        try:
            raw_caps = device.capabilities()
            abs_codes = raw_caps.get(ecodes.EV_ABS, [])
            for item in abs_codes:
                if isinstance(item, tuple):
                    code, absinfo = item
                    abs_info_cache[code] = absinfo
        except Exception:
            pass

        async for event in device.async_read_loop():
            if event.type == ecodes.EV_SYN:
                continue
            normalized_value: Optional[float] = None
            if event.type == ecodes.EV_ABS:
                absinfo = abs_info_cache.get(event.code)
                if absinfo is not None:
                    normalized_value = _normalize_axis(event.value, absinfo)
                else:
                    normalized_value = float(event.value)
            elif event.type == ecodes.EV_KEY:
                normalized_value = 1.0 if event.value else 0.0

            yield {
                "device_path": self.device_path,
                "event_type": ecodes.EV[event.type] if event.type in ecodes.EV else f"EV_{event.type}",
                "code": event.code,
                "code_name": _event_code_name(event.type, event.code),
                "value": event.value,
                "timestamp": event.timestamp(),
                "normalized_value": normalized_value,
            }

    def __aiter__(self) -> AsyncIterator[dict[str, Any]]:
        return self._read_events()


# ---------------------------------------------------------------------------
# PressAnyInputListener — detect next input from any device
# ---------------------------------------------------------------------------

class PressAnyInputListener:
    """Non-blocking listener that waits for the next physical input from any
    connected device.  Returns a dict ``{device_path, event_type, code, code_name}``
    for the first button press / axis move detected.

    Usage::

        listener = PressAnyInputListener()
        result = await listener.wait(timeout=30.0)
    """

    # Event types we actually care about for binding
    _INTERESTING_TYPES = {ecodes.EV_KEY, ecodes.EV_ABS, ecodes.EV_REL}
    _ABS_THRESHOLD = 0.25
    _WATCHDOG_MAX_TIMEOUT = 10.0

    _ABORT_KEYS = {ecodes.KEY_ESC, ecodes.KEY_BACKSPACE}
    _STEAM_BUTTONS = {ecodes.BTN_MODE}
    _B_BUTTONS = {ecodes.BTN_EAST, ecodes.BTN_B}

    def __init__(self, device_paths: Optional[list[str]] = None, grab: bool = False) -> None:
        self._device_paths = device_paths
        self.grab = grab

    async def wait(self, timeout: float = 10.0) -> Optional[dict[str, Any]]:
        """Block asynchronously until an input is detected or watchdog timeout elapses."""
        effective_timeout = min(timeout, self._WATCHDOG_MAX_TIMEOUT) if self.grab else timeout
        paths = self._device_paths
        if paths is None:
            paths = sorted(evdev.list_devices())

        devices: list[InputDevice] = []
        grabbed_devices: set[InputDevice] = set()

        for p in paths:
            try:
                dev = InputDevice(p)
                devices.append(dev)
                if self.grab:
                    try:
                        dev.grab()
                        grabbed_devices.add(dev)
                    except (OSError, PermissionError) as exc:
                        logger.debug("Could not grab %s: %s", dev.path, exc)
            except (OSError, PermissionError):
                continue

        if not devices:
            return None

        result_future: asyncio.Future[dict[str, Any]] = asyncio.get_event_loop().create_future()

        async def _read_device(dev: InputDevice) -> None:
            try:
                # Pre-cache absinfo for ABS threshold checks
                abs_info_cache: dict[int, evdev.AbsInfo] = {}
                try:
                    raw_caps = dev.capabilities()
                    for item in raw_caps.get(ecodes.EV_ABS, []):
                        if isinstance(item, tuple):
                            code, absinfo = item
                            abs_info_cache[code] = absinfo
                except Exception:
                    pass

                # Track initial ABS positions to detect movement
                abs_initial: dict[int, int] = {}

                async for event in dev.async_read_loop():
                    if result_future.done():
                        return
                    if event.type not in self._INTERESTING_TYPES:
                        continue

                    # Check for immediate abort hotkeys
                    if event.type == ecodes.EV_KEY:
                        if event.code in self._ABORT_KEYS:
                            if not result_future.done():
                                result_future.set_result({
                                    "aborted": True,
                                    "reason": "Escape pressed",
                                    "device_path": dev.path,
                                    "event_type": "EV_KEY",
                                    "code": event.code,
                                    "code_name": "KEY_ESC",
                                })
                                return

                        # Check for Steam + B abort chord
                        if event.code in self._B_BUTTONS:
                            try:
                                active = dev.active_keys()
                                if any(k in active for k in self._STEAM_BUTTONS):
                                    if not result_future.done():
                                        result_future.set_result({
                                            "aborted": True,
                                            "reason": "Steam+B chord pressed",
                                            "device_path": dev.path,
                                            "event_type": "EV_KEY",
                                            "code": event.code,
                                            "code_name": "ABORT_STEAM_B",
                                        })
                                        return
                            except Exception:
                                pass

                        # For regular keys, only trigger on press (value=1)
                        if event.value != 1:
                            continue
                    elif event.type == ecodes.EV_ABS:
                        absinfo = abs_info_cache.get(event.code)
                        if absinfo is not None:
                            total_range = absinfo.max - absinfo.min
                            if total_range == 0:
                                continue
                            if event.code not in abs_initial:
                                abs_initial[event.code] = event.value
                                continue
                            delta = abs(event.value - abs_initial[event.code]) / total_range
                            if delta < self._ABS_THRESHOLD:
                                continue
                        else:
                            continue
                    elif event.type == ecodes.EV_REL:
                        if abs(event.value) < 5:
                            continue

                    if not result_future.done():
                        result_future.set_result({
                            "aborted": False,
                            "device_path": dev.path,
                            "event_type": ecodes.EV.get(event.type, f"EV_{event.type}"),
                            "code": event.code,
                            "code_name": _event_code_name(event.type, event.code),
                        })
                        return
            except (OSError, asyncio.CancelledError):
                # Disconnect / ENODEV or cancel
                return

        tasks = [asyncio.create_task(_read_device(d)) for d in devices]

        try:
            return await asyncio.wait_for(asyncio.shield(result_future), timeout=effective_timeout)
        except asyncio.TimeoutError:
            return None
        finally:
            for t in tasks:
                t.cancel()
            for t in tasks:
                try:
                    await t
                except asyncio.CancelledError:
                    pass
            for d in grabbed_devices:
                try:
                    d.ungrab()
                except Exception:
                    pass
            for d in devices:
                try:
                    d.close()
                except Exception:
                    pass


# ---------------------------------------------------------------------------
# DeviceMonitor — hotplug connect / disconnect via pyudev
# ---------------------------------------------------------------------------

class DeviceMonitor:
    """Monitors udev for input device hotplug events.

    Usage::

        monitor = DeviceMonitor()
        async for action, device_info in monitor.events():
            if action == "add":
                print("Connected:", device_info.name)
            elif action == "remove":
                print("Disconnected:", device_info.path)
    """

    def __init__(self) -> None:
        self._context = pyudev.Context()
        self._monitor = pyudev.Monitor.from_netlink(self._context)
        self._monitor.filter_by(subsystem="input")
        self._running = False

    async def events(self) -> AsyncIterator[tuple[str, DeviceInfo]]:
        """Async generator yielding ``(action, DeviceInfo)`` tuples."""
        loop = asyncio.get_event_loop()
        self._running = True
        self._monitor.start()

        try:
            while self._running:
                # Poll udev with a short timeout so we can be cancelled
                device = await loop.run_in_executor(
                    None, lambda: self._monitor.poll(timeout=0.5)
                )
                if device is None:
                    continue

                action = device.action
                if action not in ("add", "remove"):
                    continue

                dev_node = device.device_node
                if dev_node is None or not dev_node.startswith("/dev/input/event"):
                    continue

                if action == "add":
                    # Small delay to let the device node settle
                    await asyncio.sleep(0.1)
                    try:
                        evdev_dev = InputDevice(dev_node)
                        info_obj = evdev_dev.info
                        dev_info = DeviceInfo(
                            path=evdev_dev.path,
                            name=evdev_dev.name or "",
                            vendor_id=info_obj.vendor,
                            product_id=info_obj.product,
                            serial=getattr(evdev_dev, "serial", "") or "",
                            phys=evdev_dev.phys or "",
                            uniq=evdev_dev.uniq or "",
                            capabilities=_capability_map(evdev_dev),
                            bus_type=_bus_type_name(info_obj.bustype),
                            by_id_path=_resolve_by_id(evdev_dev.path),
                        )
                        evdev_dev.close()
                        yield (action, dev_info)
                    except (OSError, PermissionError) as exc:
                        logger.debug("Cannot open new device %s: %s", dev_node, exc)
                elif action == "remove":
                    # Device already gone — just report path
                    yield (action, DeviceInfo(
                        path=dev_node,
                        name="(removed)",
                        vendor_id=0,
                        product_id=0,
                        serial="",
                        phys="",
                        uniq="",
                        capabilities={},
                        bus_type="unknown",
                        by_id_path=None,
                    ))
        except asyncio.CancelledError:
            pass
        finally:
            self._running = False

    def stop(self) -> None:
        """Signal the monitor to stop."""
        self._running = False

"""DeckForge Input Studio — Decky Loader Plugin Entry Point.

Starts the FastAPI backend server and exposes RPC methods
that the React frontend calls through Decky's serverAPI.
"""

from __future__ import annotations

import os
import sys

# ── Vendor path prioritization for Decky Loader embedded Python runtime ───
_PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
_LIB_DIR = os.path.join(_PLUGIN_DIR, "py_modules", "lib")
_PY_MODULES = os.path.join(_PLUGIN_DIR, "py_modules")

if os.path.isdir(_LIB_DIR) and _LIB_DIR not in sys.path:
    sys.path.insert(0, _LIB_DIR)
if _PY_MODULES not in sys.path:
    sys.path.insert(0, _PY_MODULES)
if _PLUGIN_DIR not in sys.path:
    sys.path.insert(0, _PLUGIN_DIR)

import asyncio
import logging
import threading
from typing import Any

import uvicorn

logger = logging.getLogger("deckforge")


class Plugin:
    """Decky Loader plugin class for DeckForge Input Studio."""

    _server: uvicorn.Server | None = None
    _server_thread: threading.Thread | None = None

    # ── lifecycle ──────────────────────────────────────────────────────

    async def _main(self) -> None:
        """Called by Decky Loader when the plugin is loaded."""
        logger.info("DeckForge Input Studio starting up …")

        # Import here so the module tree resolves after Decky injects its
        # python path.
        from py_modules.deckforge.api_server import app  # type: ignore[import-untyped]

        config = uvicorn.Config(
            app=app,
            host="0.0.0.0",
            port=8765,
            log_level="info",
            access_log=False,
        )
        self._server = uvicorn.Server(config)

        # Run uvicorn in a daemon thread so it does not block Decky's
        # event loop.
        self._server_thread = threading.Thread(
            target=self._server.run,
            name="deckforge-api",
            daemon=True,
        )
        self._server_thread.start()
        logger.info("DeckForge API server listening on 0.0.0.0:8765")

    async def _unload(self) -> None:
        """Called by Decky Loader when the plugin is unloaded."""
        logger.info("DeckForge Input Studio shutting down …")

        if self._server is not None:
            self._server.should_exit = True

        if self._server_thread is not None:
            self._server_thread.join(timeout=5.0)
            self._server_thread = None

        self._server = None
        logger.info("DeckForge Input Studio stopped.")

    # ── helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _backend() -> Any:
        """Lazy-import the backend facade so callers stay DRY."""
        from py_modules.deckforge import device_manager  # type: ignore[import-untyped]
        from py_modules.deckforge import template_manager  # type: ignore[import-untyped]
        from py_modules.deckforge import steam_integration  # type: ignore[import-untyped]
        from py_modules.deckforge import calibration  # type: ignore[import-untyped]
        from py_modules.deckforge import preset_manager  # type: ignore[import-untyped]

        class _Backend:
            devices = device_manager
            templates = template_manager
            steam = steam_integration
            cal = calibration
            presets = preset_manager

        return _Backend()

    # ── RPC methods — device management ───────────────────────────────

    async def get_devices(self) -> list[dict[str, Any]]:
        """Return a list of detected input devices with capabilities."""
        backend = self._backend()
        devices = await asyncio.to_thread(backend.devices.enumerate_devices)
        return [d.to_dict() for d in devices]

    async def get_device_events(self, device_path: str) -> list[dict[str, Any]]:
        """Return recent input events from *device_path*."""
        backend = self._backend()
        events = await asyncio.to_thread(
            backend.devices.read_events, device_path
        )
        return [e.to_dict() for e in events]

    # ── RPC methods — template management ─────────────────────────────

    async def get_templates(self) -> list[dict[str, Any]]:
        """Return metadata for every saved VDF template."""
        backend = self._backend()
        templates = await asyncio.to_thread(backend.templates.list_templates)
        return [t.to_dict() for t in templates]

    async def save_template(self, name: str, data: dict[str, Any]) -> bool:
        """Persist a VDF template under *name*."""
        backend = self._backend()
        result: bool = await asyncio.to_thread(
            backend.templates.save_template, name, data
        )
        return result

    async def load_template(self, name: str) -> dict[str, Any]:
        """Load and return the VDF template called *name*."""
        backend = self._backend()
        template = await asyncio.to_thread(backend.templates.load_template, name)
        return template.to_dict()

    async def delete_template(self, name: str) -> bool:
        """Delete the VDF template called *name*."""
        backend = self._backend()
        result: bool = await asyncio.to_thread(
            backend.templates.delete_template, name
        )
        return result

    # ── RPC methods — Steam integration ───────────────────────────────

    async def get_steam_games(self) -> list[dict[str, Any]]:
        """Return a list of installed Steam games."""
        backend = self._backend()
        games = await asyncio.to_thread(backend.steam.list_games)
        return [g.to_dict() for g in games]

    async def assign_template(
        self, template_name: str, app_id: int
    ) -> bool:
        """Bind a VDF template to a specific Steam *app_id*."""
        backend = self._backend()
        result: bool = await asyncio.to_thread(
            backend.steam.assign_template, template_name, app_id
        )
        return result

    # ── RPC methods — calibration ─────────────────────────────────────

    async def calibrate_axis(
        self,
        device_path: str,
        axis: str,
        settings: dict[str, Any],
    ) -> dict[str, Any]:
        """Run axis calibration for *axis* on *device_path* with *settings*."""
        backend = self._backend()
        result = await asyncio.to_thread(
            backend.cal.calibrate_axis, device_path, axis, settings
        )
        return result.to_dict()

    # ── RPC methods — presets ─────────────────────────────────────────

    async def get_presets(self) -> list[dict[str, Any]]:
        """Return all available device configuration presets."""
        backend = self._backend()
        presets = await asyncio.to_thread(backend.presets.list_presets)
        return [p.to_dict() for p in presets]

    async def apply_preset(
        self, preset_name: str, device_path: str
    ) -> bool:
        """Apply the named preset to the device at *device_path*."""
        backend = self._backend()
        result: bool = await asyncio.to_thread(
            backend.presets.apply_preset, preset_name, device_path
        )
        return result

    # ── RPC methods — hardware profilers & MIDI ───────────────────────

    async def get_midi_devices(self) -> list[dict[str, Any]]:
        """Return connected USB-MIDI electronic drums and synthesizers."""
        from py_modules.deckforge.midi_sniffer import list_midi_devices  # type: ignore[import-untyped]
        return await asyncio.to_thread(list_midi_devices)

    async def auto_detect_crkd(self) -> dict[str, Any] | None:
        """Auto-detect connected CRKD NEO S Pro Guitar."""
        from py_modules.deckforge.crkd_profiler import auto_detect_crkd  # type: ignore[import-untyped]
        profile = await asyncio.to_thread(auto_detect_crkd)
        return profile.to_dict() if profile else None

    async def auto_detect_gp2040(self) -> dict[str, Any] | None:
        """Auto-detect connected GP2040-CE / RP2040 controller or guitar."""
        from py_modules.deckforge.gp2040_profiler import auto_detect_gp2040  # type: ignore[import-untyped]
        profile = await asyncio.to_thread(auto_detect_gp2040)
        return profile.to_dict() if profile else None

    async def generate_guitar_template(self, guitar_type: str, game: str) -> dict[str, Any]:
        """Generate an optimized rhythm game template for CRKD or GP2040-CE."""
        if guitar_type.lower() == "gp2040":
            from py_modules.deckforge.gp2040_profiler import auto_detect_gp2040, generate_gp2040_template  # type: ignore[import-untyped]
            prof = auto_detect_gp2040()
            tpl = generate_gp2040_template(prof, target_game=game)
            return tpl.to_dict()
        else:
            from py_modules.deckforge.crkd_profiler import auto_detect_crkd, generate_crkd_template  # type: ignore[import-untyped]
            prof = auto_detect_crkd()
            tpl = generate_crkd_template(prof, target_game=game)
            return tpl.to_dict()


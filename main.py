"""DeckForge Input Studio — Decky Loader plugin entry point.

Decky's loader appends ``<plugin>/py_modules`` to ``sys.path`` but not
``<plugin>`` and not ``<plugin>/py_modules/lib``, and its embedded interpreter is
a frozen CPython that cannot see pip-installed packages.  So the vendored
third-party deps and the ``deckforge`` package are put on the path here, and
everything is imported as top-level ``deckforge.*`` — importing via
``py_modules.deckforge`` would execute the package a second time under a
different module name and give two disjoint sets of singletons.

The FastAPI/WebSocket server runs in a daemon thread; the RPC methods below are
what the Decky sidebar panel calls in-process.
"""

from __future__ import annotations

import logging
import os
import sys
import threading
from typing import Any

# Decky's file watcher treats any write inside the plugin directory as a source
# change and reloads the plugin. Importing the backend writes __pycache__/*.pyc,
# which is itself such a write -- so with the "debug" flag set the plugin
# reloads itself forever and never stays up. Byte-code caching is worthless
# here anyway (the tree is shipped read-only and reloaded often).
sys.dont_write_bytecode = True

_PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
_LIB_DIR = os.path.join(_PLUGIN_DIR, "py_modules", "lib")
_PY_MODULES = os.path.join(_PLUGIN_DIR, "py_modules")

# Order matters: vendored wheels must win over anything the frozen interpreter
# happens to expose.
for _path in (_LIB_DIR, _PY_MODULES):
    if os.path.isdir(_path) and _path in sys.path:
        sys.path.remove(_path)
for _path in (_LIB_DIR, _PY_MODULES):
    if os.path.isdir(_path):
        sys.path.insert(0, _path)

logger = logging.getLogger("deckforge")

API_HOST = "0.0.0.0"
API_PORT = 8765


class Plugin:
    """Decky Loader plugin class for DeckForge Input Studio."""

    _server: Any = None
    _server_thread: threading.Thread | None = None

    # ── lifecycle ──────────────────────────────────────────────────────

    async def _main(self) -> None:
        logger.info("DeckForge Input Studio starting up …")
        try:
            self._start_server()
        except Exception:
            logger.exception("DeckForge API server failed to start")

    def _start_server(self) -> None:
        """Start uvicorn on a daemon thread so Decky's loop stays free."""
        if self._port_in_use(API_PORT):
            # A previous load of this plugin is still holding the port. Binding
            # anyway would silently leave the *old* backend serving a stale
            # module tree, so refuse and say so.
            logger.error(
                "Port %s is already in use; not starting a second API server. "
                "A previous DeckForge process is probably still alive.",
                API_PORT,
            )
            return

        # Decky's frozen interpreter is missing logging.config; uvicorn needs it
        # at import time. Must run before `import uvicorn`.
        from deckforge import compat

        compat.apply()

        import uvicorn

        from deckforge.api_server import app

        config = uvicorn.Config(
            app=app,
            host=API_HOST,
            port=API_PORT,
            log_level="info",
            access_log=False,
        )
        self._server = uvicorn.Server(config)
        # uvicorn's Server.run() installs *non-daemon* threads (an asyncio
        # executor and the signal wakeup) and signal handlers, so a "daemon"
        # worker thread would still pin the process after unload. The thread is
        # given 2s to unwind and then the process exits, which is what Decky's
        # per-plugin process is for.
        self._server_thread = threading.Thread(
            target=self._server.run,
            name="deckforge-api",
            daemon=True,
        )
        self._server_thread.start()
        logger.info("DeckForge API listening on %s:%s", API_HOST, API_PORT)

    @staticmethod
    def _port_in_use(port: int) -> bool:
        """True if something is already accepting connections on *port*."""
        import socket

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.settimeout(0.5)
            return probe.connect_ex(("127.0.0.1", port)) == 0

    async def _unload(self) -> None:
        logger.info("DeckForge Input Studio shutting down …")
        if self._server is not None:
            self._server.should_exit = True
        if self._server_thread is not None:
            self._server_thread.join(timeout=5.0)
            self._server_thread = None
        self._server = None

    # ── RPC — status ──────────────────────────────────────────────────

    async def get_status(self) -> dict[str, Any]:
        """Report whether the backend is up and where templates publish."""
        from deckforge.api_server import template_manager

        return {
            "api": f"http://127.0.0.1:{API_PORT}",
            "running": bool(self._server_thread and self._server_thread.is_alive()),
            "steam": template_manager.steam_status(),
        }

    async def get_steam_status(self) -> dict[str, Any]:
        from deckforge.api_server import template_manager

        return template_manager.steam_status()

    # ── RPC — devices ─────────────────────────────────────────────────

    async def get_devices(self) -> list[dict[str, Any]]:
        import asyncio

        from deckforge.device_manager import enumerate_devices

        devices = await asyncio.to_thread(enumerate_devices)
        return [d.to_dict() for d in devices]

    # ── RPC — templates ───────────────────────────────────────────────

    async def get_templates(self) -> list[dict[str, Any]]:
        import asyncio

        from deckforge.api_server import template_manager

        return await asyncio.to_thread(template_manager.list_templates)

    async def save_template(self, name: str, data: dict[str, Any]) -> dict[str, Any]:
        """Save a studio template payload; publishes it into Steam."""
        import asyncio

        from deckforge.api_server import template_manager
        from deckforge.vdf_manager import VDFTemplate

        def _save() -> dict[str, Any]:
            payload = dict(data)
            payload.setdefault("title", name)
            template = VDFTemplate.from_dict(payload)
            path = template_manager.save_template(template)
            compiled = template_manager.last_compile
            return {
                "status": "saved",
                "name": template.safe_name(),
                "path": str(path),
                "applied": list(getattr(compiled, "applied", []) or []),
                "skipped": list(getattr(compiled, "skipped", []) or []),
            }

        return await asyncio.to_thread(_save)

    async def sync_template(self, name: str) -> dict[str, Any]:
        """Re-publish a saved template into Steam's template directory."""
        import asyncio

        from deckforge.api_server import template_manager

        def _sync() -> dict[str, Any]:
            template = template_manager._find_and_load(name)
            errors = template_manager.sync_to_steam(template)
            return {
                "status": "synced" if not errors else "failed",
                "errors": errors,
                "steam": template_manager.steam_status(),
            }

        return await asyncio.to_thread(_sync)

    # ── RPC — games ───────────────────────────────────────────────────

    async def get_games(self) -> list[dict[str, Any]]:
        import asyncio

        from deckforge.api_server import game_assigner

        def _games() -> list[dict[str, Any]]:
            out: list[dict[str, Any]] = []
            for game in game_assigner.list_all_games():
                try:
                    app_id = int(str(game.get("app_id") or ""))
                except ValueError:
                    app_id = 0
                out.append({
                    "appId": app_id,
                    "name": game.get("name") or "",
                    "source": game.get("source") or "steam",
                })
            return out

        return await asyncio.to_thread(_games)

    async def assign_template(self, template_name: str, app_id: str) -> dict[str, Any]:
        """Bind a template to a game through Steam's configset."""
        import asyncio

        from deckforge.api_server import game_assigner, template_manager

        return await asyncio.to_thread(
            game_assigner.assign_template_to_game,
            template_name,
            str(app_id),
            template_manager,
        )

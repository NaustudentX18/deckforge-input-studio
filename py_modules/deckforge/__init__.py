"""DeckForge Input Studio — backend package.

Provides device management, template handling, calibration, preset
management, Steam integration, and the FastAPI server that the Decky
Loader frontend communicates with over localhost.
"""

from __future__ import annotations

__version__ = "0.1.0"

# Re-export submodules using relative imports for reliability across runtimes
from . import (  # noqa: F401
    api_server,
    calibration,
    crkd_profiler,
    device_manager,
    input_sniffer,
    preset_manager,
    steam_integration,
    template_manager,
    vdf_manager,
)

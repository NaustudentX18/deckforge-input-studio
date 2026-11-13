"""DeckForge Input Studio — backend package.

Provides device management, template handling, calibration, preset
management, Steam integration, and the FastAPI server that the Decky
Loader frontend communicates with over localhost.

Submodules are deliberately *not* imported here.  The package is loaded inside
Decky Loader's frozen interpreter, where importing ``api_server`` eagerly would
drag in FastAPI, uvicorn and pydantic before the plugin has decided it needs
them -- and would make the import graph circular, since ``api_server`` imports
this package for its version string.
"""

from __future__ import annotations

__version__ = "0.1.0"

__all__ = ["__version__"]

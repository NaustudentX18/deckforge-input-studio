"""Runtime compatibility shims for Decky Loader's frozen interpreter.

Decky ships a PyInstaller-frozen CPython 3.14.  PyInstaller only bundles the
stdlib modules it can see being imported, and its own boot sequence never
imports ``logging.config`` -- so that module is simply absent at runtime even
though the rest of ``logging`` is present.  uvicorn imports ``logging.config``
at module scope, so the whole backend fails to load with ``ModuleNotFoundError:
No module named 'logging.config'``.

Confirmed on the Deck (SteamOS 20261023.100, Decky v3.3.1): of ~60 stdlib
modules probed, ``logging.config`` was the only one missing.

The fix copies the real module from the CPython 3.14 stdlib rather than
inventing a stub, so ``dictConfig`` semantics (including ``disable_existing``
and the ``cfg://`` resolver) stay correct, and registers it under its canonical
name before anything imports it.
"""

from __future__ import annotations

import importlib
import importlib.util
import logging
import sys
from pathlib import Path

_STDLIB_MODULE = "logging.config"
_FALLBACK = Path(__file__).resolve().parent / "_vendor" / "logging_config.py"


def ensure_logging_config() -> bool:
    """Make ``import logging.config`` work. Returns True if a shim was needed."""
    if _STDLIB_MODULE in sys.modules:
        return False
    try:
        importlib.import_module(_STDLIB_MODULE)
        return False
    except ModuleNotFoundError:
        pass

    if not _FALLBACK.is_file():
        raise ModuleNotFoundError(
            f"{_STDLIB_MODULE} is missing from this interpreter and the "
            f"vendored copy at {_FALLBACK} is gone"
        )

    spec = importlib.util.spec_from_file_location(_STDLIB_MODULE, _FALLBACK)
    if spec is None or spec.loader is None:  # pragma: no cover - defensive
        raise ModuleNotFoundError(f"Cannot load {_FALLBACK}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[_STDLIB_MODULE] = module
    spec.loader.exec_module(module)

    # logging.config is also reachable as an attribute of the package.
    setattr(logging, "config", module)
    return True


def apply() -> None:
    """Apply every shim this plugin needs. Cheap and idempotent."""
    ensure_logging_config()

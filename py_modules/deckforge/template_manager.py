"""
DeckForge Input Studio — Template Manager adapter for Decky RPC.
"""

from __future__ import annotations

import logging
from typing import Any
from .vdf_manager import TemplateManager as CoreTemplateManager, VDFTemplate

logger = logging.getLogger(__name__)

_mgr = CoreTemplateManager()


class TemplateItem:
    def __init__(self, data: dict[str, Any]) -> None:
        self.data = data

    def to_dict(self) -> dict[str, Any]:
        return self.data


def list_templates() -> list[TemplateItem]:
    """Return list of template metadata items."""
    return [TemplateItem(item) for item in _mgr.list_all_templates()]


def save_template(name: str, data: dict[str, Any]) -> bool:
    """Save template data under name."""
    try:
        data["title"] = name
        tpl = VDFTemplate.from_dict(data)
        _mgr.save_template(tpl)
        return True
    except Exception as exc:
        logger.error("Error saving template %s: %s", name, exc)
        return False


def load_template(name: str) -> VDFTemplate:
    """Load template by name."""
    return _mgr._find_and_load(name)


def delete_template(name: str) -> bool:
    """Delete template by name."""
    try:
        _mgr.delete_template(name)
        return True
    except Exception as exc:
        logger.error("Error deleting template %s: %s", name, exc)
        return False

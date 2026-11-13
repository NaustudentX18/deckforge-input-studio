"""
DeckForge Input Studio — Steam Integration adapter for Decky RPC.
"""

from __future__ import annotations

import logging
from typing import Any
from .vdf_manager import GameAssigner, TemplateManager

logger = logging.getLogger(__name__)

_assigner = GameAssigner()
_tm = TemplateManager()


class GameItem:
    def __init__(self, data: dict[str, Any]) -> None:
        self.data = data

    def to_dict(self) -> dict[str, Any]:
        return self.data


def list_games() -> list[GameItem]:
    """List all installed Steam games and non-Steam shortcuts."""
    return [GameItem(g) for g in _assigner.list_all_games()]


def assign_template(template_name: str, app_id: int | str) -> bool:
    """Assign a template to a game."""
    try:
        _assigner.assign_template_to_game(template_name, str(app_id), template_manager=_tm)
        return True
    except Exception as exc:
        logger.error("Error assigning template %s to app %s: %s", template_name, app_id, exc)
        return False

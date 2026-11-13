"""
DeckForge Input Studio — Preset Manager adapter for Decky RPC.
"""

from __future__ import annotations

import logging
from typing import Any

from .crkd_profiler import auto_detect_crkd, generate_crkd_template
from .vdf_manager import TemplateManager

logger = logging.getLogger(__name__)

_tm = TemplateManager()

PRESETS_DATA = [
    {
        "id": "rhythm-game-pro",
        "name": "Rhythm Game Pro",
        "description": "Optimized for Clone Hero, YARG, and rhythm games. Zero-latency strum/fret bindings.",
        "target_controller": "guitar",
    },
    {
        "id": "retro-emulation",
        "name": "Retro Emulation Universal",
        "description": "Maps spare buttons to Save State, Load State, Fast Forward, Rewind, Exit",
        "target_controller": "gamepad",
    },
    {
        "id": "desktop-media",
        "name": "Desktop & Couch Media",
        "description": "Right stick as mouse, triggers for clicks, grips for volume and Alt+Tab",
        "target_controller": "gamepad",
    },
]


class PresetItem:
    def __init__(self, data: dict[str, Any]) -> None:
        self.data = data

    def to_dict(self) -> dict[str, Any]:
        return self.data


def list_presets() -> list[PresetItem]:
    """List available presets."""
    return [PresetItem(p) for p in PRESETS_DATA]


def apply_preset(preset_name: str, device_path: str = "") -> bool:
    """Apply a preset configuration to a device and generate a template."""
    try:
        profile = auto_detect_crkd()
        if device_path:
            profile.device_path = device_path
        target_game = "Clone Hero"
        if "yarg" in preset_name.lower():
            target_game = "YARG"
        elif "retro" in preset_name.lower() or "rb4" in preset_name.lower():
            target_game = "Rock Band 4 (RPCS3)"
        template = generate_crkd_template(profile, target_game=target_game)
        _tm.save_template(template)
        return True
    except Exception as exc:
        logger.error("Error applying preset %s: %s", preset_name, exc)
        return False

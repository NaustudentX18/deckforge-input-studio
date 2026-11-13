"""
DeckForge Input Studio — Steam Input VDF Parser, Compiler & Template Manager.

Full VDF (Valve KeyValues) parser/serializer, Steam path resolution, template
management (CRUD, export/import), game enumeration, and validation.  All file
writes use atomic write patterns (write → validate → rename).
"""

from __future__ import annotations

import io
import json
import logging
import os
import re
import shutil
import struct
import tempfile
import time
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional, Union

logger = logging.getLogger(__name__)

# ===================================================================
# VDF text parser / serializer
# ===================================================================

class VDFParseError(Exception):
    """Raised when VDF text is malformed."""


def parse_vdf(text: str) -> dict[str, Any]:
    """Parse Valve KeyValues (VDF) text into a Python dict.

    Handles:
    - Nested blocks:  ``"key" { ... }``
    - Key-value pairs: ``"key" "value"``
    - Unquoted keys/values (single token, no whitespace)
    - ``//`` line comments
    - Escape sequences inside quoted strings (``\\n``, ``\\t``, ``\\\"``, ``\\\\``)
    """
    pos = 0
    length = len(text)

    def _skip_whitespace_and_comments() -> None:
        nonlocal pos
        while pos < length:
            # skip whitespace
            if text[pos] in (' ', '\t', '\r', '\n'):
                pos += 1
                continue
            # skip // comments
            if pos + 1 < length and text[pos] == '/' and text[pos + 1] == '/':
                while pos < length and text[pos] != '\n':
                    pos += 1
                continue
            break

    def _read_string() -> str:
        nonlocal pos
        _skip_whitespace_and_comments()
        if pos >= length:
            raise VDFParseError("Unexpected end of input while reading string")

        if text[pos] == '"':
            # Quoted string
            pos += 1
            buf: list[str] = []
            while pos < length:
                ch = text[pos]
                if ch == '\\' and pos + 1 < length:
                    pos += 1
                    esc = text[pos]
                    if esc == 'n':
                        buf.append('\n')
                    elif esc == 't':
                        buf.append('\t')
                    elif esc == '"':
                        buf.append('"')
                    elif esc == '\\':
                        buf.append('\\')
                    else:
                        buf.append('\\')
                        buf.append(esc)
                    pos += 1
                elif ch == '"':
                    pos += 1
                    return ''.join(buf)
                else:
                    buf.append(ch)
                    pos += 1
            raise VDFParseError("Unterminated quoted string")
        else:
            # Unquoted token
            start = pos
            while pos < length and text[pos] not in (' ', '\t', '\r', '\n', '"', '{', '}'):
                pos += 1
            if pos == start:
                raise VDFParseError(f"Unexpected character '{text[pos]}' at position {pos}")
            return text[start:pos]

    def _parse_block() -> dict[str, Any]:
        nonlocal pos
        result: dict[str, Any] = {}
        while True:
            _skip_whitespace_and_comments()
            if pos >= length:
                break
            if text[pos] == '}':
                pos += 1
                break
            key = _read_string()
            _skip_whitespace_and_comments()
            if pos >= length:
                raise VDFParseError(f"Unexpected end of input after key '{key}'")
            if text[pos] == '{':
                pos += 1
                value = _parse_block()
            else:
                value = _read_string()

            # Handle duplicate keys by converting to list
            if key in result:
                existing = result[key]
                if isinstance(existing, list):
                    existing.append(value)
                else:
                    result[key] = [existing, value]
            else:
                result[key] = value
        return result

    _skip_whitespace_and_comments()
    if pos >= length:
        return {}

    # VDF may or may not have an outer key
    root: dict[str, Any] = {}
    while pos < length:
        _skip_whitespace_and_comments()
        if pos >= length:
            break
        key = _read_string()
        _skip_whitespace_and_comments()
        if pos < length and text[pos] == '{':
            pos += 1
            root[key] = _parse_block()
        else:
            value = _read_string()
            root[key] = value
        _skip_whitespace_and_comments()

    return root


def serialize_vdf(data: dict[str, Any], indent: int = 0) -> str:
    """Serialize a Python dict back to VDF text format."""
    lines: list[str] = []
    tab = '\t' * indent

    for key, value in data.items():
        if isinstance(value, dict):
            lines.append(f'{tab}"{_escape_vdf(key)}"')
            lines.append(f'{tab}{{')
            lines.append(serialize_vdf(value, indent + 1))
            lines.append(f'{tab}}}')
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    lines.append(f'{tab}"{_escape_vdf(key)}"')
                    lines.append(f'{tab}{{')
                    lines.append(serialize_vdf(item, indent + 1))
                    lines.append(f'{tab}}}')
                else:
                    lines.append(f'{tab}"{_escape_vdf(key)}"\t\t"{_escape_vdf(str(item))}"')
        else:
            lines.append(f'{tab}"{_escape_vdf(key)}"\t\t"{_escape_vdf(str(value))}"')

    return '\n'.join(lines)


def _escape_vdf(s: str) -> str:
    """Escape special characters for VDF serialization."""
    return s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\t', '\\t')


# ===================================================================
# Binary VDF parser (for shortcuts.vdf)
# ===================================================================

# Binary VDF type tags
_BIN_TYPE_DICT = 0x00
_BIN_TYPE_STRING = 0x01
_BIN_TYPE_INT32 = 0x02
_BIN_TYPE_FLOAT = 0x03
_BIN_TYPE_PTR = 0x04  # unused in shortcuts.vdf
_BIN_TYPE_WSTRING = 0x05
_BIN_TYPE_COLOR = 0x06
_BIN_TYPE_UINT64 = 0x07
_BIN_TYPE_END = 0x08


def parse_binary_vdf(data: bytes) -> dict[str, Any]:
    """Parse a binary VDF file (e.g. shortcuts.vdf)."""
    stream = io.BytesIO(data)
    return _read_binary_dict(stream)


def _read_binary_string(stream: io.BytesIO) -> str:
    """Read a null-terminated string."""
    buf = bytearray()
    while True:
        b = stream.read(1)
        if not b or b == b'\x00':
            break
        buf.extend(b)
    return buf.decode('utf-8', errors='replace')


def _read_binary_dict(stream: io.BytesIO) -> dict[str, Any]:
    """Read a binary VDF dictionary."""
    result: dict[str, Any] = {}
    while True:
        type_byte = stream.read(1)
        if not type_byte:
            break
        type_id = type_byte[0]

        if type_id == _BIN_TYPE_END:
            break

        key = _read_binary_string(stream)

        if type_id == _BIN_TYPE_DICT:
            result[key] = _read_binary_dict(stream)
        elif type_id == _BIN_TYPE_STRING:
            result[key] = _read_binary_string(stream)
        elif type_id == _BIN_TYPE_INT32:
            raw = stream.read(4)
            if len(raw) < 4:
                break
            result[key] = struct.unpack('<i', raw)[0]
        elif type_id == _BIN_TYPE_FLOAT:
            raw = stream.read(4)
            if len(raw) < 4:
                break
            result[key] = struct.unpack('<f', raw)[0]
        elif type_id == _BIN_TYPE_UINT64:
            raw = stream.read(8)
            if len(raw) < 8:
                break
            result[key] = struct.unpack('<Q', raw)[0]
        elif type_id == _BIN_TYPE_WSTRING:
            result[key] = _read_binary_string(stream)  # simplified
        elif type_id == _BIN_TYPE_COLOR:
            raw = stream.read(4)
            if len(raw) < 4:
                break
            result[key] = struct.unpack('<I', raw)[0]
        elif type_id == _BIN_TYPE_PTR:
            raw = stream.read(4)
            if len(raw) < 4:
                break
            result[key] = struct.unpack('<I', raw)[0]
        else:
            # Unknown type, try to keep going
            logger.warning("Unknown binary VDF type 0x%02x for key '%s'", type_id, key)
            break

    return result


def calculate_shortcut_id_32(exe: str, app_name: str) -> int:
    """Calculate 32-bit legacy shortcut ID / folder ID for Non-Steam shortcuts.
    Formula: (crc32(exe + appname) | 0x80000000)
    """
    key = (exe + app_name).encode("utf-8")
    crc = zlib.crc32(key) & 0xFFFFFFFF
    return (crc | 0x80000000) & 0xFFFFFFFF


def calculate_shortcut_id_64(exe: str, app_name: str) -> int:
    """Calculate Steam Big Picture / SteamOS 64-bit shortcut ID.
    Formula: ((crc32(exe + appname) | 0x80000000) << 32) | 0x02000000
    """
    id_32 = calculate_shortcut_id_32(exe, app_name)
    return ((id_32 << 32) | 0x02000000) & 0xFFFFFFFFFFFFFFFF


# ===================================================================
# SteamPathResolver
# ===================================================================

_DEFAULT_STEAM_PATHS = [
    Path.home() / ".local" / "share" / "Steam",
    Path.home() / ".steam" / "steam",
    Path.home() / ".steam" / "root",
    Path("/usr/share/steam"),
]


class SteamPathResolver:
    """Locate Steam installation directories, user data, controller templates, etc."""

    def __init__(self, steam_root: Optional[Path] = None) -> None:
        self.steam_root = steam_root or self._find_steam_root()

    @staticmethod
    def _find_steam_root() -> Path:
        """Find the Steam installation directory."""
        for candidate in _DEFAULT_STEAM_PATHS:
            if candidate.is_dir():
                return candidate
        # Fallback
        return _DEFAULT_STEAM_PATHS[0]

    @property
    def userdata_dir(self) -> Path:
        return self.steam_root / "userdata"

    def enumerate_user_ids(self) -> list[str]:
        """Return a list of Steam user ID directory names."""
        ud = self.userdata_dir
        if not ud.is_dir():
            return []
        return sorted(
            d.name for d in ud.iterdir()
            if d.is_dir() and d.name.isdigit()
        )

    def controller_base_templates_dir(self) -> Path:
        return self.steam_root / "controller_base" / "templates"

    def user_template_dir(self, user_id: str) -> Path:
        return self.userdata_dir / user_id / "config" / "controller_configs" / "templates"

    def user_config_dir(self, user_id: str) -> Path:
        return self.userdata_dir / user_id / "config"

    def shortcuts_vdf_path(self, user_id: str) -> Path:
        return self.userdata_dir / user_id / "config" / "shortcuts.vdf"

    def library_folders_vdf(self) -> Path:
        """Path to libraryfolders.vdf."""
        candidate = self.steam_root / "steamapps" / "libraryfolders.vdf"
        if candidate.exists():
            return candidate
        return self.steam_root / "config" / "libraryfolders.vdf"

    def configset_neptune_path(self, user_id: str) -> Path:
        return (self.userdata_dir / user_id / "config" /
                "controller_configs" / "apps" / "configset_controller_neptune.vdf")

    def steam_controller_configs_dir(self, user_id: str) -> Path:
        """Steam Controller Configs directory: ~/.local/share/Steam/steamapps/common/Steam Controller Configs/<USER_ID>/config/"""
        return self.steam_root / "steamapps" / "common" / "Steam Controller Configs" / user_id / "config"

    def cloud_remote_dir(self, user_id: str) -> Path:
        """Steam Cloud remote sync directory for Steam Controller (AppID 241100):
        ~/.local/share/Steam/userdata/<USER_ID>/241100/remote/
        """
        return self.userdata_dir / user_id / "241100" / "remote"



# ===================================================================
# VDFTemplate dataclass
# ===================================================================

@dataclass
class VDFTemplate:
    """Represents a Steam Input controller configuration template."""
    version: int = 3
    title: str = ""
    description: str = ""
    creator: str = ""
    controller_type: str = "neptune"  # neptune / generic / xbox360
    timestamp: int = 0
    group_source_bindings: list[dict[str, Any]] = field(default_factory=list)
    preset_id: int = 0
    action_sets: list[dict[str, Any]] = field(default_factory=list)
    action_layers: list[dict[str, Any]] = field(default_factory=list)
    raw_vdf: Optional[dict[str, Any]] = field(default=None, repr=False)

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "title": self.title,
            "description": self.description,
            "creator": self.creator,
            "controller_type": self.controller_type,
            "timestamp": self.timestamp,
            "group_source_bindings": self.group_source_bindings,
            "preset_id": self.preset_id,
            "action_sets": self.action_sets,
            "action_layers": self.action_layers,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "VDFTemplate":
        return cls(
            version=int(data.get("version", 3)),
            title=data.get("title", ""),
            description=data.get("description", ""),
            creator=data.get("creator", ""),
            controller_type=data.get("controller_type", "neptune"),
            timestamp=int(data.get("timestamp", 0)),
            group_source_bindings=data.get("group_source_bindings", []),
            preset_id=int(data.get("preset_id", 0)),
            action_sets=data.get("action_sets", []),
            action_layers=data.get("action_layers", []),
        )

    def to_vdf_dict(self) -> dict[str, Any]:
        """Convert to a VDF-serializable dict structure."""
        if self.raw_vdf:
            return dict(self.raw_vdf)

        preset: dict[str, Any] = {
            "id": str(self.preset_id),
            "name": self.title,
        }

        # Build group_source_bindings block
        if self.group_source_bindings:
            gsb: dict[str, Any] = {}
            for i, binding in enumerate(self.group_source_bindings):
                gsb[str(i)] = binding
            preset["group_source_bindings"] = gsb

        controller_config: dict[str, Any] = {
            "version": str(self.version),
            "revision": str(self.timestamp),
            "title": self.title,
            "description": self.description,
            "creator": self.creator,
            "controller_type": self.controller_type,
            "Timestamp": str(self.timestamp or int(time.time())),
        }

        if self.action_sets:
            for i, action_set in enumerate(self.action_sets):
                controller_config[f"action_set_{i}"] = action_set

        if self.action_layers:
            for i, layer in enumerate(self.action_layers):
                controller_config[f"action_layer_{i}"] = layer

        preset_block: dict[str, Any] = {"preset": preset}
        controller_config["group"] = preset_block

        return {"controller_mappings": controller_config}

    @classmethod
    def from_vdf_dict(cls, data: dict[str, Any]) -> "VDFTemplate":
        """Parse a VDFTemplate from a parsed VDF dict."""
        cm = data.get("controller_mappings", data)

        # Extract group_source_bindings from nested preset
        gsb: list[dict[str, Any]] = []
        group = cm.get("group", {})
        preset_data = group.get("preset", {}) if isinstance(group, dict) else {}
        if isinstance(preset_data, dict):
            gsb_block = preset_data.get("group_source_bindings", {})
            if isinstance(gsb_block, dict):
                gsb = list(gsb_block.values())

        # Extract action sets
        action_sets: list[dict[str, Any]] = []
        action_layers: list[dict[str, Any]] = []
        for key, val in cm.items():
            if key.startswith("action_set_") and isinstance(val, dict):
                action_sets.append(val)
            elif key.startswith("action_layer_") and isinstance(val, dict):
                action_layers.append(val)

        return cls(
            version=int(cm.get("version", 3)),
            title=cm.get("title", ""),
            description=cm.get("description", ""),
            creator=cm.get("creator", ""),
            controller_type=cm.get("controller_type", "neptune"),
            timestamp=int(cm.get("Timestamp", cm.get("revision", 0))),
            group_source_bindings=gsb,
            preset_id=int(preset_data.get("id", 0)) if isinstance(preset_data, dict) else 0,
            action_sets=action_sets,
            action_layers=action_layers,
            raw_vdf=data,
        )

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)

    @classmethod
    def from_json(cls, text: str) -> "VDFTemplate":
        return cls.from_dict(json.loads(text))


# ===================================================================
# VDFValidator
# ===================================================================

class VDFValidationError(Exception):
    """Raised when a VDF template fails validation."""


class VDFValidator:
    """Validates VDF template structures before writing."""

    REQUIRED_KEYS = {"version", "title", "controller_type"}
    VALID_CONTROLLER_TYPES = {
        "neptune", "generic", "xbox360", "ps4", "ps5", "switch_pro",
        "controller_neptune", "controller_generic", "controller_xbox360",
        "controller_ps4", "controller_ps5", "controller_switch_pro",
    }

    @classmethod
    def validate(cls, template: VDFTemplate) -> list[str]:
        """Return a list of validation errors. Empty list means valid."""
        errors: list[str] = []

        if not template.title:
            errors.append("Template title is required")
        if not template.controller_type:
            errors.append("Controller type is required")
        elif template.controller_type not in cls.VALID_CONTROLLER_TYPES:
            errors.append(
                f"Unknown controller_type '{template.controller_type}'; "
                f"expected one of {cls.VALID_CONTROLLER_TYPES}"
            )
        if template.version < 1:
            errors.append(f"Version must be >= 1, got {template.version}")

        return errors

    @classmethod
    def validate_vdf_text(cls, vdf_text: str) -> list[str]:
        """Validate raw VDF text: parse it and check structure."""
        errors: list[str] = []
        try:
            data = parse_vdf(vdf_text)
        except VDFParseError as exc:
            errors.append(f"VDF parse error: {exc}")
            return errors

        if not data:
            errors.append("Empty VDF content")
            return errors

        # Check for controller_mappings key
        if "controller_mappings" in data:
            cm = data["controller_mappings"]
            if not isinstance(cm, dict):
                errors.append("controller_mappings must be a block")
            else:
                for key in ("version", "title"):
                    if key not in cm:
                        errors.append(f"Missing required key '{key}' in controller_mappings")
        return errors

    @classmethod
    def validate_strict(cls, template: VDFTemplate) -> None:
        """Raise VDFValidationError if template is invalid."""
        errors = cls.validate(template)
        if errors:
            raise VDFValidationError("; ".join(errors))


# ===================================================================
# Atomic file writing
# ===================================================================

def _atomic_write(path: Path, content: str, encoding: str = "utf-8") -> None:
    """Write content to *path* atomically using a temp file + rename."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    try:
        tmp_path.write_text(content, encoding=encoding)
        tmp_path.rename(path)
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink()
        raise


def _atomic_write_bytes(path: Path, content: bytes) -> None:
    """Write bytes to *path* atomically."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    try:
        tmp_path.write_bytes(content)
        tmp_path.rename(path)
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink()
        raise


# ===================================================================
# TemplateManager
# ===================================================================

_LOCAL_TEMPLATE_DIR = Path.home() / ".config" / "deckforge" / "templates"


class TemplateManager:
    """CRUD operations for Steam Input configuration templates.

    Templates live in three locations:
    1. Steam base templates (read-only)
    2. Steam user templates
    3. Local DeckForge vault (~/.config/deckforge/templates/)
    """

    def __init__(self, steam: Optional[SteamPathResolver] = None,
                 local_dir: Optional[Path] = None) -> None:
        self.steam = steam or SteamPathResolver()
        self.local_dir = local_dir or _LOCAL_TEMPLATE_DIR
        self.local_dir.mkdir(parents=True, exist_ok=True)

    # ---- listing ----

    def list_base_templates(self) -> list[dict[str, Any]]:
        """List Steam base controller templates."""
        base_dir = self.steam.controller_base_templates_dir()
        return self._list_templates_in(base_dir, source="base")

    def list_user_templates(self) -> list[dict[str, Any]]:
        """List user templates across all Steam user IDs."""
        results: list[dict[str, Any]] = []
        for uid in self.steam.enumerate_user_ids():
            tdir = self.steam.user_template_dir(uid)
            results.extend(self._list_templates_in(tdir, source=f"user:{uid}"))
        return results

    def list_local_templates(self) -> list[dict[str, Any]]:
        """List templates in the DeckForge local vault."""
        return self._list_templates_in(self.local_dir, source="local")

    def list_all_templates(self) -> list[dict[str, Any]]:
        """List templates from all sources."""
        return (
            self.list_base_templates()
            + self.list_user_templates()
            + self.list_local_templates()
        )

    def _list_templates_in(self, directory: Path, source: str) -> list[dict[str, Any]]:
        if not directory.is_dir():
            return []
        results: list[dict[str, Any]] = []
        for vdf_file in sorted(directory.glob("*.vdf")):
            try:
                tpl = self.load_template(str(vdf_file))
                results.append({
                    "name": vdf_file.stem,
                    "title": tpl.title,
                    "description": tpl.description,
                    "controller_type": tpl.controller_type,
                    "source": source,
                    "path": str(vdf_file),
                })
            except Exception as exc:
                logger.debug("Cannot parse template %s: %s", vdf_file, exc)
        # Also check JSON metadata files
        for json_file in sorted(directory.glob("*.json")):
            if json_file.stem + ".vdf" in {f.name for f in directory.glob("*.vdf")}:
                continue  # already listed
            try:
                tpl = VDFTemplate.from_json(json_file.read_text())
                results.append({
                    "name": json_file.stem,
                    "title": tpl.title,
                    "description": tpl.description,
                    "controller_type": tpl.controller_type,
                    "source": source,
                    "path": str(json_file),
                })
            except Exception:
                pass
        return results

    # ---- load / save ----

    def load_template(self, path: str) -> VDFTemplate:
        """Load a VDFTemplate from a .vdf or .json file."""
        p = Path(path)
        if not p.exists():
            # Try local dir
            local_vdf = self.local_dir / (p.name if '.' in p.name else p.name + ".vdf")
            local_json = self.local_dir / (p.stem + ".json")
            if local_vdf.exists():
                p = local_vdf
            elif local_json.exists():
                p = local_json
            else:
                raise FileNotFoundError(f"Template not found: {path}")

        content = p.read_text(encoding="utf-8", errors="replace")
        if p.suffix == ".json":
            return VDFTemplate.from_json(content)
        else:
            data = parse_vdf(content)
            return VDFTemplate.from_vdf_dict(data)

    def save_template(self, template: VDFTemplate) -> Path:
        """Save a VDFTemplate to the local vault and atomically synchronize to all
        locations indexed by SteamOS Gaming Mode:
        1. Local master vault (~/.config/deckforge/templates/)
        2. Steam user template directory (~/.local/share/Steam/userdata/<USER_ID>/config/controller_configs/templates/)
        3. Steam Controller Configs directory (~/.local/share/Steam/steamapps/common/Steam Controller Configs/<USER_ID>/config/)
        4. Steam Cloud AppID 241100 remote directory (~/.local/share/Steam/userdata/<USER_ID>/241100/remote/)

        Returns the local vault path.
        """
        VDFValidator.validate_strict(template)

        safe_name = re.sub(r'[^\w\-]', '_', template.title.lower())
        if not safe_name:
            safe_name = f"template_{int(time.time())}"

        # 1. Write to local vault (.vdf and .json)
        local_vdf_path = self.local_dir / f"{safe_name}.vdf"
        local_json_path = self.local_dir / f"{safe_name}.json"

        vdf_text = serialize_vdf(template.to_vdf_dict())
        _atomic_write(local_vdf_path, vdf_text)
        _atomic_write(local_json_path, template.to_json())

        # 2. Sync to all Steam user ID directories
        user_ids = self.steam.enumerate_user_ids()
        for uid in user_ids:
            # A. User templates: userdata/<uid>/config/controller_configs/templates/
            user_tpl_dir = self.steam.user_template_dir(uid)
            try:
                _atomic_write(user_tpl_dir / f"{safe_name}.vdf", vdf_text)
            except OSError as exc:
                logger.debug("Cannot write to user templates for %s: %s", uid, exc)

            # B. Controller Configs: steamapps/common/Steam Controller Configs/<uid>/config/
            common_cfg_dir = self.steam.steam_controller_configs_dir(uid)
            try:
                _atomic_write(common_cfg_dir / f"{safe_name}.vdf", vdf_text)
            except OSError as exc:
                logger.debug("Cannot write to common controller configs for %s: %s", uid, exc)

            # C. Steam Cloud remote sync: userdata/<uid>/241100/remote/
            cloud_dir = self.steam.cloud_remote_dir(uid)
            try:
                _atomic_write(cloud_dir / f"{safe_name}.vdf", vdf_text)
            except OSError as exc:
                logger.debug("Cannot write to Steam Cloud remote for %s: %s", uid, exc)

        logger.info("Saved template '%s' to %s and synced to Steam directories", template.title, local_vdf_path)
        return local_vdf_path

    def save_schema_variants(self, template: VDFTemplate, schemas: Optional[list[str]] = None) -> list[Path]:
        """Generate and save controller schema variants so Steam never hides a template
        due to controller-type mismatch (e.g. neptune, xbox360, ps4, ps5, generic).
        """
        if schemas is None:
            schemas = ["neptune", "xbox360", "ps4", "ps5", "generic"]

        saved_paths: list[Path] = []
        base_title = template.title

        for schema in schemas:
            variant = VDFTemplate.from_dict(template.to_dict())
            variant.controller_type = schema
            if schema != template.controller_type:
                variant.title = f"{base_title} ({schema})"
            path = self.save_template(variant)
            saved_paths.append(path)

        return saved_paths

    def clone_template(self, name: str, new_name: str) -> VDFTemplate:
        """Clone an existing template under a new name."""
        template = self._find_and_load(name)
        template.title = new_name
        template.timestamp = int(time.time())
        template.raw_vdf = None  # force re-generation
        self.save_template(template)
        return template

    def delete_template(self, name: str) -> None:
        """Delete a template from the local vault, creating a .bak backup first."""
        safe_name = re.sub(r'[^\w\-]', '_', name.lower())
        for suffix in (".vdf", ".json"):
            path = self.local_dir / f"{safe_name}{suffix}"
            if path.exists():
                bak = path.with_suffix(".bak")
                shutil.copy2(str(path), str(bak))
                path.unlink()
                logger.info("Deleted %s (backed up to %s)", path, bak)

    def export_template(self, name: str, fmt: str = "vdf") -> bytes:
        """Export a template as VDF text or DeckForge JSON bytes."""
        template = self._find_and_load(name)
        if fmt == "deckforge_json":
            return template.to_json().encode("utf-8")
        else:
            return serialize_vdf(template.to_vdf_dict()).encode("utf-8")

    def import_template(self, data: bytes, fmt: str = "vdf") -> VDFTemplate:
        """Import a template from bytes, save to local vault, and return it."""
        text = data.decode("utf-8", errors="replace")
        if fmt == "deckforge_json":
            template = VDFTemplate.from_json(text)
        else:
            parsed = parse_vdf(text)
            template = VDFTemplate.from_vdf_dict(parsed)

        if not template.title:
            template.title = f"Imported_{int(time.time())}"
        if not template.timestamp:
            template.timestamp = int(time.time())

        self.save_template(template)
        return template

    def _find_and_load(self, name: str) -> VDFTemplate:
        """Find a template by name across all sources."""
        safe_name = re.sub(r'[^\w\-]', '_', name.lower())
        # Check local first
        for suffix in (".vdf", ".json"):
            path = self.local_dir / f"{safe_name}{suffix}"
            if path.exists():
                return self.load_template(str(path))
        # Check all listings
        for info in self.list_all_templates():
            if info["name"] == safe_name or info.get("title", "").lower() == name.lower():
                return self.load_template(info["path"])
        raise FileNotFoundError(f"Template '{name}' not found")


# ===================================================================
# GameAssigner
# ===================================================================

class GameAssigner:
    """Enumerate Steam and non-Steam games and assign controller templates."""

    def __init__(self, steam: Optional[SteamPathResolver] = None) -> None:
        self.steam = steam or SteamPathResolver()

    def list_steam_games(self) -> list[dict[str, Any]]:
        """Parse libraryfolders.vdf and appmanifest files to list installed Steam games."""
        games: list[dict[str, Any]] = []
        lf_path = self.steam.library_folders_vdf()
        if not lf_path.exists():
            return games

        try:
            lf_data = parse_vdf(lf_path.read_text(encoding="utf-8", errors="replace"))
        except (VDFParseError, OSError) as exc:
            logger.warning("Cannot parse libraryfolders.vdf: %s", exc)
            return games

        # libraryfolders.vdf has numbered entries with "path" and "apps"
        root = lf_data.get("libraryfolders", lf_data)
        for key, folder in root.items():
            if not isinstance(folder, dict):
                continue
            lib_path = folder.get("path")
            if not lib_path:
                continue

            steamapps = Path(lib_path) / "steamapps"
            if not steamapps.is_dir():
                continue

            for manifest in sorted(steamapps.glob("appmanifest_*.acf")):
                try:
                    mdata = parse_vdf(manifest.read_text(encoding="utf-8", errors="replace"))
                    app_state = mdata.get("AppState", {})
                    if isinstance(app_state, dict):
                        app_id = app_state.get("appid", "")
                        name = app_state.get("name", "")
                        install_dir = app_state.get("installdir", "")
                        size = app_state.get("SizeOnDisk", "0")
                        games.append({
                            "app_id": str(app_id),
                            "name": name,
                            "install_dir": install_dir,
                            "size_on_disk": int(size) if str(size).isdigit() else 0,
                            "source": "steam",
                            "library_path": str(steamapps),
                        })
                except Exception as exc:
                    logger.debug("Cannot parse %s: %s", manifest, exc)

        return games

    def list_nonsteam_games(self) -> list[dict[str, Any]]:
        """Parse shortcuts.vdf (binary VDF) to list non-Steam games with accurate
        32-bit legacy shortcut IDs and 64-bit Steam Big Picture shortcut IDs.
        """
        games: list[dict[str, Any]] = []
        for uid in self.steam.enumerate_user_ids():
            sc_path = self.steam.shortcuts_vdf_path(uid)
            if not sc_path.exists():
                continue
            try:
                data = parse_binary_vdf(sc_path.read_bytes())
                shortcuts = data.get("shortcuts", data)
                for key, entry in shortcuts.items():
                    if not isinstance(entry, dict):
                        continue
                    app_name = entry.get("AppName", entry.get("appname", ""))
                    exe = entry.get("Exe", entry.get("exe", ""))

                    # Calculate official CRC32 shortcut IDs
                    id_32 = calculate_shortcut_id_32(exe, app_name) if (exe or app_name) else 0
                    id_64 = calculate_shortcut_id_64(exe, app_name) if (exe or app_name) else 0

                    raw_appid = entry.get("appid", key)
                    resolved_appid = str(id_32) if id_32 else str(raw_appid)

                    games.append({
                        "app_id": resolved_appid,
                        "shortcut_id_32": str(id_32),
                        "shortcut_id_64": str(id_64),
                        "raw_appid": str(raw_appid),
                        "name": app_name,
                        "exe": exe,
                        "start_dir": entry.get("StartDir", entry.get("startdir", "")),
                        "launch_options": entry.get("LaunchOptions", entry.get("launchoptions", "")),
                        "source": "non-steam",
                        "user_id": uid,
                    })
            except Exception as exc:
                logger.debug("Cannot parse shortcuts.vdf for user %s: %s", uid, exc)

        return games

    def list_all_games(self) -> list[dict[str, Any]]:
        return self.list_steam_games() + self.list_nonsteam_games()

    def assign_template_to_game(self, template_name: str, app_id: str,
                                 template_manager: Optional[TemplateManager] = None) -> None:
        """Assign a controller template to a game by modifying
        configset_controller_neptune.vdf in the user's config.

        For Non-Steam shortcuts, binds both the 32-bit ID and 64-bit Big Picture ID.
        """
        tm = template_manager or TemplateManager(steam=self.steam)
        template = tm._find_and_load(template_name)
        VDFValidator.validate_strict(template)

        user_ids = self.steam.enumerate_user_ids()
        if not user_ids:
            raise RuntimeError("No Steam user IDs found")

        # Check if this app_id matches a non-steam game with alternative 32/64 bit IDs
        target_ids = {str(app_id)}
        for game in self.list_nonsteam_games():
            if str(app_id) in (game.get("app_id"), game.get("shortcut_id_32"), game.get("shortcut_id_64"), game.get("raw_appid")):
                if game.get("shortcut_id_32"):
                    target_ids.add(str(game["shortcut_id_32"]))
                if game.get("shortcut_id_64"):
                    target_ids.add(str(game["shortcut_id_64"]))

        for uid in user_ids:
            config_path = self.steam.configset_neptune_path(uid)
            config_path.parent.mkdir(parents=True, exist_ok=True)

            # Read existing config or start fresh
            existing: dict[str, Any] = {}
            if config_path.exists():
                bak = config_path.with_suffix(".vdf.bak")
                shutil.copy2(str(config_path), str(bak))
                try:
                    existing = parse_vdf(config_path.read_text(encoding="utf-8", errors="replace"))
                except VDFParseError:
                    existing = {}

            # Set template for all matching app_ids
            if "controller_config" not in existing:
                existing["controller_config"] = {}

            tpl_vdf = template.to_vdf_dict()
            for tid in target_ids:
                existing["controller_config"][tid] = tpl_vdf

            vdf_text = serialize_vdf(existing)
            _atomic_write(config_path, vdf_text)
            logger.info("Assigned template '%s' to app targets %s for user %s",
                        template_name, target_ids, uid)


# ===================================================================
# Template diffing
# ===================================================================

def diff_templates(a: VDFTemplate, b: VDFTemplate) -> dict[str, Any]:
    """Compare two templates and return their differences."""
    diffs: dict[str, Any] = {}
    a_dict = a.to_dict()
    b_dict = b.to_dict()

    for key in set(a_dict.keys()) | set(b_dict.keys()):
        val_a = a_dict.get(key)
        val_b = b_dict.get(key)
        if val_a != val_b:
            diffs[key] = {"template_a": val_a, "template_b": val_b}

    return diffs

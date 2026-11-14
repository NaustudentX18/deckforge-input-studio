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

def _candidate_steam_roots() -> list[Path]:
    """Steam install roots, in priority order.

    Built per call rather than at import time: Decky may import this module
    before ``HOME`` reflects the real user, and a module-level ``Path.home()``
    would freeze the wrong answer for the whole process.
    """
    roots = [
        Path.home() / ".local" / "share" / "Steam",
        Path.home() / ".steam" / "steam",
        Path.home() / ".steam" / "root",
    ]
    # The plugin normally runs as the Steam user; HOME can still be root's.
    for home in ("/home/deck",):
        roots.append(Path(home) / ".local" / "share" / "Steam")
    roots.append(Path("/usr/share/steam"))
    return roots


_DEFAULT_STEAM_PATHS = _candidate_steam_roots()


class SteamPathResolver:
    """Locate Steam installation directories, user data, controller templates, etc."""

    def __init__(self, steam_root: Optional[Path] = None) -> None:
        self.steam_root = steam_root or self._find_steam_root()

    @staticmethod
    def _find_steam_root() -> Path:
        """Find the Steam installation directory."""
        candidates = _candidate_steam_roots()
        for candidate in candidates:
            if candidate.is_dir():
                return candidate
        # Fallback
        return candidates[0]

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
        """Where Steam actually looks for user-visible template files.

        Measured on SteamOS 20261023.100: ``userdata/<id>/config/controller_configs``
        does not exist, and neither does ``userdata/<id>/241100/remote``.  Steam
        loads templates from ``controller_base/templates`` (shared, writable by
        the Steam user) and per-game configs from
        ``steamapps/common/Steam Controller Configs/<id>/config``.
        """
        return self.controller_base_templates_dir()

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

    def configset_path(self, user_id: str, controller_type: str = "neptune") -> Path:
        """The ``configset`` file mapping app ids to templates for a controller.

        Steam writes one per controller schema, e.g.
        ``configset_controller_neptune.vdf`` and ``configset_45e-28e-428f6858.vdf``.
        """
        schema = "controller_" + controller_type.replace("controller_", "")
        return self.steam_controller_configs_dir(user_id) / f"configset_{schema}.vdf"

    def configset_neptune_path(self, user_id: str) -> Path:
        return self.configset_path(user_id, "neptune")

    def device_configsets(self, user_id: str) -> list[Path]:
        """Per-*device* configsets, e.g. ``configset_45e-28e-428f6858.vdf``.

        Steam keeps two parallel sets of these files: one keyed on the controller
        *schema* (``configset_controller_xbox360.vdf``) and one keyed on the
        device's ``vid-pid``. The Game Mode configurator reads the device-keyed
        one when a physical controller is connected, so a template only assigned
        in the schema-keyed file may never appear for the device in hand.
        """
        base = self.steam_controller_configs_dir(user_id)
        if not base.is_dir():
            return []
        return sorted(
            p for p in base.glob("configset_*.vdf")
            if not p.name.startswith("configset_controller_")
        )

    def steam_controller_configs_dir(self, user_id: str) -> Path:
        """Steam Controller Configs directory: ~/.local/share/Steam/steamapps/common/Steam Controller Configs/<USER_ID>/config/"""
        return self.steam_root / "steamapps" / "common" / "Steam Controller Configs" / user_id / "config"

    def cloud_remote_dir(self, user_id: str) -> Path:
        """Steam Cloud remote sync directory for Steam Controller (AppID 241100):
        ~/.local/share/Steam/userdata/<USER_ID>/241100/remote/
        """
        return self.userdata_dir / user_id / "241100" / "remote"



# ===================================================================
# VDFTemplate
# ===================================================================

@dataclass
class VDFTemplate:
    """A DeckForge input profile and its compiled Steam Input config.

    The JSON form is the one the studio frontend edits (``metadata`` /
    ``actionSets``); the VDF form is produced by :mod:`deckforge.steam_compiler`
    against Valve's shipped skeleton.  The two are not structurally similar and
    are not meant to be -- see the module docstrings.
    """
    version: int = 3
    title: str = ""
    description: str = ""
    creator: str = ""
    controller_type: str = "neptune"
    timestamp: int = 0
    name: str = ""
    device_blueprint_id: str = "steam_deck"
    tags: list[str] = field(default_factory=list)
    action_sets: list[dict[str, Any]] = field(default_factory=list)
    virtual_menus: list[dict[str, Any]] = field(default_factory=list)
    macros: list[dict[str, Any]] = field(default_factory=list)
    axis_calibrations: list[dict[str, Any]] = field(default_factory=list)
    turbo_configs: dict[str, Any] = field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""
    # Set when the template came from an existing Steam file; keeps unsupported
    # parts of that file intact instead of dropping them on the first save.
    raw_vdf: Optional[dict[str, Any]] = field(default=None, repr=False)

    def __post_init__(self) -> None:
        # Single source of truth: the schema written into the VDF, the skeleton
        # used to compile it, and the configset file Steam reads must agree.
        from .steam_compiler import canonical_controller_type

        self.controller_type = canonical_controller_type(self.controller_type)

    # ---- identity ----

    def safe_name(self) -> str:
        """Filename stem for this template."""
        stem = re.sub(r'[^\w\-]', '_', (self.name or self.title).lower()).strip('_')
        return stem or f"template_{int(time.time())}"

    # ---- bindings ----

    def bindings(self) -> list[dict[str, Any]]:
        """Flatten every action set and layer into one binding list."""
        out: list[dict[str, Any]] = []
        for action_set in self.action_sets:
            if not isinstance(action_set, dict):
                continue
            for binding in action_set.get("bindings") or []:
                if isinstance(binding, dict):
                    out.append(binding)
            for layer in action_set.get("layers") or []:
                if not isinstance(layer, dict):
                    continue
                for binding in layer.get("bindings") or []:
                    if isinstance(binding, dict):
                        out.append(binding)
        return out

    # ---- JSON ----

    def to_dict(self) -> dict[str, Any]:
        """Serialise to the frontend's ``VDFTemplate`` shape."""
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        return {
            "metadata": {
                "name": self.safe_name(),
                "title": self.title,
                "description": self.description,
                "author": self.creator,
                "createdAt": self.created_at or now,
                "updatedAt": self.updated_at or now,
                "version": f"{self.version}.0.0",
                "deviceBlueprintId": self.device_blueprint_id,
                "tags": self.tags,
            },
            "actionSets": self.action_sets,
            "virtualMenus": self.virtual_menus,
            "macros": self.macros,
            "axisCalibrations": self.axis_calibrations,
            "turboConfigs": self.turbo_configs,
            # Not used by the frontend, but keeps the Steam-facing identity
            # available to API clients and the compiler.
            "title": self.title,
            "description": self.description,
            "creator": self.creator,
            "controller_type": self.controller_type,
            "version": self.version,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "VDFTemplate":
        """Build from either the frontend shape or a flat legacy dict."""
        meta = data.get("metadata")
        if isinstance(meta, dict):
            return cls(
                version=_int_version(meta.get("version", data.get("version"))),
                title=str(meta.get("title") or data.get("title") or ""),
                description=str(meta.get("description") or data.get("description") or ""),
                creator=str(meta.get("author") or data.get("creator") or "DeckForge"),
                controller_type=str(
                    data.get("controller_type") or "neptune"
                ),
                name=str(meta.get("name") or ""),
                device_blueprint_id=str(meta.get("deviceBlueprintId") or "steam_deck"),
                tags=list(meta.get("tags") or []),
                created_at=str(meta.get("createdAt") or ""),
                updated_at=str(meta.get("updatedAt") or ""),
                action_sets=list(data.get("actionSets") or []),
                virtual_menus=list(data.get("virtualMenus") or []),
                macros=list(data.get("macros") or []),
                axis_calibrations=list(data.get("axisCalibrations") or []),
                turbo_configs=dict(data.get("turboConfigs") or {}),
            )

        # Legacy flat shape: bindings listed directly under action_sets or
        # group_source_bindings.
        action_sets = list(data.get("action_sets") or [])
        if not action_sets and data.get("group_source_bindings"):
            action_sets = [{
                "id": "default_set",
                "name": "Default",
                "bindings": [
                    _normalise_legacy_binding(b)
                    for b in data["group_source_bindings"]
                ],
                "layers": [],
            }]
        return cls(
            version=_int_version(data.get("version", 3)),
            title=str(data.get("title") or ""),
            description=str(data.get("description") or ""),
            creator=str(data.get("creator") or "DeckForge"),
            controller_type=str(data.get("controller_type") or "neptune"),
            timestamp=int(data.get("timestamp") or 0),
            name=str(data.get("name") or ""),
            device_blueprint_id=str(data.get("device_blueprint_id") or "steam_deck"),
            tags=list(data.get("tags") or []),
            action_sets=action_sets,
            virtual_menus=list(data.get("virtual_menus") or []),
            macros=list(data.get("macros") or []),
            axis_calibrations=list(data.get("axis_calibrations") or []),
            turbo_configs=dict(data.get("turbo_configs") or {}),
            created_at=str(data.get("created_at") or ""),
            updated_at=str(data.get("updated_at") or ""),
        )

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)

    @classmethod
    def from_json(cls, text: str) -> "VDFTemplate":
        return cls.from_dict(json.loads(text))

    # ---- VDF ----

    def compile(self) -> "CompiledTemplate":
        """Compile the bindings into a Steam-loadable configuration."""
        from .steam_compiler import compile_bindings

        return compile_bindings(
            self.bindings() or self._raw_bindings(),
            title=self.title or self.safe_name(),
            description=self.description,
            controller_type=self.controller_type,
            creator=self.creator or "DeckForge",
        )

    def _raw_bindings(self) -> list[dict[str, Any]]:
        """Recover editable bindings from a parsed Steam config, if any."""
        if not self.raw_vdf:
            return []
        from .steam_compiler import extract_bindings

        body = self.raw_vdf.get("controller_mappings", self.raw_vdf)
        if not isinstance(body, dict):
            return []
        return extract_bindings(body, self.controller_type)

    def to_vdf_text(self) -> str:
        """Return the compiled VDF document as text."""
        return self.compile().vdf_text

    def to_vdf_dict(self) -> dict[str, Any]:
        """Return the compiled VDF document as a dict."""
        return parse_vdf(self.to_vdf_text())

    @classmethod
    def from_vdf_dict(cls, data: dict[str, Any]) -> "VDFTemplate":
        """Parse a template from a parsed Steam VDF document."""
        cm = data.get("controller_mappings", data)
        if not isinstance(cm, dict):
            cm = {}

        localization = cm.get("localization")
        title = str(cm.get("title") or "")
        description = str(cm.get("description") or "")
        if isinstance(localization, dict):
            english = localization.get("english")
            if isinstance(english, dict):
                title = str(english.get("title") or title)
                description = str(english.get("description") or description)

        from .steam_compiler import extract_bindings

        controller_type = str(cm.get("controller_type") or "neptune")
        controller_type = controller_type.replace("controller_", "") or "neptune"

        bindings = extract_bindings(cm, controller_type)
        action_sets = []
        if bindings:
            action_sets = [{
                "id": "default_set",
                "name": "Default",
                "bindings": bindings,
                "layers": [],
            }]

        return cls(
            version=_int_version(cm.get("version", 3)),
            title=title,
            description=description,
            creator=str(cm.get("creator") or "DeckForge"),
            controller_type=controller_type,
            timestamp=int(cm.get("Timestamp") or cm.get("revision") or 0),
            action_sets=action_sets,
            raw_vdf=data,
        )


def _int_version(value: Any) -> int:
    """Coerce a version field (``"3"``, ``"1.0.0"``, ``3``) to an int."""
    if isinstance(value, int):
        return value
    text = str(value or "3").split(".")[0]
    try:
        return int(text)
    except ValueError:
        return 3


def _normalise_legacy_binding(binding: dict[str, Any]) -> dict[str, Any]:
    """Convert a legacy ``{"input","output"}`` dict into the current shape."""
    if "source" in binding or "sourceCode" in binding:
        return binding
    from .steam_compiler import _split_legacy_output

    output = binding.get("output") or binding.get("target") or ""
    source = binding.get("input") or binding.get("source") or ""
    return {
        "id": str(binding.get("id") or f"bind_{abs(hash((source, str(output)))) % 10**8}"),
        "label": str(binding.get("name") or f"{source} -> {output}"),
        "sourceCode": str(source),
        "source": str(source),
        "output": _split_legacy_output(output) if isinstance(output, str) else output,
        "activator": {"type": str(binding.get("activator") or "RegularPress")},
        "enabled": True,
    }


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
        # Populated by save_template(); the API surfaces it so the UI can show
        # which bindings Steam accepted and which it has no slot for.
        self.last_compile: Optional[Any] = None

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

    def _is_own_published(self, path: Path) -> bool:
        """True if *path* is a Steam copy of a template in the local vault."""
        try:
            meta = self.local_dir / f"{path.stem}.json"
        except Exception:
            return False
        return meta.is_file()

    def list_templates(self) -> list[dict[str, Any]]:
        """List every template as the studio's ``VDFTemplate`` JSON shape.

        Steam's own base templates are included (they are readable and useful as
        starting points) but tagged ``base``; vault templates are tagged
        ``local``.  Steam base files are never modified.
        """
        results: list[dict[str, Any]] = []
        seen: set[str] = set()

        for item in self.list_local_templates():
            try:
                tpl = self.load_template(item["path"])
            except Exception:
                continue
            payload = tpl.to_dict()
            payload["metadata"]["tags"] = sorted(set(payload["metadata"]["tags"]) | {"local"})
            results.append(payload)
            seen.add(payload["metadata"]["name"])

        for item in self.list_base_templates():
            stem = item["name"]
            if stem in seen:
                continue
            # DeckForge publishes into the same directory Steam reads from, so
            # its own files come back as "base" templates. Skip them: the vault
            # entry above is the editable one, and a second read-only copy with
            # the same title is just confusing.
            if item["path"] and self._is_own_published(Path(item["path"])):
                continue
            try:
                tpl = self.load_template(item["path"])
            except Exception:
                continue
            payload = tpl.to_dict()
            payload["metadata"]["name"] = stem
            payload["metadata"]["tags"] = ["base"]
            results.append(payload)
            seen.add(stem)

        return results

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
        """Save a template to the DeckForge vault and publish it to Steam.

        Writes:
        1. ``~/.config/deckforge/templates/<name>.vdf`` + ``.json`` (the vault)
        2. ``<steam>/controller_base/templates/<name>.vdf`` -- where SteamOS
           20261023.100 actually enumerates templates for the configurator.
           ``controller_base`` is writable by the Steam user; the
           ``userdata/<id>/config/controller_configs/templates`` and
           ``userdata/<id>/241100/remote`` paths do not exist on this build.

        Returns the vault path.
        """
        VDFValidator.validate_strict(template)
        compiled = template.compile()
        template.updated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        safe_name = template.safe_name()
        local_vdf_path = self.local_dir / f"{safe_name}.vdf"
        local_json_path = self.local_dir / f"{safe_name}.json"
        _atomic_write(local_vdf_path, compiled.vdf_text)
        _atomic_write(local_json_path, template.to_json())

        self.last_compile = compiled

        publish_errors = self.sync_to_steam(template, vdf_text=compiled.vdf_text)
        if publish_errors:
            logger.warning(
                "Template '%s' saved to vault, but Steam sync failed: %s",
                template.title, "; ".join(publish_errors),
            )
        else:
            logger.info(
                "Saved template '%s' (%d bindings applied, %d skipped) to %s",
                template.title, len(compiled.applied), len(compiled.skipped),
                local_vdf_path,
            )
        return local_vdf_path

    def sync_to_steam(self, template: VDFTemplate,
                      vdf_text: Optional[str] = None) -> list[str]:
        """Publish *template* into Steam's template directory.

        Returns a list of human-readable errors; empty means Steam has it.
        """
        text = vdf_text if vdf_text is not None else template.compile().vdf_text
        safe_name = template.safe_name()
        errors: list[str] = []

        target_dir = self.steam.controller_base_templates_dir()
        try:
            _atomic_write(target_dir / f"{safe_name}.vdf", text)
        except OSError as exc:
            errors.append(f"{target_dir}: {exc}")

        # The per-user copy is what the "Steam Controller Configs" UI lists for
        # games that already have a config; keep it in step when it exists.
        for uid in self.steam.enumerate_user_ids():
            user_dir = self.steam.steam_controller_configs_dir(uid)
            if not user_dir.is_dir():
                continue
            try:
                _atomic_write(user_dir / f"{safe_name}.vdf", text)
            except OSError as exc:
                errors.append(f"{user_dir}: {exc}")

        return errors

    def steam_status(self) -> dict[str, Any]:
        """Describe the Steam install this manager will publish into."""
        template_dir = self.steam.controller_base_templates_dir()
        writable = False
        if template_dir.is_dir():
            probe = template_dir / ".deckforge_write_probe"
            try:
                probe.write_text("", encoding="utf-8")
                probe.unlink()
                writable = True
            except OSError:
                writable = False
        return {
            "steam_root": str(self.steam.steam_root),
            "steam_root_exists": self.steam.steam_root.is_dir(),
            "template_dir": str(template_dir),
            "template_dir_exists": template_dir.is_dir(),
            "writable": writable,
            "user_ids": self.steam.enumerate_user_ids(),
        }

    def save_schema_variants(self, template: VDFTemplate, schemas: Optional[list[str]] = None) -> list[Path]:
        """Save one compiled copy per controller schema.

        Each schema needs its own body: the skeleton differs per controller, so
        the variants are compiled independently rather than re-emitting one
        document under several names.
        """
        if schemas is None:
            schemas = ["neptune", "xbox360"]

        saved_paths: list[Path] = []
        base_title = template.title

        for schema in schemas:
            variant = VDFTemplate.from_dict(template.to_dict())
            variant.controller_type = schema
            # safe_name() prefers `name`, so a variant that only changes title
            # would overwrite the base file. Give each variant its own stem.
            variant.name = f"{template.safe_name()}_{schema}"
            variant.title = (
                base_title if schema == template.controller_type
                else f"{base_title} ({schema})"
            )
            saved_paths.append(self.save_template(variant))

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
        """Delete a template from the vault and Steam, backing up the vault copy."""
        safe_name = re.sub(r'[^\w\-]', '_', name.lower())
        for suffix in (".vdf", ".json"):
            path = self.local_dir / f"{safe_name}{suffix}"
            if path.exists():
                bak = path.with_suffix(".bak")
                shutil.copy2(str(path), str(bak))
                path.unlink()
                logger.info("Deleted %s (backed up to %s)", path, bak)

        # Keep Steam's directory in step, otherwise a deleted profile stays
        # selectable in the configurator.
        published = self.steam.controller_base_templates_dir() / f"{safe_name}.vdf"
        if published.exists():
            try:
                published.unlink()
                logger.info("Removed published Steam template %s", published)
            except OSError as exc:
                logger.warning("Could not remove %s: %s", published, exc)

    def export_template(self, name: str, fmt: str = "vdf") -> bytes:
        """Export a template as compiled Steam VDF or DeckForge JSON bytes."""
        template = self._find_and_load(name)
        if fmt == "deckforge_json":
            return template.to_json().encode("utf-8")
        return template.to_vdf_text().encode("utf-8")

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
                                 template_manager: Optional[TemplateManager] = None) -> dict[str, Any]:
        """Point a game at a template via Steam's configset indirection.

        Steam does not embed a config in the configset; it stores
        ``{"template": "<file>.vdf"}`` and loads that file from
        ``controller_base/templates``.  So the template must be published first,
        then referenced by filename.

        Returns a summary of what was written.
        """
        tm = template_manager or TemplateManager(steam=self.steam)
        template = tm._find_and_load(template_name)
        VDFValidator.validate_strict(template)

        # Ensure the referenced file exists before pointing Steam at it.
        errors = tm.sync_to_steam(template)
        if errors:
            raise RuntimeError("Cannot publish template to Steam: " + "; ".join(errors))
        template_file = f"{template.safe_name()}.vdf"

        user_ids = self.steam.enumerate_user_ids()
        if not user_ids:
            raise RuntimeError("No Steam user IDs found")

        # A non-Steam shortcut answers to several ids; bind all of them.
        target_ids = {str(app_id)}
        for game in self.list_nonsteam_games():
            if str(app_id) in (
                game.get("app_id"), game.get("shortcut_id_32"),
                game.get("shortcut_id_64"), game.get("raw_appid"),
            ):
                for key in ("shortcut_id_32", "shortcut_id_64"):
                    if game.get(key):
                        target_ids.add(str(game[key]))

        written: list[str] = []
        for uid in user_ids:
            # Steam keeps TWO parallel configsets: one keyed on the controller
            # schema (configset_controller_xbox360.vdf) and one keyed on the
            # device's vid-pid (configset_45e-28e-<suffix>.vdf). The Game Mode
            # configurator reads the device-keyed one when a physical controller
            # is connected, and the schema-keyed one as the fallback. Writing only
            # one leaves the assignment invisible in the other path.
            targets = [self.steam.configset_path(uid, template.controller_type)]
            targets.extend(self.steam.device_configsets(uid))

            for config_path in targets:
                try:
                    self._bind_template_in_configset(
                        config_path, target_ids, template_file
                    )
                except OSError as exc:
                    logger.warning("Cannot write %s: %s", config_path, exc)
                    continue
                written.append(str(config_path))
                logger.info(
                    "Bound app targets %s to %s in %s",
                    sorted(target_ids), template_file, config_path.name,
                )

        return {
            "template_file": template_file,
            "app_ids": sorted(target_ids),
            "configsets": written,
        }

    @staticmethod
    def _bind_template_in_configset(config_path: Path, target_ids: set[str],
                                    template_file: str) -> None:
        """Point every id in *target_ids* at *template_file* inside one configset.

        Preserves everything else in the file: other games keep their existing
        template assignments, and an existing entry keeps extra keys (EmuDeck
        writes ``srmAppId``/``srmParserId`` which Steam may rely on).
        """
        config_path.parent.mkdir(parents=True, exist_ok=True)

        existing: dict[str, Any] = {}
        if config_path.exists():
            backup = config_path.with_suffix(".vdf.bak")
            try:
                shutil.copy2(str(config_path), str(backup))
            except OSError:
                pass
            try:
                existing = parse_vdf(
                    config_path.read_text(encoding="utf-8", errors="replace")
                )
            except (VDFParseError, OSError):
                existing = {}

        block = existing.get("controller_config")
        if not isinstance(block, dict):
            block = {}
            existing["controller_config"] = block

        for tid in target_ids:
            entry = block.get(tid)
            if not isinstance(entry, dict):
                entry = {}
            entry["template"] = template_file
            block[tid] = entry

        _atomic_write(config_path, serialize_vdf(existing) + "\n")


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

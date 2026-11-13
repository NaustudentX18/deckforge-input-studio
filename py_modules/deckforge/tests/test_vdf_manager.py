"""
Unit tests for Steam Input VDF parser, serializer, validator, and TemplateManager.
"""

from __future__ import annotations

import io
import struct
import tempfile
from pathlib import Path

import pytest

from deckforge.vdf_manager import (
    GameAssigner,
    SteamPathResolver,
    TemplateManager,
    VDFParseError,
    VDFTemplate,
    VDFValidationError,
    VDFValidator,
    diff_templates,
    parse_binary_vdf,
    parse_vdf,
    serialize_vdf,
    _atomic_write,
)

SAMPLE_VDF = """
"controller_mappings"
{
\t"version"\t\t"3"
\t"title"\t\t"Test Controller Template"
\t"description"\t\t"A test template with comments and escapes"
\t"creator"\t\t"DeckForge"
\t"controller_type"\t\t"neptune"
\t"Timestamp"\t\t"1680000000"
\t// This is a line comment
\t"group"
\t{
\t\t"preset"
\t\t{
\t\t\t"id"\t\t"0"
\t\t\t"name"\t\t"Default"
\t\t\t"group_source_bindings"
\t\t\t{
\t\t\t\t"0"\t\t"button_a"
\t\t\t\t"1"\t\t"button_b"
\t\t\t}
\t\t}
\t}
}
"""

SAMPLE_ESCAPED_VDF = """
"root"
{
\t"quoted_str"\t\t"Hello \\"World\\"\\nLine 2\\tTabbed"
\t"escaped_backslash"\t\t"C:\\\\Program Files\\\\Steam"
}
"""


class TestVDFParser:
    def test_parse_vdf_basic(self):
        result = parse_vdf(SAMPLE_VDF)
        assert "controller_mappings" in result
        cm = result["controller_mappings"]
        assert cm["title"] == "Test Controller Template"
        assert cm["version"] == "3"
        assert cm["controller_type"] == "neptune"

    def test_parse_nested_structure(self):
        result = parse_vdf(SAMPLE_VDF)
        preset = result["controller_mappings"]["group"]["preset"]
        assert preset["name"] == "Default"
        assert preset["group_source_bindings"]["0"] == "button_a"
        assert preset["group_source_bindings"]["1"] == "button_b"

    def test_parse_escape_sequences(self):
        result = parse_vdf(SAMPLE_ESCAPED_VDF)
        root = result["root"]
        assert root["quoted_str"] == 'Hello "World"\nLine 2\tTabbed'
        assert root["escaped_backslash"] == "C:\\Program Files\\Steam"

    def test_parse_empty_string(self):
        assert parse_vdf("") == {}
        assert parse_vdf("   \n\t  // comment \n") == {}

    def test_parse_malformed_vdf_raises(self):
        with pytest.raises(VDFParseError):
            parse_vdf('"unterminated string { "a" "b" }')

    def test_serialize_vdf_roundtrip(self):
        original = {
            "controller_mappings": {
                "version": "3",
                "title": "Roundtrip Test",
                "nested": {
                    "key1": "val1",
                    "key2": "val2",
                },
            }
        }
        text = serialize_vdf(original)
        parsed = parse_vdf(text)
        assert parsed == original

    def test_duplicate_keys_handled(self):
        dup_vdf = """
        "root" {
            "item" "first"
            "item" "second"
            "item" "third"
        }
        """
        parsed = parse_vdf(dup_vdf)
        assert isinstance(parsed["root"]["item"], list)
        assert parsed["root"]["item"] == ["first", "second", "third"]


class TestBinaryVDF:
    def test_shortcuts_vdf_binary_parse(self):
        # Construct a synthetic binary VDF shortcuts block
        # Format: \x00 (dict) "shortcuts" \x00
        #   \x00 (dict) "0" \x00
        #     \x01 (string) "appname" \x00 "Clone Hero" \x00
        #     \x01 (string) "exe" \x00 "/opt/clonehero/clonehero" \x00
        #     \x02 (int32) "appid" \x00 \x10\x27\x00\x00 (10000)
        #   \x08 (end dict)
        # \x08 (end shortcuts dict)
        buf = bytearray()
        buf.extend(b"\x00shortcuts\x00")
        buf.extend(b"\x000\x00")
        buf.extend(b"\x01appname\x00Clone Hero\x00")
        buf.extend(b"\x01exe\x00/usr/bin/clonehero\x00")
        buf.extend(b"\x02appid\x00" + struct.pack("<i", 9999))
        buf.extend(b"\x08")  # end entry 0
        buf.extend(b"\x08")  # end shortcuts

        parsed = parse_binary_vdf(bytes(buf))
        assert "shortcuts" in parsed
        assert parsed["shortcuts"]["0"]["appname"] == "Clone Hero"
        assert parsed["shortcuts"]["0"]["exe"] == "/usr/bin/clonehero"
        assert parsed["shortcuts"]["0"]["appid"] == 9999


class TestVDFValidator:
    def test_valid_template(self):
        tpl = VDFTemplate(
            title="Valid Template",
            controller_type="neptune",
            version=3,
        )
        assert VDFValidator.validate(tpl) == []

    def test_missing_title(self):
        tpl = VDFTemplate(title="", controller_type="neptune")
        errors = VDFValidator.validate(tpl)
        assert any("title" in e.lower() for e in errors)

    def test_invalid_controller_type(self):
        tpl = VDFTemplate(title="Test", controller_type="invalid_type")
        errors = VDFValidator.validate(tpl)
        assert any("controller_type" in e.lower() for e in errors)

    def test_strict_validation_raises(self):
        tpl = VDFTemplate(title="", controller_type="unknown")
        with pytest.raises(VDFValidationError):
            VDFValidator.validate_strict(tpl)

    def test_validate_vdf_text_checks_controller_mappings(self):
        valid_text = '"controller_mappings" { "version" "3" "title" "Test" }'
        assert VDFValidator.validate_vdf_text(valid_text) == []

        invalid_text = '"controller_mappings" { "invalid" "yes" }'
        errors = VDFValidator.validate_vdf_text(invalid_text)
        assert len(errors) > 0


class TestTemplateManager:
    @pytest.fixture
    def temp_dirs(self, tmp_path):
        steam_root = tmp_path / "Steam"
        user_id = "12345678"
        user_tpl = steam_root / "userdata" / user_id / "config" / "controller_configs" / "templates"
        user_tpl.mkdir(parents=True)
        local_dir = tmp_path / "deckforge_vault"
        local_dir.mkdir(parents=True)

        resolver = SteamPathResolver(steam_root=steam_root)
        tm = TemplateManager(steam=resolver, local_dir=local_dir)
        return tm, local_dir, user_tpl

    def test_save_and_load_template(self, temp_dirs):
        tm, local_dir, user_tpl = temp_dirs
        tpl = VDFTemplate(
            title="Guitar Pro Hero",
            description="High precision strum profile",
            controller_type="neptune",
            creator="DeckForgeTester",
        )
        path = tm.save_template(tpl)
        assert path.exists()

        loaded = tm.load_template(str(path))
        assert loaded.title == "Guitar Pro Hero"
        assert loaded.creator == "DeckForgeTester"
        assert loaded.controller_type == "neptune"

    def test_clone_template(self, temp_dirs):
        tm, local_dir, user_tpl = temp_dirs
        tpl = VDFTemplate(title="Original", controller_type="generic")
        tm.save_template(tpl)

        cloned = tm.clone_template("Original", "Cloned Copy")
        assert cloned.title == "Cloned Copy"
        # Check that cloned exists in listing
        names = [t["title"] for t in tm.list_local_templates()]
        assert "Cloned Copy" in names
        assert "Original" in names

    def test_delete_template_with_bak(self, temp_dirs):
        tm, local_dir, user_tpl = temp_dirs
        tpl = VDFTemplate(title="ToDelete", controller_type="xbox360")
        tm.save_template(tpl)

        vdf_file = local_dir / "todelete.vdf"
        assert vdf_file.exists()

        tm.delete_template("ToDelete")
        assert not vdf_file.exists()
        bak_file = local_dir / "todelete.bak"
        assert bak_file.exists()

    def test_export_and_import_roundtrip(self, temp_dirs):
        tm, local_dir, user_tpl = temp_dirs
        tpl = VDFTemplate(title="ExportMe", controller_type="neptune")
        tm.save_template(tpl)

        vdf_bytes = tm.export_template("ExportMe", fmt="vdf")
        imported_vdf = tm.import_template(vdf_bytes, fmt="vdf")
        assert imported_vdf.title == "ExportMe"

        json_bytes = tm.export_template("ExportMe", fmt="deckforge_json")
        imported_json = tm.import_template(json_bytes, fmt="deckforge_json")
        assert imported_json.title == "ExportMe"


class TestAtomicWrite:
    def test_atomic_write_creates_file(self, tmp_path):
        target = tmp_path / "atomic_test.vdf"
        _atomic_write(target, "test content")
        assert target.read_text() == "test content"
        assert not (tmp_path / "atomic_test.vdf.tmp").exists()


class TestDiffTemplates:
    def test_diff_templates(self):
        t1 = VDFTemplate(title="Profile A", controller_type="neptune", version=3)
        t2 = VDFTemplate(title="Profile B", controller_type="generic", version=3)
        diff = diff_templates(t1, t2)
        assert "title" in diff
        assert diff["title"]["template_a"] == "Profile A"
        assert diff["title"]["template_b"] == "Profile B"
        assert "controller_type" in diff
        assert "version" not in diff  # Identical

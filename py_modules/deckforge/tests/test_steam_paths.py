"""
Integration Tests for Steam Path Resolution, Multi-Path VDF Sync & CRC32 AppID matching.
"""

from pathlib import Path
import tempfile
import zlib

from deckforge.vdf_manager import (
    SteamPathResolver,
    TemplateManager,
    VDFTemplate,
    calculate_shortcut_id_32,
    calculate_shortcut_id_64,
    parse_vdf,
)


def test_shortcut_crc32_calculations():
    exe = '"/home/deck/Games/Clone Hero/clonehero"'
    appname = "Clone Hero"

    id_32 = calculate_shortcut_id_32(exe, appname)
    id_64 = calculate_shortcut_id_64(exe, appname)

    # 32-bit ID must have MSB set (bit 31 = 1)
    assert (id_32 & 0x80000000) == 0x80000000

    # 64-bit ID must have lower 32-bits containing 0x02000000
    assert (id_64 & 0xFFFFFFFF) == 0x02000000

    # Upper 32-bits of 64-bit ID match the 32-bit shortcut ID
    assert (id_64 >> 32) == id_32


def test_vdf_publishes_to_controller_base_templates():
    """Steam enumerates templates from controller_base/templates on this build.

    ``userdata/<id>/config/controller_configs/templates`` and
    ``userdata/<id>/241100/remote`` do not exist on SteamOS 20261023.100, so
    writing there is silent data loss.
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        steam_dir = root / "Steam"
        user_id = "12345678"

        (steam_dir / "controller_base" / "templates").mkdir(parents=True)
        (steam_dir / "userdata" / user_id / "config").mkdir(parents=True)

        local_vault = root / "vault"
        resolver = SteamPathResolver(steam_root=steam_dir)
        manager = TemplateManager(steam=resolver, local_dir=local_vault)

        tpl = VDFTemplate(
            title="MultiSync Test",
            controller_type="neptune",
            action_sets=[{
                "id": "default_set", "name": "Default", "layers": [],
                "bindings": [{
                    "id": "b1", "label": "A", "sourceCode": "BTN_SOUTH",
                    "output": {"type": "gamepad", "code": "BTN_A"},
                    "activator": {"type": "RegularPress"}, "enabled": True,
                }],
            }],
        )

        saved_path = manager.save_template(tpl)
        assert saved_path.exists()
        assert (local_vault / "multisync_test.vdf").exists()

        published = steam_dir / "controller_base" / "templates" / "multisync_test.vdf"
        assert published.exists(), "template must land where Steam reads it"

        text = published.read_text(encoding="utf-8-sig")
        assert text.startswith('"controller_mappings"')
        assert "xinput_button A" in text

        # The published file must be what Steam's own parser accepts.
        assert "controller_mappings" in parse_vdf(text)


def test_schema_variants_compile_per_controller():
    """Each variant is compiled against its own skeleton, not renamed."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        (root / "controller_base" / "templates").mkdir(parents=True)
        manager = TemplateManager(steam=SteamPathResolver(steam_root=root), local_dir=root / "vault")

        tpl = VDFTemplate(title="Universal Rhythms", controller_type="neptune")
        paths = manager.save_schema_variants(tpl, schemas=["neptune", "xbox360"])

        assert len(paths) == 2
        assert (root / "vault" / "universal_rhythms_neptune.vdf").exists()
        assert (root / "vault" / "universal_rhythms_xbox360.vdf").exists()

        # The xbox360 variant must carry the xbox360 controller type inside.
        xbox = (root / "vault" / "universal_rhythms_xbox360.vdf").read_text()
        assert "controller_xbox360" in xbox

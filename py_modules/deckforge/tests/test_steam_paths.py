"""
Integration Tests for Steam Path Resolution, Multi-Path VDF Sync & CRC32 AppID matching.
"""

from pathlib import Path
import tempfile
import zlib

from deckforge.vdf_manager import (
    GameAssigner,
    SteamPathResolver,
    TemplateManager,
    VDFTemplate,
    calculate_shortcut_id_32,
    calculate_shortcut_id_64,
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


def test_multi_path_vdf_sync():
    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        steam_dir = root / "Steam"
        user_id = "12345678"

        # Create mock Steam structure
        (steam_dir / "userdata" / user_id / "config" / "controller_configs" / "templates").mkdir(parents=True)
        (steam_dir / "steamapps" / "common" / "Steam Controller Configs" / user_id / "config").mkdir(parents=True)
        (steam_dir / "userdata" / user_id / "241100" / "remote").mkdir(parents=True)

        local_vault = root / "vault"
        resolver = SteamPathResolver(steam_root=steam_dir)
        manager = TemplateManager(steam=resolver, local_dir=local_vault)

        tpl = VDFTemplate(
            title="MultiSync Test",
            controller_type="neptune",
            group_source_bindings=[{"name": "A", "target": "btn_a"}],
        )

        saved_path = manager.save_template(tpl)
        assert saved_path.exists()
        assert (local_vault / "multisync_test.vdf").exists()

        # Check sync location 1: userdata templates
        user_tpl = steam_dir / "userdata" / user_id / "config" / "controller_configs" / "templates" / "multisync_test.vdf"
        assert user_tpl.exists()

        # Check sync location 2: common controller configs
        common_cfg = steam_dir / "steamapps" / "common" / "Steam Controller Configs" / user_id / "config" / "multisync_test.vdf"
        assert common_cfg.exists()

        # Check sync location 3: Cloud 241100 remote
        cloud_cfg = steam_dir / "userdata" / user_id / "241100" / "remote" / "multisync_test.vdf"
        assert cloud_cfg.exists()


def test_schema_variants_generation():
    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        manager = TemplateManager(steam=SteamPathResolver(steam_root=root), local_dir=root / "vault")

        tpl = VDFTemplate(title="Universal Rhythms", controller_type="neptune")
        paths = manager.save_schema_variants(tpl, schemas=["neptune", "xbox360", "ps4", "generic"])

        assert len(paths) == 4
        assert (root / "vault" / "universal_rhythms.vdf").exists()
        assert (root / "vault" / "universal_rhythms__xbox360_.vdf").exists()
        assert (root / "vault" / "universal_rhythms__ps4_.vdf").exists()
        assert (root / "vault" / "universal_rhythms__generic_.vdf").exists()

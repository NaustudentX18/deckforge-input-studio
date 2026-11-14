"""Tests for the built-in hardware catalog and pre-made one-click profiles.

The CRKD values here come from primary sources (official product page, CRKD
CK25GM user guide, firmware v2.0 notes), so these tests pin researched facts
rather than invented ones.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from deckforge.auto_profiler import detect_device
from deckforge.device_catalog import all_families, find_family, mode_for_position
from deckforge.game_profiles import (
    ALL_PROFILES,
    apply_profile,
    build_template,
    catalog,
    find_profile,
    profiles_for_device,
)
from deckforge.input_sniffer import DeviceInfo
from deckforge.vdf_manager import SteamPathResolver, TemplateManager


def guitar(vid=0x20BC, pid=0x5500, name="CRKD Gamepad") -> DeviceInfo:
    """The measured capability map.

    `20bc:5500` is what the unit actually reported, but it is a ShanWan bridge
    id rather than CRKD's own (`0351`/`3651`). Kept as-is because detection has
    to handle it; CRKD's documented ids are covered separately below.
    """
    return DeviceInfo(
        path="/dev/input/event9", name=name, vendor_id=vid, product_id=pid,
        serial="", phys="", uniq="",
        capabilities={
            "EV_KEY": ["BTN_A", "BTN_B", "BTN_C", "BTN_NORTH", "BTN_WEST", "BTN_Z",
                       "BTN_TL", "BTN_TR", "BTN_TL2", "BTN_TR2", "BTN_SELECT",
                       "BTN_START", "BTN_MODE", "BTN_THUMBL", "BTN_THUMBR"],
            "EV_ABS": ["ABS_X", "ABS_Y", "ABS_Z", "ABS_RZ", "ABS_HAT0X", "ABS_HAT0Y"],
        },
        bus_type="usb",
    )


class TestDeviceCatalog:
    def test_crkd_family_recognised_by_observed_bridge_id(self):
        # 20bc is the ShanWan bridge id the unit reported, not CRKD's own.
        family = find_family(0x20BC, 0x5500, "CRKD Gamepad")
        assert family is not None
        assert family.family_id == "crkd_les_paul_pro"

    def test_crkd_family_recognised_by_its_own_documented_ids(self):
        # CRKD's actual ids, per PlasticBand and SDL.
        for vid, pid in ((0x3651, 0x4161), (0x3651, 0x1500), (0x3651, 0x5500),
                         (0x3651, 0x1600), (0x3651, 0x5600),
                         (0x0351, 0x1000), (0x0351, 0x2000)):
            family = find_family(vid, pid, "")
            assert family is not None, f"0x{vid:04x}:0x{pid:04x} not matched"
            assert family.family_id == "crkd_les_paul_pro"

    def test_crkd_recognised_by_documented_vendor_id(self):
        # 0x2E95 is CRKD's documented vendor range; both must match.
        assert find_family(0x2E95, 0x0883, "") is not None

    def test_unknown_device_matches_nothing(self):
        assert find_family(0xFFFF, 0xEEEE, "Random Pad") is None

    def test_mode_dial_has_nine_positions(self):
        family = find_family(0x20BC, 0x5500, "CRKD Gamepad")
        assert len(family.mode_presets) == 9
        assert [m.position for m in family.mode_presets] == list(range(1, 10))

    def test_mode_two_is_festival_pro(self):
        family = find_family(0x20BC, 0x5500, "CRKD Gamepad")
        mode = mode_for_position(family, 2)
        assert "Festival" in mode.name
        assert "Pro" in mode.name

    def test_mode_nine_presents_as_keyboard(self):
        # The firmware v2.0 behaviour that breaks naive detection: on PC the
        # guitar becomes a keyboard in this position.
        family = find_family(0x20BC, 0x5500, "CRKD Gamepad")
        assert mode_for_position(family, 9).presents_as == "keyboard"

    def test_four_programmable_slots(self):
        family = find_family(0x20BC, 0x5500, "CRKD Gamepad")
        programmable = [m for m in family.mode_presets if m.programmable]
        assert len(programmable) == 4

    def test_family_exposes_setup_notes(self):
        family = find_family(0x20BC, 0x5500, "CRKD Gamepad")
        joined = " ".join(family.setup_notes)
        assert "Platform Slider" in joined
        assert "Mode Dial" in joined

    def test_catalog_serialises(self):
        families = all_families()
        assert families
        first = families[0]
        assert first["display_name"].startswith("CRKD")
        assert len(first["modes"]) == 9
        assert first["source"]


class TestKeyJamDetection:
    def test_guitar_in_keyjam_mode_still_identified(self):
        """Regression: in KeyJam the guitar enumerates as a keyboard.

        The capability gate would reject it as "not a controller", so a user in
        mode 9 would find the profiler claiming no hardware is connected.
        """
        keyjam = DeviceInfo(
            path="/dev/input/event9", name="CRKD Guitar", vendor_id=0x20BC,
            product_id=0x5500, serial="", phys="", uniq="",
            capabilities={
                "EV_KEY": [f"KEY_{c}" for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
                          + ["BTN_C", "BTN_Z"],
            },
            bus_type="usb",
        )
        det = detect_device(keyjam)
        assert det.kind == "guitar"
        assert det.family_id == "crkd_les_paul_pro"


class TestGameProfiles:
    def test_every_profile_has_bindings_and_a_mode(self):
        for profile in ALL_PROFILES:
            assert profile.bindings, f"{profile.profile_id} has no bindings"
            assert 1 <= profile.required_mode <= 9

    def test_clone_hero_profile_is_gamepad_based(self):
        profile = find_profile("crkd_lp_clone_hero")
        assert profile.game == "clone_hero"
        assert all(b[1] == "gamepad" for b in profile.bindings)

    def test_keyjam_profile_is_keyboard_based(self):
        profile = find_profile("crkd_lp_keyjam")
        assert profile.required_mode == 9
        # In KeyJam the device is a keyboard; a gamepad profile is meaningless.
        assert all(b[1] == "keyboard" for b in profile.bindings)

    def test_festival_profile_requires_mode_two(self):
        profile = find_profile("crkd_lp_fortnite_festival")
        assert profile.required_mode == 2
        assert any("Mode 2" in note or "Mode Dial to 2" in note
                   for note in profile.setup_notes)

    def test_rock_band_flags_xbox_requirement(self):
        # RB4 only accepts the Xbox-licensed model; claiming otherwise would
        # send a multi-platform owner chasing an impossible setup.
        profile = find_profile("crkd_lp_rock_band_4")
        assert profile.requires_xbox_licence is True

    def test_rock_band_uses_rb4_mode(self):
        assert find_profile("crkd_lp_rock_band_4").required_mode == 9

    def test_profiles_filter_to_the_connected_device(self):
        matched = profiles_for_device(0x20BC, 0x5500, "CRKD Gamepad")
        assert len(matched) == len(ALL_PROFILES)

    def test_profiles_empty_for_unknown_device(self):
        assert profiles_for_device(0xFFFF, 0xEEEE, "Nope") == []

    def test_catalog_carries_mode_names(self):
        entries = catalog()
        clone_hero = next(e for e in entries if e["profile_id"] == "crkd_lp_clone_hero")
        assert clone_hero["required_mode_name"] == "Guitar Controller Default"
        assert clone_hero["family_name"].startswith("CRKD")

    def test_template_compiles_to_valid_steam_vdf(self):
        template = build_template(find_profile("crkd_lp_clone_hero"))
        compiled = template.compile()
        assert compiled.vdf_text.startswith('"controller_mappings"')
        assert '"group"' in compiled.vdf_text
        # All ten bindings are expressible, so nothing should be dropped.
        assert len(compiled.applied) == 10
        assert compiled.skipped == []


class TestApplyProfile:
    def _manager(self, root: Path) -> TemplateManager:
        (root / "controller_base" / "templates").mkdir(parents=True)
        (root / "userdata" / "1116694616" / "config").mkdir(parents=True)
        return TemplateManager(
            steam=SteamPathResolver(steam_root=root), local_dir=root / "vault"
        )

    def test_apply_saves_and_publishes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manager = self._manager(root)
            result = apply_profile("crkd_lp_clone_hero", manager=manager)

            assert result["applied"]
            assert result["saved_path"]
            published = root / "controller_base" / "templates" / "crkd_lp_clone_hero.vdf"
            assert published.is_file(), "profile must land where Steam reads it"

    def test_apply_reports_required_hardware_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            manager = self._manager(Path(tmp))
            result = apply_profile("crkd_lp_fortnite_festival", manager=manager)
            setup = result["hardware_setup"]
            assert setup["mode_position"] == 2
            assert setup["mode_name"] == "Festival - Pro"
            assert setup["presents_as"] == "gamepad"
            assert setup["notes"]

    def test_assignment_writes_both_configsets(self):
        """Steam reads a device-keyed configset AND a schema-keyed one.

        Writing only the schema-keyed file leaves the game without a config when
        the physical controller is connected, which is exactly how a profile
        ends up invisible in Game Mode.
        """
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manager = self._manager(root)
            configs = (root / "steamapps" / "common" / "Steam Controller Configs"
                       / "1116694616" / "config")
            configs.mkdir(parents=True, exist_ok=True)
            (configs / "configset_45e-28e-428f6858.vdf").write_text(
                '"controller_config"\n{\n}\n'
            )

            from deckforge.vdf_manager import GameAssigner

            template = build_template(find_profile("crkd_lp_clone_hero"))
            manager.save_template(template)
            result = GameAssigner(steam=manager.steam).assign_template_to_game(
                template.safe_name(), "3195947680", template_manager=manager
            )

            names = {Path(c).name for c in result["configsets"]}
            assert "configset_45e-28e-428f6858.vdf" in names, "device keyed missing"
            assert any(n.startswith("configset_controller_") for n in names), \
                "schema keyed missing"
            for path in result["configsets"]:
                assert "3195947680" in Path(path).read_text()

    def test_assignment_preserves_other_games(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manager = self._manager(root)
            configs = (root / "steamapps" / "common" / "Steam Controller Configs"
                       / "1116694616" / "config")
            configs.mkdir(parents=True, exist_ok=True)
            target = configs / "configset_45e-28e-428f6858.vdf"
            target.write_text(
                '"controller_config"\n{\n\t"other game"\n\t{\n'
                '\t\t"template"\t\t"keepme.vdf"\n\t}\n}\n'
            )

            from deckforge.vdf_manager import GameAssigner

            template = build_template(find_profile("crkd_lp_clone_hero"))
            manager.save_template(template)
            GameAssigner(steam=manager.steam).assign_template_to_game(
                template.safe_name(), "3195947680", template_manager=manager
            )
            body = target.read_text()
            assert "other game" in body, "an existing assignment was destroyed"
            assert "keepme.vdf" in body

    def test_apply_unknown_profile_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            manager = self._manager(Path(tmp))
            with pytest.raises(FileNotFoundError):
                apply_profile("does_not_exist", manager=manager)

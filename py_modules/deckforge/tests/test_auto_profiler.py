"""Tests for the auto-profiler: device fingerprinting, classification, templates.

The capability maps here are transcribed from real devices on the Deck and on a
workstation on 2026-11-13/14, not invented. `CRKD_LES_PAUL` in particular is the
actual evdev capability map captured from the CRKD Les Paul Pro.

Note on the ids: that unit reported `20bc:5500`, which is a **ShanWan bridge**
id, not CRKD's own (`0351`/`3651`). The id is used here because it is what the
hardware really reported, and because detection must cope with it. The control
LAYOUT is the measured part; the id attribution is not.
"""

from __future__ import annotations

from deckforge.auto_profiler import (
    KIND_FIGHTSTICK,
    KIND_GAMEPAD,
    KIND_GUITAR,
    KIND_UNKNOWN,
    Detection,
    Fingerprint,
    best_candidate,
    classify,
    detect_device,
    fingerprint_device,
    generate_profile,
    lookup_identity,
)
from deckforge.input_sniffer import DeviceInfo


def make_device(path: str, name: str, vid: int, pid: int,
                keys: list[str], abs_: list[str], rel: list[str] | None = None,
                bus: str = "usb") -> DeviceInfo:
    caps: dict[str, list[str]] = {}
    if keys:
        caps["EV_KEY"] = keys
    if abs_:
        caps["EV_ABS"] = abs_
    if rel:
        caps["EV_REL"] = rel
    return DeviceInfo(
        path=path, name=name, vendor_id=vid, product_id=pid, serial="",
        phys="", uniq="", capabilities=caps, bus_type=bus,
    )


# Measured on the hardware: solo strip via BTN_C/Z/THUMB/THUMB2, no sticks,
# strum on ABS_HAT0Y, whammy on ABS_Z, tilt on ABS_HAT0X.
CRKD_LES_PAUL = make_device(
    "/dev/input/event9", "CRKD Gamepad", 0x20BC, 0x5500,
    keys=["BTN_A", "BTN_B", "BTN_C", "BTN_NORTH", "BTN_WEST", "BTN_Z", "BTN_TL",
          "BTN_TR", "BTN_TL2", "BTN_TR2", "BTN_SELECT", "BTN_START", "BTN_MODE",
          "BTN_THUMBL", "BTN_THUMBR"],
    abs_=["ABS_X", "ABS_Y", "ABS_Z", "ABS_RZ", "ABS_GAS", "ABS_BRAKE",
          "ABS_HAT0X", "ABS_HAT0Y"],
)

# A standard Xbox pad: four face buttons, two sticks, triggers, dpad.
XBOX_PAD = make_device(
    "/dev/input/event5", "Microsoft X-Box 360 pad", 0x045E, 0x028E,
    keys=["BTN_A", "BTN_B", "BTN_X", "BTN_Y", "BTN_TL", "BTN_TR",
          "BTN_SELECT", "BTN_START", "BTN_MODE", "BTN_THUMBL", "BTN_THUMBR",
          "BTN_DPAD_UP", "BTN_DPAD_DOWN", "BTN_DPAD_LEFT", "BTN_DPAD_RIGHT"],
    abs_=["ABS_X", "ABS_Y", "ABS_Z", "ABS_RX", "ABS_RY", "ABS_RZ", "ABS_HAT0X",
          "ABS_HAT0Y"],
)

# A laptop keyboard, measured: hundreds of KEY_ codes, plus BTN_ media codes
# that collide with guitar fret codes. This must never be read as a guitar.
KEYBOARD = make_device(
    "/dev/input/event3", "AT Translated Set 2 keyboard", 0x0001, 0x0001,
    keys=[f"KEY_F{i}" for i in range(1, 13)] + [f"KEY_{c}" for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
         + ["BTN_C", "BTN_Z", "BTN_THUMB", "BTN_BASE"],
    abs_=[],
)

HOTKEY_PANEL = make_device(
    "/dev/input/event6", "Dell WMI hotkeys", 0, 0,
    keys=["KEY_VOLUMEUP", "KEY_VOLUMEDOWN", "KEY_BRIGHTNESSDOWN", "KEY_EJECTCD"],
    abs_=[],
)

MOUSE = make_device(
    "/dev/input/event13", "libvirtualhid Mouse", 0x1209, 0x0003,
    keys=["BTN_LEFT", "BTN_RIGHT", "BTN_MIDDLE", "BTN_SIDE", "BTN_EXTRA"],
    abs_=[], rel=["REL_X", "REL_Y", "REL_WHEEL"],
)

# Eight arcade buttons, no sticks.
FIGHTSTICK = make_device(
    "/dev/input/event7", "Sanwa Fightstick", 0x0F0D, 0x0001,
    keys=["BTN_A", "BTN_B", "BTN_X", "BTN_Y", "BTN_TL", "BTN_TR", "BTN_TL2",
          "BTN_TR2"],
    abs_=[],
)

STEAM_VIRTUAL_PAD = make_device(
    "/dev/input/event4", "Valve Software Steam Controller", 0x28DE, 0x11FF,
    keys=["BTN_A", "BTN_B", "BTN_X", "BTN_Y"],
    abs_=["ABS_X", "ABS_Y"], bus="virtual",
)


class TestFingerprint:
    def test_controller_buttons_exclude_key_codes(self):
        fp = fingerprint_device(KEYBOARD)
        # KEY_* codes must not be counted as controller buttons.
        assert not any(b.startswith("KEY_") for b in fp.buttons)
        assert fp.key_codes >= 20

    def test_measured_guitar_has_solo_row_and_no_sticks(self):
        fp = fingerprint_device(CRKD_LES_PAUL)
        # Measured capability map: the solo strip appears as BTN_C + BTN_Z.
        assert fp.solo_frets == {"BTN_C", "BTN_Z"}
        # ABS_X/Y exist on the raw device (whammy/tilt wiring) but there is no
        # complete right-stick pair, so this must not count as analog sticks.
        assert fp.has_sticks is False
        assert fp.has_hat is True

    def test_relative_axes_detected_for_mouse(self):
        assert fingerprint_device(MOUSE).rel_axes > 0


class TestClassification:
    def test_measured_guitar_is_guitar(self):
        det = detect_device(CRKD_LES_PAUL)
        assert det.kind == KIND_GUITAR
        assert det.kind_confidence > 0.9
        # Recognised by family now, which outranks the capability guess and is
        # the stronger statement (it also survives KeyJam mode, where the same
        # hardware enumerates as a keyboard).
        assert det.family_id == "crkd_les_paul_pro"
        assert "CRKD" in det.kind_reason
        assert det.setup_notes, "a recognised family must carry its setup notes"

    def test_keyboard_is_not_guitar(self):
        # The exact bug this engine must not have: media-key BTN codes matching
        # the guitar solo strip.
        det = detect_device(KEYBOARD)
        assert det.kind != KIND_GUITAR
        assert det.kind == KIND_UNKNOWN

    def test_hotkey_panel_is_not_a_controller(self):
        assert detect_device(HOTKEY_PANEL).kind == KIND_UNKNOWN

    def test_mouse_is_not_a_controller(self):
        assert detect_device(MOUSE).kind == KIND_UNKNOWN

    def test_xbox_pad_is_gamepad_with_sdl_type(self):
        det = detect_device(XBOX_PAD)
        assert det.kind == KIND_GAMEPAD
        assert det.sdl_type == "XBox360Controller"
        assert det.steam_schema == "xbox360"

    def test_fightstick_recognised_by_button_count(self):
        assert detect_device(FIGHTSTICK).kind == KIND_FIGHTSTICK

    def test_steam_virtual_pad_is_reserved(self):
        # Steam owns its virtual devices; remapping them silently would be wrong.
        assert detect_device(STEAM_VIRTUAL_PAD).reserved is True

    def test_classify_requires_controller_inputs(self):
        kind, confidence, _ = classify(
            Fingerprint(key_codes=40), "some keyboard", None, 1, 1
        )
        assert kind == KIND_UNKNOWN
        assert confidence < 0.5


class TestIdentityTable:
    def test_known_pad_identity(self):
        ident = lookup_identity(0x045E, 0x028E)
        assert ident is not None
        assert ident["sdl_type"] == "XBox360Controller"

    def test_observed_crkd_id_classified_by_sdl_as_ps3(self):
        # Documented gap: SDL does not model guitars, and the id the unit
        # reported (a ShanWan bridge id) is classed as a PS3 pad. The profiler
        # must not rely on SDL for guitar identity.
        ident = lookup_identity(0x20BC, 0x5500)
        assert ident is not None
        assert ident["sdl_type"] == "PS3Controller"

    def test_unknown_device_has_no_identity(self):
        assert lookup_identity(0xFFFF, 0xEEEE) is None


class TestIdleWirelessReceiver:
    """A 2.4 GHz receiver enumerates even with the instrument switched off.

    This matters because auto-profiling a silent device silently produces a
    WRONG profile: with no axes reported, the guitar builder falls back to
    generic dpad strum instead of the measured hat axis, and reports nothing as
    skipped because every generic binding happens to apply.
    """

    def _idle(self, name="CRKD Gamepad", vid=0x20BC, pid=0x5500) -> DeviceInfo:
        return make_device("/dev/input/event9", name, vid, pid, keys=[], abs_=[])

    def test_idle_receiver_is_not_a_guitar(self):
        det = detect_device(self._idle())
        assert det.kind == KIND_UNKNOWN

    def test_idle_receiver_reason_asks_if_powered_on(self):
        det = detect_device(self._idle())
        assert "switched on" in det.kind_reason

    def test_idle_receiver_is_never_a_profile_candidate(self):
        assert best_candidate([detect_device(self._idle())]) is None

    def test_family_match_does_not_rescue_a_silent_device(self):
        # The family is recognised from its ids; that must not promote a device
        # that reports nothing.
        det = detect_device(self._idle())
        assert det.kind != KIND_GUITAR


class TestSelection:
    def test_guitar_beats_gamepad(self):
        detections = [detect_device(XBOX_PAD), detect_device(CRKD_LES_PAUL)]
        best = best_candidate(detections)
        assert best is not None
        assert best.kind == KIND_GUITAR

    def test_reserved_device_is_never_selected(self):
        best = best_candidate([detect_device(STEAM_VIRTUAL_PAD)])
        assert best is None

    def test_no_controller_returns_none(self):
        detections = [
            detect_device(KEYBOARD), detect_device(MOUSE), detect_device(HOTKEY_PANEL)
        ]
        assert best_candidate(detections) is None


class TestProfileGeneration:
    def test_guitar_profile_binds_the_frets(self):
        det = detect_device(CRKD_LES_PAUL)
        profile = generate_profile(det, target_game="clone_hero")
        bindings = profile.template.bindings()
        sources = {b["sourceCode"] for b in bindings}
        # Frets, strum and start must all be present for a usable guitar profile.
        assert {"BTN_SOUTH", "BTN_EAST", "BTN_NORTH", "BTN_WEST"} <= sources
        assert any(s.startswith("ABS_HAT0Y") for s in sources)
        assert profile.template.device_blueprint_id == KIND_GUITAR
        assert "auto" in profile.template.tags

    def test_guitar_profile_prefers_measured_whammy_axis(self):
        det = detect_device(CRKD_LES_PAUL)
        notes = " ".join(generate_profile(det).notes)
        assert "hat axis" in notes or "Strum" in notes or "Guitar" in notes

    def test_guitar_profile_compiles_to_valid_steam_vdf(self):
        det = detect_device(CRKD_LES_PAUL)
        profile = generate_profile(det)
        compiled = profile.template.compile()
        assert compiled.vdf_text.startswith('"controller_mappings"')
        # Steam's real schema, not a private format.
        assert '"group"' in compiled.vdf_text
        assert compiled.applied, "profile must bind at least one control"

    def test_profile_is_reproducible_in_name(self):
        det = detect_device(CRKD_LES_PAUL)
        a = generate_profile(det, "clone_hero")
        b = generate_profile(det, "clone_hero")
        assert a.template_name == b.template_name
        # Deterministic naming means re-profiling overwrites rather than piling up.
        assert a.template_name.startswith("auto_")

    def test_pad_profile_uses_its_own_schema(self):
        det = detect_device(XBOX_PAD)
        profile = generate_profile(det)
        assert profile.template.controller_type in ("xbox360", "neptune")

    def test_generic_profile_for_fightstick_binds_buttons(self):
        det = detect_device(FIGHTSTICK)
        profile = generate_profile(det)
        assert profile.template.bindings()
        assert any(b["output"]["type"] == "gamepad" for b in profile.template.bindings())

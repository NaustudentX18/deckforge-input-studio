"""Build the vendored controller identity database.

Run this by hand (or via `make identity-db`) to regenerate
`py_modules/deckforge/data/controller_ids.json` from upstream SDL. It is not
imported at runtime -- the generated JSON is, because Decky's frozen interpreter
cannot fetch anything at plugin load time.

Two upstream sources, each doing a different job:

1. `src/joystick/controller_list.h` from SDL -- video-gamepad *classification*.
   One row per (vendor, product) mapping to an SDL controller type. This is what
   lets DeckForge say "this is an Xbox 360 controller / a PS5 pad" with
   authority instead of guessing from a product string.

2. `gamecontrollerdb.txt` -- *semantic* mapping (which button index is `a`,
   which axis is `leftx`). Used to understand a pad's layout.

Neither source models rhythm-game guitars: SDL has zero guitar entries, and it
classifies 20bc:5500 -- the id a CRKD-labelled unit reported, which belongs to
the ShanWan bridge chip -- as a plain PS3 controller.
Guitar identity therefore cannot come from SDL at all -- it comes from
`:class:`deckforge.auto_profiler` capability fingerprinting. This script records
that gap explicitly so the runtime code does not pretend otherwise.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

SDL_CONTROLLER_LIST = (
    "https://raw.githubusercontent.com/libsdl-org/SDL/main/src/joystick/controller_list.h"
)
SDL_GAMECONTROLLERDB = (
    "https://raw.githubusercontent.com/mdqinc/SDL_GameControllerDB/master/gamecontrollerdb.txt"
)

OUT_PATH = Path(__file__).resolve().parent.parent / "py_modules" / "deckforge" / "data" / "controller_ids.json"

# SDL's enum names carry a k_eControllerType_ prefix; strip it for the data file.
_TYPE_RE = re.compile(r"k_eControllerType_(\w+)")

# SDL type -> the schema Steam's configurator would present for it.
# Anything unmapped falls back to "generic".
SDL_TYPE_TO_STEAM = {
    "XBox360Controller": "xbox360",
    "XBoxOneController": "xbox360",
    "XBoxEliteController": "xbox360",
    "XInputPS4Controller": "ps4",
    "PS3Controller": "ps3",
    "PS4Controller": "ps4",
    "PS5Controller": "ps5",
    "PS5EdgeController": "ps5",
    "SwitchProController": "switch_pro",
    "SwitchInputOnlyController": "switch_pro",
    "Switch2ProController": "switch_pro",
    "Switch2InputOnlyController": "switch_pro",
    "SwitchJoyConLeft": "switch_pro",
    "SwitchJoyConRight": "switch_pro",
    "SwitchJoyConPair": "switch_pro",
    "XInputSwitchController": "switch_pro",
    "8BitDoController": "generic",
    "SteamController": "generic",
    "SteamControllerNeptune": "neptune",
    "SteamControllerTriton": "neptune",
    "SteamControllerV2": "neptune",
    "HoriSteamController": "neptune",
    "MobileTouch": "generic",
    "UnknownNonSteamController": "generic",
}


def fetch(url: str) -> str:
    with urllib.request.urlopen(url, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_sdl_controllers(header: str) -> list[dict[str, object]]:
    pattern = re.compile(
        r"MAKE_CONTROLLER_ID\(\s*0x([0-9a-fA-F]+)\s*,\s*0x([0-9a-fA-F]+)\s*\)"
        r"\s*,\s*(k_e\w+)\s*,\s*(NULL|\"[^\"]*\")"
    )
    out: list[dict[str, object]] = []
    for vid, pid, sdl_type, name in pattern.findall(header):
        type_match = _TYPE_RE.match(sdl_type)
        short_type = type_match.group(1) if type_match else sdl_type
        out.append({
            "vid": int(vid, 16),
            "pid": int(pid, 16),
            "sdl_type": short_type,
            "steam_schema": SDL_TYPE_TO_STEAM.get(short_type, "generic"),
            "name": name.strip('"') if name != "NULL" else None,
        })
    return out


def parse_gamecontrollerdb(text: str) -> dict[str, dict[str, str]]:
    """Index the mapping DB by SDL GUID.

    The GUID's first 8 hex digits are bus+vendor+product in SDL's little-endian
    layout, so they identify the device for our purposes.
    """
    db: dict[str, dict[str, str]] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        fields = line.split(",")
        if len(fields) < 3:
            continue
        guid = fields[0].strip().lower()
        name = fields[1].strip()
        bindings: dict[str, str] = {}
        for field in fields[2:]:
            if ":" not in field:
                continue
            key, _, value = field.partition(":")
            key, value = key.strip(), value.strip()
            if key in ("platform", "type", "hint"):
                continue
            bindings[key] = value
        if bindings:
            db[guid] = {"name": name, "bindings": bindings}
    return db


def main() -> int:
    print("fetching SDL controller_list.h ...")
    header = fetch(SDL_CONTROLLER_LIST)
    controllers = parse_sdl_controllers(header)

    print("fetching SDL gamecontrollerdb.txt ...")
    gcdb = parse_gamecontrollerdb(fetch(SDL_GAMECONTROLLERDB))

    by_key: dict[str, dict[str, object]] = {}
    for entry in controllers:
        key = f"{entry['vid']:04x}:{entry['pid']:04x}"
        by_key[key] = entry

    types = Counter(c["sdl_type"] for c in controllers)
    payload = {
        "_comment": (
            "Generated by tools/build_identity_db.py from SDL. Classifies gamepads "
            "only; SDL has no rhythm-guitar entries, so guitars are identified by "
            "capability fingerprinting in auto_profiler.py."
        ),
        "sources": {
            "controller_list": SDL_CONTROLLER_LIST,
            "gamecontrollerdb": SDL_GAMECONTROLLERDB,
        },
        "counts": {
            "identities": len(by_key),
            "semantic_mappings": len(gcdb),
        },
        "sdl_types": dict(types.most_common()),
        "identities": by_key,
        "guid_mappings": gcdb,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {OUT_PATH} ({len(by_key)} identities, {len(gcdb)} mappings, "
          f"{OUT_PATH.stat().st_size // 1024} KiB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

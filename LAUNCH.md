# DeckForge Input Studio — launch status and setup

Repo: `~/Work/projects/deckforge-input-studio` (fork state of NaustudentX18/deckforge-input-studio).
Installed on the Deck at `/home/deck/homebrew/plugins/DeckForge Input Studio`.
Verified on hardware 2026-11-13, SteamOS build `20261023.100`, Decky v3.3.1.

---

## What was broken, and what was changed

The repo built and its 77 tests passed, but it could not have worked on a Deck. Four
independent blockers, each confirmed by probing the real machine rather than reading code:

| # | Blocked by | Evidence | Fix |
|---|---|---|---|
| 1 | Decky's interpreter is a **frozen CPython 3.14** that cannot see pip packages | probe plugin: `fastapi`, `uvicorn`, `pyudev`, `websockets`, `mido`, `pydantic` all `ModuleNotFoundError`; only system `evdev` imported | vendor ABI-matched wheels into `py_modules/lib`; `main.py` puts `py_modules/lib` and `py_modules` on `sys.path` |
| 2 | Decky appends only `<plugin>/py_modules` to `sys.path` | `decky_loader/plugin/sandboxed_plugin.py:91` | import as top-level `deckforge.*`, never `py_modules.deckforge.*` (that would double-import the package) |
| 3 | `"flags": ["root"]` runs the plugin with `HOME=/root` | probe: `home=/root` | root flag removed; nothing needs it (`/dev/input` is uaccess-granted to `deck`, Steam is under `/home/deck`, port 8765 is unprivileged) |
| 4 | The frozen stdlib is **missing `logging.config`** (PyInstaller never imports it) | uvicorn died on `import logging.config` | `deckforge/compat.py` loads the real 3.14 stdlib module from `_vendor/` before uvicorn imports |

Beyond those, the Steam-facing layer was wrong in ways that would have silently done nothing:

- Templates were written to `userdata/<id>/config/controller_configs/templates/` and
  `userdata/<id>/241100/remote/` — **neither directory exists on this SteamOS build**.
  Steam reads templates from `controller_base/templates/`.
- The VDF emitter hand-rolled a `controller_mappings` body that is not Steam's schema.
  Steam's format is group-based (`group` → `mode` → named `inputs` → `activator` →
  `binding`), and analog output is a *group* setting (`settings/output_joystick`), not an
  `xinput_axis` binding. No shipped template or autosave contains `xinput_axis`.
- Game assignment embedded the whole config into `configset_*.vdf`. Steam stores only
  `{"template": "<file>.vdf"}` there and loads the file by name.
- Backend and frontend disagreed on JSON shape (`title`/`action_sets` vs `metadata`/`actionSets`).

The compiler (`py_modules/deckforge/steam_compiler.py`) now patches Valve's own shipped
template instead of synthesising one, so Steam always receives a structurally valid file;
only slots for controls you actually mapped are rewritten. Unmappable sources are reported
rather than silently dropped.

---

## Verified on the Deck

```
plugin loads            Loaded DeckForge Input Studio (v0.1.0), 0 loader restarts
API                     http://<deck>:8765/api/health -> ok
devices                 9 evdev devices incl. "CRKD Gamepad", both Steam virtual pads
steam_info              template_dir=/home/deck/.local/share/Steam/controller_base/templates writable
templates listed        47 Valve base templates
create -> publish       file lands in controller_base/templates/, parses as controller_mappings
                        binding key_press F1 in group 0 / button_a
assign to app           configset gets {"template": "<name>.vdf"} + app id key
QAM registration        "DeckForge Input Studio" present in Decky's live plugin list with content mounted
frontend bundle         served by Decky, imports cleanly as Decky imports it
web studio              http://<deck>:8765/ renders, live devices, "Status: connected"
```

Test artifacts written into your real Steam dirs during verification were removed, and
`configset_controller_neptune.vdf` was restored byte-identically.

---

## What you need to configure

**Nothing is required to use the studio.** It is installed, running, and reachable. The
remaining work is the mapping content itself, which is design decisions only you can make.

### 1. The firewall (already done, but it will regress)

`firewalld` blocked 8765 on the LAN `public` zone (tailnet `trusted` was fine). I added it
permanently:

```bash
sudo firewall-cmd --permanent --zone=public --add-port=8765/tcp && sudo firewall-cmd --reload
```

Without this, tablet/phone pairing over the house LAN silently fails while the tailnet URL
works — a confusing half-failure. Re-check after any SteamOS atomic update.

### 2. Build your first profile

Open the studio: `http://192.168.4.223:8765/` (LAN) or `http://100.120.2.39:8765/` (tailnet),
or the Decky QAM panel → DeckForge → the `/deckforge` full-screen route.

1. Pick your device in the **device dropdown** (your CRKD shows as `CRKD Gamepad`).
2. Pick the matching **blueprint** (CRKD Les Paul Pro Model).
3. Click an input on the blueprint → bind it in the inspector.
4. **Profiles** tab → create a profile → **Save VDF**.
5. **Profiles** → assign it to the game (Clone Hero, YARG, GHWT:DE).

Each save publishes into `controller_base/templates/`, which is what Steam's configurator
reads. Anything the compiler cannot express is listed in the API response's `skipped` array
and logged — check it rather than assuming silence means success.

### 3. Known limits you should decide about

These are schema facts, not bugs, and they affect whether your guitar mapping does what you want:

- **Whammy cannot be mapped as an analog axis.** Steam exposes analog output only at group
  level (`output_joystick` / `output_trigger`); there is no axis binding string in any of the
  77 shipped templates or in Steam's autosaves. A whammy entry therefore maps onto the stick
  group's slot and is flagged in the API's `skipped` report rather than silently dropped.
  Real analog whammy needs a stick-group mode change, which is a design decision, not a fix.
- **`BTN_MODE` (guide/pickup toggle) has no writable slot** — Steam owns the guide button.
  It is reported as skipped. Star-power on the pickup toggle needs a different physical input
  or a layer.
- **`BTN_BASE` (5th solo fret) has no slot** in the neptune schema either.
- **`controller_type` is canonicalised** to the two schemas that have a skeleton (`neptune`,
  `xbox360`); `generic`/`ps4`/`ps5`/`switch_pro` fold onto those. Emitting a schema with no
  skeleton produces a config Steam hides.

### 3a. Your CRKD guitar — corrected against the hardware

The repo's CRKD support did not match your unit. Measured over SSH on the Deck:

| | Repo assumed | Your hardware (measured) |
|---|---|---|
| USB id | `0x2E95` (+ 0x0883 etc.) | **`20bc:5500`**, name "CRKD Gamepad" |
| Whammy | `ABS_RZ` | **`ABS_Z`** |
| Tilt | `ABS_Y` analog | **`ABS_HAT0X`**, digital, `-1` only |
| Strum | `BTN_DPAD_UP/DOWN` | **`ABS_HAT0Y`**, ±1, shares hat 0 with tilt |

All four are now handled: detection matches `20bc:5500` (and still the documented ids), the
profile keeps the device's real ids instead of substituting `0x0883`, whammy maps to `ABS_Z`,
tilt to its own button slot, and strum maps onto the dpad group. Verified live — the preset
endpoint now returns `0x20bc 0x5500`, `whammy ABS_Z`, `tilt ABS_HAT0X`.

Two consequences you must decide on: tilt and strum **share hat 0**, so a tilt reading and a
strum reading are distinguished only by axis, and Steam has no concept of them as separate
device axes. And since tilt is a single-direction digital edge, it cannot be a smooth
star-power tilt — only a switch.

### 4. Not done, and why

- **Nothing committed or pushed.** Your repo rules; changes are in the working tree.
- **The GitHub store listing is not live.** `plugin.json` now has a valid `publish` object
  and a real 256×256 `assets/plugin_icon.png`, but the raw icon URL 404s until the icon is
  pushed. The zip at `dist/deckforge-input-studio.zip` is the developer-mode install artifact.
- **`debug` was removed from `flags`.** With it set, Decky reloads the plugin on any write
  inside the plugin dir — including `__pycache__` from its own imports — which loops. Bytecode
  writing is also disabled in `main.py`. If you re-add `debug` for frontend work, expect that loop.

### 5. Reproducing a deploy

```bash
cd ~/Work/projects/deckforge-input-studio
bun run build                      # dist/index.js + static/dist/web-entry.js
npx tsc --noEmit                   # clean
make zip                           # dist/deckforge-input-studio.zip
rsync -az --delete --exclude .git --exclude node_modules --exclude .venv \
      --exclude __pycache__ --exclude '*.pyc' --exclude tests \
      ./ deck@192.168.4.223:/home/deck/tmp/dfstage/
ssh deck@192.168.4.223 'P="/home/deck/homebrew/plugins/DeckForge Input Studio";
  sudo systemctl stop plugin_loader.service; sudo rm -rf "$P"; sudo mkdir -p "$P";
  sudo cp -r /home/deck/tmp/dfstage/. "$P"/; sudo chown -R root:root "$P";
  sudo systemctl start plugin_loader.service'
```

`make vendor` regenerates `py_modules/lib` for **x86_64 / cp314** — do not re-vendor for a
different platform or the plugin will only fail at import time on the Deck.

### 6. Deck hygiene found while working

The loader was flapping from a stale PowerTools backend holding `127.0.0.1:44443` — the
exact cascade recorded in the steam-deck knowledge guide. Fixed with
`sudo kill -9 <stale backend pid>` then a loader restart. If plugins vanish from the QAM
later, that is the first thing to check. A separate stray probe process of mine was also
consuming 11.5 GB and has been removed.

---

# Mobile / PWA (Galaxy S25)

Added 2026-11-13 and verified on an emulated S25 viewport against the live Deck
(384×854 CSS px, DPR 2.8125, touch) plus the desktop path re-checked at 1280×800.

## Installing on the S25

The PWA needs a **secure context**. `http://<deck-lan-ip>:8765` is *not* one — the
browser hides `navigator.serviceWorker` entirely there, so install is impossible
over plain HTTP. Two working options:

1. **Tailnet (recommended, works anywhere):** `https://steamdeck.tail9760ad.ts.net/`
   is served by `tailscale serve` and proxied to the local API, so it is HTTPS with
   a valid cert. Open it in Chrome → ⋮ → **Add to Home screen** / **Install app**.
2. **Localhost on the Deck itself:** `http://127.0.0.1:8765` counts as secure.

Configured `tailscale serve` (persists until changed):

```bash
sudo /opt/tailscale/tailscale serve --bg --https=443 http://127.0.0.1:8765
```

Note `/opt/tailscale/tailscale` is the binary path on SteamOS; there is no
`tailscale` on `PATH`, which is a confusing "command not found" if you forget.

## What was added

- `static/manifest.webmanifest` — standalone display, maskable icon, app shortcuts,
  theme colour.
- `static/sw.js` — caches the app shell only. The API is **never** cached: every
  useful value here is live hardware state, and a stale device list is worse than
  an honest failure. Navigations are network-first (so a redeploy is picked up)
  with the cached shell as fallback; static assets are cache-first with a
  background refresh.
- `static/icons/` — 192, 512 and a padded 512 maskable, rasterized from the logo.
- `src/hooks/useResponsive.ts` — viewport/touch hooks, SW registration, install
  prompt. Registration is a no-op outside a secure context instead of throwing.
- FastAPI serves `/sw.js` and `/manifest.webmanifest` at the origin root with
  `Cache-Control: no-store` and `Service-Worker-Allowed: /`, correct
  `application/manifest+json` MIME.

## Layout changes

Breakpoint is **900px** (`COMPACT_MAX_WIDTH`), not the usual 700: the studio's
control bar needs about that much width before labels start clipping, so phones in
landscape and small tablets get the mobile chrome too.

- Sidebar becomes a 4-item bottom bar (Map / Live / Profiles) plus a **More** sheet
  holding the remaining six destinations; nine tabs never fit a phone bar and a
  scrolling row hid them.
- The binding editor becomes a bottom sheet on phones instead of a docked flyout,
  so it never covers the control being mapped.
- Safe-area insets on all four edges; `100dvh` so the mobile browser's collapsing
  toolbar doesn't clip the layout.
- Touch targets ≥44px; selects use 16px text because iOS zooms any focused input
  under that.
- Blueprint SVGs are authored at fixed pixel sizes and are now capped with
  `max-width: 100%`.
- The "Architecture & Guides" switcher is an inline row rather than a floating
  overlay — floated, it sat exactly where the studio's own top-right controls live
  and covered them.
- The Steam path readout moved from the top bar to the status bar; in the bar it
  crowded out the Save button.

## Fixed while doing this

- **Mixed content / wrong host over HTTPS.** The API client hardcoded
  `http://<host>:8765`, which an HTTPS page blocks outright. It is now
  protocol-aware: an HTTPS page talks to its own origin (the proxy forwards to
  the API), an HTTP page keeps the explicit port.
- The `sw.js`/manifest must be served at scope root; they were only reachable
  under `/static/`, which would have made the SW scope `/static/` and left the
  app itself uncached.

## Verified

```
secure context        true   (https://steamdeck.tail9760ad.ts.net)
serviceWorker         supported, registered, activated, scope "/"
manifest              name/short_name/display=standalone, 3 icons incl. maskable
cache                 deckforge-shell-v1 with all 7 shell assets
offline reload        shell renders from cache, shows "No Controller Connected"
API over HTTPS        200; body shows "Status: connected"
S25 384x854           no clipping, all controls reachable, bottom nav works
desktop 1280x800      sidebar + status bar intact, nothing truncated
```

---

# Smart Auto-Profiler (2026-11-14)

One press on **⚡ Auto-Profile** identifies the connected hardware, builds a
matching Steam Input profile, saves it and publishes it into Steam.

## Why it can't just read USB ids

Researched against upstream SDL on 2026-11-14, because this determines the whole
design:

| Source | What it says about your CRKD Les Paul Pro |
|---|---|
| SDL `controller_list.h` | `20bc:5500` → **`k_eControllerType_PS3Controller`** (a plain PS3 pad) |
| SDL `gamecontrollerdb.txt` | **nothing** — zero guitar/rock-band/riffmaster entries |
| Steam `configset_*.vdf` | only per-device files, no guitar concept |

The mainstream database is wrong or silent for exactly the hardware DeckForge
exists for. So identity is layered by strength of evidence:

1. **Capability fingerprint** (measured): a guitar has a solo-fret row and no
   complete stick pair; a fightstick has 8+ buttons and no sticks; a keyboard has
   `KEY_*` where a controller has `BTN_*`.
2. **Vendored SDL identity table** (613 ids): names and classifies gamepads.
3. **Name heuristics**: last resort.

`tools/build_identity_db.py` regenerates the table from upstream; the JSON is
committed because Decky's frozen interpreter cannot fetch at load time.

## False positives this had to defeat

The first implementation classified a laptop keyboard as a guitar, because media
keys emit `BTN_C`/`BTN_Z`/`BTN_THUMB` — the same codes as a solo-fret strip. The
gates that fix it, each verified against a real device's evdev map:

- `KEY_*` codes are counted separately from `BTN_*`; a large `KEY_*` count with
  no hat axis means keyboard, not guitar.
- `REL_*` relative axes (or a mouse-like name) means pointing device, never a
  controller.
- No `BTN_*` and no gamepad axes at all means not a controller (hotkey panels,
  power buttons, audio jacks).
- Steam's own devices (`0x28DE`, virtual bus, "Valve" in the name) are marked
  `reserved` and can never be the auto-profile target.

## What it produces

Measured guitar (`20bc:5500`), Clone Hero target:

```
Detected as guitar · 97% confidence
solo-fret row present (BTN_C, BTN_Z) with no analog sticks
✓ 11 bound   1 unsupported   Steam writable
```

Bound: all five frets, strum up/down (hat axis → d-pad group), whammy (`ABS_Z`),
tilt, start, select. Unsupported and reported, not silently dropped: the pickup
toggle (`BTN_MODE`) because Steam owns the guide button.

Every generated profile is compiled through the same Steam VDF compiler as
manual ones, so it is a real loadable config in Steam's group-based schema.

## API

```
GET  /api/auto/detect     all devices + per-device reasoning + best candidate
POST /api/auto/profile    {target_game, save, device_path?}
                          -> detection, notes, saved:{applied[], skipped[], steam}
```

`kind_reason` is part of the payload: when a guess is wrong you can see which
inputs drove it instead of guessing back.

## Verified

- 23 new tests (100 total passing) using capability maps transcribed from the
  real CRKD, a real Xbox pad, a real keyboard, a mouse and a hotkey panel.
- Endpoint exercised live: returns 404 with a clear message when nothing is
  connected; returns the guitar profile when the measured fingerprint is present.
- UI modal verified rendering the success payload (screenshot, 1280×800) and the
  no-device error.

Not yet verified on the physical Deck: it was asleep for this session. On wake,
press **⚡ Auto-Profile** with the guitar plugged in and check the modal matches
the block above.

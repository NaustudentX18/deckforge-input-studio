#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# DeckForge Input Studio — One-command installer for Steam Deck
# Usage:  curl -sL https://raw.githubusercontent.com/NaustudentX18/deckforge-input-studio/main/install.sh | bash
#         or:  chmod +x install.sh && ./install.sh
#
# This script does exactly four things:
#   1. verify Decky Loader is present
#   2. clone or fast-forward the repo into ~/homebrew/plugins/DeckForge Input Studio
#   3. install Node deps and build the frontend bundles (dist/, static/dist/)
#   4. restart plugin_loader
#
# It deliberately installs NO Python packages. Decky Loader runs plugins on its
# own frozen interpreter, which cannot see user site-packages, and SteamOS ships
# no pip for it. All Python dependencies are vendored at packaging time into
# py_modules/lib (see `make vendor`) and shipped inside the repo/zip.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

PLUGIN_NAME="DeckForge Input Studio"
REPO_URL="https://github.com/NaustudentX18/deckforge-input-studio"
HOMEBREW_DIR="$HOME/homebrew"
PLUGINS_DIR="$HOMEBREW_DIR/plugins"
INSTALL_DIR="$PLUGINS_DIR/$PLUGIN_NAME"

# ── colours ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Colour

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── pre-flight checks ────────────────────────────────────────────────
if [[ ! -d "$HOMEBREW_DIR" ]]; then
    error "Decky Loader does not appear to be installed ($HOMEBREW_DIR not found)."
    error "Install Decky Loader first: https://decky.xyz"
    exit 1
fi

if ! command -v git &>/dev/null; then
    warn "git not found — installing via pacman …"
    sudo pacman -Sy --noconfirm git
fi

if ! command -v npm &>/dev/null; then
    warn "npm not found — installing nodejs/npm via pacman …"
    sudo pacman -Sy --noconfirm nodejs npm
fi

# ── install / update ─────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Existing installation found — pulling latest changes …"
    cd "$INSTALL_DIR"
    git pull --ff-only
else
    info "Cloning $PLUGIN_NAME …"
    rm -rf "$INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# ── vendored Python dependencies (shipped, never installed here) ─────
if [[ ! -d "$INSTALL_DIR/py_modules/lib" ]]; then
    warn "py_modules/lib is missing from this checkout."
    warn "The plugin cannot import its Python dependencies without it —"
    warn "install the released zip instead, or run 'make vendor' on a packaging machine."
fi

# ── frontend build ───────────────────────────────────────────────────
info "Installing Node dependencies …"
npm install --legacy-peer-deps

info "Building frontend bundles …"
npm run build

info "Verifying build artefacts …"
for f in "dist/index.js" "static/dist/web-entry.js"; do
    if [[ -f "$INSTALL_DIR/$f" ]]; then
        info "  ✓ $f"
    else
        error "  ✗ $f missing — frontend build failed."
        exit 1
    fi
done

# ── restart Decky Loader ─────────────────────────────────────────────
info "Restarting Decky Loader plugin service …"
if systemctl is-active --quiet plugin_loader.service; then
    sudo systemctl restart plugin_loader.service
    info "Decky Loader restarted."
else
    warn "plugin_loader.service is not running — you may need to restart it manually."
fi

echo ""
info "✅  $PLUGIN_NAME installed successfully!"
info "Open the Decky menu (QAM ⇢ 🔌) to access the plugin."

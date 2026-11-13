#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# DeckForge Input Studio — One-command installer for Steam Deck
# Usage:  curl -sL <url>/install.sh | bash
#         or:  chmod +x install.sh && ./install.sh
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

PLUGIN_NAME="DeckForge Input Studio"
REPO_URL="https://github.com/deckforge/input-studio"
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
    warn "npm not found — installing nodejs via pacman …"
    sudo pacman -Sy --noconfirm nodejs npm
fi

if ! command -v pip &>/dev/null; then
    warn "pip not found — installing python-pip via pacman …"
    sudo pacman -Sy --noconfirm python-pip
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

# ── frontend build ───────────────────────────────────────────────────
info "Installing Node dependencies …"
npm install --legacy-peer-deps

info "Building frontend bundle …"
npm run build

# ── Python dependencies ──────────────────────────────────────────────
info "Installing Python dependencies …"
pip install --user --break-system-packages \
    evdev pyudev fastapi "uvicorn[standard]" websockets aiofiles 2>/dev/null \
    || pip install --user \
    evdev pyudev fastapi "uvicorn[standard]" websockets aiofiles

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

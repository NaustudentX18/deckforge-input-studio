# DeckForge Input Studio — Makefile
# ─────────────────────────────────────────────────────────────────────
PLUGIN_NAME   := DeckForge Input Studio
DECK_USER     := deck
DECK_HOST     := steamdeck
DECK_DEST     := /home/$(DECK_USER)/homebrew/plugins/$(PLUGIN_NAME)
PY_MODULES    := py_modules/deckforge
LIB_DIR       := py_modules/lib
ZIP_NAME      := dist/deckforge-input-studio.zip

# Auto-detect Decky Loader python runtime or fallback
DECKY_PYTHON  ?= $(shell \
	if [ -x /home/deck/homebrew/services/PluginLoader ]; then \
		echo "/home/deck/homebrew/services/PluginLoader"; \
	elif [ -x /home/deck/homebrew/environments/plugin_loader/bin/python ]; then \
		echo "/home/deck/homebrew/environments/plugin_loader/bin/python"; \
	elif command -v python3 >/dev/null 2>&1; then \
		command -v python3; \
	else \
		echo "python3"; \
	fi)

.PHONY: install vendor build package zip deploy clean test dev

## install — install all frontend and backend dependencies
install:
	pnpm install || npm install
	pip install --user -e ".[dev]" || pip install -e ".[dev]"

## vendor — vendor pure-Python & ABI-matched dependencies into py_modules/lib
vendor:
	@echo "Vendoring Python dependencies for Decky runtime: $(DECKY_PYTHON) …"
	mkdir -p $(LIB_DIR)
	$(DECKY_PYTHON) -m pip install --target $(LIB_DIR) --upgrade \
		fastapi uvicorn websockets pyudev evdev mido 2>/dev/null || \
	pip install --target $(LIB_DIR) --upgrade \
		fastapi uvicorn websockets pyudev evdev mido

## build — compile the frontend bundle & standalone web studio
build:
	pnpm run build || npm run build

## package — alias to build and prepare vendor dependencies
package: build vendor

## zip — build a clean, store-ready Decky Developer Mode zip
zip: build
	@echo "Creating store-ready Decky Developer Mode zip: $(ZIP_NAME) …"
	mkdir -p dist
	rm -f $(ZIP_NAME)
	# Build temporary staging area
	rm -rf .tmp_pkg && mkdir -p .tmp_pkg
	cp plugin.json main.py .tmp_pkg/
	cp -r dist .tmp_pkg/
	cp -r static .tmp_pkg/
	cp -r defaults .tmp_pkg/
	cp -r assets .tmp_pkg/
	cp -r py_modules .tmp_pkg/
	# Clean unwanted files from staging
	find .tmp_pkg -type d -name '__pycache__' -exec rm -rf {} +
	find .tmp_pkg -type d -name '.pytest_cache' -exec rm -rf {} +
	find .tmp_pkg -type d -name 'tests' -exec rm -rf {} +
	find .tmp_pkg -type f -name '*.pyc' -delete
	find .tmp_pkg -type f -name '*.map' -delete
	# Create zip containing plugin files at root
	(cd .tmp_pkg && zip -r ../$(ZIP_NAME) .)
	rm -rf .tmp_pkg
	@echo "✅ Store-ready zip built: $(ZIP_NAME) ($$(du -h $(ZIP_NAME) | cut -f1))"

## deploy — rsync the plugin to the Steam Deck
deploy: build
	rsync -avz --delete \
		--exclude='node_modules' \
		--exclude='.git' \
		--exclude='__pycache__' \
		--exclude='*.pyc' \
		--exclude='.mypy_cache' \
		--exclude='.pytest_cache' \
		--exclude='.ruff_cache' \
		--exclude='tests' \
		./ $(DECK_USER)@$(DECK_HOST):$(DECK_DEST)/
	ssh $(DECK_USER)@$(DECK_HOST) "sudo systemctl restart plugin_loader"

## clean — remove build artefacts
clean:
	rm -rf dist node_modules static/dist .tmp_pkg
	find . -type d -name '__pycache__' -exec rm -rf {} +
	find . -type f -name '*.pyc' -delete

## test — run the Python test suite
test:
	uv run pytest $(PY_MODULES)/tests -v --tb=short || python3 -m pytest $(PY_MODULES)/tests -v --tb=short

## dev — start frontend watcher and backend server side-by-side
dev:
	@echo "Starting API server and frontend watcher …"
	@trap 'kill 0' EXIT; \
	uvicorn py_modules.deckforge.api_server:app \
		--host 0.0.0.0 --port 8765 --reload \
		--reload-dir $(PY_MODULES) & \
	npm run watch & \
	wait

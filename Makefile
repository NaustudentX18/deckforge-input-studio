# DeckForge Input Studio — Makefile
# ─────────────────────────────────────────────────────────────────────
PLUGIN_NAME   := DeckForge Input Studio
DECK_USER     := deck
DECK_HOST     ?= 192.168.4.223
DECK_DEST     := /home/$(DECK_USER)/homebrew/plugins/$(PLUGIN_NAME)
PY_MODULES    := py_modules/deckforge
LIB_DIR       ?= py_modules/lib
ZIP_NAME      := dist/deckforge-input-studio.zip

# Auto-detect Decky Loader python runtime (only used for optional local vendoring)
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

## install — install all frontend and backend dependencies (dev machines only)
install:
	pnpm install || npm install
	pip install --user -e ".[dev]" || pip install -e ".[dev]"

## vendor — rebuild py_modules/lib for the Decky frozen interpreter
##          (measured on current SteamOS: CPython 3.14, x86_64).
##          Decky's frozen Python cannot install packages at runtime, so this is
##          a packaging-time step and the result is shipped inside the plugin.
vendor:
	@echo "Vendoring Python dependencies into $(LIB_DIR) …"
	rm -rf $(LIB_DIR) && mkdir -p $(LIB_DIR)
	uv pip install --target $(LIB_DIR) --link-mode copy \
		--python-platform x86_64-manylinux2014 --python-version 3.14 --only-binary :all: \
		fastapi "uvicorn[standard]" websockets pyudev mido aiofiles python-multipart
	# evdev ships sdist-only; build it for the same interpreter tag.
	uv pip install --target $(LIB_DIR) --link-mode copy \
		--python-version 3.14 evdev
	rm -rf $(LIB_DIR)/bin
	find $(LIB_DIR) -type d -name '__pycache__' -prune -exec rm -rf {} +
	@echo "✅ Vendored: $$(ls $(LIB_DIR) | wc -l) entries, $$(du -sh $(LIB_DIR) | cut -f1)"

## styles — regenerate the CSS text module (run after editing src/styles/*.css)
styles:
	node tools/gen-styles.mjs

## identity-db — regenerate the vendored controller identity table from upstream SDL
identity-db:
	python3 tools/build_identity_db.py

## build — compile the frontend bundle & standalone web studio
build: styles
	pnpm run build || npm run build

## package — alias to build and prepare vendor dependencies
package: build vendor

## zip — build a clean, store-ready Decky Developer Mode zip
zip: build
	@echo "Creating store-ready Decky Developer Mode zip: $(ZIP_NAME) …"
	@test -f dist/index.js || { echo "ERROR: dist/index.js missing (frontend build failed)."; exit 1; }
	@test -f static/dist/web-entry.js || { echo "ERROR: static/dist/web-entry.js missing (web build failed)."; exit 1; }
	@test -d $(LIB_DIR) || { echo "ERROR: $(LIB_DIR) missing — the vendored dependencies (fastapi, uvicorn, …) MUST be committed; Decky's frozen Python cannot see site-packages. Run 'make vendor' on an aarch64 host or copy the prebuilt $(LIB_DIR)."; exit 1; }
	mkdir -p dist
	rm -f $(ZIP_NAME)
	# Build temporary staging area
	rm -rf .tmp_pkg && mkdir -p .tmp_pkg
	cp plugin.json package.json main.py .tmp_pkg/
	cp -r dist .tmp_pkg/
	cp -r static .tmp_pkg/
	cp -r defaults .tmp_pkg/
	cp -r assets .tmp_pkg/
	mkdir -p .tmp_pkg/py_modules
	cp -r $(PY_MODULES) .tmp_pkg/py_modules/
	cp -r $(LIB_DIR) .tmp_pkg/py_modules/
	# Clean unwanted files from staging
	find .tmp_pkg -type d \( -name '__pycache__' -o -name '.pytest_cache' -o -name 'tests' -o -name 'node_modules' -o -name '.venv' -o -name '*.egg-info' \) -prune -exec rm -rf {} +
	find .tmp_pkg -type f \( -name '*.pyc' -o -name '*.map' -o -name '*.pyo' \) -delete
	# Create zip containing plugin files at root
	(cd .tmp_pkg && zip -rq ../$(ZIP_NAME) .)
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

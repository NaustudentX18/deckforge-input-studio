# DeckForge Input Studio — Makefile
# ─────────────────────────────────────────────────────────────────────
PLUGIN_NAME   := DeckForge Input Studio
DECK_USER     := deck
DECK_HOST     := steamdeck
DECK_DEST     := /home/$(DECK_USER)/homebrew/plugins/$(PLUGIN_NAME)
PY_MODULES    := py_modules/deckforge

.PHONY: install build deploy clean test dev

## install — install all frontend and backend dependencies
install:
	npm install
	pip install --user -e ".[dev]"

## build — compile the frontend bundle
build:
	npm run build

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
		./ $(DECK_USER)@$(DECK_HOST):$(DECK_DEST)/
	ssh $(DECK_USER)@$(DECK_HOST) "sudo systemctl restart plugin_loader"

## clean — remove build artefacts
clean:
	rm -rf dist node_modules
	find . -type d -name '__pycache__' -exec rm -rf {} +
	find . -type f -name '*.pyc' -delete

## test — run the Python test suite
test:
	python -m pytest $(PY_MODULES)/tests -v --tb=short

## dev — start frontend watcher and backend server side-by-side
dev:
	@echo "Starting API server and frontend watcher …"
	@trap 'kill 0' EXIT; \
	uvicorn py_modules.deckforge.api_server:app \
		--host 0.0.0.0 --port 8765 --reload \
		--reload-dir $(PY_MODULES) & \
	npm run watch & \
	wait

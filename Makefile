.PHONY: sync fetch check profile compare inspect artifacts detections density tiles passes site lab clean

sync:
	uv sync

fetch:
	uv run python -m firms.fetch --download

check:
	uv run python -m firms.fetch --check

profile:
	uv run python -m firms.profile

compare:
	uv run python -m firms.compare

inspect:
	uv run python -m firms.inspect

REGION ?= CA

artifacts:
	uv run python -m firms.artifacts --region $(REGION)

detections:
	uv run python -m firms.detections

density:
	uv run python -m firms.density

tiles:
	uv run python -m firms.tiles

passes:
	uv run python -m firms.passes

site:
	cd web && bun run build

lab:
	uv run jupyter lab --no-browser --ServerApp.open_browser=False --notebook-dir=notebooks

clean:
	rm -rf data/processed/* private/figures/*

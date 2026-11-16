#!/usr/bin/env bash
# Download one country's FIRMS CSVs, slowly.
#
#   ./scripts/download_country.sh Canada                    # published sensors, 50 s
#   ./scripts/download_country.sh United_States 50
#   ./scripts/download_country.sh Argentina 50
#   ./scripts/download_country.sh Canada 50 viirs-jpss1     # NOAA-20, validation only
#
# Sequential, one request at a time, skips existing files, logs to data/download.log.

set -euo pipefail

country="${1:?usage: $0 <Country> [pause_seconds] [sensors]}"
pause="${2:-50}"
sensors="${3:-modis,viirs-snpp}"

cd "$(dirname "$0")/.."
exec uv run python -m firms.fetch --download --country "$country" \
  --sensor "$sensors" --pause "$pause"

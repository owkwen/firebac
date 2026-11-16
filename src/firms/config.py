"""Paths, sensors, countries, URL construction.

Country tokens must match FIRMS exactly: "United_States", "Canada", "Argentina".
Years are inclusive ranges. MODIS starts Nov 2000; VIIRS S-NPP starts Jan 2012.
"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
FIGURES = ROOT / "private" / "figures"

BASE = "https://firms.modaps.eosdis.nasa.gov/data/country"

COUNTRIES = ("Argentina", "Canada", "United_States")

SENSOR_YEARS: dict[str, range] = {
    "modis": range(2000, 2026),
    "viirs-snpp": range(2012, 2026),
    # NOAA-20. Same 375 m fire product, ~50 min behind S-NPP in the same orbit
    # plane, which is what makes sub-hourly fire tracking possible.
    "viirs-jpss1": range(2018, 2026),
}

# The published record is MODIS + S-NPP only. Additional platforms are downloaded and
# used for cross-platform validation; merging them into the calendar would move the
# multiplicity bins and silently change every published number.
PUBLISHED_SENSORS = ("modis", "viirs-snpp")

# This workstation hits Tjmax (100 C) at four threads; two is the measured ceiling.
# DuckDB defaults to one thread per core, so every build must cap it explicitly.
DUCKDB_THREADS = int(os.getenv("FIRMS_THREADS", "2"))


def url(sensor: str, year: int, country: str) -> str:
    return f"{BASE}/{sensor}/{year}/{sensor}_{year}_{country}.csv"


def local_path(sensor: str, year: int, country: str) -> Path:
    return RAW / f"{sensor}_{year}_{country}.csv"

"""Loading and light normalisation. No science here."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .config import RAW


def sensor_of(path: Path) -> str:
    name = path.name.lower()
    if name.startswith("viirs"):
        return "VIIRS"
    if name.startswith("modis"):
        return "MODIS"
    return "UNKNOWN"


def country_of(path: Path) -> str:
    """`modis_2020_United_States.csv` -> `United_States`."""
    parts = path.stem.split("_")
    return "_".join(parts[2:]) if len(parts) >= 3 else "UNKNOWN"


def load(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, low_memory=False)
    df.columns = [c.strip().lower() for c in df.columns]
    df["sensor"] = sensor_of(path)
    df["country"] = country_of(path)
    df["source_file"] = path.name
    return add_time(df)


def load_all(raw: Path = RAW, country: str | None = None) -> pd.DataFrame:
    files = sorted(raw.glob("*.csv"))
    if country:
        files = [path for path in files if country_of(path) == country]
    if not files:
        raise SystemExit(f"No CSVs in {raw} for country={country!r}. Run `make fetch` first.")
    return pd.concat([load(p) for p in files], ignore_index=True)


def add_time(df: pd.DataFrame) -> pd.DataFrame:
    """acq_time is HHMM as an integer; build minutes-since-midnight and a timestamp."""
    time = pd.to_numeric(df["acq_time"], errors="coerce").fillna(0).astype("int64")
    df = df.copy()
    df["minutes"] = (time // 100) * 60 + (time % 100)
    df["ts"] = pd.to_datetime(df["acq_date"], errors="coerce") + pd.to_timedelta(
        df["minutes"], unit="m"
    )
    return df


def cell_keys(df: pd.DataFrame, grid_deg: float) -> pd.Series:
    """Round lat/lon to a grid; returns integer cell ids as tuples."""
    lat = (df["latitude"] / grid_deg).round().astype("int64")
    lon = (df["longitude"] / grid_deg).round().astype("int64")
    return pd.Series(list(zip(lat, lon)), index=df.index, name="cell")

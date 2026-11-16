"""Cross-sensor comparison and dedupe. The first real result lives here.

    uv run python -m firms.compare

Produces the numbers the demo hangs on:
  - raw row ratio between VIIRS and MODIS
  - the same ratio after dedupe in space AND time
  - confidence-scheme asymmetry
  - VIIRS brightness censoring
  - shared-cell acquisition offsets
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .config import RAW
from .io import cell_keys, country_of, load, sensor_of

GRID_DEG = 0.01  # ~1.1 km, one MODIS pixel
WINDOW_MIN = 30  # a fire detected twice within 30 min in the same cell is one detection


def dedupe(df: pd.DataFrame, grid_deg: float = GRID_DEG, window_min: int = WINDOW_MIN):
    """Greedy space+time dedupe: one detection per (cell, date, window).

    A fixed time bucket would split pairs that straddle a boundary, so we walk
    chronologically per cell-day and keep a detection only when it is at least
    `window_min` after the last kept one.
    """
    work = df.copy()
    work["cell"] = cell_keys(work, grid_deg)
    work = work.sort_values(["cell", "acq_date", "minutes"])

    keep = []
    last_seen: dict[tuple, int] = {}
    for cell, date, minute in zip(work["cell"], work["acq_date"], work["minutes"]):
        key = (cell, date)
        previous = last_seen.get(key)
        fresh = previous is None or (minute - previous) >= window_min
        keep.append(fresh)
        if fresh:
            last_seen[key] = minute

    return work.loc[keep].drop(columns=["cell"])


def load_sensor(sensor: str, country: str | None = None) -> pd.DataFrame:
    files = [
        path
        for path in sorted(RAW.glob("*.csv"))
        if sensor_of(path) == sensor and (country is None or country_of(path) == country)
    ]
    if not files:
        raise SystemExit(f"No {sensor} files in {RAW} for country={country!r}")
    return pd.concat([load(p) for p in files], ignore_index=True)


def confidence_summary(df: pd.DataFrame) -> str:
    values = df["confidence"].astype("string")
    if values.str.match(r"^\d+$").all():
        numeric = pd.to_numeric(values)
        high = (numeric >= 80).mean()
        return f"numeric 0-100  median={numeric.median():.0f}  >=80: {high:.1%}"
    counts = values.value_counts(normalize=True)
    return "categorical  " + "  ".join(f"{k}:{v:.1%}" for k, v in counts.items())


def main(country: str | None = None) -> None:
    modis = load_sensor("MODIS", country)
    viirs = load_sensor("VIIRS", country)

    print(f"MODIS rows {len(modis):,}   VIIRS rows {len(viirs):,}")
    print(f"raw ratio VIIRS/MODIS: {len(viirs) / len(modis):.3f}x")

    m = dedupe(modis)
    v = dedupe(viirs)
    print(f"after dedupe  MODIS {len(m):,}   VIIRS {len(v):,}")
    print(f"deduped ratio: {len(v) / len(m):.3f}x   (grid {GRID_DEG} deg, window {WINDOW_MIN} min)")

    print("\nconfidence")
    print(f"  MODIS {confidence_summary(modis)}")
    print(f"  VIIRS {confidence_summary(viirs)}")

    if "bright_ti4" in viirs.columns:
        ti4 = pd.to_numeric(viirs["bright_ti4"], errors="coerce")
        ceiling = (ti4 == 367.0).sum()
        print(f"\nVIIRS bright_ti4 ceiling 367.0 K: {ceiling:,} rows ({ceiling / len(viirs):.2%})")

    if "type" in modis.columns and "type" in viirs.columns:
        print("\ntype (0=vegetation, 2=industrial, 3=offshore)")
        for label, frame in (("MODIS", modis), ("VIIRS", viirs)):
            counts = frame["type"].value_counts().sort_index()
            print(f"  {label}: {dict(counts)}")

    if "daynight" in modis.columns and "daynight" in viirs.columns:
        print("\ndaynight")
        for label, frame in (("MODIS", modis), ("VIIRS", viirs)):
            print(f"  {label}: {dict(frame['daynight'].value_counts())}")

    # shared cells: earliest detection per cell-day, then compare acquisition times
    m_shared = m.assign(cell=cell_keys(m, GRID_DEG))[["cell", "acq_date", "minutes"]]
    v_shared = v.assign(cell=cell_keys(v, GRID_DEG))[["cell", "acq_date", "minutes"]]
    m_shared = m_shared.sort_values("minutes").drop_duplicates(["cell", "acq_date"])
    v_shared = v_shared.sort_values("minutes").drop_duplicates(["cell", "acq_date"])

    joined = m_shared.merge(v_shared, on=["cell", "acq_date"], suffixes=("_m", "_v"))
    if len(joined):
        offset = (joined["minutes_m"] - joined["minutes_v"]).abs()
        print(f"\nshared cell-days: {len(joined):,}")
        print(f"acquisition offset  median={offset.median():.0f} min  p90={offset.quantile(0.9):.0f} min")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Cross-sensor comparison")
    parser.add_argument("--country", default=None, help="e.g. Argentina, Canada, United_States")
    main(parser.parse_args().country)

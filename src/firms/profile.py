"""Schema profiling. Run this before writing any model.

    uv run python -m firms.profile
"""

from __future__ import annotations

import pandas as pd

from .config import RAW
from .io import country_of, load

CATEGORICALS = (
    "confidence",
    "type",
    "daynight",
    "satellite",
    "instrument",
    "version",
    "scan",
    "track",
)


def report(path) -> None:
    df = load(path)
    print("=" * 78)
    print(f"{path.name}   rows={len(df):,}   cols={len(df.columns)}")
    print(f"dates: {df['acq_date'].min()} -> {df['acq_date'].max()}")
    print(f"columns: {', '.join(df.columns)}")
    print("-" * 78)

    nulls = df.isna().sum()
    nulls = nulls[nulls > 0].sort_values(ascending=False)
    print("nulls:", "none" if nulls.empty else ", ".join(f"{c}={n}" for c, n in nulls.items()))

    for col in CATEGORICALS:
        if col not in df.columns:
            continue
        values = df[col].astype("string")
        counts = values.value_counts(dropna=False).head(6)
        print(f"{col:12s} unique={values.nunique(dropna=True):<6} top={dict(counts)}")

    for col in ("brightness", "bright_ti4", "bright_t31", "bright_ti5", "frp"):
        if col in df.columns:
            s = pd.to_numeric(df[col], errors="coerce")
            print(
                f"{col:12s} min={s.min():.2f} p50={s.median():.2f} "
                f"max={s.max():.2f} zeros={(s == 0).sum()} neg={(s < 0).sum()}"
            )

    if {"latitude", "longitude", "acq_date"} <= set(df.columns):
        dup = df.duplicated(subset=["latitude", "longitude", "acq_date"]).sum()
        print(f"exact (lat,lon,date) duplicates: {dup}")
    print()


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Schema and distribution report")
    parser.add_argument("--country", default=None, help="e.g. Argentina, Canada, United_States")
    country = parser.parse_args().country

    files = sorted(RAW.glob("*.csv"))
    if country:
        files = [path for path in files if country_of(path) == country]
    if not files:
        raise SystemExit(f"No CSVs in {RAW} for country={country!r}. Run `make fetch` first.")
    for path in files:
        report(path)


if __name__ == "__main__":
    main()

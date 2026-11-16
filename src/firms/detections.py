"""Per-year raw detection parquet for the AOI page.

The calendar publishes cell-day aggregates. This publishes the detections those
aggregates are built from, so an arbitrary area can be explored without a server.
Nothing here is harmonised: one row is one pixel detection.
"""

from __future__ import annotations

import json
from pathlib import Path

import duckdb

from .config import DUCKDB_THREADS, PUBLISHED_SENSORS, RAW, ROOT

OUT = ROOT / "web" / "public" / "detections"
YEARS = range(2012, 2026)


def build(country: str = "Canada", code: str = "CA") -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(config={"threads": DUCKDB_THREADS})
    index = []

    for year in YEARS:
        files = [p for p in RAW.glob(f"*_{year}_{country}.csv")
                 if p.name.lower().startswith(PUBLISHED_SENSORS)]
        if not files:
            continue
        frame = con.sql(f"""
            select acq_date,
                   coalesce(try_cast(acq_time as integer), 0) as hhmm,
                   latitude as lat,
                   longitude as lon,
                   frp,
                   coalesce(brightness, bright_ti4) as bright_4um,
                   case when filename ilike '%viirs%' then 'VIIRS' else 'MODIS' end as sensor,
                   satellite,
                   cast(confidence as varchar) as confidence
            from read_csv([{", ".join(f"'{path}'" for path in files)}],
                          union_by_name=true, filename=true)
            where type = 0
        """).df()
        frame["minutes"] = (frame.hhmm // 100) * 60 + frame.hhmm % 100
        # Only what the 200-row table renders: every published number comes from
        # the cell-day artifacts, so the other raw columns would be dead weight.
        frame = frame[["acq_date", "minutes", "lat", "lon", "frp", "bright_4um",
                       "sensor", "satellite", "confidence"]]

        path = OUT / f"{code}-{year}.parquet"
        frame.to_parquet(path, compression="zstd", index=False)
        index.append({"year": year, "rows": int(len(frame)), "bytes": path.stat().st_size})
        print(f"{year}: {len(frame):>9,} rows  {path.stat().st_size / 1e6:6.1f} MB")

    (OUT / "index.json").write_text(json.dumps({"region": code, "years": index}, indent=2))
    print("total", round(sum(i["bytes"] for i in index) / 1e6, 1), "MB")


if __name__ == "__main__":
    build()

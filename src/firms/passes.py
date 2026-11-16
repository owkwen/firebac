"""Per-pass aggregates for the Timeline page.

Git currently loads the whole raw detection parquet for a year (35 MB) to group passes in
the browser. That grouping does not change per session: a pass is a satellite, a date and a
six-hour bucket. Precompute it once, at cell grain, and the page loads a few MB.

Two files per year:

    passes/{region}-{year}.parquet       one row per pass
    passcells/{region}-{year}.parquet    one row per pass × 0.01° cell

Neither carries individual detections. `show` reads the aggregates; nothing needs the raw
rows except the AOI page's table, which is a different product.
"""

from __future__ import annotations

import json
from pathlib import Path

import duckdb

from .config import DUCKDB_THREADS, PUBLISHED_SENSORS, RAW, ROOT

OUT = ROOT / "web" / "public"
CELL = 0.01
BUCKETS = 4  # 6-hour pass buckets
YEARS = range(2012, 2026)


def build(country: str = "Canada", code: str = "CA") -> None:
    con = duckdb.connect(config={"threads": DUCKDB_THREADS})
    (OUT / "passes").mkdir(parents=True, exist_ok=True)
    (OUT / "passcells").mkdir(parents=True, exist_ok=True)
    index = []

    for year in YEARS:
        files = [
            path for path in RAW.glob(f"*_{year}_{country}.csv")
            if path.name.lower().startswith(PUBLISHED_SENSORS)
        ]
        if not files:
            continue
        source = ", ".join(f"'{path}'" for path in files)

        con.sql(f"""
            create or replace view det as
            select case
                     when satellite = 'Terra' then 'TERRA'
                     when satellite = 'Aqua' then 'AQUA'
                     else 'NPP'
                   end as platform,
                   acq_date,
                   least({BUCKETS - 1}, (cast(acq_time as integer) // 100) / 6)::int as bucket,
                   (cast(acq_time as integer) // 100) * 60 + cast(acq_time as integer) % 100 as minutes,
                   round(latitude / {CELL})::bigint as clat,
                   round(longitude / {CELL})::bigint as clon,
                   frp
            from read_csv([{source}], union_by_name=true)
            where type = 0 and frp > 0
        """)

        con.sql(f"""
            copy (
                select platform, acq_date, bucket,
                       min(minutes)::int as minutes,
                       count(*)::bigint as detections,
                       sum(frp)::double as frp,
                       count(distinct (clat, clon))::bigint as cells,
                       min(clat)::bigint as min_clat, max(clat)::bigint as max_clat,
                       min(clon)::bigint as min_clon, max(clon)::bigint as max_clon
                from det group by 1, 2, 3 order by acq_date desc, minutes
            ) to '{OUT / 'passes' / f'{code}-{year}.parquet'}' (format parquet, compression zstd)
        """)
        con.sql(f"""
            copy (
                select platform, acq_date, bucket, clat, clon,
                       count(*)::bigint as n, sum(frp)::double as frp
                from det group by 1, 2, 3, 4, 5 order by 1, 2, 3, 4, 5
            ) to '{OUT / 'passcells' / f'{code}-{year}.parquet'}' (format parquet, compression zstd)
        """)

        passes = OUT / "passes" / f"{code}-{year}.parquet"
        passcells = OUT / "passcells" / f"{code}-{year}.parquet"
        n_passes = con.sql(f"select count(*) from read_parquet('{passes}')").fetchall()[0][0]
        n_cells = con.sql(f"select count(*) from read_parquet('{passcells}')").fetchall()[0][0]
        index.append({
            "year": year,
            "passes": int(n_passes),
            "pass_cells": int(n_cells),
            "bytes": passes.stat().st_size + passcells.stat().st_size,
        })
        print(f"{year}: {n_passes:>4} passes  {n_cells:>8,} pass-cells  "
              f"{(passes.stat().st_size + passcells.stat().st_size) / 1e6:5.2f} MB")

    (OUT / "passes" / "index.json").write_text(json.dumps({"region": code, "years": index}, indent=2))


if __name__ == "__main__":
    build()

"""Display raster and selection table for the AOI page.

The page used to scan 2 M raw detections on load. Both files here exist so it never has to:

    density/{region}-{year}.json   0.1 deg bins, painted straight to the canvas
    celldays/{region}-{year}.parquet  0.01 deg cell-days, the unit every published
                                      number is made of, small enough to scan per selection
"""

from __future__ import annotations

import json
from pathlib import Path

import duckdb

from .config import DUCKDB_THREADS, PUBLISHED_SENSORS, RAW, ROOT

OUT = ROOT / "web" / "public"
DENSITY_DEG = 0.1
CELL_DEG = 0.01
YEARS = range(2012, 2026)


def build(country: str = "Canada", code: str = "CA") -> None:
    con = duckdb.connect(config={"threads": DUCKDB_THREADS})
    (OUT / "density").mkdir(parents=True, exist_ok=True)
    (OUT / "celldays").mkdir(parents=True, exist_ok=True)
    index = []

    for year in YEARS:
        files = [
            path for path in RAW.glob(f"*_{year}_{country}.csv")
            if path.name.lower().startswith(PUBLISHED_SENSORS)
        ]
        if not files:
            continue
        source = ", ".join(f"'{path}'" for path in files)

        density = con.sql(f"""
            select round(latitude / {DENSITY_DEG})::int as gi,
                   round(longitude / {DENSITY_DEG})::int as gj,
                   count(*) as detections,
                   count(*) filter (where sensor_viirs) as viirs,
                   count(*) filter (where not sensor_viirs) as modis,
                   sum(frp) as frp
            from (
                select latitude, longitude, frp,
                       filename ilike '%viirs%' as sensor_viirs
                from read_csv([{source}], union_by_name=true, filename=true)
                where type = 0 and frp > 0
            )
            group by 1, 2 order by 1, 2
        """).df()
        cells = [
            [round(row.gi * DENSITY_DEG, 2), round(row.gj * DENSITY_DEG, 2),
             int(row.detections), int(row.modis), int(row.viirs), round(float(row.frp), 1)]
            for row in density.itertuples()
        ]
        doc = {
            "schema": "fire-density/1",
            "region": code,
            "year": year,
            "step_deg": DENSITY_DEG,
            "cells": cells,
        }
        density_path = OUT / "density" / f"{code}-{year}.json"
        density_path.write_text(json.dumps(doc, separators=(",", ":")))

        # Written sorted by cell so Parquet row-group statistics can skip a bbox.
        celldays_path = OUT / "celldays" / f"{code}-{year}.parquet"
        con.sql(f"""
            copy (
                select acq_date,
                       round(latitude / {CELL_DEG})::bigint as clat,
                       round(longitude / {CELL_DEG})::bigint as clon,
                       count(*) filter (where not (filename ilike '%viirs%')) as n_modis,
                       count(*) filter (where filename ilike '%viirs%') as n_viirs,
                       sum(frp) as frp
                from read_csv([{source}], union_by_name=true, filename=true)
                where type = 0 and frp > 0
                group by 1, 2, 3 order by 2, 3, 1
            ) to '{celldays_path}' (format parquet, compression zstd)
        """)

        row = con.sql(f"select count(*) from read_parquet('{celldays_path}')").fetchall()[0][0]
        index.append({
            "year": year,
            "cell_days": int(row),
            "density_cells": len(cells),
            "density_bytes": density_path.stat().st_size,
            "celldays_bytes": celldays_path.stat().st_size,
        })
        print(f"{year}: {row:>8,} cell-days  {len(cells):>6,} density cells  "
              f"{density_path.stat().st_size / 1e3:6.0f} KB + {celldays_path.stat().st_size / 1e6:5.1f} MB")

    (OUT / "density" / "index.json").write_text(json.dumps({"region": code, "years": index}, indent=2))


if __name__ == "__main__":
    build()

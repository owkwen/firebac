"""Zoom-level detail for the AOI map: 5° tiles at 0.01°, per year.

The map paints 0.1° bins from `density/` at country scale. Once the view is small enough to
see 0.01° cells, it fetches only the tiles that intersect the viewport — the same idea as a
map tile pyramid, sized for one country instead of the world.

Each cell carries annual totals, not dates: this is a display layer, never a source of
published numbers.
"""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import numpy as np

from .config import DUCKDB_THREADS, PUBLISHED_SENSORS, RAW, ROOT

OUT = ROOT / "web" / "public" / "tiles"
TILE_DEG = 5.0
CELL_DEG = 0.01
YEARS = range(2012, 2026)


def build(country: str = "Canada", code: str = "CA") -> None:
    con = duckdb.connect(config={"threads": DUCKDB_THREADS})
    index: list[dict] = []

    for year in YEARS:
        files = [
            path for path in RAW.glob(f"*_{year}_{country}.csv")
            if path.name.lower().startswith(PUBLISHED_SENSORS)
        ]
        if not files:
            continue
        source = ", ".join(f"'{path}'" for path in files)

        cells = con.sql(f"""
            select round(latitude / {CELL_DEG})::bigint as clat,
                   round(longitude / {CELL_DEG})::bigint as clon,
                   count(distinct acq_date) filter (where not (filename ilike '%viirs%')) as modis_cd,
                   count(distinct acq_date) filter (where filename ilike '%viirs%') as viirs_cd,
                   count(*) filter (where not (filename ilike '%viirs%')) as modis_px,
                   count(*) filter (where filename ilike '%viirs%') as viirs_px
            from read_csv([{source}], union_by_name=true, filename=true)
            where type = 0 and frp > 0
            group by 1, 2
        """).df()

        cells["ti"] = np.floor(cells.clat * CELL_DEG / TILE_DEG).astype(int)
        cells["tj"] = np.floor(cells.clon * CELL_DEG / TILE_DEG).astype(int)

        year_dir = OUT / code / str(year)
        year_dir.mkdir(parents=True, exist_ok=True)
        tiles: list[dict] = []

        for (ti, tj), group in cells.groupby(["ti", "tj"], sort=True):
            rows = [
                [int(r.clat), int(r.clon), int(r.modis_cd), int(r.viirs_cd),
                 int(r.modis_px), int(r.viirs_px)]
                for r in group.itertuples()
            ]
            doc = {
                "schema": "fire-tile/1",
                "year": year,
                "tile": [int(ti), int(tj)],
                "step_deg": CELL_DEG,
                "cells": rows,
            }
            path = year_dir / f"{int(ti)}_{int(tj)}.json"
            path.write_text(json.dumps(doc, separators=(",", ":")))
            tiles.append({
                "tile": [int(ti), int(tj)],
                "cells": len(rows),
                "bytes": path.stat().st_size,
            })

        index.append({"year": year, "tiles": tiles})
        total = sum(t["bytes"] for t in tiles)
        print(f"{year}: {len(tiles):>3} tiles  {total / 1e6:5.2f} MB  {len(cells):>6,} cells")

    (OUT / code).mkdir(parents=True, exist_ok=True)
    (OUT / code / "index.json").write_text(
        json.dumps({"region": code, "step_deg": CELL_DEG, "tile_deg": TILE_DEG, "years": index})
    )
    print("index", (OUT / code / "index.json").stat().st_size, "bytes")


if __name__ == "__main__":
    build()

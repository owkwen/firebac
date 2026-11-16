"""Build the frontend artifacts: calendar, grid, model, hotspot exports.

Every published number is produced here. The browser only reads and aggregates.

Two series are published, because the honest merged record has a sensor boundary:

    modis        cell-days MODIS detected. Continuous 2000-2025, one estimator.
    harmonized   modis + expectation of the cell-days only VIIRS saw, using
                 P(MODIS | VIIRS, multiplicity). Exists from 2012 only.

P is calibrated on 2012-2022 and then held fixed, so 2023-2025 are out of sample.
See private/notebooks/07_multiplicity.ipynb (draft).
"""

from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

from .config import DUCKDB_THREADS, PUBLISHED_SENSORS, RAW, ROOT

ARTIFACTS = ROOT / "web" / "public" / "artifacts"
GRID_DEG = 0.01
MAP_DEG = 0.25
BASELINE = (2012, 2022)
CALIBRATION = (2012, 2022)
MULT_BINS = ("1", "2-3", "4-7", "8+")

# The first three years are published, because the detections are real, but their
# level is not comparable with the rest of the record, so no z or ratio is published.
#   2000  record starts in November
#   2001  Terra-only archive gap: 7,673 detections against 25,620 in Terra-only 2003
#   2002  Aqua joins in July, so the year is half a constellation
NON_COMPARABLE = (2000, 2001, 2002)
NON_COMPARABLE_NOTE = (
    "2000-2002 are not comparable with later years: the record starts in November 2000, "
    "2001 was reprocessed Terra-only (about a third of the 2003 Terra level), and Aqua "
    "joins in July 2002. Their counts and maps are published; z and ratio are withheld."
)

REGIONS = {
    "CA": {"country": "Canada", "name": "Canada"},
    "AR": {"country": "Argentina", "name": "Argentina"},
    "US": {"country": "United_States", "name": "United States"},
}

BIN_SQL = """case when n_viirs = 1 then 1
                 when n_viirs <= 3 then 2
                 when n_viirs <= 7 then 3
                 when n_viirs >= 8 then 4 end"""


def files_for(country: str) -> list[Path]:
    """Published sensors only. A newly downloaded platform must not enter the record
    until the model is recalibrated for it."""
    return sorted(
        path for path in RAW.glob(f"*_{country}.csv")
        if path.name.lower().startswith(PUBLISHED_SENSORS)
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def wilson(hits: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    p = hits / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * (p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5 / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def log_stats(frame: pd.DataFrame, value: str, keys: str) -> pd.DataFrame:
    """Mean and sd of log1p(count) over the baseline, so z reads as a multiplicative
    departure from a typical month rather than from a raw count."""
    return pd.DataFrame({"k": frame[keys], "v": np.log1p(frame[value])}).groupby("k").v.agg(["mean", "std"])


def build(region: str) -> None:
    spec = REGIONS[region]
    country = spec["country"]
    paths = files_for(country)
    if not paths:
        raise SystemExit(f"No CSVs for {country}. Run scripts/download_country.sh first.")

    con = duckdb.connect(config={"threads": DUCKDB_THREADS})
    con.sql(f"""
        create view raw as
        select case when filename ilike '%viirs%' then 'VIIRS' else 'MODIS' end as sensor,
               latitude, longitude, frp, type, acq_date, satellite
        from read_csv([{", ".join(f"'{path}'" for path in paths)}],
                      union_by_name=true, filename=true)
        where type = 0 and frp > 0
    """)
    con.sql(f"""
        create table cd as
        select sensor, satellite,
               round(latitude / {GRID_DEG})::bigint as clat,
               round(longitude / {GRID_DEG})::bigint as clon,
               acq_date, count(*) as n, max(frp) as frp_max
        from raw group by 1, 2, 3, 4, 5
    """)
    con.sql("""
        create table ev as
        select clat, clon, acq_date,
               cast(extract(year from acq_date) as int) as yr,
               cast(month(acq_date) as int) as mo,
               cast(dayofyear(acq_date) as int) as doy,
               coalesce(sum(n) filter (where satellite = 'Terra'), 0) as n_terra,
               coalesce(sum(n) filter (where satellite = 'Aqua'), 0) as n_aqua,
               coalesce(sum(n) filter (where sensor = 'MODIS'), 0) as n_modis,
               coalesce(sum(n) filter (where sensor = 'VIIRS'), 0) as n_viirs,
               coalesce(max(frp_max) filter (where sensor = 'MODIS'), 0) as frp_modis,
               coalesce(max(frp_max) filter (where sensor = 'VIIRS'), 0) as frp_viirs
        from cd group by 1, 2, 3
    """)

    cal = con.sql(f"""
        select {BIN_SQL} as bin, count(*) as events,
               count(*) filter (where n_modis > 0) as hits
        from ev
        where n_viirs > 0 and yr between {CALIBRATION[0]} and {CALIBRATION[1]}
        group by 1 order by 1
    """).df()
    prob = {int(row.bin): float(row.hits / row.events) for row in cal.itertuples()}
    con.sql(f"""
        create table pbin as
        select * from (values
            (1, {prob[1]}), (2, {prob[2]}), (3, {prob[3]}), (4, {prob[4]})
        ) as t(bin, p)
    """)
    con.sql(f"""
        create table harm as
        select ev.*,
               case when n_modis > 0 then 1.0
                    when n_viirs > 0 then pbin.p
                    else 0.0 end as harmonized
        from ev left join pbin on pbin.bin = {BIN_SQL}
    """)

    monthly = con.sql("""
        select yr, mo,
               count(*) filter (where n_modis > 0) as modis,
               count(*) filter (where n_viirs > 0) as viirs,
               sum(harmonized) as harmonized,
               sum(n_modis) as modis_px,
               sum(n_viirs) as viirs_px,
               sum(n_terra) as terra_px,
               sum(n_aqua) as aqua_px,
               count(distinct acq_date) as days
        from harm group by 1, 2 order by 1, 2
    """).df()
    daily = con.sql("""
        select yr, doy,
               count(*) filter (where n_modis > 0) as modis,
               count(*) filter (where n_viirs > 0) as viirs,
               sum(harmonized) as harmonized
        from harm group by 1, 2 order by 1, 2
    """).df()
    grid = con.sql(f"""
        select yr,
               round(clat * {GRID_DEG} / {MAP_DEG})::int as mlat,
               round(clon * {GRID_DEG} / {MAP_DEG})::int as mlon,
               mo,
               count(*) filter (where n_modis > 0) as modis,
               sum(harmonized) as harmonized,
               count(*) filter (where n_viirs > 0) as viirs
        from harm group by 1, 2, 3, 4 order by 1, 2, 3, 4
    """).df()

    years = sorted(monthly.yr.unique().tolist())
    non_comparable = [y for y in years if y in NON_COMPARABLE]
    harmonized_from = 2012

    # Baselines: monthly medians and log1p z, per mode, each over its own closed window.
    modis_base = monthly[(monthly.yr.between(*BASELINE))]
    harm_base = modis_base

    med_m = modis_base.groupby("mo").modis.median()
    med_v = harm_base.groupby("mo").viirs.median()
    med_h = harm_base.groupby("mo").harmonized.median()
    z_stats_m = log_stats(modis_base, "modis", "mo")
    z_stats_v = log_stats(harm_base, "viirs", "mo")
    z_stats_h = log_stats(harm_base, "harmonized", "mo")

    def zscore(value: float, stats: pd.Series) -> float:
        return round((math.log1p(value) - stats["mean"]) / stats["std"], 3)

    cells = []
    for row in monthly.itertuples():
        mo = int(row.mo)
        comparable = int(row.yr) not in NON_COMPARABLE
        harmonized = round(float(row.harmonized), 2)
        cells.append({
            "y": int(row.yr),
            "m": mo,
            "modis": int(row.modis),
            "viirs": int(row.viirs),
            "harmonized": harmonized if row.yr >= harmonized_from else None,
            "modis_px": int(row.modis_px),
            "viirs_px": int(row.viirs_px),
            "terra_px": int(row.terra_px),
            "aqua_px": int(row.aqua_px),
            "days": int(row.days),
            "sparse": bool(row.days <= 2),
            "base": {
                "modis": round(float(med_m.loc[mo]), 2),
                "viirs": round(float(med_v.loc[mo]), 2),
                "harmonized": round(float(med_h.loc[mo]), 2),
            },
            "z": {
                "modis": zscore(float(row.modis), z_stats_m.loc[mo]) if comparable else None,
                "viirs": zscore(float(row.viirs), z_stats_v.loc[mo])
                if comparable and row.yr >= harmonized_from else None,
                "harmonized": zscore(harmonized, z_stats_h.loc[mo])
                if comparable and row.yr >= harmonized_from else None,
            },
            "ratio": {
                "modis": round(float(row.modis) / float(med_m.loc[mo]), 3)
                if comparable and med_m.loc[mo] > 0 else None,
                "viirs": round(float(row.viirs) / float(med_v.loc[mo]), 3)
                if comparable and row.yr >= harmonized_from and med_v.loc[mo] > 0 else None,
                "harmonized": round(harmonized / float(med_h.loc[mo]), 3)
                if comparable and row.yr >= harmonized_from and med_h.loc[mo] > 0 else None,
            },
        })

    # Annual aggregation repeats the same treatment so the cards and the heatmap agree.
    annual_frame = monthly.groupby("yr")[["modis", "viirs", "harmonized"]].sum().reset_index()
    modis_annual_base = annual_frame[annual_frame.yr.between(*BASELINE)]
    harm_annual_base = modis_annual_base
    annual_stats_m = pd.Series(np.log1p(modis_annual_base.modis)).agg(["mean", "std"])
    annual_stats_v = pd.Series(np.log1p(modis_annual_base.viirs)).agg(["mean", "std"])
    annual_stats_h = pd.Series(np.log1p(harm_annual_base.harmonized)).agg(["mean", "std"])
    med_am = float(modis_annual_base.modis.median())
    med_av = float(modis_annual_base.viirs.median())
    med_ah = float(harm_annual_base.harmonized.median())

    platforms: dict[int, set[str]] = {}
    for row in monthly.itertuples():
        seen = platforms.setdefault(int(row.yr), set())
        if row.terra_px > 0:
            seen.add("Terra")
        if row.aqua_px > 0:
            seen.add("Aqua")
        if row.viirs_px > 0:
            seen.add("Suomi NPP")

    annual = []
    for row in annual_frame.itertuples():
        has_h = row.yr >= harmonized_from
        comparable = int(row.yr) not in NON_COMPARABLE
        annual.append({
            "year": int(row.yr),
            "satellites": sorted(platforms[int(row.yr)]),
            "modis": int(row.modis),
            "viirs": int(row.viirs) if has_h else None,
            "harmonized": round(float(row.harmonized), 2) if has_h else None,
            "base": {"modis": round(med_am, 2), "viirs": round(med_av, 2),
                     "harmonized": round(med_ah, 2)},
            "ratio": {
                "modis": round(float(row.modis) / med_am, 3) if comparable else None,
                "viirs": round(float(row.viirs) / med_av, 3) if comparable and has_h else None,
                "harmonized": round(float(row.harmonized) / med_ah, 3) if comparable and has_h else None,
            },
            "z": {
                "modis": zscore(float(row.modis), annual_stats_m) if comparable else None,
                "viirs": zscore(float(row.viirs), annual_stats_v) if comparable and has_h else None,
                "harmonized": zscore(float(row.harmonized), annual_stats_h) if comparable and has_h else None,
            },
        })

    series = []
    for year in years:
        row = daily[daily.yr == year]
        modis = [0.0] * 366
        viirs = [0.0] * 366
        harmonized = [0.0] * 366
        for doy, m, v, h in zip(row.doy, row.modis, row.viirs, row.harmonized):
            modis[int(doy) - 1] = float(m)
            viirs[int(doy) - 1] = float(v)
            harmonized[int(doy) - 1] = round(float(h), 2)
        series.append({
            "year": int(year),
            "modis": modis,
            "viirs": viirs if year >= harmonized_from else None,
            "harmonized": harmonized if year >= harmonized_from else None,
        })

    peak = max((a for a in annual if a["year"] in years and a["year"] not in NON_COMPARABLE),
               key=lambda a: a["ratio"]["modis"])

    payload = {
        "schema": "fire-calendar/2",
        "region": {"code": region, "name": spec["name"]},
        "grid_deg": GRID_DEG,
        "map_deg": MAP_DEG,
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "years": years,
        "months": list(range(1, 13)),
        "modes": ["modis", "viirs", "harmonized"],
        "harmonized_from": harmonized_from,
        "non_comparable_years": non_comparable,
        "non_comparable_note": NON_COMPARABLE_NOTE,
        "constellation": {
            "modis": ["Terra", "Aqua"],
            "terra_from": "2000-11",
            "aqua_from": "2002-07",
            "viirs": ["Suomi NPP"],
            "viirs_from": "2012-01",
            "note": "MODIS is Terra + Aqua merged. The record starts with Terra in November 2000; "
                    "Aqua contributes from July 2002. 2000-2002 are therefore not comparable with "
                    "later years and carry no z or ratio.",
        },
        "harmonized_partial": [y for y in years if y == 2012],
        "baseline": {"start": BASELINE[0], "end": BASELINE[1]},
        "calibration": {"start": CALIBRATION[0], "end": CALIBRATION[1]},
        "peak": {"year": peak["year"], "ratio": peak["ratio"]["modis"]},
        "cells": cells,
        "annual": annual,
        "series": series,
    }

    out = ARTIFACTS
    for sub in ("calendar", f"grid/{region}", "hotspots", "model", "meta"):
        (out / sub).mkdir(parents=True, exist_ok=True)
    (out / "calendar" / f"{region}.json").write_text(json.dumps(payload, separators=(",", ":")))

    for year, frame in grid.groupby("yr"):
        index = frame[["mlat", "mlon"]].drop_duplicates().reset_index(drop=True)
        lookup = {(a, b): i for i, (a, b) in enumerate(index.itertuples(index=False))}
        rows = [
            [lookup[(int(r.mlat), int(r.mlon))], int(r.mo), int(r.modis),
             round(float(r.harmonized), 2), int(r.viirs)]
            for r in frame.itertuples()
        ]
        doc = {
            "schema": "fire-grid/1",
            "region": region,
            "year": int(year),
            "step_deg": MAP_DEG,
            "cells": [[round(a * MAP_DEG, 4), round(b * MAP_DEG, 4)]
                      for a, b in index.itertuples(index=False)],
            "rows": rows,
        }
        (out / "grid" / region / f"{int(year)}.json").write_text(
            json.dumps(doc, separators=(",", ":"))
        )

    for year in years:
        frame = con.sql(f"""
            select acq_date, clat, clon, n_modis, n_viirs, frp_modis, frp_viirs, harmonized
            from harm where yr = {year} order by acq_date, clat, clon
        """).df()
        frame.insert(1, "lat", (frame.clat * GRID_DEG).round(2))
        frame.insert(2, "lon", (frame.clon * GRID_DEG).round(2))
        frame = frame.drop(columns=["clat", "clon"])
        frame.to_csv(out / "hotspots" / f"{region}-{year}.csv.gz", index=False, compression="gzip")

    model = {
        "schema": "fire-model/1",
        "region": region,
        "method": "occupancy",
        "unit": "expected detected 0.01 deg cell-day",
        "reference_sensor": "MODIS",
        "estimate": "P(MODIS present | VIIRS present, multiplicity), calibrated on "
                    f"{CALIBRATION[0]}-{CALIBRATION[1]} and applied unchanged after",
        "multiplicity_bins": [
            {
                "label": label,
                "p": round(prob[i + 1], 8),
                "ci": [round(v, 4) for v in wilson(int(cal.hits[i]), int(cal.events[i]))],
                "events": int(cal.events[i]),
                "correction": round(1 / prob[i + 1], 2),
            }
            for i, label in enumerate(MULT_BINS)
        ],
        "validation": {
            "log_loss_canada_2023": {"frp": 0.6020, "multiplicity": 0.5475, "frp_multiplicity": 0.5400},
            "transfer": "trained on Argentina 2019, tested on Canada 2023",
            "shape": "the curve is region-invariant; the level depends on the matching unit",
            "ece": 0.0396,
        },
        "caveats": [
            "The target is a 0.01 deg co-location indicator, not a detection probability.",
            "A 3x3 matching neighbourhood raises the level (0.288 to 0.684 in Canada 2023).",
            "Landscape is not normalised away; the shape transfers, the level is calibrated per region.",
            "No single correction factor: r falls from about 7.3 to 1.5 as multiplicity rises.",
            "Geometric covariates (footprint, solar zenith) add almost nothing once multiplicity is known.",
        ],
        "generated_utc": payload["generated_utc"],
    }
    (out / "model" / f"{region}.json").write_text(json.dumps(model, indent=2))

    inputs = []
    for path in paths:
        rows = con.sql(f"select count(*) from read_csv('{path}', union_by_name=true)").fetchall()[0][0]
        inputs.append({"file": path.name, "bytes": path.stat().st_size, "rows": int(rows),
                       "sha256": sha256(path)})
    meta = {
        "schema": "fire-meta/1",
        "generated_utc": payload["generated_utc"],
        "region": region,
        "grid_deg": GRID_DEG,
        "map_deg": MAP_DEG,
        "rows": {
            "detections": int(sum(i["rows"] for i in inputs)),
            "cell_days": int(con.sql("select count(*) from ev").fetchall()[0][0]),
        },
        "inputs": inputs,
        "software": {"duckdb": duckdb.__version__, "pandas": pd.__version__},
    }
    (out / "meta" / f"{region}.json").write_text(json.dumps(meta, indent=2))

    index = []
    for path in sorted((out / "calendar").glob("*.json")):
        doc = json.loads(path.read_text())
        index.append({"code": doc["region"]["code"], "name": doc["region"]["name"]})
    (out / "regions.json").write_text(json.dumps(index, indent=2))

    print(f"{region}: {len(years)} years, {len(cells)} year-months, {len(grid)} map rows")
    print(pd.DataFrame(model["multiplicity_bins"]).to_string(index=False))
    scale = [a["harmonized"] / a["modis"] for a in annual if a["harmonized"]]
    print(f"harmonized / modis: {min(scale):.2f}-{max(scale):.2f} (n={len(scale)} years)")
    print(f"peak year: {peak['year']} at {peak['ratio']['modis']:.1f}x the baseline median")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--region", default="CA", choices=sorted(REGIONS))
    build(parser.parse_args().region)

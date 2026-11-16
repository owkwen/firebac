"""Visual diagnostic report. One self-contained HTML, no server.

    uv run python -m firms.inspect            # writes private/figures/inspect.html
    uv run python -m firms.inspect --raw DIR --out FILE

Three panels:
  1. Columns   - 4um and 11um brightness distributions, co-located scatter,
                 and a quantile map (MODIS brightness -> VIIRS I4).
  2. Confidence- MODIS 0-100 histogram, VIIRS l/n/h bars, live threshold
                 sliders that recompute counts and the high-confidence ratio.
  3. Footprints- scan x track per sensor, footprint area, detections per
                 0.01 deg cell, and a zoomed lon/lat map.

Plotly is loaded from a CDN; the file itself contains only data.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from .config import FIGURES, RAW
from .io import cell_keys, load, sensor_of

GRID = 0.01
JOIN_WINDOW_MIN = 30
MAX_POINTS = 20000


def _num(x):
    if x is None:
        return None
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.floating,)):
        return float(x)
    return x


def _hist(values, bins=60, lo=None, hi=None):
    v = pd.to_numeric(pd.Series(values), errors="coerce").dropna()
    if v.empty:
        return {"x": [], "y": []}
    counts, edges = np.histogram(
        v.to_numpy(), bins=bins, range=(lo, hi) if lo is not None and hi is not None else None
    )
    centers = (edges[:-1] + edges[1:]) / 2
    return {"x": [_num(c) for c in centers], "y": [int(c) for c in counts]}


def _sample(df: pd.DataFrame, n: int = MAX_POINTS) -> pd.DataFrame:
    return df.sample(n, random_state=0) if len(df) > n else df


def _load(raw: Path, sensor: str, country: str | None = None) -> pd.DataFrame | None:
    files = [
        path
        for path in sorted(raw.glob("*.csv"))
        if sensor_of(path) == sensor
        and (country is None or path.stem.endswith(f"_{country}"))
    ]
    if not files:
        return None
    return pd.concat([load(p) for p in files], ignore_index=True)


def build(raw: Path, country: str | None = None) -> dict:
    modis = _load(raw, "MODIS", country)
    viirs = _load(raw, "VIIRS", country)
    if modis is None and viirs is None:
        raise SystemExit(f"No CSVs in {raw}. Run `make fetch` first.")

    payload: dict = {
        "meta": {
            "modis_rows": int(len(modis)) if modis is not None else 0,
            "viirs_rows": int(len(viirs)) if viirs is not None else 0,
            "files": sorted(p.name for p in raw.glob("*.csv")),
            "grid_deg": GRID,
            "join_window_min": JOIN_WINDOW_MIN,
        }
    }

    # ---- 1. columns -------------------------------------------------------
    hist = {}
    for col in ("brightness", "bright_t31", "bright_ti4", "bright_ti5", "frp"):
        for label, frame in (("modis", modis), ("viirs", viirs)):
            if frame is not None and col in frame.columns:
                hist[f"{label}:{col}"] = _hist(frame[col], bins=70)
    payload["hist"] = hist

    scatter = {"n": 0, "m": [], "v": [], "censored": 0, "qmap": {"m": [], "v": []}}
    if modis is not None and viirs is not None:
        m = modis.assign(cell=cell_keys(modis, GRID))
        v = viirs.assign(cell=cell_keys(viirs, GRID))
        left = m[["cell", "acq_date", "minutes", "brightness", "bright_t31", "confidence"]]
        right = v[["cell", "acq_date", "minutes", "bright_ti4", "bright_ti5", "confidence"]]
        joined = left.merge(right, on=["cell", "acq_date"], suffixes=("_m", "_v"))
        joined["dt"] = (joined["minutes_m"] - joined["minutes_v"]).abs()
        joined = joined[joined["dt"] <= JOIN_WINDOW_MIN]

        pairs = joined[["brightness", "bright_ti4"]].apply(
            pd.to_numeric, errors="coerce"
        ).dropna()
        if not pairs.empty:
            ceiling = pairs["bright_ti4"] >= 366.9
            scatter["censored"] = int(ceiling.sum())
            unsaturated = pairs[~ceiling]
            if not unsaturated.empty:
                q = np.linspace(0, 1, 101)
                scatter["qmap"] = {
                    "m": [float(x) for x in np.quantile(unsaturated["brightness"], q)],
                    "v": [float(x) for x in np.quantile(unsaturated["bright_ti4"], q)],
                }
                take = _sample(unsaturated)
                scatter["m"] = [float(x) for x in take["brightness"]]
                scatter["v"] = [float(x) for x in take["bright_ti4"]]
                scatter["n"] = int(len(take))

        # 11 um pair, for completeness
        pairs11 = joined[["bright_t31", "bright_ti5"]].apply(
            pd.to_numeric, errors="coerce"
        ).dropna()
        if not pairs11.empty:
            take11 = _sample(pairs11)
            scatter["m11"] = [float(x) for x in take11["bright_t31"]]
            scatter["v11"] = [float(x) for x in take11["bright_ti5"]]
            scatter["n11"] = int(len(take11))

    payload["scatter"] = scatter

    # ---- 2. confidence ----------------------------------------------------
    conf: dict = {"modis_hist": [0] * 101, "viirs": {}, "modis_n": 0, "viirs_n": 0}
    if modis is not None and "confidence" in modis.columns:
        numeric = pd.to_numeric(modis["confidence"], errors="coerce").dropna()
        counts, _ = np.histogram(numeric, bins=100, range=(0, 100))
        conf["modis_hist"] = [int(c) for c in counts]
        conf["modis_n"] = int(len(numeric))
    if viirs is not None and "confidence" in viirs.columns:
        values = viirs["confidence"].astype("string").str.lower()
        conf["viirs"] = {k: int(v) for k, v in values.value_counts().items()}
        conf["viirs_n"] = int(len(values))
    payload["conf"] = conf

    # ---- 3. footprints and grid ------------------------------------------
    foot: dict = {"medians": {}, "cells": {}}
    for label, frame in (("modis", modis), ("viirs", viirs)):
        if frame is None or "scan" not in frame.columns:
            continue
        scan = pd.to_numeric(frame["scan"], errors="coerce")
        track = pd.to_numeric(frame["track"], errors="coerce")
        area = (scan * track).dropna()
        take = _sample(frame[["scan", "track"]].assign(area=scan * track).dropna())
        foot[label] = {
            "scan": [float(x) for x in take["scan"]],
            "track": [float(x) for x in take["track"]],
            "area_hist": _hist(area, bins=50),
        }
        foot["medians"][label] = {
            "scan_km": float(scan.median()),
            "track_km": float(track.median()),
            "area_km2": float(area.median()),
        }
        cells = frame.assign(cell=cell_keys(frame, GRID)).groupby("cell").size()
        foot["cells"][label] = {
            "p50": int(cells.median()) if len(cells) else 0,
            "p90": int(cells.quantile(0.9)) if len(cells) else 0,
            "max": int(cells.max()) if len(cells) else 0,
            "n_cells": int(len(cells)),
        }
        take = _sample(frame[["longitude", "latitude"]], 4000)
        foot[f"{label}_map"] = {
            "lon": [float(x) for x in take["longitude"]],
            "lat": [float(x) for x in take["latitude"]],
        }
    payload["foot"] = foot

    return payload


TEMPLATE = """<!doctype html>
<html><head><meta charset="utf-8"><title>FIRMS diagnostic</title>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
<style>
 body{font:14px/1.5 system-ui,sans-serif;margin:0;background:#0f1115;color:#e7e9ee}
 header{padding:16px 24px;border-bottom:1px solid #232733}
 main{padding:16px 24px;max-width:1200px}
 section{margin:0 0 40px}
 h2{font-size:16px;margin:0 0 4px} .sub{color:#8b93a7;margin:0 0 12px}
 .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
 .card{background:#161a22;border:1px solid #232733;border-radius:8px;padding:8px}
 .full{grid-column:1/-1}
 .controls{display:flex;gap:24px;align-items:center;margin:8px 0 12px;flex-wrap:wrap}
 label{color:#8b93a7} input[type=range]{width:220px}
 code{background:#232733;padding:2px 6px;border-radius:4px}
 .warn{color:#f0b46a}
</style></head><body>
<header><strong>FIRMS diagnostic</strong> &nbsp;<span id="meta" class="sub"></span></header>
<main>

<section>
 <h2>1. Columns</h2>
 <p class="sub">Different channels, not variants: pair <code>brightness</code> with <code>bright_ti4</code>, and <code>bright_t31</code> with <code>bright_ti5</code>.</p>
 <div class="grid">
  <div class="card"><div id="h4"></div></div>
  <div class="card"><div id="h11"></div></div>
  <div class="card"><div id="scatter"></div></div>
  <div class="card"><div id="qmap"></div></div>
 </div>
</section>

<section>
 <h2>2. Confidence</h2>
 <p class="sub">VIIRS is <code>l</code>/<code>n</code>/<code>h</code> = low / nominal / high. Move the thresholds to see what a MODIS split implies.</p>
 <div class="controls">
  <label>low below <input id="lo" type="range" min="0" max="100" value="30" step="1"> <span id="lov">30</span></label>
  <label>high from <input id="hi" type="range" min="0" max="100" value="80" step="1"> <span id="hiv">80</span></label>
 </div>
 <div class="grid">
  <div class="card"><div id="cmodis"></div></div>
  <div class="card"><div id="cviirs"></div></div>
  <div class="card full"><div id="ctable"></div></div>
 </div>
</section>

<section>
 <h2>3. Footprints and grid</h2>
 <p class="sub">Each detection carries its own <code>scan</code> &times; <code>track</code> footprint in km. There is no fixed lattice to nest.</p>
 <div class="grid">
  <div class="card"><div id="fscan"></div></div>
  <div class="card"><div id="farea"></div></div>
  <div class="card"><div id="fcells"></div></div>
  <div class="card"><div id="fmap"></div></div>
 </div>
</section>

</main>
<script>
const P = %%PAYLOAD%%;
const F = {margins:{l:50,r:20,t:40,b:40}, paper_bgcolor:'#161a22', plot_bgcolor:'#161a22',
           font:{color:'#e7e9ee',size:11}, showlegend:true, legend:{orientation:'h'}};
const cfg = {displayModeBar:false, responsive:true};
document.getElementById('meta').textContent =
  `${P.meta.modis_rows.toLocaleString()} MODIS · ${P.meta.viirs_rows.toLocaleString()} VIIRS · grid ${P.meta.grid_deg}° · join ±${P.meta.join_window_min} min`;

function draw(id, traces, layout){ Plotly.newPlot(id, traces, Object.assign({}, F, layout), cfg); }
function tone(id){ return document.getElementById(id); }

const h = P.hist;
draw('h4', [
 {x:(h['modis:brightness']||{}).x, y:(h['modis:brightness']||{}).y, type:'bar', name:'MODIS brightness (~4µm)', marker:{color:'#5b8ff9'}},
 {x:(h['viirs:bright_ti4']||{}).x, y:(h['viirs:bright_ti4']||{}).y, type:'bar', name:'VIIRS bright_ti4', marker:{color:'#f6a04d'}, opacity:.6}
], {barmode:'overlay', title:'4 µm brightness temperature (K)'});

draw('h11', [
 {x:(h['modis:bright_t31']||{}).x, y:(h['modis:bright_t31']||{}).y, type:'bar', name:'MODIS bright_t31 (~11µm)', marker:{color:'#5b8ff9'}},
 {x:(h['viirs:bright_ti5']||{}).x, y:(h['viirs:bright_ti5']||{}).y, type:'bar', name:'VIIRS bright_ti5', marker:{color:'#f6a04d'}, opacity:.6}
], {barmode:'overlay', title:'11 µm brightness temperature (K)'});

const S = P.scatter;
const scatterTraces = [];
if (S.m.length) {
  scatterTraces.push({x:S.m, y:S.v, mode:'markers', type:'scattergl', name:'co-located', marker:{size:3, color:'#5b8ff9', opacity:.35}});
  scatterTraces.push({x:[Math.min(...S.m), Math.max(...S.m)], y:[367,367], mode:'lines', name:'VIIRS I4 ceiling', line:{color:'#f0b46a', dash:'dash'}});
}
draw('scatter', scatterTraces,
  {title:`Co-located pairs (${S.n.toLocaleString()}, ${S.censored} censored)`, xaxis:{title:'MODIS brightness K'}, yaxis:{title:'VIIRS bright_ti4 K'}});

draw('qmap', [
 {x:S.qmap.m, y:S.qmap.v, mode:'lines+markers', name:'quantile map', line:{color:'#63d2a6'}}
], {title:'Quantile map (unsaturated pairs)', xaxis:{title:'MODIS brightness K'}, yaxis:{title:'VIIRS bright_ti4 K'}});

const C = P.conf;
draw('cmodis', [{x:[...Array(101).keys()], y:C.modis_hist, type:'bar', name:'MODIS', marker:{color:'#5b8ff9'}}],
  {title:'MODIS confidence (0–100)', xaxis:{title:'confidence'}, yaxis:{title:'rows'}, bargap:0});

const vk = Object.keys(C.viirs);
draw('cviirs', [{x:vk, y:vk.map(k=>C.viirs[k]), type:'bar', name:'VIIRS', marker:{color:'#f6a04d'}}],
  {title:'VIIRS confidence (l / n / h)', yaxis:{title:'rows'}});

function updateConf(){
  const lo = +tone('lo').value, hi = +tone('hi').value;
  tone('lov').textContent = lo; tone('hiv').textContent = hi;
  let low=0, nom=0, high=0;
  for(let i=0;i<=100;i++){ const c=C.modis_hist[i]||0;
    if(i<lo) low+=c; else if(i>=hi) high+=c; else nom+=c; }
  const mN = low+nom+high || 1;
  const vN = C.viirs_n || 1;
  const rows = [
    ['MODIS low / nominal / high', low, nom, high, (high/mN*100).toFixed(1)+'%'],
    ['VIIRS low / nominal / high', C.viirs.l||0, C.viirs.n||0, C.viirs.h||0, ((C.viirs.h||0)/vN*100).toFixed(1)+'%']
  ];
  const html = '<table style="width:100%;border-collapse:collapse">'
    + '<tr><th align="left">scheme</th><th>low</th><th>nominal</th><th>high</th><th>high share</th></tr>'
    + rows.map(r=>`<tr><td>${r[0]}</td><td align="right">${r[1].toLocaleString()}</td><td align="right">${r[2].toLocaleString()}</td><td align="right">${r[3].toLocaleString()}</td><td align="right">${r[4]}</td></tr>`).join('')
    + '</table>';
  tone('ctable').innerHTML = html;
}
tone('lo').addEventListener('input', updateConf);
tone('hi').addEventListener('input', updateConf);
updateConf();

const D = P.foot;
draw('fscan', [
 {x:(D.modis||{}).scan, y:(D.modis||{}).track, mode:'markers', type:'scattergl', name:'MODIS', marker:{size:3,color:'#5b8ff9',opacity:.3}},
 {x:(D.viirs||{}).scan, y:(D.viirs||{}).track, mode:'markers', type:'scattergl', name:'VIIRS', marker:{size:3,color:'#f6a04d',opacity:.3}}
], {title:'Footprint scan × track (km)', xaxis:{title:'scan km'}, yaxis:{title:'track km'}});

draw('farea', [
 {x:(D.modis||{}).area_hist.x, y:(D.modis||{}).area_hist.y, type:'bar', name:'MODIS', marker:{color:'#5b8ff9'}},
 {x:(D.viirs||{}).area_hist.x, y:(D.viirs||{}).area_hist.y, type:'bar', name:'VIIRS', marker:{color:'#f6a04d'}, opacity:.6}
], {barmode:'overlay', title:'Footprint area (km²)'});

draw('fcells', [
 {x:['p50','p90','max'], y:[D.cells.modis.p50, D.cells.modis.p90, D.cells.modis.max], type:'bar', name:'MODIS', marker:{color:'#5b8ff9'}},
 {x:['p50','p90','max'], y:[D.cells.viirs.p50, D.cells.viirs.p90, D.cells.viirs.max], type:'bar', name:'VIIRS', marker:{color:'#f6a04d'}, opacity:.7}
], {barmode:'group', title:'Detections per 0.01° cell'});

draw('fmap', [
 {x:(D.modis_map||{}).lon, y:(D.modis_map||{}).lat, mode:'markers', type:'scattergl', name:'MODIS', marker:{size:3,color:'#5b8ff9',opacity:.4}},
 {x:(D.viirs_map||{}).lon, y:(D.viirs_map||{}).lat, mode:'markers', type:'scattergl', name:'VIIRS', marker:{size:2,color:'#f6a04d',opacity:.3}}
], {title:'Detections (lon/lat)', xaxis:{title:'lon'}, yaxis:{title:'lat', scaleanchor:'x', scaleratio:1}});
</script></body></html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=RAW)
    parser.add_argument("--out", type=Path, default=FIGURES / "inspect.html")
    parser.add_argument("--country", default=None, help="e.g. Argentina, Canada, United_States")
    args = parser.parse_args()

    payload = build(args.raw, args.country)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    html = TEMPLATE.replace("%%PAYLOAD%%", json.dumps(payload, allow_nan=True))
    args.out.write_text(html, encoding="utf-8")
    print(f"wrote {args.out}  ({args.out.stat().st_size / 1e6:.2f} MB)")
    print(f"open: file://{args.out.resolve()}")


if __name__ == "__main__":
    main()

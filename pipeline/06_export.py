"""Paso 6 — Export v1/ según docs/data-contract.md (sección 2).

Salida: data/processed/export/v1/
  meta.json
  globe/{YYYY-MM}.json                 [[h3_r3, n], ...]
  fire/cal/{h3_r2}.json                months + cells{h3_r5: {m, clim, lc}}
  fire/daily/{h3_r2}.json              epoch 2000-01-01, cells{h3_r5: {d: [[día, n], ...]}}
  fire/points/{h3_r2}/{YYYY}.csv.gz    solo shards con focos en Argentina (D5)
  risk/{h3_r2}.json                    nivel historial (D7)

JSON compacto sin compresión (R2 lo sirve con Content-Encoding gzip); los
tamaños se reportan comprimidos con gzip nivel 6 en export/sizes.json.

Uso:  python pipeline/06_export.py [--skip-points]
"""

from __future__ import annotations

import argparse
import gzip
import json
import shutil
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq

from common import PROCESSED, REPO, Timer, connect

AGG = PROCESSED / "agg"
OUT = PROCESSED / "export" / "v1"
FIXTURE_META = REPO / "fixtures" / "meta.json"
METRICS = REPO / "docs" / "validation" / "metrics.json"
SIZES: dict[str, list[int]] = {}


def hexs(a) -> list[str]:
    return [format(int(x), "x") for x in a]


def write_json(path: Path, obj, kind: str):
    raw = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    SIZES.setdefault(kind, []).append(len(gzip.compress(raw, 6)))


def r1(x: float) -> float:
    return float(round(float(x), 1))


def groups(keys: np.ndarray):
    """Rangos [i, j) de valores iguales consecutivos en un arreglo ordenado."""
    if len(keys) == 0:
        return
    cut = np.flatnonzero(keys[1:] != keys[:-1]) + 1
    starts = np.concatenate(([0], cut))
    ends = np.concatenate((cut, [len(keys)]))
    yield from zip(starts, ends)


def export_meta(info: dict):
    meta = json.loads(FIXTURE_META.read_text())
    m = json.loads(METRICS.read_text())
    meta["generated_at"] = info["generated_at"]
    meta["range"] = {"start": info["first_month"], "end": info["last_month"]}
    meta["baseline"] = {"start": "2003-01", "end": "2022-12"}
    meta["h3"] = {"globe": 3, "panel": 5, "shard": 2, "cache": 6}
    meta["harmonization"] = {
        "unit": "VIIRS_NOAA20",
        "method": "log(VIIRS+1) = a + b*log(MODIS+1), strata = latitude band 10deg x month, "
                  "total-preserving factor per stratum",
        "overlap": [m["train"][0], "2025-12"],
        "holdout": m["holdout"],
        "validation": {"r2": m["r2"], "bias_pct": m["bias_pct"], "r2_cells_day": m["r2_cells_day"]},
    }
    meta["low_confidence_periods"] = [["2000-11", "2012-01"]]
    meta["sp_until"] = info.get("sp_until", {
        "MODIS": info["last_day"], "VIIRS_SNPP": info["last_day"], "VIIRS_NOAA20": info["last_day"]})
    # semaphore: tal cual el fixture (D9)
    write_json(OUT / "meta.json", meta, "meta")


def export_globe():
    t = pq.read_table(AGG / "globe_r3.parquet").to_pandas()
    for month, g in t.groupby("month", sort=True):
        cells = [[h, r1(n)] for h, n in zip(g["h3"], g["n"])]
        write_json(OUT / "globe" / f"{month}.json", {"month": month, "cells": cells}, "globe")
    return t["month"].nunique()


def export_cal(info: dict):
    first = np.datetime64(info["first_month"], "M")
    last = np.datetime64(info["last_month"], "M")
    months = [str(m) for m in np.arange(first, last + np.timedelta64(1, "M"))]
    nm = len(months)

    mt = pq.read_table(AGG / "monthly_r5.parquet")
    shard = mt["shard"].to_numpy(); cell = mt["cell"].to_numpy()
    mi = mt["mi"].to_numpy(); n = mt["n"].to_numpy()

    ct = pq.read_table(AGG / "clim_r5.parquet")
    c_cell = ct["cell"].to_numpy(); c_week = ct["week"].to_numpy(); c_frac = ct["frac"].to_numpy()
    order = np.argsort(c_cell, kind="stable")
    c_cell, c_week, c_frac = c_cell[order], c_week[order], c_frac[order]

    def clim_for(cells_u: np.ndarray) -> np.ndarray:
        out = np.zeros((len(cells_u), 52), dtype=np.float64)
        lo = np.searchsorted(c_cell, cells_u, "left")
        hi = np.searchsorted(c_cell, cells_u, "right")
        for k, (a, b) in enumerate(zip(lo, hi)):
            if b > a:
                out[k, c_week[a:b] - 1] = c_frac[a:b]
        return out

    count = 0
    for i, j in groups(shard):
        cs = cell[i:j]
        cells_u, inv = np.unique(cs, return_inverse=True)
        dense = np.zeros((len(cells_u), nm), dtype=np.float64)
        dense[inv, mi[i:j]] = n[i:j]
        dense = np.round(dense, 1)
        clim = np.round(clim_for(cells_u), 2)
        obj = {
            "shard": format(int(shard[i]), "x"),
            "months": months,
            "cells": {h: {"m": dense[k].tolist(), "clim": clim[k].tolist(), "lc": None}
                      for k, h in enumerate(hexs(cells_u))},
        }
        write_json(OUT / "fire" / "cal" / f"{obj['shard']}.json", obj, "fire/cal")
        count += 1
    return count


def export_daily():
    count = 0
    for bucket_dir in sorted((AGG / "daily_r5").glob("bucket=*")):
        t = pq.read_table(bucket_dir)
        shard = t["shard"].to_numpy(); cell = t["cell"].to_numpy()
        day = t["day"].to_numpy().astype(np.int64); n = t["n"].to_numpy()
        order = np.lexsort((day, cell, shard))
        shard, cell, day, n = shard[order], cell[order], day[order], n[order]
        for i, j in groups(shard):
            cells = {}
            for a, b in groups(cell[i:j]):
                a += i; b += i
                cells[format(int(cell[a]), "x")] = {
                    "d": [[int(dd), r1(v)] for dd, v in zip(day[a:b], n[a:b])]}
            sh = format(int(shard[i]), "x")
            write_json(OUT / "fire" / "daily" / f"{sh}.json",
                       {"shard": sh, "epoch": "2000-01-01", "cells": cells}, "fire/daily")
            count += 1
    return count


def export_risk(info: dict):
    t = pq.read_table(AGG / "risk_r5.parquet").to_pandas()
    gen = info["generated_at"]
    count = 0
    for sh, g in t.groupby("shard", sort=True):
        cells = {}
        for row in g.itertuples(index=False):
            cells[format(int(row.cell), "x")] = {
                "p": float(row.p), "clim": float(row.clim),
                "ratio": None if row.ratio is None or np.isnan(row.ratio) else float(row.ratio),
                "cat": row.cat, "level": "historial", "model_version": "clim-persist-0.1",
                "reasons": list(row.reasons),
            }
        shx = format(int(sh), "x")
        write_json(OUT / "risk" / f"{shx}.json", {"generated_at": gen, "horizon_days": 7, "cells": cells}, "risk")
        count += 1
    return count


def export_points():
    """Focos crudos filtrados de Argentina, un CSV.gz por shard × año (D5)."""
    con = connect()
    tmp = OUT / "fire" / "_points_tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    con.sql(f"""
        COPY (
            SELECT
                strftime(acq_datetime, '%Y-%m-%d') AS acq_date,
                strftime(acq_datetime, '%H%M')     AS acq_time,
                round(lat, 4) AS lat, round(lon, 4) AS lon,
                sensor, satellite, frp,
                confidence_norm AS confidence, daynight,
                h3_h3_to_string(h3_r5) AS h3_r5,
                h3_h3_to_string(h3_r2) AS shard,
                year
            FROM read_parquet('{PROCESSED}/hotspots_h3/*/*/data.parquet', hive_partitioning = true)
            WHERE country = 'Argentina'
            ORDER BY shard, year, acq_datetime
        ) TO '{tmp}' (FORMAT csv, HEADER, COMPRESSION gzip, PARTITION_BY (shard, year))
    """)
    count = 0
    for f in tmp.glob("shard=*/year=*/*.csv.gz"):
        sh = f.parent.parent.name.split("=")[1]
        yr = f.parent.name.split("=")[1]
        dest = OUT / "fire" / "points" / sh / f"{yr}.csv.gz"
        dest.parent.mkdir(parents=True, exist_ok=True)
        f.replace(dest)
        SIZES.setdefault("fire/points", []).append(dest.stat().st_size)
        count += 1
    shutil.rmtree(tmp, ignore_errors=True)
    return count


def size_report():
    rep = {}
    for kind, v in SIZES.items():
        a = np.array(v)
        rep[kind] = {"files": int(len(a)), "p50_kb": round(float(np.percentile(a, 50)) / 1024, 1),
                     "p95_kb": round(float(np.percentile(a, 95)) / 1024, 1),
                     "max_kb": round(float(a.max()) / 1024, 1),
                     "total_mb": round(float(a.sum()) / 1024 / 1024, 1)}
    (OUT.parent / "sizes.json").write_text(json.dumps(rep, indent=2))
    return rep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-points", action="store_true")
    args = ap.parse_args()
    info = json.loads((AGG / "info.json").read_text())
    sp_file = PROCESSED / "sp_until.json"
    if sp_file.exists():
        info["sp_until"] = json.loads(sp_file.read_text())

    for sub in ("globe", "fire/cal", "fire/daily", "risk") + (() if args.skip_points else ("fire/points",)):
        shutil.rmtree(OUT / sub, ignore_errors=True)

    with Timer("meta"):
        export_meta(info)
    with Timer("globe"):
        print("   meses:", export_globe())
    with Timer("fire/cal"):
        print("   shards:", export_cal(info))
    with Timer("fire/daily"):
        print("   shards:", export_daily())
    with Timer("risk"):
        print("   shards:", export_risk(info))
    if not args.skip_points:
        with Timer("fire/points"):
            print("   archivos:", export_points())
    print(json.dumps(size_report(), indent=2))


if __name__ == "__main__":
    main()

"""Predict 7-day fire probability for every Argentina res-5 cell and
write risk/{h3_r2}.json shards in the contract shape (section 2.6).

Inputs:
  - model/fire_risk/model.txt (LightGBM, ar-lgbm-0.1)
  - fires: last 30 days from the FIRMS area API (VIIRS NRT + SP);
    the 365-day lookback uses the Parquet, which ends 2025-12-31 —
    Jan-Oct 2026 fires are missing from that feature (documented gap)
  - POWER: existing parquet (through 2026-11-12; recent enough)
  - clim: share of 2012-2025 years with fire in this week-of-year
"""

import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from io import StringIO
from pathlib import Path

import h3
import lightgbm as lgb
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from scipy.ndimage import maximum_filter1d
from scipy.sparse import csr_matrix
from scipy.spatial import cKDTree

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)

ROOT = Path(__file__).resolve().parents[2]
FIRES_PQ = ROOT / "data/processed/model_input/fires_ar_r5_daily.parquet"
POWER_PQ = ROOT / "data/processed/model_input/power_ar_daily.parquet"
CELLS_JSON = ROOT / "data/geo/argentina_r5.json"
MODEL = ROOT / "model/fire_risk/model.txt"
OUT_DIR = ROOT / "data/processed/risk"

AR_BBOX = "-74,-56.5,-52.5,-21"
FIRMS_SOURCES = ["VIIRS_NOAA20_NRT", "VIIRS_SNPP_NRT", "VIIRS_NOAA21_NRT",
                 "VIIRS_SNPP_SP", "VIIRS_NOAA20_SP", "VIIRS_NOAA21_SP"]
MODEL_VERSION = "ar-lgbm-0.1"
FEATURES = ["fires_7d", "fires_30d", "fires_365d", "neigh_fires_30d",
            "woy_sin", "woy_cos", "lat", "lon", "clim",
            "t2m_max_mean_7d", "rh2m_mean_7d", "ws2m_max_7d",
            "rain_7d", "rain_30d", "rain_90d", "days_since_rain"]


def firms_csv(source, day_range, start, key):
    url = (f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/"
           f"{key}/{source}/{AR_BBOX}/{day_range}/{start}")
    req = urllib.request.Request(url, headers={"User-Agent": "risk/0.1"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode()
    except Exception:
        return []
    if "latitude" not in body.split("\n", 1)[0]:
        return []
    df = pd.read_csv(StringIO(body))
    if "confidence" in df.columns:
        df = df[df["confidence"].astype(str).str[0].isin(
            ["n", "h", "N", "H"])]
        conf_num = pd.to_numeric(df["confidence"], errors="coerce")
        df = df[(df["confidence"].astype(str).str[0].str.isalpha())
                | (conf_num >= 30)]
    out = []
    for row in df.itertuples():
        try:
            d = date.fromisoformat(str(row.acq_date))
        except Exception:
            continue
        out.append((float(row.latitude), float(row.longitude), d))
    return out


def fetch_fires(key, today):
    """Last 30 days of VIIRS fires in Argentina -> cell -> set of days."""
    jobs = []
    for src in FIRMS_SOURCES:
        for k in range(6):
            end = today - timedelta(days=5 * k)
            start = end - timedelta(days=4)
            jobs.append((src, 5, str(start)))
    pts = []
    with ThreadPoolExecutor(8) as ex:
        futs = {ex.submit(firms_csv, s, dr, st, key): (s, st)
                for s, dr, st in jobs}
        for f in as_completed(futs):
            pts.extend(f.result())
    cell_days = {}
    for la, lo, d in pts:
        try:
            c = h3.latlng_to_cell(la, lo, 5)
        except Exception:
            continue
        cell_days.setdefault(c, set()).add(d)
    return cell_days


def categorize(p, clim):
    """ratio thresholds; when clim < 0.01, cat comes from p alone."""
    if clim >= 0.01:
        ratio = p / clim
        return (round(ratio, 2),
                "muy_alto" if ratio > 3 else
                "alto" if ratio > 1.5 else
                "moderado" if ratio >= 0.75 else "bajo")
    return (None,
            "muy_alto" if p >= 0.30 else
            "alto" if p >= 0.15 else
            "moderado" if p >= 0.05 else "bajo")


def reason_phrases(top_feats, row):
    """Top SHAP features -> neutral Spanish phrases."""
    out = []
    for f in top_feats:
        v = row.get(f)
        if f == "days_since_rain" and v and v >= 3:
            out.append(f"{int(v)} días sin lluvia")
        elif f == "rh2m_mean_7d" and v is not None and v < 55:
            out.append(f"humedad relativa {int(v)} %")
        elif f == "neigh_fires_30d" and v and v > 0:
            out.append("focos en las celdas vecinas")
        elif f in ("fires_7d", "fires_30d") and v and v > 0:
            out.append("focos recientes en la celda")
        elif f in ("woy_sin", "woy_cos", "clim"):
            if f == "clim" and v is not None:
                if v >= 0.15:
                    out.append("temporada de quemas")
            else:
                out.append("temporada de quemas")
        elif f == "t2m_max_mean_7d" and v is not None and v > 30:
            out.append(f"calor de los últimos días ({int(v)} °C)")
        elif f in ("rain_7d", "rain_30d") and v is not None and v < 5:
            out.append("lluvias recientes muy bajas")
    return out


def make_reasons(top_feats, row):
    reasons = reason_phrases(top_feats, row)
    return reasons[:3] if reasons else ["sin señales de riesgo destacables"]


def main() -> int:
    t0 = time.monotonic()
    today = date.today()
    cells = sorted(json.loads(CELLS_JSON.read_text())["r5"])
    cidx = {c: i for i, c in enumerate(cells)}
    n_cells = len(cells)

    key = os.environ.get("FIRMS_MAP_KEY", "").strip()
    cell_days = fetch_fires(key, today) if key else {}
    print(f"firms cells with recent fire: {len(cell_days)}", flush=True)

    fires = pd.read_parquet(FIRES_PQ)
    fires["date"] = pd.to_datetime(fires["date"])
    day0 = pd.Timestamp("2012-01-01")
    pend = pd.Timestamp(today)
    n_days = (pend - day0).days + 1
    fmat = np.zeros((n_cells, n_days), dtype=np.float32)
    keep = fires["h3_r5"].isin(cidx)
    fi = fires.loc[keep, "h3_r5"].map(cidx).to_numpy()
    fd = ((fires.loc[keep, "date"] - day0).dt.days).to_numpy()
    fmat[fi, fd] = 1.0
    for c, ds in cell_days.items():
        if c in cidx:
            for d in ds:
                i = (d - day0.date()).days
                if 0 <= i < n_days:
                    fmat[cidx[c], i] = 1.0
    fcum = np.zeros((n_cells, n_days + 1), np.float32)
    np.cumsum(fmat, axis=1, out=fcum[:, 1:])
    rows, cols = [], []
    for i, c in enumerate(cells):
        for nb in h3.grid_ring(c, 1):
            j = cidx.get(nb)
            if j is not None:
                rows.append(i); cols.append(j)
    adj = csr_matrix((np.ones(len(rows), np.float32), (rows, cols)),
                     shape=(n_cells, n_cells))
    ncum = np.zeros((n_cells, n_days + 1), np.float32)
    np.cumsum(adj @ fmat, axis=1, out=ncum[:, 1:])
    d = n_days - 1  # predict as of today
    feats = {
        "fires_7d": fcum[:, d] - fcum[:, max(d - 7, 0)],
        "fires_30d": fcum[:, d] - fcum[:, max(d - 30, 0)],
        "fires_365d": fcum[:, d] - fcum[:, max(d - 365, 0)],
        "neigh_fires_30d": ncum[:, d] - ncum[:, max(d - 30, 0)],
    }

    # clim: share of 2012-2025 years with fire in this woy (weekly)
    woy_now = today.isocalendar()[1]
    fires["woy"] = fires["date"].dt.isocalendar().week
    fires["wyear"] = fires["date"].dt.isocalendar().year
    fire_years = (fires[fires["h3_r5"].isin(cidx)]
                  .groupby(["h3_r5", "woy"])["wyear"].nunique()
                  .unstack(fill_value=0))
    week_cols = fire_years.columns
    clim_s = pd.Series(0.0, index=cells)
    if woy_now in week_cols:
        clim_s = (fire_years[woy_now]
                  .reindex(cells, fill_value=0) / 14.0)
    feats["clim"] = clim_s.to_numpy(np.float32)

    # POWER features over the last days
    power = pd.read_parquet(POWER_PQ)
    power["date"] = pd.to_datetime(power["date"])
    power = power[power["date"] <= pend]
    pts = power[["lat", "lon"]].drop_duplicates().sort_values(
        ["lat", "lon"]).reset_index(drop=True)
    pi = power.groupby(["lat", "lon"], sort=True).ngroup().to_numpy()
    pdays = ((power["date"] - day0).dt.days).to_numpy()
    ok = (pdays >= 0) & (pdays < n_days)
    pi, pdays = pi[ok], pdays[ok]
    n_pts = len(pts)

    def pvar(name):
        m = np.full((n_pts, n_days), np.nan, dtype=np.float32)
        m[pi, pdays] = power[name].to_numpy(np.float32)[ok]
        return m

    rain = np.nan_to_num(pvar("PRECTOTCORR"))
    rcum = np.zeros((n_pts, n_days + 1), np.float32)
    np.cumsum(rain, axis=1, out=rcum[:, 1:])
    tm = np.zeros((n_pts, n_days + 1), np.float32)
    np.cumsum(np.nan_to_num(pvar("T2M_MAX")), axis=1, out=tm[:, 1:])
    rh = np.zeros((n_pts, n_days + 1), np.float32)
    np.cumsum(np.nan_to_num(pvar("RH2M")), axis=1, out=rh[:, 1:])
    wsm = maximum_filter1d(np.nan_to_num(pvar("WS2M")), size=7,
                           axis=1, mode="nearest", origin=-3)
    last_wet = np.where(rain > 1, np.arange(n_days)[None, :], -1)
    last_wet = np.maximum.accumulate(last_wet, axis=1)

    cent = np.array([h3.cell_to_latlng(c) for c in cells])
    _, cell_pt = cKDTree(pts[["lat", "lon"]].values).query(cent)

    def wsum(cum, n):
        return (cum[:, d] - cum[:, max(d - n, 0)]) / min(n, max(d, 1))

    feats["t2m_max_mean_7d"] = wsum(tm, 7)[cell_pt]
    feats["rh2m_mean_7d"] = wsum(rh, 7)[cell_pt]
    feats["ws2m_max_7d"] = wsm[:, d][cell_pt]
    feats["rain_7d"] = (rcum[:, d] - rcum[:, max(d - 7, 0)])[cell_pt]
    feats["rain_30d"] = (rcum[:, d] - rcum[:, max(d - 30, 0)])[cell_pt]
    feats["rain_90d"] = (rcum[:, d] - rcum[:, max(d - 90, 0)])[cell_pt]
    feats["days_since_rain"] = np.clip(
        d - last_wet[:, d], 0, 365)[cell_pt]
    feats["lat"] = cent[:, 0].astype(np.float32)
    feats["lon"] = cent[:, 1].astype(np.float32)
    feats["woy_sin"] = np.float32(np.sin(2 * np.pi * woy_now / 52))
    feats["woy_cos"] = np.float32(np.cos(2 * np.pi * woy_now / 52))

    X = pd.DataFrame({f: feats[f] for f in FEATURES})
    model = lgb.Booster(model_file=str(MODEL))
    p = model.predict(X, num_iteration=model.best_iteration)
    platt_path = MODEL.with_name("platt.json")
    if platt_path.exists():
        pl = json.loads(platt_path.read_text())
        lo = np.log(np.clip(p, 1e-6, 1 - 1e-6)
                    / (1 - np.clip(p, 1e-6, 1 - 1e-6)))
        p = 1 / (1 + np.exp(-(pl["a"] * lo + pl["b"])))

    import shap
    sv = shap.TreeExplainer(model).shap_values(X)
    if isinstance(sv, list):
        sv = sv[-1]
    order = np.argsort(-np.abs(sv), axis=1)[:, :3]

    shards = {}
    gen = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for i, c in enumerate(cells):
        pc = float(p[i])
        cl = float(feats["clim"][i])
        ratio, cat = categorize(pc, cl)
        row = {f: float(feats[f][i]) if np.ndim(feats[f]) else
               float(feats[f]) for f in FEATURES}
        reasons = make_reasons(
            [FEATURES[j] for j in order[i]], row)
        obj = {"p": round(pc, 3), "clim": round(cl, 3),
               "ratio": ratio, "cat": cat, "level": "clima",
               "model_version": MODEL_VERSION,
               "reasons": reasons}
        r2 = h3.cell_to_parent(c, 2)
        shards.setdefault(r2, {"generated_at": gen,
                               "horizon_days": 7,
                               "cells": {}})["cells"][c] = obj

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for r2, s in shards.items():
        (OUT_DIR / f"{r2}.json").write_text(
            json.dumps(s, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(shards)} risk shards "
          f"({time.monotonic() - t0:.0f}s)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

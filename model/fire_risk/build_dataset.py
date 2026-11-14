"""Build risk_train.parquet: one row per Argentina res-5 cell x Monday, 2012-2025.

Label: >=1 VIIRS detection in the cell during [d, d+6].
All features use only data strictly before d (no leakage):

  fires_7d / fires_30d / fires_365d   fires in the cell over the last N days
  neigh_fires_30d                    fires summed over the 8 ring-1 cells, 30 d
  woy_sin / woy_cos                  week-of-year seasonality
  lat / lon                          cell centroid
  t2m_max_mean_7d / rh2m_mean_7d     POWER means over the last 7 days
  ws2m_max_7d                        POWER max over the last 7 days
  rain_7d / rain_30d / rain_90d      POWER precipitation sums
  days_since_rain                    days since last day with >1 mm (cap 365)
  clim                               share of earlier years with fire in that
                                     week-of-year (fires file starts 2012,
                                     so the 2003-2011 part of the baseline
                                     simply does not exist here; documented)

Usage: python model/fire_risk/build_dataset.py
"""

import json
import sys
import time
from pathlib import Path

import h3
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
OUT = ROOT / "data/processed/model_input/risk_train.parquet"


def window_sums(cum, widx, n_back):
    """Sum over days [d-n_back, d-1] evaluated at each row date index."""
    return (cum[:, widx] - cum[:, np.maximum(widx - n_back, 0)]
            ).astype(np.float32)


def main() -> int:
    t0 = time.monotonic()
    cells = sorted(json.loads(CELLS_JSON.read_text())["r5"])
    cidx = {c: i for i, c in enumerate(cells)}
    n_cells = len(cells)
    print(f"{n_cells} cells", flush=True)

    fires = pd.read_parquet(FIRES_PQ)
    fires["date"] = pd.to_datetime(fires["date"])
    day0 = pd.Timestamp("2012-01-01")
    day1 = pd.Timestamp("2025-12-31")
    n_days = (day1 - day0).days + 1
    days = pd.date_range(day0, periods=n_days)

    # ------------------------------------------------------- fire matrix ----
    fmat = np.zeros((n_cells, n_days), dtype=np.float32)
    keep = fires["h3_r5"].isin(cidx)
    fi = fires.loc[keep, "h3_r5"].map(cidx).to_numpy()
    fd = ((fires.loc[keep, "date"] - day0).dt.days).to_numpy()
    np.add.at(fmat, (fi, fd), 1.0)
    fmat = (fmat > 0).astype(np.float32)
    del fires, fi, fd

    fcum = np.zeros((n_cells, n_days + 1), dtype=np.float32)
    np.cumsum(fmat, axis=1, out=fcum[:, 1:])

    # ring-1 neighbor fires: A @ fmat then cumulative
    rows, cols = [], []
    for i, c in enumerate(cells):
        for nb in h3.grid_ring(c, 1):
            j = cidx.get(nb)
            if j is not None:
                rows.append(i)
                cols.append(j)
    adj = csr_matrix(
        (np.ones(len(rows), np.float32), (rows, cols)),
        shape=(n_cells, n_cells))
    nmat = adj @ fmat
    ncum = np.zeros((n_cells, n_days + 1), dtype=np.float32)
    np.cumsum(nmat, axis=1, out=ncum[:, 1:])
    del nmat
    print("fire matrices done", flush=True)

    # ------------------------------------------------------ POWER matrix ----
    power = pd.read_parquet(POWER_PQ)
    power["date"] = pd.to_datetime(power["date"])
    pts = power[["lat", "lon"]].drop_duplicates().sort_values(
        ["lat", "lon"]).reset_index(drop=True)
    n_pts = len(pts)
    # group codes follow the same lexicographic order as sorted pts
    pi = power.groupby(["lat", "lon"], sort=True).ngroup().to_numpy()
    pdays = ((power["date"] - day0).dt.days).to_numpy()
    ok = (pdays >= 0) & (pdays < n_days)
    pi, pdays = pi[ok], pdays[ok]

    def pvar(name):
        m = np.full((n_pts, n_days), np.nan, dtype=np.float32)
        m[pi, pdays] = power[name].to_numpy(np.float32)[ok]
        return m

    tmax = pvar("T2M_MAX")
    rh = pvar("RH2M")
    ws = pvar("WS2M")
    rain = pvar("PRECTOTCORR")
    del power
    print("power matrices done", flush=True)

    rain0 = np.nan_to_num(rain, nan=0.0)
    rcum = np.zeros((n_pts, n_days + 1), dtype=np.float32)
    np.cumsum(rain0, axis=1, out=rcum[:, 1:])
    tm_cum = np.zeros((n_pts, n_days + 1), dtype=np.float32)
    np.cumsum(np.nan_to_num(tmax), axis=1, out=tm_cum[:, 1:])
    rh_cum = np.zeros((n_pts, n_days + 1), dtype=np.float32)
    np.cumsum(np.nan_to_num(rh), axis=1, out=rh_cum[:, 1:])
    # rolling max over the LAST 7 days (origin=-3 -> window [i-6, i])
    ws_max7 = maximum_filter1d(np.nan_to_num(ws), size=7, axis=1,
                               mode="nearest", origin=-3)
    # last day index with >1 mm rain, forward-filled
    last_wet = np.where(rain0 > 1.0, np.arange(n_days)[None, :], -1)
    last_wet = np.maximum.accumulate(last_wet, axis=1)
    del tmax, rh, ws, rain, rain0

    # nearest POWER point per cell
    cent = np.array([h3.cell_to_latlng(c) for c in cells])
    tree = cKDTree(pts[["lat", "lon"]].values)
    _, cell_pt = tree.query(cent)

    # -------------------------------------------------------- week grid -----
    mondays = [d for d in days if d.weekday() == 0
               and (d + pd.Timedelta(days=6)) <= day1]
    n_weeks = len(mondays)
    widx = np.array([(d - day0).days for d in mondays])
    woy = np.array([d.isocalendar()[1] for d in mondays])
    wyear = np.array([d.year for d in mondays])
    print(f"{n_weeks} monday rows per cell", flush=True)

    # labels: any fire in [d, d+6]
    label = (fcum[:, widx + 7] - fcum[:, widx]) > 0
    lab = label.astype(np.float32)

    # clim: per cell & woy, share of earlier years with fire in that woy
    clim = np.full((n_cells, n_weeks), np.nan, dtype=np.float32)
    for w in np.unique(woy):
        m = woy == w
        order = np.argsort(wyear[m], kind="stable")
        sub = lab[:, m][:, order]
        cum = np.cumsum(sub, axis=1)
        cnt = np.arange(1, sub.shape[1] + 1, dtype=np.float32)
        prior = np.concatenate(
            [np.zeros((n_cells, 1), np.float32), cum[:, :-1]], axis=1)
        vals = prior / np.maximum(cnt - 1, 1)
        vals[:, 0] = np.nan
        clim[:, np.flatnonzero(m)[order]] = vals
    # fallback for rows with no earlier years: global woy mean (documented)
    uniq = np.unique(woy)
    gmean = np.array([lab[:, woy == w].mean() for w in uniq],
                     dtype=np.float32)
    fb = np.array([gmean[list(uniq).index(w)] for w in woy],
                  dtype=np.float32)
    clim = np.where(np.isnan(clim), fb[None, :], clim)

    # ----------------------------------------------------- assemble ---------
    def win(cum, n_back):
        return window_sums(cum, widx, n_back)

    rec = {
        "h3_r5": np.repeat(np.array(cells, dtype="U15"), n_weeks),
        "week": np.tile(np.array([d.date() for d in mondays]), n_cells),
        "label": label.ravel().astype(np.uint8),
        "fires_7d": win(fcum, 7).ravel(),
        "fires_30d": win(fcum, 30).ravel(),
        "fires_365d": win(fcum, 365).ravel(),
        "neigh_fires_30d": win(ncum, 30).ravel(),
        "woy_sin": np.tile(np.sin(2 * np.pi * woy / 52).astype(np.float32),
                           n_cells),
        "woy_cos": np.tile(np.cos(2 * np.pi * woy / 52).astype(np.float32),
                           n_cells),
        "lat": np.repeat(cent[:, 0].astype(np.float32), n_weeks),
        "lon": np.repeat(cent[:, 1].astype(np.float32), n_weeks),
        "clim": clim.ravel(),
    }

    def pfeat(m_cum_or_mat, n_back=None, mean=False):
        if n_back:
            v = (m_cum_or_mat[:, widx]
                 - m_cum_or_mat[:, np.maximum(widx - n_back, 0)])
            if mean:
                v = v / np.maximum(np.minimum(n_back, widx), 1)[None, :]
        else:
            v = m_cum_or_mat[:, np.maximum(widx - 1, 0)]
        return v[cell_pt].astype(np.float32).ravel()

    rec["t2m_max_mean_7d"] = pfeat(tm_cum, 7, mean=True)
    rec["rh2m_mean_7d"] = pfeat(rh_cum, 7, mean=True)
    rec["ws2m_max_7d"] = pfeat(ws_max7)
    rec["rain_7d"] = pfeat(rcum, 7)
    rec["rain_30d"] = pfeat(rcum, 30)
    rec["rain_90d"] = pfeat(rcum, 90)
    dsr = widx[None, :] - last_wet[:, np.maximum(widx - 1, 0)]
    rec["days_since_rain"] = np.clip(
        dsr[cell_pt].ravel(), 0, 365).astype(np.float32)

    df = pd.DataFrame(rec)
    df.to_parquet(OUT, index=False)
    rate = df["label"].mean()
    print(f"rows={len(df):,} positives={rate:.4f} "
          f"-> {OUT} ({time.monotonic() - t0:.0f}s)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

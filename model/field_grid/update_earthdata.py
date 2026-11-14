"""Update field/grid shards with Earthdata layers (task 06b).

Each layer is independent: failures leave the field null and are reported.
Layers:
  - lc          MCD12Q1 IGBP (500 m tiles, LP DAAC) — replaces WorldCover
  - grace_trend GRACE-FO mascon grid (PODAAC, single netCDF)
  - sm_anom_pct SMAP L3 daily (NSIDC): latest day vs same-DOY 2018-2024
  - bare_soil_days_yr MOD13C2 monthly NDVI 0.05 deg (LP DAAC)
IMERG stays POWER-sourced: GES DISC rejects this profile with EulaNotAccepted.
"""

import json
import sys
import time
import urllib.request
from pathlib import Path

import h3
import numpy as np
import pandas as pd
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)

import earthaccess  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CELLS_JSON = ROOT / "data/geo/argentina_r5.json"
GRID_DIR = ROOT / "data/processed/field/grid"
DL = ROOT / "data/earthdata"
AR_BBOX = (-74.0, -56.5, -52.5, -21.0)

RESULTS = {}


def load_cells():
    return {c: h3.cell_to_latlng(c)
            for c in json.loads(CELLS_JSON.read_text())["r5"]}


def update(field, per_cell, extra=None, src=None):
    """Write per-cell values into every shard; report fill share."""
    n = 0
    for fp in sorted(GRID_DIR.glob("*.json")):
        d = json.loads(fp.read_text(encoding="utf-8"))
        dirty = False
        for cid, c in d["cells"].items():
            v = per_cell.get(cid)
            if v is not None:
                if field == "sm":
                    c["sm_anom_pct"], c["sm_updated"] = v
                else:
                    c[field] = v
                if extra:
                    c.update(extra)
                if src and field != "sm":
                    c.setdefault("src", {})[field] = src
                n += 1
                dirty = True
        if dirty:
            fp.write_text(json.dumps(d, ensure_ascii=False),
                          encoding="utf-8")
    print(f"  {field}: {n} cells updated", flush=True)
    RESULTS[field] = n


# ------------------------------------------------------------------ lc -----

IGBP = {**{i: "forest" for i in range(1, 6)},
        **{i: "shrub" for i in (6, 7)},
        **{i: "grass" for i in (8, 9, 10)},
        **{i: "crop" for i in (12, 14)}}

# MODIS sinusoidal tile grid (500 m products): 36 x 18 tiles,
# R = 6371007.181 m, tile = 1111950.5197 m, 2400 px per tile.
SINU_R = 6371007.181
SINU_TILE = 1111950.5196665224
SINU_RES = SINU_TILE / 2400
X_MIN, Y_MAX = -20015109.354, 10007554.677


def sinu_rc(lat, lon, h, v):
    """cell (lat, lon) -> pixel (row, col) inside MODIS tile h,v."""
    phi = np.radians(lat)
    x = SINU_R * np.radians(lon) * np.cos(phi)
    y = SINU_R * phi
    x0 = X_MIN + h * SINU_TILE
    y0 = Y_MAX - v * SINU_TILE
    return int((y0 - y) / SINU_RES), int((x - x0) / SINU_RES)


def tile_hv(f):
    import re
    m = re.search(r"\.h(\d\d)v(\d\d)\.", str(f))
    return int(m.group(1)), int(m.group(2))


def do_lc(cells):
    from collections import Counter
    from pyhdf.SD import SD
    r = earthaccess.search_data(
        short_name="MCD12Q1", version="061",
        temporal=("2022-01-01", "2022-12-31"), bounding_box=AR_BBOX)
    files = earthaccess.download(r, DL / "mcd12q1")
    per = {}
    for f in files:
        hv = tile_hv(f)
        arr = SD(str(f)).select("LC_Type1")[:]
        for cid, (lat, lon) in cells.items():
            if cid in per:
                continue
            r_, c_ = sinu_rc(lat, lon, *hv)
            if not (0 <= r_ < arr.shape[0] and 0 <= c_ < arr.shape[1]):
                continue
            w = arr[max(r_ - 2, 0):r_ + 3, max(c_ - 2, 0):c_ + 3]
            vals = [v for v in w.ravel() if v in IGBP]
            if vals:
                per[cid] = IGBP[Counter(vals).most_common(1)[0][0]]
    update("lc", per,
           src={"dataset": "MCD12Q1 IGBP LC_Type1",
                "resolution": "500 m", "period": "2022"})


# --------------------------------------------------------------- grace -----

def do_grace(cells):
    import xarray as xr
    r = earthaccess.search_data(
        short_name="TELLUS_GRAC-GRFO_MASCON_GRID_RL06.3_V4", count=1)
    f = earthaccess.download(r[0], DL / "grace")[0]
    ds = xr.open_dataset(f)
    print("  grace vars:", list(ds.data_vars)[:8], flush=True)
    da = ds["lwe_thickness"]
    times = pd.to_datetime(ds["time"].values)
    keep = times >= "2018-06-01"
    da = da.sel(time=ds["time"][keep])
    tt = (pd.to_datetime(da["time"].values) - pd.Timestamp("2000-01-01")
          ).days.values.astype(float)
    lats = ds["lat"].values
    lons = ds["lon"].values
    per = {}
    for cid, (lat, lon) in cells.items():
        li = int(np.argmin(np.abs(lats - lat)))
        lo = int(np.argmin(np.abs(lons - ((lon + 180) % 360 - 180))))
        y = da[:, li, lo].values.astype(float)
        ok = ~np.isnan(y)
        if ok.sum() < 12:
            continue
        slope = np.polyfit(tt[ok], y[ok], 1)[0] * 365.25  # cm/yr
        per[cid] = "up" if slope > 1 else ("down" if slope < -1
                                         else "flat")
    ds.close()
    update("grace_trend", per,
           src={"dataset": "JPL GRACE-FO mascon RL06.3 v4",
                "resolution": "0.5°", "period": "2018-latest"})


# ---------------------------------------------------------------- smap -----

def do_smap(cells):
    import h5py
    from scipy.spatial import cKDTree
    latest = pd.Timestamp.utcnow().normalize() - pd.Timedelta(days=5)
    days = [latest - pd.DateOffset(years=y)
            for y in range(0, 8)]
    vals = []
    used = []
    for d in days:
        r = earthaccess.search_data(
            short_name="SPL3SMP", version="009",
            temporal=(str(d.date()), str(d.date())),
            bounding_box=AR_BBOX, count=1)
        if not r:
            continue
        f = earthaccess.download(r[0], DL / "smap")[0]
        with h5py.File(f) as h:
            g = h["Soil_Moisture_Retrieval_Data_AM"]
            sm = g["soil_moisture"][:]
            lat = g["latitude"][:]
            lon = g["longitude"][:]
        sm = np.where(sm > 0, sm, np.nan)
        vals.append((lat.ravel(), lon.ravel(), sm.ravel()))
        used.append(str(d.date()))
    per = {}
    for cid, (la, lo) in cells.items():
        series = []
        for lat_, lon_, sm_ in vals:
            ok = ~np.isnan(sm_)
            if not ok.any():
                continue
            tr = cKDTree(np.c_[lat_[ok], lon_[ok]])
            _, j = tr.query([la, lo])
            series.append(sm_[ok][j])
        if len(series) >= 3:
            anom = (series[0] - np.mean(series[1:])) \
                / max(np.mean(series[1:]), 1e-3) * 100
            per[cid] = (round(float(anom), 1), used[0])
    update("sm", per)


# ------------------------------------------------------------- modis --------

def do_baresoil(cells):
    from pyhdf.SD import SD
    r = earthaccess.search_data(
        short_name="MOD13C2", version="061",
        temporal=("2024-01-01", "2024-12-31"), count=12)
    files = earthaccess.download(r, DL / "mod13c2")
    arrays = []
    for f in files:
        sd = SD(str(f))
        sds = [n for n in sd.datasets() if "NDVI" in n]
        arrays.append(sd.select(sds[0])[:])
    # CMG grid: 7200 x 3600 px, lat 90..-90, lon -180..180
    nlat, nlon = arrays[0].shape
    per = {}
    for cid, (lat, lon) in cells.items():
        r_ = min(int((90 - lat) / 180 * nlat), nlat - 1)
        c_ = min(int((lon + 180) / 360 * nlon), nlon - 1)
        below = 0
        for a in arrays:
            v = a[r_, c_]
            if -2000 <= v <= 10000 and v * 1e-4 < 0.2:
                below += 1
        per[cid] = below * 30
    update("bare_soil_days_yr", per,
           src={"dataset": "MOD13C2 monthly NDVI",
                "resolution": "0.05°", "period": "2024",
                "note": "days = months with NDVI<0.2 x 30"})


LAYERS = {"lc": do_lc, "grace": do_grace, "smap": do_smap,
          "baresoil": do_baresoil}


def main():
    DL.mkdir(parents=True, exist_ok=True)
    earthaccess.login(strategy="environment")
    cells = load_cells()
    which = sys.argv[1:] or list(LAYERS)
    for name in which:
        print(f"=== {name} ===", flush=True)
        t = time.monotonic()
        try:
            LAYERS[name](cells)
        except Exception as exc:
            print(f"  {name} FAILED: {type(exc).__name__} "
                  f"{str(exc)[:200]}", flush=True)
            RESULTS[name] = f"FAILED {type(exc).__name__}"
        print(f"  ({time.monotonic() - t:.0f}s)", flush=True)
    print("RESULTS:", RESULTS, flush=True)


if __name__ == "__main__":
    main()

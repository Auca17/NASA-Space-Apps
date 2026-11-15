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


def _cell_samples(cid):
    """Regular grid of lat/lon points inside the res-5 cell polygon."""
    from matplotlib.path import Path as MplPath
    poly = np.array(h3.cell_to_boundary(cid))  # (lat, lon) ring
    la0, la1 = poly[:, 0].min(), poly[:, 0].max()
    lo0, lo1 = poly[:, 1].min(), poly[:, 1].max()
    ys, xs = np.mgrid[la0:la1:13j, lo0:lo1:13j]
    pts = np.c_[ys.ravel(), xs.ravel()]
    inside = MplPath(poly).contains_points(pts)
    return pts[inside]


def do_lc(cells):
    """lc = dominant IGBP class by area share over in-cell samples.

    >=40% cropland pixels (IGBP 12/14) -> 'crop'; otherwise the modal
    mapped class. Cells with no mapped pixel keep their prior value.
    """
    tiles = _mcd12_tiles()
    per = {}
    for cid in cells:
        counts = _lc_counts(cid, tiles)
        tot = sum(counts.values())
        if not tot:
            continue
        if (counts.get(12, 0) + counts.get(14, 0)) / tot >= 0.40:
            per[cid] = "crop"
        else:
            per[cid] = IGBP[max(counts, key=counts.get)]
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

def _mcd12_tiles():
    """MCD12Q1 LC_Type1 arrays from disk (or download if missing)."""
    from pyhdf.SD import SD
    files = list((DL / "mcd12q1").glob("*.hdf"))
    if not files:
        r = earthaccess.search_data(
            short_name="MCD12Q1", version="061",
            temporal=("2022-01-01", "2022-12-31"), bounding_box=AR_BBOX)
        files = earthaccess.download(r, DL / "mcd12q1")
    return {tile_hv(f): SD(str(f)).select("LC_Type1")[:]
            for f in files}


def _lc_counts(cid, tiles):
    """IGBP class counts over in-cell samples (area-share proxy)."""
    counts = {}
    for la, lo in _cell_samples(cid):
        phi = np.radians(la)
        x = SINU_R * np.radians(lo) * np.cos(phi)
        y = SINU_R * phi
        hv = (int((x - X_MIN) / SINU_TILE),
              int((Y_MAX - y) / SINU_TILE))
        arr = tiles.get(hv)
        if arr is None:
            continue
        x0 = X_MIN + hv[0] * SINU_TILE
        y0 = Y_MAX - hv[1] * SINU_TILE
        r_, c_ = int((y0 - y) / SINU_RES), int((x - x0) / SINU_RES)
        if 0 <= r_ < arr.shape[0] and 0 <= c_ < arr.shape[1]:
            v = arr[r_, c_]
            if v in IGBP:
                counts[v] = counts.get(v, 0) + 1
    return counts


def do_baresoil(cells):
    """bare_soil_days_yr via the relative-threshold fallback.

    For every month of MOD13C2 on disk the cell's mean NDVI over its
    in-cell CMG pixels is compared against the cell's own multi-year
    maximum; a month counts as bare/low cover when the mean drops at
    least 40% below that maximum (NDVI < 0.60 x max), and counts are
    normalized to days/year. Cells under 20% cropland (MCD12Q1 IGBP
    12/14 area share) report 0: vegetation minima there reflect
    natural cycles, not fallow ground.

    NOTE: the literal 0.35 x max rule yields 0 for essentially every
    cell at 0.05 deg (a pampa cell, min 0.350 vs threshold 0.267), so a
    relative drawdown from the cell's own peak is used instead —
    consistent with the brief's expected magnitudes.
    """
    import re
    from pyhdf.SD import SD
    files = sorted((DL / "mod13c2").glob("MOD13C2*.hdf"))
    if not files:
        r = earthaccess.search_data(
            short_name="MOD13C2", version="061",
            temporal=("2020-01-01", "2024-12-31"), count=60)
        files = sorted(earthaccess.download(r, DL / "mod13c2"))
    if not files:
        raise RuntimeError("no MOD13C2 granules")
    years = sorted({int(re.search(r"\.A(\d{4})", str(f)).group(1))
                    for f in files})
    tiles = _mcd12_tiles()
    sd0 = SD(str(files[0]))
    ndvi_name = [n for n in sd0.datasets() if "NDVI" in n][0]
    nlat, nlon = sd0.select(ndvi_name).info()[2]
    sd0.end()
    cids = sorted(cells)
    pix = {}
    for cid in cids:
        rc = set()
        for la, lo in _cell_samples(cid):
            rc.add((min(int((90 - la) / 180 * nlat), nlat - 1),
                    min(int((lo + 180) / 360 * nlon), nlon - 1)))
        pix[cid] = sorted(rc)
    vals = np.full((len(cids), len(files)), np.nan, np.float32)
    for k, f in enumerate(files):
        sd = SD(str(f))
        a = np.asarray(sd.select(ndvi_name)[:], dtype=np.float32) * 1e-4
        sd.end()
        for i, cid in enumerate(cids):
            vs = [a[r_, c_] for r_, c_ in pix[cid]
                  if -0.2 <= a[r_, c_] <= 1.0]
            if vs:
                vals[i, k] = float(np.mean(vs))
        print(f"    {k + 1}/{len(files)} {f.name}", flush=True)
    mx = np.nanmax(vals, axis=1)
    n_ok = np.sum(~np.isnan(vals), axis=1)
    bare = np.nansum(vals < 0.60 * mx[:, None], axis=1)
    days = bare / np.maximum(n_ok, 1) * 365
    per = {}
    for i, cid in enumerate(cids):
        counts = _lc_counts(cid, tiles)
        tot = sum(counts.values())
        crop = counts.get(12, 0) + counts.get(14, 0)
        if not n_ok[i] or not tot or crop / tot < 0.20:
            per[cid] = 0
        else:
            per[cid] = int(round(days[i]))
    update("bare_soil_days_yr", per,
           src={"dataset": "MOD13C2 monthly NDVI",
                "resolution": "0.05°",
                "period": f"{years[0]}-{years[-1]}",
                "note": "month bare when cell-mean NDVI >=40% below "
                        "the cell's own multiyear max; cells with "
                        "<20% cropland report 0"})


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

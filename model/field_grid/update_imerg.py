"""GPM IMERG monthly final (GPM_3IMERGM v07, 0.1 deg) rainfall stats for the
Argentina res-5 field grid (task 21b / 23.3).

Per res-5 cell: mean annual rain (mm/yr), coefficient of variation of annual
totals, and the 25th-percentile-year total, over 2001..last full year.
Compares against the POWER-derived values already in the grid shards for 200
random cells, then replaces rain_mm_yr / rain_cv / rain_p25_mm in
data/processed/field/grid (heavy_days_yr stays POWER daily -- IMERG monthly
cannot produce it) and updates the src blocks.

Granules stream via earthaccess.open; only the Argentina bbox slice is read.
Each month's slice is cached in an incremental npz so a restart resumes.
"""
import calendar
import json
import random
import sys
import time
from pathlib import Path

import h3
import numpy as np
import pandas as pd
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env", override=False)

import earthaccess  # noqa: E402

CELLS_JSON = ROOT / "data/geo/argentina_r5.json"
GRID_DIR = ROOT / "data/processed/field/grid"
DL = ROOT / "data/earthdata"
AR_BBOX = (-74.0, -56.5, -55.0, -21.0)   # west, south, east, north
LONW, LATS, LONE, LATN = AR_BBOX
Y0 = 2001
Y1 = pd.Timestamp.now("UTC").year - 1     # last full year
GROUP = "Grid"
CACHE = DL / "imerg_ar_months.npz"


def load_cells():
    return {c: h3.cell_to_latlng(c)
            for c in json.loads(CELLS_JSON.read_text())["r5"]}


def read_month(year, month):
    """Argentina slice of the IMERG monthly precipitation rate (mm/hr)."""
    import h5py
    last = calendar.monthrange(year, month)[1]
    r = earthaccess.search_data(
        short_name="GPM_3IMERGM", version="07",
        temporal=(f"{year}-{month:02d}-01", f"{year}-{month:02d}-{last}"),
        bounding_box=AR_BBOX, count=1)
    if not r:
        return None
    try:
        with h5py.File(earthaccess.open([r[0]])[0]) as h:
            g = h[GROUP]
            lat = g["lat"][:]
            lon = g["lon"][:]
            iy = np.where((lat >= LATS) & (lat <= LATN))[0]
            ix = np.where((lon >= LONW) & (lon <= LONE))[0]
            # precipitation is (time, lon, lat); slice then transpose
            p = g["precipitation"][0, ix[0]:ix[-1] + 1,
                                   iy[0]:iy[-1] + 1].astype("float32").T
            return lat[iy], lon[ix], p * 24.0 * last   # -> mm/month
    except Exception as exc:
        print(f"  {year}-{month:02d} read failed: {type(exc).__name__}",
              flush=True)
        return None


def grid_axes(shape):
    """IMERG regular 0.1 deg grid sliced to AR_BBOX -> (lat, lon)."""
    flat = -89.95 + np.arange(1800) * 0.1
    flon = -179.95 + np.arange(3600) * 0.1
    iy = np.where((flat >= LATS) & (flat <= LATN))[0]
    ix = np.where((flon >= LONW) & (flon <= LONE))[0]
    lat, lon = flat[iy], flon[ix]
    assert lat.size == shape[0] and lon.size == shape[1], \
        f"slice {lat.size}x{lon.size} != cached {shape}"
    return lat, lon


def build_annual():
    """Monthly mm totals per Argentina pixel, cached incrementally."""
    months = [f"{y}-{m:02d}" for y in range(Y0, Y1 + 1) for m in range(1, 13)]
    cached = np.load(CACHE) if CACHE.exists() else {}
    data = dict(cached)
    pending = [m for m in months if m not in data]
    if not pending and data:
        lat, lon = grid_axes(next(iter(data.values())).shape)
        return lat, lon, data
    print(f"cached months: {len(data)}  pending: {len(pending)}", flush=True)
    lat = lon = None
    for i, ym in enumerate(pending):
        y, m = int(ym[:4]), int(ym[5:])
        for att in range(3):
            out = read_month(y, m)
            if out is not None:
                break
            time.sleep(3 + att * 5)
        if out is None:
            print(f"  {ym}: skipped after retries", flush=True)
            continue
        lat, lon, mm = out
        data[ym] = mm
        if i % 10 == 0 or i == len(pending) - 1:
            np.savez(CACHE, **data)
            print(f"  {ym} done ({i + 1}/{len(pending)})", flush=True)
    np.savez(CACHE, **data)
    if lat is None and data:
        lat, lon = grid_axes(next(iter(data.values())).shape)
    return lat, lon, data


def annual_totals(lat, lon, data):
    """year -> (nlat, nlon) annual mm totals."""
    years = {}
    for y in range(Y0, Y1 + 1):
        ms = [data.get(f"{y}-{m:02d}") for m in range(1, 13)]
        if any(v is None for v in ms):
            print(f"  year {y} incomplete, skipped")
            continue
        years[y] = np.nansum(np.stack(ms), axis=0)
    return years


def cell_stats(lat, lon, years, cells):
    """Map pixels to res-5 cells, weight by cos(lat), per-cell stats."""
    lon2, lat2 = np.meshgrid(lon, lat)
    cell_of = np.array(
        [[h3.latlng_to_cell(la, lo, 5) for lo in lon] for la in lat],
        dtype=object)
    w = np.cos(np.deg2rad(lat2))
    wanted = set(cells)
    keep = np.isin(cell_of, list(wanted))
    ys_idx = sorted(years)
    per_cell: dict[str, list[list[float]]] = {c: [] for c in wanted}
    # collect weighted samples per year
    flat_cells = cell_of[keep].ravel()
    flat_w = w[keep].ravel()
    cell_mask = {c: (flat_cells == c) for c in wanted}
    arrs = {y: years[y][keep].ravel() for y in ys_idx}
    stats = {}
    for c, mask in cell_mask.items():
        if not mask.any():
            continue
        cw = flat_w[mask]
        ann = np.array([np.average(arrs[y][mask], weights=cw)
                        for y in ys_idx])
        ann = ann[~np.isnan(ann)]
        if len(ann) < 15:
            continue
        cv = float(ann.std() / ann.mean()) if ann.mean() > 0 else np.nan
        stats[c] = {
            "rain_mm_yr": round(float(ann.mean()), 1),
            "rain_cv": round(cv, 3),
            "rain_p25_mm": round(float(np.percentile(ann, 25)), 1),
            "rain_years": int(len(ann)),
        }
    return stats


def compare(stats):
    """Bias + correlation vs the POWER values currently in the shards."""
    cur = {}
    for fp in GRID_DIR.glob("*.json"):
        d = json.loads(fp.read_text(encoding="utf-8"))
        for cid, c in d["cells"].items():
            if cid in stats and c.get("rain_mm_yr") is not None:
                cur[cid] = c
    common = sorted(set(stats) & set(cur))
    print(f"cells with IMERG stats: {len(stats)}, overlap: {len(common)}")
    random.seed(11)
    sample = random.sample(common, min(200, len(common)))
    im = np.array([stats[c]["rain_mm_yr"] for c in sample])
    pw = np.array([cur[c]["rain_mm_yr"] for c in sample])
    from scipy.stats import pearsonr, spearmanr
    print(f"n={len(sample)}")
    print(f"  IMERG mean={im.mean():.0f} POWER mean={pw.mean():.0f} "
          f"bias={np.mean(im - pw):+.0f} mm/yr "
          f"({100 * np.mean((im - pw) / pw):+.1f}%)")
    print(f"  pearson r={pearsonr(im, pw)[0]:+.3f} "
          f"spearman rho={spearmanr(im, pw)[0]:+.3f}")


def write_grid(stats, last_year):
    src = {"dataset": "GPM IMERG monthly final V07 (GPM_3IMERGM)",
           "resolution": "0.1 deg",
           "period": f"{Y0}-{last_year}"}
    n = 0
    for fp in sorted(GRID_DIR.glob("*.json")):
        d = json.loads(fp.read_text(encoding="utf-8"))
        dirty = False
        for cid, c in d["cells"].items():
            v = stats.get(cid)
            if v:
                c["rain_mm_yr"] = v["rain_mm_yr"]
                c["rain_cv"] = v["rain_cv"]
                c["rain_p25_mm"] = v["rain_p25_mm"]
                s = c.setdefault("src", {})
                for k in ("rain_mm_yr", "rain_cv", "rain_p25_mm"):
                    s[k] = dict(src)
                dirty = True
                n += 1
        if dirty:
            fp.write_text(json.dumps(d, ensure_ascii=False),
                          encoding="utf-8")
    print(f"updated {n} cells")


def main():
    earthaccess.login(strategy="environment")
    cells = load_cells()
    lat, lon, data = build_annual()
    years = annual_totals(lat, lon, data)
    print(f"years complete: {len(years)}", flush=True)
    stats = cell_stats(lat, lon, years, cells)
    compare(stats)
    write_grid(stats, max(years))


if __name__ == "__main__":
    sys.exit(main())

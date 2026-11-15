"""SMAP L3 enhanced (SPL3SMP_E.006, AM overpass) 30-day soil-moisture
anomaly for the Argentina res-5 field grid (task 18.1).

Recent window = 30 days ending on the latest available date.
Baseline    = same day-of-year window over 2015..last full year.
Per cell    = median of recommended-quality pixels (retrieval_qual_flag==0)
              inside the cell, per date.
Writes      = sm_anom_pct, sm_anom_z, sm_valid_days, sm_updated + src block
              into data/processed/field/grid shards.

Streaming reads (earthaccess.open + h5py slices) keep memory/disk small:
only the Argentina bbox slice of each array is pulled per granule.
"""
import json
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
AR_BBOX = (-74.0, -56.5, -52.5, -21.0)   # west, south, east, north
LONW, LATS, LONE, LATN = AR_BBOX
GROUP = "Soil_Moisture_Retrieval_Data_AM"
MIN_RECENT_DAYS = 10
MIN_BASE_YEARS = 5


def load_cells():
    return {c: h3.cell_to_latlng(c)
            for c in json.loads(CELLS_JSON.read_text())["r5"]}


def ease_grid():
    """Lat/lon of the fixed EASE-2 9 km grid + Argentina slice indices.
    Cached under data/earthdata so it is read once."""
    cache = DL / "smap_ease_cache.npz"
    if cache.exists():
        z = np.load(cache)
        return z["lat"], z["lon"], (int(z["y0"]), int(z["y1"]),
                                    int(z["x0"]), int(z["x1"]))
    latest = pd.Timestamp.now("UTC").normalize() - pd.Timedelta(days=5)
    r = earthaccess.search_data(short_name="SPL3SMP_E", version="006",
                                temporal=(str(latest.date()),
                                          str(latest.date())),
                                bounding_box=AR_BBOX, count=1)
    import h5py
    with h5py.File(earthaccess.open([r[0]])[0]) as h:
        g = h[GROUP]
        lat = g["latitude"][:].astype("float32")
        lon = g["longitude"][:].astype("float32")
    inside = (lat >= LATS) & (lat <= LATN) & (lon >= LONW) & (lon <= LONE)
    ys, xs = np.where(inside)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    np.savez(cache, lat=lat, lon=lon, y0=y0, y1=y1, x0=x0, x1=x1)
    return lat, lon, (y0, y1, x0, x1)


def pixel_cells(lat, lon, sl):
    """Map each grid pixel in the slice to its res-5 cell id (or None)."""
    y0, y1, x0, x1 = sl
    out = np.empty(lat.shape, dtype=object)
    sub_lat, sub_lon = lat[y0:y1, x0:x1], lon[y0:y1, x0:x1]
    out[y0:y1, x0:x1] = [[h3.latlng_to_cell(la, lo, 5)
                          for la, lo in zip(rl, cl)]
                         for rl, cl in zip(sub_lat, sub_lon)]
    return out


def read_day(date_str, sl, pix):
    """Median soil moisture per res-5 cell for one day (AM, quality-0)."""
    import h5py
    r = earthaccess.search_data(short_name="SPL3SMP_E", version="006",
                                temporal=(date_str, date_str),
                                bounding_box=AR_BBOX, count=1)
    if not r:
        return None
    y0, y1, x0, x1 = sl
    try:
        with h5py.File(earthaccess.open([r[0]])[0]) as h:
            g = h[GROUP]
            sm = g["soil_moisture"][y0:y1, x0:x1].astype("float32")
            qf = g["retrieval_qual_flag"][y0:y1, x0:x1]
    except Exception as exc:
        print(f"  {date_str} read failed: {type(exc).__name__}",
              flush=True)
        return None
    sm = np.where((qf == 0) & (sm > 0), sm, np.nan)
    pc = pix[y0:y1, x0:x1]
    per: dict[str, list[float]] = {}
    for cid, v in zip(pc.ravel(), sm.ravel()):
        if cid is not None and not np.isnan(v):
            per.setdefault(cid, []).append(float(v))
    return {c: float(np.median(vs)) for c, vs in per.items()}


def main():
    earthaccess.login(strategy="environment")
    cells = load_cells()
    lat, lon, sl = ease_grid()
    cachep = DL / "smap_pixcells.npy"
    if cachep.exists():
        pix = np.load(cachep, allow_pickle=True)
    else:
        pix = pixel_cells(lat, lon, sl)
        np.save(cachep, pix)
    print(f"grid {sl} -> {(pix != None).sum()} px", flush=True)  # noqa: E711

    latest = pd.Timestamp.now("UTC").normalize() - pd.Timedelta(days=5)
    last_full = latest.year - 1 if latest.month > 1 else latest.year - 2
    windows = {"recent": pd.date_range(latest - pd.Timedelta(days=29),
                                       latest)}
    for y in range(2015, last_full + 1):
        end = latest - pd.DateOffset(years=latest.year - y)
        windows[y] = pd.date_range(end - pd.Timedelta(days=29), end)

    # cell x date matrix, cached incrementally so a restart resumes
    matp = DL / "smap_cell_day.csv"
    mat = pd.read_csv(matp, index_col=0) if matp.exists() else \
        pd.DataFrame(index=list(cells))
    pending = [str(d.date()) for days in windows.values() for d in days
               if str(d.date()) not in mat.columns]
    print(f"pending days: {len(pending)}", flush=True)

    from concurrent.futures import ThreadPoolExecutor

    def work(ds):
        return ds, read_day(ds, sl, pix)

    with ThreadPoolExecutor(max_workers=4) as ex:
        for ds, vals in ex.map(work, pending):
            if vals is not None:
                mat[ds] = pd.Series(vals, dtype="float32")
                mat.to_csv(matp)
            print(f"  {ds}: {'skip' if vals is None else len(vals)} "
                  f"cells", flush=True)

    days_cols = list(mat.columns)
    recent = set(str(d.date()) for d in windows["recent"])
    base_cols = [c for c in days_cols if c not in recent]
    recent_cols = [c for c in days_cols if c in recent]
    base_years = {}
    for y, days in windows.items():
        if y == "recent":
            continue
        base_years[y] = [str(d.date()) for d in days
                         if str(d.date()) in days_cols]

    per_cell = {}
    for cid in mat.index:
        rv = mat.loc[cid, recent_cols].dropna()
        if len(rv) < MIN_RECENT_DAYS:
            continue
        rmean = float(rv.mean())
        ymeans = [float(mat.loc[cid, cols].dropna().mean())
                  for cols in base_years.values()
                  if mat.loc[cid, cols].dropna().size >= MIN_RECENT_DAYS]
        if len(ymeans) < MIN_BASE_YEARS:
            continue
        bmean, bstd = float(np.mean(ymeans)), float(np.std(ymeans))
        pct = (rmean - bmean) / max(bmean, 1e-3) * 100
        z = (rmean - bmean) / max(bstd, 1e-3)
        per_cell[cid] = {"sm_anom_pct": round(pct, 1),
                         "sm_anom_z": round(z, 2),
                         "sm_valid_days": int(len(rv)),
                         "sm_updated": str(latest.date())}

    n = 0
    for fp in sorted(GRID_DIR.glob("*.json")):
        d = json.loads(fp.read_text(encoding="utf-8"))
        dirty = False
        for cid, c in d["cells"].items():
            v = per_cell.get(cid)
            if v:
                c.update(v)
                c.setdefault("src", {})["sm_anom_pct"] = {
                    "dataset": "SMAP L3 enhanced SPL3SMP_E.006 (AM)",
                    "resolution": "9 km",
                    "period": f"30 días vs climatología "
                              f"{min(windows[2015].year)}-{last_full}"}
                dirty = True
                n += 1
            else:
                for k in ("sm_anom_pct", "sm_anom_z", "sm_valid_days",
                          "sm_updated"):
                    c.pop(k, None)
        if dirty:
            fp.write_text(json.dumps(d, ensure_ascii=False),
                          encoding="utf-8")

    vals = [v["sm_anom_pct"] for v in per_cell.values()]
    print("RESULT: cells=%d median=%.1f p10=%.1f p90=%.1f"
          % (n, np.median(vals), np.percentile(vals, 10),
             np.percentile(vals, 90)))


if __name__ == "__main__":
    sys.exit(main())

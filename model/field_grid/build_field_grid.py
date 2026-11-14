"""Build field/grid/{h3_r2}.json shards for Argentina (task 06).

Sources that need no credentials:
  - rain_mm_yr / rain_cv / rain_p25_mm / heavy_days_yr / hot_days_gt35 /
    frost_free: NASA POWER daily parquet from task 01
    (data/processed/model_input/power_ar_daily.parquet, 0.5x0.625 deg,
    nearest grid point to each res-5 centroid).
  - soil {texture, soc_g_kg}: ISRIC SoilGrids WCS, 0-30 cm weighted mean
    of clay/sand/silt + SOC, sampled at each res-5 centroid (250 m).
  - lc: ESA WorldCover v200 (10 m, public COG bucket) dominant class over
    samples inside each res-5 cell -> crop|forest|grass|shrub|other.

Blocked without EARTHDATA_TOKEN (left null, reported):
  IMERG, SMAP sm_anom_pct, GRACE grace_trend, MODIS bare_soil_days_yr,
  GAEZ gaez.
"""

import json
import math
import os
import statistics
import sys
import time
import urllib.request
from pathlib import Path

import h3
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from scipy.spatial import cKDTree

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)

ROOT = Path(__file__).resolve().parents[2]
POWER_PQ = ROOT / "data/processed/model_input/power_ar_daily.parquet"
CELLS_JSON = ROOT / "data/geo/argentina_r5.json"
OUT_DIR = ROOT / "data/processed/field/grid"
SG_DIR = ROOT / "data/soilgrids"
FULL_YEARS = range(2013, 2026)  # complete years in the parquet

AR_BBOX = (-74.0, -56.5, -52.5, -21.0)  # minlon, minlat, maxlon, maxlat
SG_WCS = ("https://maps.isric.org/mapserv?map=/map/{prop}.map"
          "&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage"
          "&COVERAGEID={prop}_{depth}_mean&FORMAT=image/tiff"
          "&SUBSET=long({x0},{x1})&SUBSET=lat({y0},{y1})"
          "&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326"
          "&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326")
SG_DEPTHS = [("0-5cm", 5), ("5-15cm", 10), ("15-30cm", 15)]
SG_PROPS = ["clay", "sand", "soc"]

WC_BUCKET = "s3://esa-worldcover/v200/2021/map"
WC_MAP = {10: "forest", 20: "shrub", 30: "grass", 40: "crop"}

MONTHS_30 = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


# ------------------------------------------------------------------ POWER --

def _frost_free_md(tmin: pd.Series):
    """Same frost-year logic as the API: coldest month starts the year."""
    s = {d.date(): v for d, v in tmin.items() if not pd.isna(v)}
    month_vals = {}
    for d, v in s.items():
        month_vals.setdefault(d.month, []).append(v)
    if len(month_vals) < 12:
        return None
    min_med = min(statistics.median(v) for v in month_vals.values())
    tied = [m for m, v in month_vals.items()
            if statistics.median(v) == min_med]
    if len(tied) > 1:
        ang = [2 * math.pi * d.timetuple().tm_yday / 365
               for d, v in s.items() if v <= 0]
        center = math.degrees(math.atan2(
            statistics.fmean(math.sin(a) for a in ang),
            statistics.fmean(math.cos(a) for a in ang))) % 360 if ang else 0
        cold = min(tied, key=lambda m: abs(
            ((m - 1) * 30.4 + 15 - center + 180) % 360 - 180))
    else:
        cold = tied[0]
    import datetime as dt
    lasts, firsts = [], []
    for y in sorted({d.year for d in s}):
        start, end = dt.date(y, cold, 1), dt.date(y + 1, cold, 1)
        days = [(d, v) for d, v in s.items() if start <= d < end]
        if sum(v is not None for _, v in days) < 300:
            continue
        fr = sorted(d for d, v in days if v is not None and v <= 0)
        spr = [d for d in fr if (d - start).days < 184]
        aut = [d for d in fr if (d - start).days >= 184]
        if spr and aut:
            lasts.append((spr[-1] + dt.timedelta(days=1)).strftime("%m-%d"))
            firsts.append((aut[0] - dt.timedelta(days=1)).strftime("%m-%d"))
    if len(lasts) < 3:
        return None
    return {"start": sorted(lasts)[len(lasts) // 2],
            "end": sorted(firsts)[len(firsts) // 2]}


def power_stats() -> pd.DataFrame:
    """Per POWER grid point: rain + temperature aggregates."""
    df = pd.read_parquet(POWER_PQ)
    df["date"] = pd.to_datetime(df["date"])
    df["year"] = df["date"].dt.year
    full = df[df["year"].isin(FULL_YEARS)]

    annual = full.groupby(["lat", "lon", "year"]).agg(
        rain=("PRECTOTCORR", "sum"),
        heavy=("PRECTOTCORR", lambda s: (s > 50).sum()),
        hot=("T2M_MAX", lambda s: (s > 35).sum())).reset_index()
    out = annual.groupby(["lat", "lon"]).agg(
        rain_mm_yr=("rain", "mean"),
        rain_cv=("rain", lambda s: s.std() / s.mean()),
        rain_p25_mm=("rain", lambda s: np.percentile(s, 25)),
        heavy_days_yr=("heavy", "mean"),
        hot_days_gt35=("hot", "mean")).reset_index()

    ff_map = {}
    for (la, lo), gdf in full.groupby(["lat", "lon"]):
        ff_map[(la, lo)] = _frost_free_md(
            gdf.set_index("date")["T2M_MIN"])
    out["frost_free"] = [ff_map.get((r.lat, r.lon))
                         for r in out.itertuples()]
    return out


def assign_nearest(points: pd.DataFrame, cells: dict) -> dict:
    """r5 cell -> nearest POWER grid point stats (grid is coarser)."""
    tree = cKDTree(points[["lat", "lon"]].values)
    lats = np.array([v[0] for v in cells.values()])
    lons = np.array([v[1] for v in cells.values()])
    _, idx = tree.query(np.c_[lats, lons])
    ids = list(cells)
    return {ids[i]: points.iloc[j] for i, j in enumerate(idx)}


# -------------------------------------------------------------- SoilGrids --

def _tiff_ok(f: Path) -> bool:
    """Probe a grid of windows: truncated tiles hide mid-raster."""
    if not f.exists() or f.stat().st_size < 1000:
        return False
    try:
        import rasterio
        with rasterio.open(f) as ds:
            for fr in (0.0, 0.25, 0.5, 0.75, 1.0):
                for fc in (0.0, 0.5, 1.0):
                    r = min(int(fr * ds.height), ds.height - 1)
                    c = min(int(fc * ds.width), ds.width - 1)
                    ds.read(1, window=((r, r + 1), (c, c + 1)))
        return True
    except Exception:
        return False


def _sg_download(url: str, f: Path) -> bool:
    req = urllib.request.Request(url, headers={"User-Agent": "field-grid/0.1"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = r.read()
    except Exception as exc:
        print(f"    {type(exc).__name__}: {exc}", flush=True)
        return False
    if not data[:4].startswith(b"II") and not data[:4].startswith(b"MM"):
        print(f"    not a TIFF ({data[:60]!r})", flush=True)
        return False
    f.write_bytes(data)
    if _tiff_ok(f):
        return True
    print("    truncated TIFF", flush=True)
    return False


def _sg_url(prop: str, depth: str, bbox) -> str:
    return SG_WCS.format(prop=prop, depth=depth,
                         x0=bbox[0], x1=bbox[2],
                         y0=bbox[1], y1=bbox[3])


def sg_fetch(prop: str, depth: str) -> list[Path]:
    """Full-bbox WCS first; on repeated truncation fall back to lat bands."""
    f = SG_DIR / f"{prop}_{depth}.tif"
    if _tiff_ok(f):
        return [f]
    url = _sg_url(prop, depth, AR_BBOX)
    for attempt in range(2):
        print(f"  soilgrids {prop} {depth} (try {attempt + 1})...",
              flush=True)
        if _sg_download(url, f):
            return [f]

    n = 4
    bands = np.linspace(AR_BBOX[1], AR_BBOX[3], n + 1)
    parts = []
    for i in range(n):
        bb = (AR_BBOX[0], float(bands[i]), AR_BBOX[2], float(bands[i + 1]))
        p = SG_DIR / f"{prop}_{depth}_band{i}.tif"
        if _tiff_ok(p):
            parts.append(p)
            continue
        print(f"  soilgrids {prop} {depth} band {i}...", flush=True)
        for attempt in range(3):
            if _sg_download(_sg_url(prop, depth, bb), p):
                break
        else:
            raise RuntimeError(
                f"SoilGrids {prop} {depth} band {i}: failed")
        parts.append(p)
    return parts


def soil_samples(cells: dict) -> dict:
    import rasterio
    rasters = {}
    for prop in SG_PROPS:
        for depth, _w in SG_DEPTHS:
            rasters[(prop, depth)] = [rasterio.open(f)
                                      for f in sg_fetch(prop, depth)]
    out = {}
    for cid, (lat, lon) in cells.items():
        vals = {}
        for prop in SG_PROPS:
            num = den = 0.0
            for depth, w in SG_DEPTHS:
                for ds in rasters[(prop, depth)]:
                    r, c = ds.index(lon, lat)
                    r0, c0 = max(r - 2, 0), max(c - 2, 0)
                    r1 = min(r + 3, ds.height)
                    c1 = min(c + 3, ds.width)
                    if r1 <= r0 or c1 <= c0:
                        continue
                    win = ds.read(1, window=((r0, r1), (c0, c1)))
                    good = win[(win > 0) & (win < 60000)]
                    if good.size:
                        num += float(good.mean()) * w
                        den += w
                    break
            vals[prop] = num / den if den else None
        if all(v is None for v in vals.values()):
            out[cid] = None
            continue
        clay, sand = vals["clay"], vals["sand"]
        silt = (1000 - clay - sand) / 10 if clay and sand else None
        out[cid] = {"clay_g_kg": clay, "sand_g_kg": sand,
                    "silt_g_kg": silt * 10 if silt else None,
                    "soc_g_kg": vals["soc"]}
    for dsl in rasters.values():
        for ds in dsl:
            ds.close()
    return out


def texture_class(clay, sand, silt):
    if None in (clay, sand, silt):
        return None
    clay, sand, silt = clay / 10, sand / 10, silt / 10
    if clay >= 40: return "Arcilloso"
    if sand >= 70: return "Arenoso"
    if silt >= 60: return "Franco-limoso"
    if clay >= 27: return "Franco-arcilloso"
    if sand >= 45: return "Franco-arenoso"
    return "Franco"


# ------------------------------------------------------------ WorldCover ---

def wc_tiles(cells: dict) -> dict[str, list[str]]:
    """tile name -> list of res-5 cell ids inside it."""
    tiles = {}
    for cid, (lat, lon) in cells.items():
        la, lo = math.floor(lat / 3) * 3, math.floor(lon / 3) * 3
        ns = f"N{la:02d}" if la >= 0 else f"S{-la:02d}"
        ew = f"E{lo:03d}" if lo >= 0 else f"W{-lo:03d}"
        tiles.setdefault(ns + ew, []).append(cid)
    return tiles


def lc_classes(cells: dict) -> dict:
    import rasterio
    os.environ["AWS_NO_SIGN_REQUEST"] = "YES"
    out = {c: None for c in cells}
    for i, (tile, cids) in enumerate(wc_tiles(cells).items()):
        url = f"{WC_BUCKET}/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
        t0 = time.monotonic()
        try:
            with rasterio.open(url) as ds:
                dec = ds.read(1, out_shape=(ds.height // 10,
                                            ds.width // 10),
                              resampling=rasterio.enums.Resampling.nearest)
                for cid in cids:
                    lat, lon = cells[cid]
                    # centroid + hexagon ring samples inside the cell
                    pts = [(lat, lon)] + [
                        (lat + 0.02 * math.sin(a),
                         lon + 0.02 * math.cos(a))
                        for a in np.linspace(0, 2 * np.pi, 6)[:-1]]
                    vals = []
                    for la, lo in pts:
                        r, c = ds.index(lo, la)
                        rr, cc = r // 10, c // 10
                        if 0 <= rr < dec.shape[0] and 0 <= cc < dec.shape[1]:
                            vals.append(dec[rr, cc])
                    if vals:
                        dom = max(set(vals), key=vals.count)
                        out[cid] = WC_MAP.get(dom, "other")
        except Exception as exc:
            print(f"  wc {tile}: {type(exc).__name__} {exc}", flush=True)
        print(f"  wc {i + 1} tiles {tile} "
              f"({time.monotonic() - t0:.0f}s)", flush=True)
    return out


# -------------------------------------------------------------------- main -

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cells = {c: h3.cell_to_latlng(c)
             for c in json.loads(CELLS_JSON.read_text())["r5"]}
    print(f"{len(cells)} res-5 cells", flush=True)

    print("power stats...", flush=True)
    pts = power_stats()
    near = assign_nearest(pts, cells)

    print("soilgrids...", flush=True)
    soils = soil_samples(cells)

    print("worldcover...", flush=True)
    lcs = lc_classes(cells)

    shards = {}
    for cid, (lat, lon) in cells.items():
        r2 = h3.cell_to_parent(cid, 2)
        p = near[cid]
        soil = soils.get(cid)
        entry = {
            "rain_mm_yr": round(float(p["rain_mm_yr"])),
            "rain_cv": round(float(p["rain_cv"]), 2),
            "rain_p25_mm": round(float(p["rain_p25_mm"])),
            "heavy_days_yr": round(float(p["heavy_days_yr"]), 1),
            "sm_anom_pct": None, "sm_updated": None,
            "frost_free": p["frost_free"],
            "hot_days_gt35": round(float(p["hot_days_gt35"]), 1),
            "grace_trend": None, "gaez": None,
            "bare_soil_days_yr": None,
            "soil": ({
                "texture": texture_class(soil["clay_g_kg"],
                                         soil["sand_g_kg"],
                                         soil["silt_g_kg"]),
                "soc_g_kg": round(soil["soc_g_kg"] / 10, 1)
                if soil["soc_g_kg"] else None}
                if soil else None),
            "lc": lcs.get(cid),
            "src": {
                "rain": {"dataset": "NASA POWER daily",
                         "resolution": "0.5°×0.625°",
                         "period": "2013-2025"},
                "soil": {"dataset": "ISRIC SoilGrids v2 WCS",
                         "resolution": "250 m", "period": "0-30 cm"},
                "lc": {"dataset": "ESA WorldCover v200",
                       "resolution": "10 m", "period": "2021"},
            }}
        shards.setdefault(r2, {})[cid] = entry

    for r2, cs in shards.items():
        path = OUT_DIR / f"{r2}.json"
        path.write_text(json.dumps(
            {"shard": r2, "cells": cs}, ensure_ascii=False),
            encoding="utf-8")
    print(f"wrote {len(shards)} shards to {OUT_DIR}", flush=True)


if __name__ == "__main__":
    sys.exit(main())

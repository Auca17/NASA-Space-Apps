"""Task 20.2: elevation-correct frost_free / hot_days_gt35 in field/grid.

- elevation_m per res-5 cell: mean of AWS Terrarium tiles (z8 ~500 m/px)
  over the cell bbox; tiles cached to disk.
- POWER cell elevation: third coordinate of the point response, one
  request per unique POWER grid point (batched, disk cache, pauses).
- delta = -0.0065 * (cell_elev - power_elev) applied when |diff| >= 100 m;
  recompute frost_free (same _frost_free_md as build_field_grid) and
  hot_days_gt35 from the parquet series. Keep *_raw, add temp_adjust_c,
  elevation_m.
"""
import io
import json
import math
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import h3
import httpx
import numpy as np
import pandas as pd
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_field_grid import _frost_free_md, assign_nearest, power_stats  # noqa: E402

GRID_DIR = ROOT / "data/processed/field/grid"
POWER_PQ = ROOT / "data/processed/model_input/power_ar_daily.parquet"
CELLS_JSON = ROOT / "data/geo/argentina_r5.json"
TILE_DIR = ROOT / "data/earthdata/terrarium_z8"
ELEV_CACHE = ROOT / "data/earthdata/power_elev.json"
TERR = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
Z = 8
LAPSE = 0.0065
MIN_DIFF = 100
FULL_YEARS = range(2013, 2026)


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1 - math.log(math.tan(math.radians(lat))
                     + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def load_tile(tx, ty):
    p = TILE_DIR / f"{tx}_{ty}.png"
    if not p.exists():
        url = TERR.format(z=Z, x=tx, y=ty)
        req = urllib.request.Request(url, headers={"User-Agent": "fg/1.0"})
        p.write_bytes(urllib.request.urlopen(req, timeout=60).read())
    a = np.asarray(Image.open(p), dtype=np.float64)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


def cell_elevation(lat, lon):
    """Mean terrain elevation over ~0.05 deg around the centroid."""
    d = 0.06
    x0, y0 = tile_xy(lat + d, lon - d, Z)
    x1, y1 = tile_xy(lat - d, lon + d, Z)
    vals = []
    for tx in range(int(min(x0, x1)), int(max(x0, x1)) + 1):
        for ty in range(int(min(y0, y1)), int(max(y0, y1)) + 1):
            try:
                e = load_tile(tx, ty)
            except Exception:
                continue
            c0 = int(np.clip((min(x0, x1) - tx) * 256, 0, 255))
            c1 = int(np.clip((max(x0, x1) - tx) * 256, 0, 255))
            r0 = int(np.clip((min(y0, y1) - ty) * 256, 0, 255))
            r1 = int(np.clip((max(y0, y1) - ty) * 256, 0, 255))
            w = e[r0:r1 + 1, c0:c1 + 1]
            if w.size:
                vals.append(float(np.nanmean(w)))
    return float(np.mean(vals)) if vals else None


def power_elev(point):
    lat, lon = point
    r = httpx.get(
        "https://power.larc.nasa.gov/api/temporal/daily/point",
        params={"parameters": "T2M", "community": "AG",
                "latitude": lat, "longitude": lon,
                "start": "20240101", "end": "20240102",
                "format": "JSON"}, timeout=30)
    r.raise_for_status()
    c = r.json()["geometry"]["coordinates"]
    return float(c[2]) if len(c) >= 3 else None


def main():
    TILE_DIR.mkdir(parents=True, exist_ok=True)
    cells = {c: h3.cell_to_latlng(c)
             for c in json.loads(CELLS_JSON.read_text())["r5"]}
    print(f"{len(cells)} res-5 cells", flush=True)

    df = pd.read_parquet(POWER_PQ)
    df["date"] = pd.to_datetime(df["date"])
    df["year"] = df["date"].dt.year
    full = df[df["year"].isin(FULL_YEARS)]
    pts = full[["lat", "lon"]].drop_duplicates().reset_index(drop=True)
    near = assign_nearest(pts, cells)
    p2cell = {cid: (float(near[cid]["lat"]), float(near[cid]["lon"]))
              for cid in cells}
    uniq = sorted(set(p2cell.values()))
    print(f"{len(uniq)} unique POWER points", flush=True)

    # ---- res-5 cell elevations (terrarium, ~1 km) ----
    elev_r5 = {}
    cache = ROOT / "data/earthdata/r5_elev.json"
    if cache.exists():
        elev_r5 = {k: v for k, v in
                   json.loads(cache.read_text()).items()}
    for i, (cid, (la, lo)) in enumerate(cells.items()):
        if cid in elev_r5:
            continue
        elev_r5[cid] = cell_elevation(la, lo)
        if i % 100 == 0:
            cache.write_text(json.dumps(elev_r5))
            print(f"  r5 elev {i}/{len(cells)}", flush=True)
    cache.write_text(json.dumps(elev_r5))
    print("cell elevations done", flush=True)

    # ---- POWER cell elevations (API 3rd coordinate; terrain-mean
    # fallback over the 0.5 x 0.625 cell when the API rate-limits) ----
    pe = json.loads(ELEV_CACHE.read_text()) if ELEV_CACHE.exists() else {}
    pending = [p for p in uniq if pe.get(f"{p[0]}|{p[1]}") is None]

    def job(p):
        try:
            return p, power_elev(p)
        except Exception:
            return p, None

    with ThreadPoolExecutor(max_workers=2) as ex:
        for i, (p, v) in enumerate(ex.map(job, pending)):
            pe[f"{p[0]}|{p[1]}"] = v
            if i % 200 == 0:
                ELEV_CACHE.write_text(json.dumps(pe))
                print(f"  power elev {i}/{len(pending)}", flush=True)
            time.sleep(0.3)
    ELEV_CACHE.write_text(json.dumps(pe))
    still = [p for p in pending if pe.get(f"{p[0]}|{p[1]}") is None]
    if still:
        print(f"terrain fallback for {len(still)} power cells",
              flush=True)
        for p in still:
            la, lo = p
            try:
                x0, y0 = tile_xy(la + 0.25, lo - 0.3125, Z)
                x1, y1 = tile_xy(la - 0.25, lo + 0.3125, Z)
                vals = []
                for tx in range(int(min(x0, x1)), int(max(x0, x1)) + 1):
                    for ty in range(int(min(y0, y1)),
                                    int(max(y0, y1)) + 1):
                        try:
                            e = load_tile(tx, ty)
                            vals.append(float(np.nanmean(e)))
                        except Exception:
                            pass
                pe[f"{la}|{lo}"] = float(np.mean(vals)) if vals else None
            except Exception:
                pass
        ELEV_CACHE.write_text(json.dumps(pe))
    print("power elevations done", flush=True)

    # ---- recompute frost_free / hot_days_gt35 -------------------------
    grouped = {k: g for k, g in full.groupby(["lat", "lon"])}
    stats = {}
    n_gt1 = n_gt3 = 0
    adjs = []
    for cid, (la, lo) in cells.items():
        er = elev_r5.get(cid)
        pk = p2cell[cid]
        ep = pe.get(f"{pk[0]}|{pk[1]}")
        delta = 0.0
        if (er is not None and ep is not None
                and abs(er - ep) >= MIN_DIFF):
            delta = round(-LAPSE * (er - ep), 2)
        stats[cid] = {"delta": delta, "elev": er}
        if abs(delta) > 1:
            n_gt1 += 1
        if abs(delta) > 3:
            n_gt3 += 1
        adjs.append((abs(delta), delta, cid))

        gdf = grouped.get(pk)
        if gdf is None or not delta:
            continue
        tmax = gdf.set_index("date")["T2M_MAX"] + delta
        tmin = gdf.set_index("date")["T2M_MIN"] + delta
        hot = tmax.groupby(tmax.index.year).apply(
            lambda s: (s > 35).sum())
        stats[cid]["hot"] = round(float(hot.mean()), 1)
        stats[cid]["ff"] = _frost_free_md(tmin)

    # ---- merge into shards --------------------------------------------
    n_adj = 0
    for fp in sorted(GRID_DIR.glob("*.json")):
        d = json.loads(fp.read_text(encoding="utf-8"))
        dirty = False
        for cid, c in d["cells"].items():
            s = stats.get(cid)
            if not s:
                continue
            c["elevation_m"] = s["elev"]
            c["temp_adjust_c"] = s["delta"]
            if s["delta"]:
                c.setdefault("frost_free_raw", c.get("frost_free"))
                c.setdefault("hot_days_gt35_raw",
                             c.get("hot_days_gt35"))
                if "hot" in s:
                    c["hot_days_gt35"] = s["hot"]
                if "ff" in s:
                    c["frost_free"] = s["ff"]
                n_adj += 1
            dirty = True
        if dirty:
            fp.write_text(json.dumps(d, ensure_ascii=False),
                          encoding="utf-8")

    top = sorted(adjs, reverse=True)[:5]
    print("RESULT cells=%d adj>1C=%d adj>3C=%d adjusted=%d"
          % (len(cells), n_gt1, n_gt3, n_adj))
    for a, delta, cid in top:
        print(f"  top {delta:+.2f} C  {cid} "
              f"{cells[cid]}", flush=True)


if __name__ == "__main__":
    sys.exit(main())

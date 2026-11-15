"""ECOSTRESS ECO_L2T_LSTE mean LST inside the two demo plots (task 18.3).

Granules ship as Cloud-Optimized GeoTIFFs (LST.tif, QC.tif, ...).
Downloads up to N recent scenes per site (bbox search), computes mean
LST inside the plot bbox with the QC mask, compares with NASA POWER
T2M_MAX for the same dates, writes data/processed/ecostress_demo.json.
"""
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import transform as warp
from rasterio.windows import from_bounds
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env", override=False)

import earthaccess  # noqa: E402
import httpx  # noqa: E402

DL = ROOT / "data/earthdata/ecostress"
OUT = ROOT / "data/processed/ecostress_demo.json"
N_SCENES = 10
SITES = {
    "mendoza": {"bbox": (-68.95, -33.07, -68.88, -33.01),
                "center": (-33.04, -68.91), "crop": "Viña"},
}


def _read_masked(tif_path, bbox):
    """Window-read a tif at the bbox; return masked array or None."""
    with rasterio.open(tif_path) as ds:
        xs, ys = warp("EPSG:4326", ds.crs,
                      [bbox[0], bbox[2]], [bbox[1], bbox[3]])
        win = from_bounds(min(xs), min(ys), max(xs), max(ys),
                          transform=ds.transform)
        win = win.round_offsets().round_lengths()
        if win.width <= 0 or win.height <= 0:
            return None
        arr = ds.read(1, window=win).astype("float32")
        return arr  # nodata is nan already


def scene_mean(files, bbox):
    """Mean LST (deg C) inside bbox for one granule's tif set."""
    lst = next((f for f in files if str(f).endswith("LST.tif")), None)
    cloud = next((f for f in files if str(f).endswith("cloud.tif")),
                 None)
    if lst is None:
        return None, "no LST.tif"
    v = _read_masked(lst, bbox)
    if v is None:
        return None, "empty window"
    if cloud is not None:
        q = _read_masked(cloud, bbox)
        if q is not None and q.shape == v.shape:
            v = np.where(q == 0, v, np.nan)  # 1 = cloudy
    v = v - 273.15  # L2T_LSTE stores LST in Kelvin
    n = int((~np.isnan(v)).sum())
    if n < 5:
        return None, f"only {n} clear px"
    return float(np.nanmean(v)), n


def granule_date(g):
    try:
        return str(g["umm"]["TemporalExtent"]["RangeDateTime"]
                   ["BeginningDateTime"])[:10]
    except Exception:
        return ""


def power_tmax(lat, lon, dates):
    if not dates:
        return {}
    r = httpx.get(
        "https://power.larc.nasa.gov/api/temporal/daily/point",
        params={"parameters": "T2M_MAX", "community": "AG",
                "latitude": lat, "longitude": lon,
                "start": min(dates).replace("-", ""),
                "end": max(dates).replace("-", ""),
                "format": "JSON"}, timeout=60)
    r.raise_for_status()
    raw = r.json()["properties"]["parameter"]["T2M_MAX"]
    return {f"{k[:4]}-{k[4:6]}-{k[6:]}": v for k, v in raw.items()
            if v > -900}


def main():
    earthaccess.login(strategy="environment")
    DL.mkdir(parents=True, exist_ok=True)
    out = {"note": "ECOSTRESS ECO_L2T_LSTE 70 m LST vs NASA POWER "
                   "T2M_MAX (demo plots)", "sites": {}}
    for name, site in SITES.items():
        bb = site["bbox"]
        grs = earthaccess.search_data(
            short_name="ECO_L2T_LSTE", version="002",
            temporal=("2024-11-01", "2026-11-15"),
            bounding_box=bb, count=40)
        rows = []
        for g in reversed(grs):  # newest first
            if len(rows) >= N_SCENES:
                break
            try:
                files = earthaccess.download(g, DL)
            except Exception as exc:
                print(f"  dl fail: {type(exc).__name__}", flush=True)
                continue
            date = granule_date(g)
            try:
                mean_c, npx = scene_mean(files, bb)
            except Exception as exc:
                mean_c, npx = None, f"read {type(exc).__name__}"
            if mean_c is None:
                print(f"  {date}: unusable ({npx})", flush=True)
                continue
            rows.append({"date": date, "lst_c": round(mean_c, 1),
                         "n_px": npx})
            print(f"  {name} {date}: {mean_c:.1f} C ({npx} px)",
                  flush=True)
        tmax = power_tmax(*site["center"],
                          [r["date"] for r in rows])
        for r in rows:
            r["power_t2m_max_c"] = tmax.get(r["date"])
        diffs = [r["lst_c"] - r["power_t2m_max_c"]
                 for r in rows if r.get("power_t2m_max_c") is not None]
        out["sites"][name] = {
            "crop": site["crop"], "bbox": site["bbox"],
            "n_scenes": len(rows),
            "bias_c": round(float(np.mean(diffs)), 1) if diffs else None,
            "rmse_c": round(float(np.sqrt(np.mean(
                np.array(diffs) ** 2))), 1) if diffs else None,
            "scenes": rows}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1),
                   encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()

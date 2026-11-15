"""On-demand bare-soil estimate outside the Argentina grid, from
Sentinel-2 L2A (AWS Earth Search STAC, public, no credentials — the
same source field_moisture.py and current_crop.py already read).

Monthly median NDVI of clear pixels (SCL classes vegetation, bare soil
and water) over the last 12 months, at 20 m, inside the plot or a
300 m circle around the point. Months with NDVI < 0.2 count as bare
soil; bare_soil_days = months x 30.4. Hard budget <6 s, cached 24 h by
rounded location; on failure or too few clear months the caller gets
a reason and must report value null (never zero).
"""
from __future__ import annotations

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import httpx
import numpy as np
from affine import Affine
from rasterio import Env, open as raster_open
from rasterio.features import geometry_mask
from rasterio.warp import transform_geom
from rasterio.windows import Window, from_bounds
from shapely.geometry import mapping, shape

from ..cache import CACHE
from .field_moisture import asset_url
from .parcel_geo import circle_polygon

log = logging.getLogger("field")

SEARCH = "https://earth-search.aws.element84.com/v1/search"
BANDS = ("red", "nir08", "scl")
CLEAR_SCL = {4, 5, 6}            # vegetation, not vegetated, water
NDVI_BARE = 0.2
MONTHS = 12
SCENES_PER_MONTH = 1
RADIUS_M = 300
MIN_PIXELS = 8
MIN_MONTHS = 4
BUDGET_S = 5.5
TTL_S = 24 * 3600

_READ_POOL = ThreadPoolExecutor(max_workers=24)

# GDAL HTTP opts are process-global: set once so multiplexed HTTP/2
# sessions and the VSICURL cache are shared across all scene reads
_ENV = Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
           GDAL_HTTP_TIMEOUT="5", GDAL_HTTP_MAX_RETRY="0",
           GDAL_HTTP_MULTIPLEX="YES", GDAL_HTTP_VERSION="2",
           VSI_CACHE="TRUE",
           CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif")
_ENV.__enter__()

_reason_text = {
    "unavailable": ("Sin acceso al catálogo Sentinel-2 en este momento",
                    "Sentinel-2 catalog unavailable right now"),
    "no_scenes": ("No hay escenas Sentinel-2 despejadas recientes para "
                  "este punto", "No recent cloud-free Sentinel-2 scenes "
                  "for this point"),
    "too_few_months": ("No hay suficientes meses despejados para estimar "
                       "el suelo desnudo", "Not enough clear months to "
                       "estimate bare soil"),
    "timeout": ("La consulta a Sentinel-2 tardó demasiado",
                "Sentinel-2 request took too long"),
}


def reason_text(reason: str, lang: str = "es") -> str:
    pair = _reason_text.get(reason, _reason_text["unavailable"])
    return pair[1] if lang == "en" else pair[0]


def _read_ds(raster, bounds, decimate: int = 1):
    w = from_bounds(*bounds, transform=raster.transform)
    x0, y0 = int(np.floor(w.col_off)), int(np.floor(w.row_off))
    x1 = int(np.ceil(w.col_off + w.width))
    y1 = int(np.ceil(w.row_off + w.height))
    window = Window(x0, y0, x1 - x0, y1 - y0)
    if not 0 < window.width * window.height <= 300_000:
        return None
    out_shape = (window.height // decimate, window.width // decimate) \
        if decimate > 1 else None
    data = raster.read(1, window=window, boundless=True, fill_value=0,
                       out_shape=out_shape)
    transform = raster.window_transform(window)
    if decimate > 1:
        transform = transform @ Affine.scale(decimate)
    return data, transform


def _read_window(url: str, bounds, crs, decimate: int = 1):
    """Band-windowed read; each band gets its own window because SCL is
    20 m while red is 10 m."""
    with raster_open(url) as raster:
        if str(raster.crs) != str(crs):
            return None
        return _read_ds(raster, bounds, decimate)


def _scene_plan(scene: dict, geom):
    """(urls, projected_geom, crs) for one scene, or None."""
    assets = scene["assets"]
    epsg = scene["properties"].get("proj:epsg")
    if not all(b in assets for b in BANDS) or not epsg:
        return None
    try:
        urls = {key: asset_url(assets[key]) for key in BANDS}
    except (KeyError, ValueError):
        return None
    crs = f"EPSG:{epsg}"
    projected = shape(transform_geom("EPSG:4326", crs, mapping(geom)))
    return urls, projected, crs


def scene_ndvi(scene: dict, geom) -> float | None:
    """Median NDVI of clear pixels of one scene inside `geom`."""
    plan = _scene_plan(scene, geom)
    if plan is None:
        return None
    urls, projected, crs = plan
    try:
        with ThreadPoolExecutor(3) as pool:
            reads = dict(zip(BANDS, pool.map(
                lambda kv: _read_window(kv[1], projected.bounds, crs,
                                        2 if kv[0] == "red" else 1),
                urls.items())))
    except (OSError, RuntimeError, ValueError):
        return None
    return _scene_from_reads(reads, projected)


def _scene_from_reads(reads: dict, projected) -> float | None:
    if any(v is None for v in reads.values()):
        return None
    (red, transform), (nir, _), (scl, _) = (reads["red"], reads["nir08"],
                                           reads["scl"])
    # all arrays now share the 20 m grid; align on the smallest shape
    h = min(red.shape[0], nir.shape[0], scl.shape[0])
    w = min(red.shape[1], nir.shape[1], scl.shape[1])
    red, nir, scl = red[:h, :w], nir[:h, :w], scl[:h, :w]
    inside = geometry_mask([projected], out_shape=red.shape,
                           transform=transform, invert=True,
                           all_touched=True)
    valid = (inside & (nir > 0) & (red > 0)
             & np.isin(scl, list(CLEAR_SCL)))
    if valid.sum() < MIN_PIXELS or valid.sum() < .1 * inside.sum():
        return None
    ndvi = (nir[valid].astype("float32") - red[valid]) / \
        (nir[valid].astype("float32") + red[valid])
    return float(np.median(ndvi))


async def bare_soil_estimate(clat: float, clon: float,
                             geom=None) -> dict:
    """{"ndvi_monthly": [12], "months_with_data": n,
        "bare_soil_days": int} or {"reason": str}."""
    key = f"{clat:.3f},{clon:.3f}" if geom is None else \
        f"g:{clat:.3f},{clon:.3f}"
    cached = CACHE.get(key, "bare_soil_s2")
    if cached is not None:
        return cached
    result = await _fetch(clat, clon, geom)
    # stable results cached 24 h; transient failures are not cached so
    # a cold GDAL session doesn't poison the whole day
    if result.get("reason") in (None, "no_scenes", "too_few_months"):
        CACHE.set(key, "bare_soil_s2", result, TTL_S)
    return result


async def _fetch(clat: float, clon: float, geom) -> dict:
    area = geom if geom is not None else \
        shape(circle_polygon(clon, clat, RADIUS_M))
    today = date.today()
    start = today - timedelta(days=366)
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            result = await client.post(SEARCH, json={
                "collections": ["sentinel-2-l2a"],
                "intersects": mapping(area),
                "datetime": f"{start}T00:00:00Z/{today}T23:59:59Z",
                "sortby": [{"field": "properties.datetime",
                            "direction": "desc"}],
                "query": {"eo:cloud_cover": {"lt": 60}},
                "limit": 300,   # ~15 scenes/month -> covers 12 months
            })
            result.raise_for_status()
            scenes = result.json()["features"]
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        log.warning("Sentinel catalog unavailable: %s", type(exc).__name__)
        return {"reason": "unavailable"}
    if not scenes:
        return {"reason": "no_scenes"}

    per_month: dict[tuple[int, int], list] = {}
    for scene in scenes:
        stamp = scene["properties"].get("datetime") or ""
        try:
            key = (int(stamp[:4]), int(stamp[5:7]))
        except (TypeError, ValueError):
            continue
        bucket = per_month.setdefault(key, [])
        if len(bucket) < SCENES_PER_MONTH * 4:
            bucket.append(scene)
    # keep the clearest scenes per month
    for key, bucket in per_month.items():
        bucket.sort(key=lambda s: s["properties"].get(
            "eo:cloud_cover", 99))
        del bucket[SCENES_PER_MONTH:]

    months = []
    y, m = today.year, today.month
    for _ in range(MONTHS):
        months.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    months.reverse()

    # hard timeout: threads can't be cancelled, so we wait on futures
    # and simply ignore whichever are still running past the budget.
    # One flat job per (scene, band) in the shared pool: no nested
    # pools competing for the link.
    loop = asyncio.get_running_loop()
    plans = {}   # scene idx -> (urls, projected, crs)
    jobs = []    # (month_key, scene_idx, band, future)
    for key in months:
        for si, scene in enumerate(per_month.get(key, [])):
            plan = _scene_plan(scene, area)
            if plan is None:
                continue
            plans[(key, si)] = plan
            urls, projected, crs = plan
            for band in BANDS:
                jobs.append((key, si, band,
                             loop.run_in_executor(
                                 _READ_POOL, _read_window, urls[band],
                                 projected.bounds, crs,
                                 2 if band == "red" else 1)))
    done, pending = await asyncio.wait(
        [f for _, _, _, f in jobs],
        timeout=max(1.0, BUDGET_S - (time.monotonic() - t0)))
    if pending:
        log.warning("bare_soil_s2: %d band reads still running past "
                    "budget at %.2f,%.2f", len(pending), clat, clon)
    reads_by_scene: dict[tuple, dict] = {}
    for key, si, band, fut in jobs:
        if fut in done and not fut.cancelled() and fut.exception() is None:
            reads_by_scene.setdefault((key, si), {})[band] = fut.result()
    per_month_vals: dict[tuple[int, int], list] = {}
    for (key, si), reads in reads_by_scene.items():
        if len(reads) == len(BANDS):
            v = _scene_from_reads(reads, plans[(key, si)][1])
            if v is not None:
                per_month_vals.setdefault(key, []).append(v)
    medians = [round(float(np.median(per_month_vals[k])), 3)
               if k in per_month_vals else None for k in months]
    if pending and sum(v is not None for v in medians) < MIN_MONTHS:
        return {"reason": "timeout"}

    n_data = sum(v is not None for v in medians)
    if n_data < MIN_MONTHS:
        return {"reason": "too_few_months",
                "ndvi_monthly": medians, "months_with_data": n_data}
    bare = sum(1 for v in medians if v is not None and v < NDVI_BARE)
    return {"ndvi_monthly": medians, "months_with_data": n_data,
            "bare_soil_days": round(bare * 30.4)}

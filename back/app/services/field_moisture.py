"""Relative canopy moisture from real Sentinel-2 reflectance."""

import asyncio
import hashlib
import logging
from datetime import date, timedelta
from urllib.parse import urlsplit

import httpx
import numpy as np
from rasterio import Env, open as raster_open
from rasterio.features import geometry_mask, shapes, sieve
from rasterio.windows import from_bounds, Window
from rasterio.warp import transform_geom
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from ..cache import CACHE
from .field_geometry import pieces

SEARCH = "https://earth-search.aws.element84.com/v1/search"
log = logging.getLogger("field")
BANDS = ("nir08", "swir16", "scl")
CLASSES = {1: "missing", 2: "dry", 3: "middle", 4: "wet"}


def classify(values, inside):
    valid = inside & np.isfinite(values)
    codes = np.where(inside, 1, 0).astype("uint8")
    codes[valid] = 3
    if valid.sum() >= 8:
        low, high = np.quantile(values[valid], [.2, .8])
        if high - low >= .06:
            cutoff = (high - low) / 3
            codes[valid & (values < low + cutoff)] = 2
            codes[valid & (values > high - cutoff)] = 4
            if valid.sum() >= 12:
                codes = sieve(codes, size=4, mask=valid.astype("uint8"))
    return codes


def asset_url(asset):
    url = asset["href"]
    parts = urlsplit(url)
    if (parts.scheme != "https" or parts.username or parts.password or
            parts.hostname != "sentinel-cogs.s3.us-west-2.amazonaws.com"):
        raise ValueError("unexpected Sentinel asset host")
    return url


def reflectance(raw, asset, applied):
    band = (asset.get("raster:bands") or [{}])[0]
    scale = band.get("scale", .0001)
    offset = 0 if applied else band.get("offset", 0)
    return raw.astype("float32") * scale + offset


def read_scene(scene, geom):
    assets = scene["assets"]
    urls = {key: asset_url(assets[key]) for key in BANDS}
    with Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="5",
             GDAL_HTTP_MAX_RETRY="0", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        with raster_open(urls["swir16"]) as reference:
            crs = reference.crs
            projected = shape(transform_geom("EPSG:4326", crs, mapping(geom)))
            w = from_bounds(*projected.bounds, transform=reference.transform)
            x0, y0 = int(np.floor(w.col_off)), int(np.floor(w.row_off))
            x1 = int(np.ceil(w.col_off + w.width))
            y1 = int(np.ceil(w.row_off + w.height))
            window = Window(x0, y0, x1 - x0, y1 - y0)
            if not 0 < window.width * window.height <= 300_000:
                return None
            transform = reference.window_transform(window)
            swir = reference.read(1, window=window, boundless=True, fill_value=0)
        arrays = {}
        for key in ("nir08", "scl"):
            with raster_open(urls[key]) as raster:
                if raster.crs != crs or raster.window_transform(window) != transform:
                    return None
                arrays[key] = raster.read(1, window=window, boundless=True, fill_value=0)

    inside = geometry_mask([projected], out_shape=swir.shape, transform=transform,
                           invert=True, all_touched=True)
    nir, scl = arrays["nir08"], arrays["scl"]
    valid = inside & (nir > 0) & (swir > 0) & (scl == 4)
    if valid.sum() < 8 or valid.sum() < .1 * inside.sum():
        return None
    applied = scene["properties"].get("earthsearch:boa_offset_applied") is True
    n = reflectance(nir, assets["nir08"], applied)
    s = reflectance(swir, assets["swir16"], applied)
    valid &= (n > 0) & (s > 0)
    values = np.full(n.shape, np.nan)
    np.divide(n - s, n + s, out=values, where=valid)
    if valid.sum() < 8 or valid.sum() < .1 * inside.sum():
        return None

    labels = classify(values, inside)
    sectors = []
    for polygon, code in shapes(labels, mask=(labels >= 2), transform=transform):
        clipped = shape(polygon).buffer(0).intersection(projected)
        if clipped.area < 800:  # two full 20 m pixels before reporting a sector
            continue
        sectors.append((clipped, CLASSES[int(code)]))
    if not sectors:
        return None
    used = unary_union([poly for poly, _ in sectors])
    unobserved = projected.difference(used)
    if unobserved.area:
        sectors.append((unobserved, "missing"))
    zones = []
    for poly, label in sectors:
        polygons = [part for part in pieces(poly)
                    if part.geom_type == "Polygon" and part.area > 0]
        if not polygons and poly.geom_type == "GeometryCollection":
            polygons = [part for component in poly.geoms
                        for part in pieces(component) if part.geom_type == "Polygon"]
        if polygons:
            geometry = mapping(unary_union(polygons))
            zones.append({"kind": label, "ha": sum(part.area for part in polygons) / 10_000,
                          "geometry": transform_geom(crs, "EPSG:4326", geometry)})
    fraction = min(1.0, used.area / projected.area)
    return {"coverage": fraction, "zones": zones,
            "date": scene["properties"]["datetime"][:10], "resolution_m": 20,
            "status": "available"}


async def moisture_zones(geom):
    geometry_key = hashlib.sha256(geom.wkb).hexdigest()
    cached = CACHE.get(geometry_key, "canopy_moisture")
    if cached is not None:
        return cached
    if geom.bounds[2] - geom.bounds[0] > .4 or geom.bounds[3] - geom.bounds[1] > .4:
        return {"status": "no_detail"}
    try:
        today = date.today()
        async with httpx.AsyncClient(timeout=10) as client:
            result = await client.post(SEARCH, json={
                "collections": ["sentinel-2-l2a"], "intersects": mapping(geom),
                "datetime": f"{today - timedelta(days=45)}T00:00:00Z/{today}T23:59:59Z",
                "sortby": [{"field": "properties.datetime", "direction": "desc"}],
                "query": {"eo:cloud_cover": {"lt": 65}}, "limit": 8,
            })
            result.raise_for_status()
            scenes = result.json()["features"]
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        log.warning("Sentinel catalog unavailable: %s", type(exc).__name__)
        return {"status": "unavailable"}
    best = None
    failures = 0
    for scene in scenes[:4]:
        try:
            outcome = await asyncio.to_thread(read_scene, scene, geom)
        except (OSError, ValueError, KeyError, RuntimeError) as exc:
            log.warning("Sentinel scene could not be read: %s", type(exc).__name__)
            failures += 1
            continue
        if outcome and (best is None or outcome["coverage"] > best["coverage"]):
            best = outcome
            if best["coverage"] >= .8:
                break
    status = "unavailable" if failures and failures == min(4, len(scenes)) else "no_detail"
    result = best or {"status": status}
    CACHE.set(geometry_key, "canopy_moisture", result,
              ttl_seconds=21_600 if best else 600)
    return result

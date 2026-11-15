"""What is on each part of a field NOW, from this season's Sentinel-2.

No crop map of the running campaign is published (INTA's newest is
2024-2025), so we read the field's NDVI on a few clear dates since the
start of the winter and classify each 20 m pixel by its phenology:

  winter_cereal  bare/low in early winter, green in Aug-Oct (wheat/barley)
  summer_early   bare in winter, greening now (early maize, sown Sep-Oct)
  fallow         bare now and through the winter: waiting for summer sowing
  perennial      green the whole time (pasture, alfalfa, woods)

Soybean vs late maize cannot be told yet: they are sown Nov-Dec.
Only the southern-hemisphere season (Argentina, Jun-Mar) is modelled.
"""

import asyncio
import hashlib
import logging
import warnings
from datetime import date, timedelta

import httpx
import numpy as np
from rasterio import Env, open as raster_open
from rasterio.enums import Resampling
from rasterio.features import geometry_mask, shapes, sieve
from rasterio.warp import transform_geom
from rasterio.windows import Window, from_bounds
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import unary_union

from ..cache import CACHE
from .field_moisture import SEARCH, asset_url, reflectance

log = logging.getLogger("field")

SOURCE = "Sentinel-2 L2A (ESA Copernicus) · fenología de la campaña en curso"
RES_M = 20
MAX_PIXELS = 400_000
MIN_ZONE_SHARE = 0.03
MIN_ZONE_HA = 1.0
MAX_ZONE_VERTICES = 1500

CLASSES = {
    1: {"id": "winter_cereal", "short_es": "Trigo/cebada", "short_en": "Wheat/barley",
        "es": "Trigo o cebada (en pie o recién cosechado)",
        "en": "Wheat or barley (standing or just harvested)", "kind": "crop"},
    2: {"id": "summer_early", "short_es": "Maíz temprano", "short_en": "Early maize",
        "es": "Cultivo de verano temprano (probable maíz)",
        "en": "Early summer crop (likely maize)", "kind": "crop"},
    3: {"id": "fallow", "short_es": "Barbecho", "short_en": "Fallow",
        "es": "Barbecho, listo para la siembra de verano",
        "en": "Fallow, ready for summer sowing", "kind": "fallow"},
    4: {"id": "perennial", "short_es": "Pastura/monte", "short_en": "Pasture/woods",
        "es": "Pastura, alfalfa o monte",
        "en": "Pasture, alfalfa or woodland", "kind": "perennial"},
}


# ------------------------------------------------------------ phenology -----

def classify_pixels(early, mid, now):
    """NDVI stacks -> class code per pixel (0 = not enough clear dates).

    early: NDVI at the start of winter (Jun-Jul)
    mid:   max NDVI over Aug-Oct
    now:   NDVI of the latest clear date (and the one before, max)
    """
    codes = np.zeros(now.shape, dtype=np.uint8)
    ok = np.isfinite(mid) & np.isfinite(now)
    e = np.where(np.isfinite(early), early, np.nan)
    green_mid = mid >= 0.55
    low_early = ~(e >= 0.45)                       # NaN counts as unknown/low
    perennial = ok & green_mid & (e >= 0.45) & (now >= 0.45)
    winter = ok & green_mid & low_early
    winter |= ok & green_mid & ~perennial & (now < 0.45)
    summer = ok & ~green_mid & (now >= 0.40) & (mid < 0.45)
    fallow = ok & ~green_mid & ~summer
    codes[fallow] = 3
    codes[summer] = 2
    codes[winter] = 1
    codes[perennial] = 4
    return codes


# --------------------------------------------------------------- scenes -----

def pick_scenes(scenes, today: date):
    """One clear scene per phase, all on the same MGRS tile."""
    tiles: dict[str, list] = {}
    for s in scenes:
        tile = s["properties"].get("grid:code") or s["properties"].get("s2:mgrs_tile")
        tiles.setdefault(tile, []).append(s)
    if not tiles:
        return None
    best = max(tiles.values(), key=len)
    def d(s):
        return date.fromisoformat(s["properties"]["datetime"][:10])
    def clearest(lo, hi):
        c = [s for s in best if lo <= d(s) <= hi]
        return sorted(c, key=lambda s: s["properties"]["eo:cloud_cover"])[:2]
    y = today.year if today.month >= 6 else today.year - 1
    return {
        "early": clearest(date(y, 6, 1), date(y, 7, 31))[:1],
        "mid": (clearest(date(y, 8, 1), date(y, 8, 31))[:1] +
                clearest(date(y, 9, 1), date(y, 9, 30))[:1] +
                clearest(date(y, 10, 1), date(y, 10, 31))[:1]),
        "now": sorted([s for s in best if d(s) >= today - timedelta(days=30)],
                      key=lambda s: (s["properties"]["eo:cloud_cover"],
                                     -d(s).toordinal()))[:2],
    }


def read_ndvi(scene, projected, crs, window, transform, shape_):
    """NDVI on the reference 20 m grid, NaN where cloudy/invalid."""
    assets = scene["assets"]
    with Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="8",
             GDAL_HTTP_MAX_RETRY="1", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        with raster_open(asset_url(assets["nir08"])) as r:
            if r.crs != crs or r.window_transform(window) != transform:
                return None
            nir = r.read(1, window=window, boundless=True, fill_value=0)
        with raster_open(asset_url(assets["scl"])) as r:
            scl = r.read(1, window=window, boundless=True, fill_value=0)
        with raster_open(asset_url(assets["red"])) as r:   # 10 m -> 20 m
            w10 = Window(window.col_off * 2, window.row_off * 2,
                         window.width * 2, window.height * 2)
            red = r.read(1, window=w10, boundless=True, fill_value=0,
                         out_shape=shape_, resampling=Resampling.average)
    applied = scene["properties"].get("earthsearch:boa_offset_applied") is True
    n = reflectance(nir, assets["nir08"], applied)
    rd = reflectance(red, assets["red"], applied)
    valid = np.isin(scl, (4, 5)) & (n > 0) & (rd > 0)  # vegetation / bare soil
    out = np.full(n.shape, np.nan, dtype="float32")
    np.divide(n - rd, n + rd, out=out, where=valid)
    return out


def _stack(arrays, how):
    arrays = [a for a in arrays if a is not None]
    if not arrays:
        return None
    with np.errstate(all="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        st = np.stack(arrays)
        return np.nanmax(st, axis=0) if how == "max" else np.nanmedian(st, axis=0)


def build_grid(scene, geom):
    with Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="8",
             CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        with raster_open(asset_url(scene["assets"]["nir08"])) as ref:
            crs = ref.crs
            projected = shape(transform_geom("EPSG:4326", crs, mapping(geom)))
            w = from_bounds(*projected.bounds, transform=ref.transform)
            x0, y0 = int(np.floor(w.col_off)), int(np.floor(w.row_off))
            window = Window(x0, y0, int(np.ceil(w.col_off + w.width)) - x0,
                            int(np.ceil(w.row_off + w.height)) - y0)
            if not 0 < window.width * window.height <= MAX_PIXELS:
                return None
            transform = ref.window_transform(window)
    shape_ = (int(window.height), int(window.width))
    inside = geometry_mask([projected], out_shape=shape_, transform=transform,
                           invert=True, all_touched=False)
    return crs, projected, window, transform, shape_, inside


def read_phases(picked, geom):
    first = (picked["now"] or picked["mid"])[0]
    grid = build_grid(first, geom)
    if grid is None:
        return None
    crs, projected, window, transform, shape_, inside = grid
    phases, dates = {}, {}
    for phase, scenes in picked.items():
        arrays = []
        for s in scenes:
            try:
                arrays.append(read_ndvi(s, projected, crs, window, transform, shape_))
                dates.setdefault(phase, []).append(s["properties"]["datetime"][:10])
            except (OSError, ValueError, KeyError, RuntimeError) as exc:
                log.warning("Sentinel scene unreadable: %s", type(exc).__name__)
        phases[phase] = _stack(arrays, "max")
    return phases, dates, inside, transform, crs


# ---------------------------------------------------------------- zones -----

def _polys(g):
    if isinstance(g, Polygon):
        return [g]
    return [p for p in getattr(g, "geoms", []) if isinstance(p, Polygon)]


def _vertices(g):
    return sum(len(p.exterior.coords) + sum(len(i.coords) for i in p.interiors)
               for p in _polys(g))


def zones_from_codes(codes, inside, transform, crs, projected):
    """Projected-metre geometry per class -> WGS84 zones, biggest first."""
    codes = np.where(inside, codes, 0).astype(np.uint8)
    if (codes > 0).sum() >= 12:
        codes = sieve(codes, size=6, mask=(codes > 0).astype("uint8"))
        codes = np.where(inside, codes, 0).astype(np.uint8)
    field_m2 = projected.area
    floor = max(MIN_ZONE_HA * 1e4, MIN_ZONE_SHARE * field_m2)
    zones = []
    for code, meta in CLASSES.items():
        mask = codes == code
        if not mask.any():
            continue
        polys = [shape(g) for g, v in shapes(mask.astype(np.uint8), mask=mask,
                                             transform=transform) if v == 1]
        raw = unary_union(polys).buffer(0).intersection(projected)
        g, tol = None, 10.0
        while tol <= 320:
            simple = raw.simplify(tol, preserve_topology=True)
            keep = [p for p in _polys(simple) if p.area >= floor / 4]
            g = None if not keep else keep[0] if len(keep) == 1 else MultiPolygon(keep)
            if g is None or _vertices(g) <= MAX_ZONE_VERTICES:
                break
            tol *= 2
        if g is None or g.area < floor:
            continue
        if not g.is_valid:
            g = g.buffer(0)
        geo = transform_geom(crs, "EPSG:4326", mapping(g))
        zones.append({"class": {k: meta[k] for k in
                                ("id", "es", "en", "short_es", "short_en")},
                      "kind": meta["kind"], "ha": round(g.area / 1e4, 1),
                      "share": round(g.area / field_m2, 2), "geometry": geo})
    zones.sort(key=lambda z: -z["ha"])
    return zones


async def current_crop(geom, today: date | None = None):
    today = today or date.today()
    key = hashlib.sha256(geom.wkb).hexdigest()
    cached = CACHE.get(key, "current_crop")
    if cached is not None:
        return cached
    base = {"source": SOURCE, "resolution_m": RES_M, "as_of": None,
            "season": f"{today.year if today.month >= 6 else today.year - 1}-"
                      f"{(today.year if today.month >= 6 else today.year - 1) + 1}",
            "zones": []}
    minx, miny, maxx, maxy = geom.bounds
    if maxy > -20 or miny < -56 or maxx > -53 or minx < -74:
        return {**base, "status": "no_coverage"}
    y = today.year if today.month >= 6 else today.year - 1
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(SEARCH, json={
                "collections": ["sentinel-2-l2a"], "intersects": mapping(geom),
                "datetime": f"{y}-06-01T00:00:00Z/{today}T23:59:59Z",
                "query": {"eo:cloud_cover": {"lt": 30}}, "limit": 100,
                "sortby": [{"field": "properties.datetime", "direction": "asc"}]})
            res.raise_for_status()
            scenes = res.json()["features"]
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        log.warning("Sentinel catalog unavailable: %s", type(exc).__name__)
        return {**base, "status": "unavailable"}
    picked = pick_scenes(scenes, today)
    if not picked or not picked["now"] or not picked["mid"]:
        return {**base, "status": "no_detail"}
    out = await asyncio.to_thread(read_phases, picked, geom)
    if out is None:
        return {**base, "status": "no_detail"}
    phases, dates, inside, transform, crs = out
    if phases.get("now") is None or phases.get("mid") is None:
        return {**base, "status": "unavailable"}
    early = phases.get("early")
    if early is None:
        early = np.full(phases["now"].shape, np.nan, dtype="float32")
    codes = classify_pixels(early, phases["mid"], phases["now"])
    projected = shape(transform_geom("EPSG:4326", crs, mapping(geom)))
    zones = zones_from_codes(codes, inside, transform, crs, projected)
    result = {**base, "status": "available" if zones else "no_detail",
              "as_of": max(dates.get("now", [""])), "dates": dates,
              "zones": zones}
    CACHE.set(key, "current_crop", result, 6 * 3600)
    return result

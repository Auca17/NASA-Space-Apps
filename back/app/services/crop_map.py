"""Automatic crop per parcel from INTA's Mapa Nacional de Cultivos (MNC).

INTA publishes each campaign as a classified ~30 m raster on its GeoServer
(geo-nodo05). WCS refuses small subsets (it reads the whole mosaic), so we
ask WMS GetMap for the parcel's bounding box at ~30 m per pixel: the default
style paints every class with a fixed legend colour and nearest-neighbour
sampling, so each pixel's colour maps straight back to its class. Pixels
inside the parcel vote; the majority class is the detected crop.

Coverage is Argentina's agricultural area only. Anything else (outside the
mosaic, transparent pixels, INTA down) ends as "sin identificar".
"""

import asyncio
import hashlib
import io
import logging
import math
from dataclasses import dataclass, field

import httpx
import numpy as np
import shapely
from PIL import Image
from rasterio.features import shapes
from rasterio.transform import from_bounds
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import unary_union

from ..cache import CACHE
from .geodesy import ring_area_ha

log = logging.getLogger("field")

WMS_URL = "https://geo-nodo05.inta.gob.ar/geoserver/ows"
SOURCE = "INTA · Mapa Nacional de Cultivos"
SOURCE_URL = "https://geo-backend.inta.gob.ar/catalogue/"
RESOLUTION_M = 30
TIMEOUT = httpx.Timeout(6.0)
TTL = 7 * 24 * 3600          # the maps change once per campaign
MIN_COVERAGE = 0.3           # share of the parcel with a known class
MAX_PX = 512
MIN_PX = 8
# Mosaic envelope (DescribeCoverage): lon -67.48..-55.62, lat -41.04..-22.00
EXTENT = (-67.48, -41.04, -55.62, -22.0)


@dataclass(frozen=True)
class Klass:
    code: int
    kind: str                # crop | fallow | non_agricultural | mask
    id: str = ""
    es: str = ""
    en: str = ""


@dataclass(frozen=True)
class Season:
    id: str
    campaign: str
    layer: str
    classes: dict = field(hash=False)   # "#RRGGBB" -> Klass


def _crop(code, cid, es, en):
    return Klass(code, "crop", cid, es, en)


SEASONS = (
    Season("summer", "2024-2025",
           "geonode:mnc_ver25_0137b886113242df34818d72a99f6838", {
               "#0042FF": _crop(10, "maize", "Maíz", "Maize"),
               "#339820": _crop(11, "soy", "Soja", "Soybean"),
               "#A41DE2": _crop(12, "sunflower", "Girasol", "Sunflower"),
               "#F022DB": _crop(13, "bean", "Poroto", "Dry bean"),
               "#FCC1B3": _crop(14, "sugarcane", "Caña de azúcar", "Sugarcane"),
               "#B7B9BD": _crop(15, "cotton", "Algodón", "Cotton"),
               "#FBFF05": _crop(16, "peanut", "Maní", "Peanut"),
               "#1D1E33": _crop(17, "rice", "Arroz", "Rice"),
               "#1E0F6B": _crop(18, "sorghum", "Sorgo", "Sorghum"),
               "#A32102": _crop(19, "sunflower", "Girasol", "Sunflower"),
               "#646B63": Klass(21, "fallow"),
               "#E6F0C2": Klass(22, "non_agricultural"),
               "#FF5050": _crop(26, "potato", "Papa", "Potato"),
               "#B6D1FF": _crop(27, "forage_maize", "Maíz para verdeo", "Forage maize"),
               "#6699FF": _crop(28, "forage_sorghum", "Sorgo para verdeo", "Forage sorghum"),
               "#000000": Klass(31, "mask"),
           }),
    Season("winter", "2024",
           "geonode:mnc_inv24_eaef41861ef189c2add78522812c553c", {
               "#EC7D74": _crop(6, "chickpea", "Garbanzo", "Chickpea"),
               "#42F4CE": _crop(16, "winter_cereals", "Cereales de invierno",
                                "Winter cereals"),
               "#FF8000": _crop(17, "other_crops", "Otros cultivos", "Other crops"),
               "#646B63": Klass(18, "fallow"),
               "#FCC1B3": _crop(19, "sugarcane", "Caña de azúcar", "Sugarcane"),
               "#E6F0C2": Klass(20, "non_agricultural"),
               "#D54B01": _crop(24, "pea", "Arveja", "Pea"),
               "#000000": Klass(25, "mask"),
               "#FF5050": _crop(26, "potato", "Papa", "Potato"),
           }),
)


def _hex(r, g, b):
    return f"#{r:02X}{g:02X}{b:02X}"


def class_counts(img: np.ndarray, inside: np.ndarray, season: Season):
    """-> ({class code: pixels}, pixels inside). Only opaque pixels whose
    colour is in the legend count; masked-out and stray colours do not."""
    n_inside = int(inside.sum())
    px = img[inside]
    px = px[px[:, 3] > 0]
    counts: dict[int, int] = {}
    if len(px):
        colours, n = np.unique(px[:, :3], axis=0, return_counts=True)
        for (r, g, b), k in zip(colours, n):
            klass = season.classes.get(_hex(int(r), int(g), int(b)))
            if klass and klass.kind != "mask":
                counts[klass.code] = counts.get(klass.code, 0) + int(k)
    return counts, n_inside


def _base(season: Season, status: str, **extra):
    return {"season": season.id, "campaign": season.campaign,
            "status": status, "crop": None, "share": None,
            "coverage": None, **extra}


def summarize(counts: dict, n_inside: int, season: Season):
    valid = sum(counts.values())
    if not n_inside or valid / n_inside < MIN_COVERAGE:
        return _base(season, "no_coverage")
    by_code = {k.code: k for k in season.classes.values()}
    code, n = max(counts.items(), key=lambda kv: kv[1])
    klass = by_code[code]
    out = _base(season, klass.kind, share=round(n / valid, 2),
                coverage=round(valid / n_inside, 2))
    if klass.kind == "crop":
        out["crop"] = {"id": klass.id, "es": klass.es, "en": klass.en}
    return out


def pixel_grid(geom):
    """~30 m pixel grid over the parcel's bbox -> (width, height, inside)."""
    minx, miny, maxx, maxy = geom.bounds
    lat = (miny + maxy) / 2
    deg_lat = RESOLUTION_M / 111_320
    deg_lon = deg_lat / max(math.cos(math.radians(lat)), 0.1)
    w = min(MAX_PX, max(MIN_PX, math.ceil((maxx - minx) / deg_lon)))
    h = min(MAX_PX, max(MIN_PX, math.ceil((maxy - miny) / deg_lat)))
    xs = minx + (np.arange(w) + .5) * (maxx - minx) / w
    ys = maxy - (np.arange(h) + .5) * (maxy - miny) / h   # row 0 = north
    gx, gy = np.meshgrid(xs, ys)
    inside = shapely.contains_xy(geom, gx, gy)
    if not inside.any():   # sliver thinner than a pixel: use its centre
        c = geom.representative_point()
        col = min(w - 1, int((c.x - minx) / (maxx - minx or 1) * w))
        row = min(h - 1, int((maxy - c.y) / (maxy - miny or 1) * h))
        inside[row, col] = True
    return w, h, inside


def _in_extent(geom):
    minx, miny, maxx, maxy = geom.bounds
    x0, y0, x1, y1 = EXTENT
    return maxx >= x0 and minx <= x1 and maxy >= y0 and miny <= y1


async def _fetch_rgba(client, season: Season, geom, w, h):
    """WMS map of the parcel's bbox as an (h, w, 4) array, or None."""
    minx, miny, maxx, maxy = geom.bounds
    try:
        res = await client.get(WMS_URL, params={
            "service": "WMS", "version": "1.1.1", "request": "GetMap",
            "layers": season.layer, "styles": "", "srs": "EPSG:4326",
            "bbox": f"{minx},{miny},{maxx},{maxy}", "width": w, "height": h,
            "format": "image/png", "transparent": "true"})
        res.raise_for_status()
        if not res.headers.get("content-type", "").startswith("image/"):
            raise ValueError("WMS answered with a non-image")
        img = np.asarray(Image.open(io.BytesIO(res.content)).convert("RGBA"))
    except (httpx.HTTPError, ValueError, OSError) as exc:
        log.warning("INTA MNC %s unavailable: %s", season.id,
                    type(exc).__name__)
        return None
    if img.shape[:2] != (h, w):
        img = np.asarray(Image.fromarray(img).resize((w, h), Image.NEAREST))
    return img


async def _season(client, season: Season, geom, w, h, inside):
    img = await _fetch_rgba(client, season, geom, w, h)
    if img is None:
        return _base(season, "unavailable")
    return summarize(*class_counts(img, inside, season), season)


async def detect_crop(geom):
    key = hashlib.sha256(geom.wkb).hexdigest()
    cached = CACHE.get(key, "inta_mnc")
    if cached is not None:
        return cached
    if not _in_extent(geom):
        seasons = [_base(s, "no_coverage") for s in SEASONS]
    else:
        w, h, inside = pixel_grid(geom)
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            seasons = list(await asyncio.gather(
                *(_season(client, s, geom, w, h, inside) for s in SEASONS)))
    out = {"source": SOURCE, "source_url": SOURCE_URL,
           "resolution_m": RESOLUTION_M, "seasons": seasons}
    if all(s["status"] != "unavailable" for s in seasons):
        CACHE.set(key, "inta_mnc", out, TTL)
    return out


# ------------------------------------------------ split a field by crop -----

MIN_ZONE_HA = 1.0        # smaller patches stay "sin zona"
MIN_ZONE_SHARE = 0.03    # ... and so do patches under 3 % of the field
SIMPLIFY_DEG = 0.0001    # ~10 m: keeps saved zones light
MAX_ZONE_VERTICES = 1500  # /api/field/diagnose accepts 2000 per request


def _vertices(g) -> int:
    return sum(len(p.exterior.coords) + sum(len(i.coords) for i in p.interiors)
               for p in _polygons(g))


def codes_grid(img: np.ndarray, season: Season) -> np.ndarray:
    """RGBA map -> class code per pixel (0 = transparent or unknown)."""
    out = np.zeros(img.shape[:2], dtype=np.int32)
    opaque = img[..., 3] > 0
    for hexc, klass in season.classes.items():
        rgb = [int(hexc[i:i + 2], 16) for i in (1, 3, 5)]
        out[opaque & np.all(img[..., :3] == rgb, axis=-1)] = klass.code
    return out


def _ha(g) -> float:
    parts = g.geoms if isinstance(g, MultiPolygon) else [g]
    return sum(max(0.0, ring_area_ha(list(p.exterior.coords)[:-1]) -
                   sum(ring_area_ha(list(i.coords)[:-1]) for i in p.interiors))
               for p in parts if isinstance(p, Polygon))


def _polygons(g):
    if isinstance(g, Polygon):
        return [g]
    return [p for p in getattr(g, "geoms", []) if isinstance(p, Polygon)]


def zones_from_grid(codes, inside, geom, season: Season):
    """One zone per crop (sunflower variants merged), biggest first.
    Non-crop classes and specks are left out."""
    h, w = codes.shape
    transform = from_bounds(*geom.bounds, w, h)
    field_ha = _ha(geom)
    floor = max(MIN_ZONE_HA, MIN_ZONE_SHARE * field_ha)
    by_id: dict[str, list[int]] = {}
    for k in season.classes.values():
        if k.kind == "crop":
            by_id.setdefault(k.id, []).append(k.code)
    zones = []
    for cid, cs in by_id.items():
        mask = np.isin(codes, cs) & inside
        if not mask.any():
            continue
        polys = [shape(g) for g, v in shapes(mask.astype(np.uint8),
                                             mask=mask, transform=transform)
                 if v == 1]
        raw = unary_union(polys).intersection(geom)
        part_floor = max(MIN_ZONE_HA / 2, floor / 4)
        g, tol = None, SIMPLIFY_DEG
        while tol <= 0.0032:   # coarser until it fits the diagnosis limit
            simple = raw.simplify(tol, preserve_topology=True)
            keep = [p for p in _polygons(simple) if _ha(p) >= part_floor]
            g = (None if not keep else keep[0] if len(keep) == 1
                 else MultiPolygon(keep))
            if g is None or _vertices(g) <= MAX_ZONE_VERTICES:
                break
            tol *= 2
        if g is None:
            continue
        if not g.is_valid:
            g = g.buffer(0)
        ha = _ha(g)
        if ha < floor:
            continue
        k = next(k for k in season.classes.values() if k.id == cid)
        zones.append({"crop": {"id": cid, "es": k.es, "en": k.en},
                      "ha": round(ha, 1), "geometry": mapping(g)})
    zones.sort(key=lambda z: -z["ha"])
    return zones


async def crop_zones(geom):
    """Split a field into zones per crop of the summer campaign."""
    season = SEASONS[0]
    key = hashlib.sha256(geom.wkb).hexdigest()
    cached = CACHE.get(key, "inta_mnc_zones")
    if cached is not None:
        return cached
    out = {"source": SOURCE, "source_url": SOURCE_URL,
           "resolution_m": RESOLUTION_M, "season": season.id,
           "campaign": season.campaign, "zones": []}
    if not _in_extent(geom):
        return {**out, "status": "no_coverage"}
    w, h, inside = pixel_grid(geom)
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        img = await _fetch_rgba(client, season, geom, w, h)
    if img is None:
        return {**out, "status": "unavailable"}
    zones = zones_from_grid(codes_grid(img, season), inside, geom, season)
    out = {**out, "status": "available" if zones else "no_coverage",
           "zones": zones}
    CACHE.set(key, "inta_mnc_zones", out, TTL)
    return out

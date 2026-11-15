"""On-demand upstream clients for /api/field/diagnose (D16, D18, D25).

Every fetch is cached per (h3_r6 of centroid, utc_date, source_name) and keeps
its own timeout: 3 s default (D18); POWER daily gets 5 s (D25, like FIRMS).
Anything failing or slow returns None — the caller emits the card as
value=null/confidence=low instead of failing the request.
"""

import asyncio
import io
import logging
import math
import random
import time
from datetime import date, timedelta

import httpx
import numpy as np

from ..cache import CACHE
from ..config import MissingEnv
from .data import fetch_json, data_url

log = logging.getLogger("field")

POWER_DAILY_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
POWER_DAILY_TIMEOUT = 5.0  # D25 exception
POWER_PARAMS = [
    "PRECTOTCORR", "T2M_MAX", "T2M_MIN", "RH2M", "WS2M",
    "GWETTOP", "GWETROOT", "GWETPROF", "EVPTRNS",
]

SOILGRIDS_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query"
SOILGRIDS_DEPTHS = [("0-5cm", 5), ("5-15cm", 10), ("15-30cm", 15)]

TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
TERRAIN_Z = 12

ORNL_URL = "https://modis.ornl.gov/rst/api/v1/{product}/subset"

TIMEOUT = httpx.Timeout(3.0)


_NULL = object()  # cached negative result marker

NEGATIVE_TTL = 600  # permanent-looking failures (404, bad data)
TRANSIENT_TTL = 20  # 429 / 5xx / timeouts: retry much sooner


def _negative_ttl(exc: Exception) -> float:
    """Negative-cache TTL by failure kind (task 29): transient upstream
    problems (429, 5xx, timeouts, connection errors) get a short TTL so a
    retry really re-calls the source; 404 and bad-data parse failures
    keep the long one."""
    st = getattr(getattr(exc, "response", None), "status_code", None)
    if isinstance(exc, (httpx.TimeoutException, httpx.TransportError)):
        return TRANSIENT_TTL
    if st is not None and (st == 429 or st >= 500):
        return TRANSIENT_TTL
    return NEGATIVE_TTL

# In-flight de-duplication (task 23): concurrent diagnoses for the same
# (h3_r6, source) share one upstream call instead of one call each.
_inflight: dict[tuple, "asyncio.Task"] = {}


async def _cached(h3_r6: str, name: str, fetch, ttl: float = 21_600):
    hit = CACHE.get(h3_r6, name)
    if hit is not None:
        return None if hit is _NULL else hit
    key = (h3_r6, name)
    task = _inflight.get(key)
    if task is None:
        task = asyncio.ensure_future(
            _fetch_and_store(h3_r6, name, fetch, ttl))
        _inflight[key] = task
        try:
            # shield: one caller's cancellation must not kill the
            # upstream call other diagnoses are waiting on
            return await asyncio.shield(task)
        finally:
            _inflight.pop(key, None)
    return await asyncio.shield(task)


async def _fetch_and_store(h3_r6: str, name: str, fetch,
                           ttl: float = 21_600):
    t0 = time.monotonic()
    fail_ttl = NEGATIVE_TTL
    try:
        value = await fetch()
    except Exception as exc:
        log.warning("%s failed after %.2fs: %s",
                    name, time.monotonic() - t0, type(exc).__name__)
        fail_ttl = _negative_ttl(exc)
        value = None
    log.info("%s fetched in %.2fs -> %s", name, time.monotonic() - t0,
             "ok" if value is not None else "null")
    # cache every upstream response, including failures (brief: same-day
    # replays must not hit upstreams again)
    CACHE.set(h3_r6, name, _NULL if value is None else value,
              ttl_seconds=ttl if value is not None else fail_ttl)
    return value


# ------------------------------------------------------------- POWER --------

async def power_daily(client: httpx.AsyncClient, lat: float, lon: float,
                      h3_r6: str) -> dict | None:
    """One POWER daily point call: 2001-01-01 -> yesterday, all params (D25).

    Returns {param: {datetime.date: float | None}}; -999 fills become None.
    """
    async def go():
        today = date.today()
        params = {
            "parameters": ",".join(POWER_PARAMS), "community": "AG",
            "latitude": lat, "longitude": lon,
            "start": "20010101",
            "end": (today - timedelta(days=1)).strftime("%Y%m%d"),
            "format": "JSON"}
        r = None
        for attempt in range(2):
            r = await client.get(POWER_DAILY_URL, params=params,
                                 timeout=POWER_DAILY_TIMEOUT)
            if r.status_code == 429 or r.status_code >= 500:
                if attempt == 0:
                    ra = r.headers.get("retry-after")
                    try:
                        delay = min(float(ra), 4.0) if ra else \
                            1.5 + random.uniform(0, 0.5)
                    except ValueError:
                        delay = 1.5 + random.uniform(0, 0.5)
                    log.warning("power_daily %s, retry in %.2fs",
                                r.status_code, delay)
                    await asyncio.sleep(delay)
                    continue
            break
        r.raise_for_status()
        body = r.json()
        param = body["properties"]["parameter"]
        out = {}
        coords = (body.get("geometry") or {}).get("coordinates") or []
        if len(coords) >= 3 and coords[2] is not None:
            out["_elev_m"] = float(coords[2])
        for name, series in param.items():
            out[name] = {
                date(int(d[:4]), int(d[4:6]), int(d[6:8])):
                    (None if v <= -999 else float(v))
                for d, v in series.items()
            }
        return out
    return await _cached(h3_r6, "power_daily", go, ttl=6 * 3600)


# ---------------------------------------------------------- SoilGrids -------

async def soilgrids(client: httpx.AsyncClient, lat: float, lon: float,
                    h3_r6: str) -> dict | None:
    """Weighted 0-30 cm clay/silt/sand % and SOC g/kg. None if slow/empty."""
    async def go():
        r = await client.get(SOILGRIDS_URL, params=[
            ("lon", lon), ("lat", lat),
            *[("property", p) for p in ("clay", "silt", "sand", "soc")],
            *[("depth", d) for d, _ in SOILGRIDS_DEPTHS],
            ("value", "mean")], timeout=TIMEOUT)
        r.raise_for_status()
        layers = {ly["name"]: ly for ly in
                  r.json().get("properties", {}).get("layers", [])}
        out = {}
        for prop in ("clay", "silt", "sand", "soc"):
            vals = [(lyr["depths"][i]["values"].get("mean"), w)
                    for i, (_, w) in enumerate(SOILGRIDS_DEPTHS)
                    if (lyr := layers.get(prop)) and i < len(lyr["depths"])]
            vals = [(v.get("mean") if isinstance(v, dict) else v, w)
                    for v, w in vals]
            num = sum(v * w for v, w in vals if v is not None)
            den = sum(w for v, w in vals if v is not None)
            out[prop] = num / den if den else None
        if all(v is None for v in out.values()):
            return None
        return out
    return await _cached(h3_r6, "soilgrids", go)


# ------------------------------------------------------------ terrain -------

def _tile_xy(lat: float, lon: float, z: int) -> tuple[float, float]:
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1 - math.log(math.tan(math.radians(lat))
                     + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


async def terrain_stats(client: httpx.AsyncClient, lat: float, lon: float,
                        h3_r6: str, geom=None) -> dict | None:
    """Decode cached tiles, then calculate slope within the selected geometry."""
    from PIL import Image
    from rasterio.features import geometry_mask
    from rasterio.transform import from_origin
    from shapely import transform
    from .field_geometry import pieces

    if abs(lat) >= 85:
        return None
    x, y = _tile_xy(lat, lon, TERRAIN_Z)
    projected = None
    pixel = 1 / 256
    coordinates = {(int(x), int(y))}
    if geom is not None:
        if max(abs(geom.bounds[1]), abs(geom.bounds[3])) >= 85:
            return None
        projected = transform(
            geom, lambda coords: np.array([_tile_xy(p[1], p[0], TERRAIN_Z)
                                          for p in coords]))
        coordinates = set()
        for part in pieces(projected):
            a, b, c, d = part.bounds
            if (int(c) - int(a) + 1) * (int(d) - int(b) + 1) > 64:
                return None
            coordinates.update((i, j) for i in range(int(a), int(c) + 1)
                               for j in range(int(b), int(d) + 1))
        if len(coordinates) > 64:
            return None

    async def tile(i, j):
        async def fetch():
            response = await client.get(TERRARIUM_URL.format(z=TERRAIN_Z, x=i, y=j),
                                        timeout=TIMEOUT)
            response.raise_for_status()
            rgb = np.asarray(Image.open(io.BytesIO(response.content)).convert("RGB"),
                             dtype=np.float32)
            return rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768
        return await _cached(f"{TERRAIN_Z}/{i}/{j}", "terrain_tile", fetch)

    count = inside_count = 0
    elevation_sum = slope_sum = 0.0
    batch = sorted(coordinates)
    for start in range(0, len(batch), 12):
        group = batch[start:start + 12]
        tiles = await asyncio.gather(*(tile(i, j) for i, j in group))
        for (i, j), elevation in zip(group, tiles):
            if projected is None:
                col, row = int((x - i) * 256), int((y - j) * 256)
                mask = np.zeros((256, 256), dtype=bool)
                mask[max(0, row - 4):row + 5, max(0, col - 4):col + 5] = True
            else:
                mask = geometry_mask([projected], out_shape=(256, 256),
                                     transform=from_origin(i, j, pixel, -pixel),
                                     invert=True, all_touched=True)
            size = int(mask.sum())
            inside_count += size
            if elevation is None or not size:
                continue
            metres = 156543.03 * math.cos(math.radians(lat)) / 2 ** TERRAIN_Z
            gy, gx = np.gradient(elevation, metres)
            count += size
            elevation_sum += float(elevation[mask].sum(dtype=np.float64))
            slope_sum += float(np.hypot(gx, gy)[mask].sum(dtype=np.float64)) * 100
    if not count:
        return None
    coverage = round(count / inside_count, 3)
    return {"slope": round(slope_sum / count, 1) if coverage >= .7 else None,
            "elevation_m": round(elevation_sum / count, 1) if coverage >= .7 else None,
            "coverage": coverage}


# ------------------------------------------------------------ ORNL MODIS ----

async def ornl_modis(client: httpx.AsyncClient, product: str, band: str,
                     lat: float, lon: float, h3_r6: str,
                     years: int = 3, scale: float = 1.0) -> list | None:
    """ORNL MODIS subset -> [(date, value)] for the pixel at the point.
    Known to exceed the 3 s budget: returns None on timeout."""
    async def go():
        end = date.today()
        start = end - timedelta(days=years * 365)
        r = await client.get(ORNL_URL.format(product=product), params={
            "latitude": lat, "longitude": lon,
            "startDate": f"A{start.year}001",
            "endDate": f"A{end.year}{end.timetuple().tm_yday:03d}",
            "kmAboveBelow": 0, "kmLeftRight": 0, "band": band},
            timeout=TIMEOUT)
        r.raise_for_status()
        out = []
        for s in r.json().get("subset", []):
            d = s["calendar_date"]
            v = s["data"][0] if s.get("data") else None
            if v is not None:
                day = (date(int(d[1:5]), 1, 1) + timedelta(days=int(d[5:]) - 1)
                       if d.startswith("A") else date.fromisoformat(d))
                if -0.2 <= float(v) * scale <= 1:
                    out.append((day, float(v) * scale))
        return out or None
    return await _cached(h3_r6, f"ornl_{product}_{band}", go)


# ----------------------------------------------------- our own shards -------

async def json_shard(lat: float, lon: float, path: str, h3_r6: str,
                     name: str) -> dict | None:
    """DATA_BASE_URL + path, cached under the shared (r6, date, name) key."""
    try:
        url = data_url(path)
    except MissingEnv:
        return None
    return await _cached(h3_r6, f"{name}:{url}", lambda: fetch_json(url))

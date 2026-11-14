"""On-demand upstream clients for /api/field/diagnose (D16, D18, D25).

Every fetch is cached per (h3_r6 of centroid, utc_date, source_name) and keeps
its own timeout: 3 s default (D18); POWER daily gets 5 s (D25, like FIRMS).
Anything failing or slow returns None — the caller emits the card as
value=null/confidence=low instead of failing the request.
"""

import io
import logging
import math
import time
from datetime import date, timedelta

import httpx
import numpy as np

from ..cache import CACHE
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

NEGATIVE_TTL = 600  # failed fetches retry after 10 min, not the full TTL

async def _cached(h3_r6: str, name: str, fetch, ttl: float = 21_600):
    hit = CACHE.get(h3_r6, name)
    if hit is not None:
        return None if hit is _NULL else hit
    t0 = time.monotonic()
    try:
        value = await fetch()
    except Exception as exc:
        log.warning("%s failed after %.2fs: %s",
                    name, time.monotonic() - t0, type(exc).__name__)
        value = None
    log.info("%s fetched in %.2fs -> %s", name, time.monotonic() - t0,
             "ok" if value is not None else "null")
    # cache every upstream response, including failures (brief: same-day
    # replays must not hit upstreams again)
    CACHE.set(h3_r6, name, _NULL if value is None else value,
              ttl_seconds=ttl if value is not None else NEGATIVE_TTL)
    return value


# ------------------------------------------------------------- POWER --------

async def power_daily(client: httpx.AsyncClient, lat: float, lon: float,
                      h3_r6: str) -> dict | None:
    """One POWER daily point call: 2001-01-01 -> yesterday, all params (D25).

    Returns {param: {datetime.date: float | None}}; -999 fills become None.
    """
    async def go():
        today = date.today()
        r = await client.get(POWER_DAILY_URL, params={
            "parameters": ",".join(POWER_PARAMS), "community": "AG",
            "latitude": lat, "longitude": lon,
            "start": "20010101",
            "end": (today - timedelta(days=1)).strftime("%Y%m%d"),
            "format": "JSON"}, timeout=POWER_DAILY_TIMEOUT)
        r.raise_for_status()
        param = r.json()["properties"]["parameter"]
        out = {}
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
            num = sum(v["mean"] * w for v, w in vals
                      if v and v["mean"] is not None)
            den = sum(w for v, w in vals if v and v["mean"] is not None)
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


async def terrain_slope(client: httpx.AsyncClient, lat: float, lon: float,
                        h3_r6: str, bbox=None) -> float | None:
    """Mean slope % over the plot, from a Terrarium PNG tile (SRTM)."""
    async def go():
        from PIL import Image
        x, y = _tile_xy(lat, lon, TERRAIN_Z)
        r = await client.get(
            TERRARIUM_URL.format(z=TERRAIN_Z, x=int(x), y=int(y)),
            timeout=TIMEOUT)
        r.raise_for_status()
        elev = (np.asarray(Image.open(io.BytesIO(r.content)),
                         dtype=np.float64))
        elev = elev[..., 0] * 256 + elev[..., 1] + elev[..., 2] / 256 - 32768
        m_px = 156543.03 * math.cos(math.radians(lat)) / 2 ** TERRAIN_Z
        gy, gx = np.gradient(elev, m_px)
        slope = np.hypot(gx, gy) * 100
        px, py = x - int(x), y - int(y)  # fractional tile coords
        if bbox:  # window covering the plot bbox inside the tile
            x0, y0 = _tile_xy(bbox[1], bbox[0], TERRAIN_Z)
            x1, y1 = _tile_xy(bbox[3], bbox[2], TERRAIN_Z)
            tx, ty = int(x), int(y)
            c0 = int(np.clip((min(x0, x1) - tx) * 256, 0, 255))
            c1 = int(np.clip((max(x0, x1) - tx) * 256, 0, 255))
            r0 = int(np.clip((min(y0, y1) - ty) * 256, 0, 255))
            r1 = int(np.clip((max(y0, y1) - ty) * 256, 0, 255))
            w = slope[r0:r1 + 1, c0:c1 + 1]
        else:  # point: 9x9 window around the centroid pixel
            c, rr = int(px * 256), int(py * 256)
            w = slope[max(0, rr - 4):rr + 5, max(0, c - 4):c + 5]
        return round(float(np.nanmean(w)), 1) if w.size else None
    return await _cached(h3_r6, "terrain_slope", go)


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
            d = s["calendar_date"]  # 'A2023049'
            v = s["data"][0] if s.get("data") else None
            if v is not None:
                out.append((date(int(d[1:5]), 1, 1)
                            + timedelta(days=int(d[5:]) - 1), float(v) * scale))
        return out or None
    return await _cached(h3_r6, f"ornl_{product}_{band}", go)


# ----------------------------------------------------- our own shards -------

async def json_shard(lat: float, lon: float, path: str, h3_r6: str,
                     name: str) -> dict | None:
    """DATA_BASE_URL + path, cached under the shared (r6, date, name) key."""
    async def go():
        try:
            return await fetch_json(data_url(path))
        except Exception:
            return None
    return await _cached(h3_r6, name, go)

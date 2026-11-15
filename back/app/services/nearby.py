"""OpenStreetMap Overpass client for /api/field/parcels (task 32).

One POST to overpass-api.de asks for fire stations and hospitals
within 50 km and water features within 10 km of the boundary centroid.
Coordinates are rounded to 0.01 degree before sending; results are
cached for 24 h per rounded centroid. Any failure returns empty lists
with degraded=True — the endpoint never 500s on OSM.
"""

import logging
import time

import httpx

from .parcel_geo import haversine_km

log = logging.getLogger("parcels")

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
TIMEOUT = httpx.Timeout(6.0)
CACHE_TTL = 24 * 3600
UA = ("fieldshift-parcels/1.0 (rural fire risk demo; "
      "contact: team@example.com)")
MAX_ITEMS = 5

_cache: dict[tuple, tuple[float, dict]] = {}

QUERY = """
[out:json][timeout:5];
(
  nwr["amenity"="fire_station"](around:{r50},{lat},{lon});
  nwr["amenity"="hospital"](around:{r50},{lat},{lon});
  nwr["amenity"="clinic"](around:{r50},{lat},{lon});
  nw["waterway"~"^(river|canal)$"](around:{r10},{lat},{lon});
  nw["natural"="water"](around:{r10},{lat},{lon});
  nw["landuse"="reservoir"](around:{r10},{lat},{lon});
);
out center 60;
"""


def _query(lat: float, lon: float) -> str:
    return QUERY.format(lat=round(lat, 2), lon=round(lon, 2),
                        r50=50_000, r10=10_000)


def _water_kind(tags: dict) -> str:
    if tags.get("landuse") == "reservoir" or \
            tags.get("water") in ("reservoir",):
        return "reservoir"
    if tags.get("waterway") == "canal":
        return "canal"
    if tags.get("waterway") == "river":
        return "river"
    return "lake"


def _label(tags: dict, default: str) -> str:
    return (tags.get("name") or tags.get("name:es")
            or tags.get("official_name") or default)


def _parse(elements: list, lat: float, lon: float) -> dict:
    fire, hosp, water = [], [], []
    for el in elements:
        tags = el.get("tags") or {}
        if el.get("type") == "node":
            elat, elon = el.get("lat"), el.get("lon")
        else:
            c = el.get("center") or {}
            elat, elon = c.get("lat"), c.get("lon")
        if elat is None or elon is None:
            continue
        d = round(haversine_km(lat, lon, elat, elon), 1)
        if tags.get("amenity") == "fire_station":
            fire.append({"name": _label(tags, "Bomberos"),
                         "distance_km": d, "lon": elon, "lat": elat})
        elif tags.get("amenity") in ("hospital", "clinic"):
            hosp.append({"name": _label(tags, "Hospital"),
                         "distance_km": d, "lon": elon, "lat": elat})
        elif tags.get("waterway") or tags.get("natural") == "water" or \
                tags.get("landuse") == "reservoir":
            water.append({"name": _label(tags, "Curso de agua"),
                          "kind": _water_kind(tags),
                          "distance_km": d, "lon": elon, "lat": elat})
    key = lambda x: x["distance_km"]
    return {"fire_stations": sorted(fire, key=key)[:MAX_ITEMS],
            "hospitals": sorted(hosp, key=key)[:MAX_ITEMS],
            "water": sorted(water, key=key)[:MAX_ITEMS]}


async def nearby(lat: float, lon: float,
                 client: httpx.AsyncClient | None = None) -> dict:
    """-> {fire_stations, hospitals, water, source, degraded}."""
    key = (round(lat, 2), round(lon, 2))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return {**hit[1], "source": "OpenStreetMap contributors",
                "degraded": False}

    async def go(c: httpx.AsyncClient):
        r = await c.post(OVERPASS_URL,
                         data={"data": _query(lat, lon)},
                         headers={"User-Agent": UA})
        r.raise_for_status()
        return r.json().get("elements", [])

    try:
        if client is not None:
            elements = await go(client)
        else:
            async with httpx.AsyncClient(timeout=TIMEOUT) as c:
                elements = await go(c)
    except Exception as exc:
        log.warning("overpass failed: %s", type(exc).__name__)
        return {"fire_stations": [], "hospitals": [], "water": [],
                "source": "OpenStreetMap contributors",
                "degraded": True}
    out = _parse(elements, lat, lon)
    _cache[key] = (time.time(), out)
    return {**out, "source": "OpenStreetMap contributors",
            "degraded": False}

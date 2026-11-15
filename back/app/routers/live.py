"""GET /api/live — FIRMS NRT proxy. Contract 4.1 / decisions D6, D22."""

import json
import math
from datetime import datetime, timezone

import h3
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from ..config import require_env
from ..services import firms

router = APIRouter()

WINDOW_DAYS = {"24h": 1, "48h": 2, "7d": 7}
WINDOW_H = {"24h": 24, "48h": 48, "7d": 168}
WORLD_BBOX = (-180.0, -90.0, 180.0, 90.0)
CACHE_CONTROL = "public, s-maxage=10800, stale-while-revalidate=86400"  # D24
CELLS_AREA_THRESHOLD = 400.0  # square degrees (D22)
MAX_BODY_BYTES = 4 * 1024 * 1024
GRID_DEG = 5.0


def parse_bbox(raw: str | None):
    """Returns ((lo0, la0, lo1, la1), error). bbox = minLon,minLat,maxLon,maxLat."""
    if raw is None:
        return WORLD_BBOX, None
    parts = raw.split(",")
    if len(parts) != 4:
        return None, "bbox must be minLon,minLat,maxLon,maxLat"
    try:
        lo0, la0, lo1, la1 = (float(p) for p in parts)
    except ValueError:
        return None, "bbox values must be numbers"
    if not (-180 <= lo0 <= 180 and -180 <= lo1 <= 180
            and -90 <= la0 <= 90 and -90 <= la1 <= 90):
        return None, "bbox out of range (lon -180..180, lat -90..90)"
    if lo0 >= lo1 or la0 >= la1:
        return None, "bbox min values must be smaller than max values"
    return (lo0, la0, lo1, la1), None


def expand_bbox(box):
    """Grow outward to multiples of GRID_DEG so the CDN cache is shared (D22)."""
    lo0, la0, lo1, la1 = box
    return (
        max(-180.0, math.floor(lo0 / GRID_DEG) * GRID_DEG),
        max(-90.0, math.floor(la0 / GRID_DEG) * GRID_DEG),
        min(180.0, math.ceil(lo1 / GRID_DEG) * GRID_DEG),
        min(90.0, math.ceil(la1 / GRID_DEG) * GRID_DEG),
    )


def to_cells(points):
    """Aggregate points to [[h3_r3, count, max_frp], ...] (D22 cells mode)."""
    agg = {}
    for lat, lon, frp, *_ in points:
        cell = h3.latlng_to_cell(lat, lon, 3)
        entry = agg.get(cell)
        if entry is None:
            agg[cell] = [1, frp]
        else:
            entry[0] += 1
            entry[1] = max(entry[1], frp)
    return [[cell, n, f] for cell, (n, f) in agg.items()]


def _fmt(v: float) -> str:
    s = f"{v:g}"
    return s


@router.get("/api/live")
async def live(window: str = Query("24h"), bbox: str | None = Query(None)):
    map_key = require_env("FIRMS_MAP_KEY")  # MissingEnv -> 503 via handler
    if window not in WINDOW_DAYS:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_window",
                     "detail": "window must be one of 24h|48h|7d"})
    box, err = parse_bbox(bbox)
    if err:
        return JSONResponse(
            status_code=400, content={"error": "invalid_bbox", "detail": err})

    # country at the centre of the requested (unexpanded) area: the
    # front picks emergency numbers from it when nothing better is known
    from ..services.georef import country_at
    clat = (box[1] + box[3]) / 2
    clon = (box[0] + box[2]) / 2
    country = (country_at(clat, clon) or {}).get("iso2")
    box = expand_bbox(box)
    bbox_str = ",".join(_fmt(v) for v in box)
    area = (box[2] - box[0]) * (box[3] - box[1])

    ok, failed, points = await firms.fetch_all(map_key, bbox_str, window)
    if not ok:
        return JSONResponse(
            status_code=502,
            content={"error": "upstream_unavailable",
                     "sources_failed": failed},
            headers={"Cache-Control": "no-store"})
    cache_control = ("public, s-maxage=600" if failed else CACHE_CONTROL)
    body = {
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window_h": WINDOW_H[window],
        "sources": ok,
        "mode": "points",
        "bbox": bbox_str,
        "country": country,
        "points": points,
    }
    if failed:
        body["sources_failed"] = failed
    # D22: big areas or responses that would exceed 4 MB fall back to cells.
    if area > CELLS_AREA_THRESHOLD or \
            len(json.dumps(body).encode("utf-8")) > MAX_BODY_BYTES:
        body.pop("points")
        body["mode"] = "cells"
        body["cells"] = to_cells(points)
    return JSONResponse(body, headers={"Cache-Control": cache_control})

"""GET /api/geocode?q=... — same-origin Nominatim proxy.

The public Nominatim endpoint sends no Access-Control-Allow-Origin,
so the welcome city search cannot call it from the browser. This thin
proxy keeps the search working on any deploy origin (proper UA, short
in-process cache, trimmed payload).
"""

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..cache import CACHE

router = APIRouter()
URL = "https://nominatim.openstreetmap.org/search"
UA = "field-shift/1.0 (nasa-space-apps)"
TIMEOUT = httpx.Timeout(5.0)


@router.get("/api/geocode")
async def geocode(q: str = ""):
    q = q.strip()
    if len(q) < 3:
        return JSONResponse({"hits": []})
    hit = CACHE.get(q.lower(), "geocode")
    if hit is not None:
        return JSONResponse({"hits": hit})
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as c:
            r = await c.get(URL, headers={
                "User-Agent": UA, "Accept-Language": "es"},
                params={"format": "json", "limit": "5", "q": q})
            r.raise_for_status()
            hits = [{"lat": float(h["lat"]), "lon": float(h["lon"]),
                     "name": h.get("display_name", "")[:120]}
                    for h in r.json()[:5]]
    except Exception:
        hits = []
    CACHE.set(q.lower(), "geocode", hits, ttl_seconds=3600)
    return JSONResponse({"hits": hits})

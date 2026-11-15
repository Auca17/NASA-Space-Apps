"""GET /api/risk — lookup in published risk/{h3_r2}.json. Contract 4.4."""

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

import h3

from ..h3util import h3_r5
from ..services.data import risk_shard
from ..services.risk_validity import risk_dates

router = APIRouter()

CACHE_CONTROL = "public, s-maxage=3600"


def _not_found(r5: str):
    return JSONResponse(
        status_code=404,
        content={"error": "no_risk_for_cell", "h3_r5": r5,
                 "detail": "no model output for this cell"},
        headers={"Cache-Control": CACHE_CONTROL})


@router.get("/api/risk")
async def risk(lat: float = Query(...), lon: float = Query(...)):
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_point",
                     "detail": "lat -90..90, lon -180..180"})
    r5 = h3_r5(lat, lon)
    r2 = h3.cell_to_parent(r5, 2)
    shard = await risk_shard(r2)
    if shard is None:
        return _not_found(r5)
    cell = shard.get("cells", {}).get(r5)
    if cell is None:
        return _not_found(r5)
    dates = risk_dates(shard)
    from ..services.measures import evaluate
    msr = evaluate({"risk_cat": cell.get("cat")}) if dates["current"] else {}
    from ..services.georef import zone_at
    return JSONResponse(
        {**cell, "h3_r5": r5, **dates, "country": zone_at(lat, lon)["country"],
         **msr},
        headers={"Cache-Control": CACHE_CONTROL})

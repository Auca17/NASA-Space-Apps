"""GET /api/risk — lookup in published risk/{h3_r2}.json. Contract 4.4."""

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from ..h3util import h3_r2, h3_r5
from ..services.data import risk_shard

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
    r5, r2 = h3_r5(lat, lon), h3_r2(lat, lon)
    shard = await risk_shard(r2)
    if shard is None:
        return _not_found(r5)
    cell = shard.get("cells", {}).get(r5)
    if cell is None:
        return _not_found(r5)
    from ..services.measures import evaluate
    msr = evaluate({"risk_cat": cell.get("cat")})
    return JSONResponse(
        {**cell, "h3_r5": r5, "generated_at": shard.get("generated_at"),
         **msr},
        headers={"Cache-Control": CACHE_CONTROL})

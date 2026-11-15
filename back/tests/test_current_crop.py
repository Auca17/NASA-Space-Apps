"""Current-season crop from Sentinel-2 phenology."""

from datetime import date
from pathlib import Path
import sys

import numpy as np
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.services import current_crop as cc


def px(*v):
    return np.array([v], dtype="float32")


def test_phenology_classes():
    #            wheat  early maize  fallow  pasture  wheat harvested  no data
    early = px(0.20, 0.20, 0.15, 0.60, 0.25, np.nan)
    mid = px(0.80, 0.30, 0.30, 0.75, 0.80, np.nan)
    now = px(0.70, 0.55, 0.20, 0.65, 0.25, np.nan)
    assert cc.classify_pixels(early, mid, now).tolist() == [[1, 2, 3, 4, 1, 0]]


def test_phenology_without_an_early_winter_image():
    nan = np.nan
    codes = cc.classify_pixels(px(nan, nan), px(0.8, 0.2), px(0.7, 0.2))
    assert codes.tolist() == [[1, 3]]


def scene(day, cloud=0, tile="20HQC"):
    return {"properties": {"datetime": f"{day}T14:00:00Z", "eo:cloud_cover": cloud,
                           "grid:code": tile}}


def test_pick_scenes_uses_one_tile_and_the_latest_clear_image():
    scenes = [scene("2026-06-16"), scene("2026-08-07"), scene("2026-09-14", 20),
              scene("2026-09-19", 5), scene("2026-10-04"), scene("2026-11-08"),
              scene("2026-11-10", 2, tile="21HTT")]
    p = cc.pick_scenes(scenes, date(2026, 11, 15))
    day = lambda s: s["properties"]["datetime"][:10]
    assert [day(s) for s in p["early"]] == ["2026-06-16"]
    assert [day(s) for s in p["mid"]] == ["2026-08-07", "2026-09-19", "2026-10-04"]
    assert day(p["now"][0]) == "2026-11-08"


async def test_endpoint_outside_argentina_is_no_coverage():
    square = [[-93.61, 41.89], [-93.59, 41.89], [-93.59, 41.91], [-93.61, 41.91],
              [-93.61, 41.89]]
    async with AsyncClient(transport=ASGITransport(app=app),
                           base_url="http://test") as client:
        res = await client.post("/api/field/current-crop",
                                json={"polygon": {"type": "Polygon",
                                                  "coordinates": [square]}})
    assert res.status_code == 200 and res.json()["status"] == "no_coverage"

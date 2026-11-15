"""Automatic crop detection per parcel from INTA's Mapa Nacional de Cultivos."""

import io
from pathlib import Path
import sys

import httpx
import numpy as np
import respx
from httpx import ASGITransport, AsyncClient
from PIL import Image
from shapely.geometry import box

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.services import crop_map
from app.services.crop_map import SEASONS, class_counts, pixel_grid, summarize

SUMMER, WINTER = SEASONS
SOY = (0x33, 0x98, 0x20, 255)
MAIZE = (0x00, 0x42, 0xFF, 255)
NON_AGRI = (0xE6, 0xF0, 0xC2, 255)
FALLOW = (0x64, 0x6B, 0x63, 255)
CEREALS = (0x42, 0xF4, 0xCE, 255)
EMPTY = (255, 255, 255, 0)


def rgba(rows):
    return np.array(rows, dtype=np.uint8)


def test_counts_only_known_classes_inside_the_parcel():
    img = rgba([[SOY, SOY, MAIZE], [SOY, EMPTY, (1, 2, 3, 255)]])
    inside = np.array([[True, True, True], [True, True, False]])
    counts, n_inside = class_counts(img, inside, SUMMER)
    assert n_inside == 5
    assert counts == {11: 3, 10: 1}  # transparent and stray colours ignored


def test_majority_crop_reports_name_campaign_and_share():
    out = summarize({11: 30, 10: 10}, 40, SUMMER)
    assert out["status"] == "crop"
    assert out["crop"] == {"id": "soy", "es": "Soja", "en": "Soybean"}
    assert out["campaign"] == "2024-2025"
    assert out["season"] == "summer"
    assert out["share"] == 0.75 and out["coverage"] == 1.0


def test_winter_cereals_majority():
    out = summarize({16: 9, 20: 1}, 10, WINTER)
    assert out["status"] == "crop"
    assert out["crop"]["id"] == "winter_cereals"
    assert out["campaign"] == "2024"


def test_non_agricultural_and_fallow_are_not_crops():
    assert summarize({22: 8, 11: 2}, 10, SUMMER)["status"] == "non_agricultural"
    out = summarize({21: 8, 11: 2}, 10, SUMMER)
    assert out["status"] == "fallow" and out["crop"] is None


def test_little_coverage_means_unidentified():
    out = summarize({11: 2}, 10, SUMMER)
    assert out["status"] == "no_coverage" and out["crop"] is None
    assert summarize({}, 0, SUMMER)["status"] == "no_coverage"


def test_pixel_grid_is_about_30_m_and_masks_the_polygon():
    geom = box(-61.92, -34.62, -61.88, -34.58)  # ~3.7 km x 4.4 km
    w, h, inside = pixel_grid(geom)
    assert 100 < w < 140 and 120 < h < 170
    assert inside.shape == (h, w) and inside.all()
    tiny = box(-61.9, -34.6, -61.8995, -34.5995)
    w, h, inside = pixel_grid(tiny)
    assert w >= 8 and h >= 8 and inside.any()


def png(color, size=(10, 10)):
    buf = io.BytesIO()
    Image.new("RGBA", size, color).save(buf, "PNG")
    return buf.getvalue()


def square(lon=-61.9, lat=-34.6, d=.002):
    return [[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d],
            [lon - d, lat + d], [lon - d, lat - d]]


@respx.mock
async def test_endpoint_returns_both_campaigns_with_source():
    crop_map.CACHE._store.clear()

    def reply(request):
        layer = request.url.params["layers"]
        return httpx.Response(200, content=png(SOY if layer == SUMMER.layer
                                               else CEREALS),
                              headers={"content-type": "image/png"})

    respx.get(url__startswith=crop_map.WMS_URL).mock(side_effect=reply)
    async with AsyncClient(transport=ASGITransport(app=app),
                           base_url="http://test") as client:
        res = await client.post("/api/field/crop",
                                json={"polygon": {"type": "Polygon",
                                                  "coordinates": [square()]}})
    assert res.status_code == 200
    body = res.json()
    assert body["source"] == "INTA · Mapa Nacional de Cultivos"
    summer, winter = body["seasons"]
    assert summer["crop"]["id"] == "soy" and summer["campaign"] == "2024-2025"
    assert winter["crop"]["id"] == "winter_cereals"


@respx.mock
async def test_endpoint_degrades_to_unidentified_when_inta_fails():
    crop_map.CACHE._store.clear()
    respx.get(url__startswith=crop_map.WMS_URL).mock(
        return_value=httpx.Response(503))
    async with AsyncClient(transport=ASGITransport(app=app),
                           base_url="http://test") as client:
        res = await client.post("/api/field/crop",
                                json={"polygon": {"type": "Polygon",
                                                  "coordinates": [square(d=.003)]}})
    assert res.status_code == 200
    assert [s["status"] for s in res.json()["seasons"]] == ["unavailable"] * 2


@respx.mock
async def test_outside_argentina_skips_the_request():
    crop_map.CACHE._store.clear()
    route = respx.get(url__startswith=crop_map.WMS_URL)
    async with AsyncClient(transport=ASGITransport(app=app),
                           base_url="http://test") as client:
        res = await client.post("/api/field/crop",
                                json={"polygon": {"type": "Polygon",
                                                  "coordinates": [square(-93.6, 41.9)]}})
    assert not route.called
    assert [s["status"] for s in res.json()["seasons"]] == ["no_coverage"] * 2


def test_zones_split_the_parcel_by_crop():
    from app.services.crop_map import zones_from_grid
    geom = box(-61.92, -34.62, -61.90, -34.60)
    w, h, inside = pixel_grid(geom)
    codes = np.full((h, w), 11, dtype=np.int32)      # soy
    codes[:, 2 * w // 3:] = 10                        # east third maize
    codes[:3, :3] = 22                                # a corner, non-agri
    zones = zones_from_grid(codes, inside, geom, SUMMER)
    assert [z["crop"]["id"] for z in zones] == ["soy", "maize"]  # biggest first
    from shapely.geometry import shape
    shares = []
    for z in zones:
        g = shape(z["geometry"])
        assert g.is_valid and g.within(geom.buffer(1e-9))
        shares.append(g.area / geom.area)
    assert 0.6 < shares[0] < 0.7 and 0.3 < shares[1] < 0.37
    assert zones[0]["ha"] > zones[1]["ha"] > 0


def test_zones_drop_specks():
    from app.services.crop_map import zones_from_grid
    geom = box(-61.92, -34.62, -61.90, -34.60)
    w, h, inside = pixel_grid(geom)
    codes = np.full((h, w), 11, dtype=np.int32)
    codes[10, 10] = 10                                # one maize pixel
    zones = zones_from_grid(codes, inside, geom, SUMMER)
    assert [z["crop"]["id"] for z in zones] == ["soy"]


@respx.mock
async def test_crop_zones_endpoint():
    crop_map.CACHE._store.clear()

    def reply(request):
        img = Image.new("RGBA", (int(request.url.params["width"]),
                                 int(request.url.params["height"])), SOY)
        buf = io.BytesIO(); img.save(buf, "PNG")
        return httpx.Response(200, content=buf.getvalue(),
                              headers={"content-type": "image/png"})

    respx.get(url__startswith=crop_map.WMS_URL).mock(side_effect=reply)
    async with AsyncClient(transport=ASGITransport(app=app),
                           base_url="http://test") as client:
        res = await client.post("/api/field/crop-zones",
                                json={"polygon": {"type": "Polygon",
                                                  "coordinates": [square(d=.01)]}})
    body = res.json()
    assert body["status"] == "available" and body["campaign"] == "2024-2025"
    assert [z["crop"]["es"] for z in body["zones"]] == ["Soja"]

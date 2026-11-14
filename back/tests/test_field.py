import sys
from datetime import date, timedelta
from pathlib import Path

import pytest
import respx
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402
from app.services import field_sources  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
PLOT = {"point": [-33.89, -60.57], "ha": 50}


def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


def _power_body():
    """Small synthetic POWER daily response, 3 years of daily values."""
    days = {}
    d = date(2023, 1, 1)
    while d <= date(2025, 12, 31):
        days[d.strftime("%Y%m%d")] = round(
            2.0 + (d.day % 5), 2)
        d += timedelta(days=1)
    param = {p: dict(days) for p in field_sources.POWER_PARAMS}
    for d, v in param["T2M_MAX"].items():
        param["T2M_MAX"][d] = 36.0 if d.endswith("0115") else 30.0
    for d, v in param["T2M_MIN"].items():
        param["T2M_MIN"][d] = -1.0 if d.endswith("0715") else 8.0
    for d, v in param["EVPTRNS"].items():
        param["EVPTRNS"][d] = 4.0
    for d, v in param["GWETROOT"].items():
        param["GWETROOT"][d] = 0.4
    return {"properties": {"parameter": param}}


def _mock_all_ok():
    respx.get(url__regex=r".*power\.larc\.nasa\.gov.*").respond(
        200, json=_power_body())
    respx.get(url__regex=r".*isric\.org.*").respond(404)
    respx.get(url__regex=r".*elevation-tiles.*").respond(404)
    respx.get(url__regex=r".*modis\.ornl\.gov.*").respond(404)


@respx.mock
async def test_diagnose_all_sources_ok(monkeypatch):
    monkeypatch.setenv("DATA_BASE_URL", FIXTURES.as_uri() + "/")
    _mock_all_ok()
    r = await client().post("/api/field/diagnose", json=PLOT)
    assert r.status_code == 200
    body = r.json()
    ids = [c["id"] for c in body["cards"]]
    assert ids == ["rain", "heavy_rain", "frost", "heat", "soil_moisture",
                   "crop_water", "vigor_bare_soil", "slope", "soil",
                   "water_trend", "fire", "fire_weather", "recent_weather"]
    assert all(k in body["cards"][0] for k in
               ("value", "unit", "text", "source", "resolution", "confidence"))
    assert body["h3_r5"] and body["h3_r6"]
    rows = body["calendar"]["rows"]
    assert [r["id"] for r in rows] == \
        ["bare_soil", "frost", "water_stress", "heat", "burn_season"]
    assert all(len(r["levels"]) == 12 for r in rows)
    assert r.headers["Cache-Control"] == "no-store"


@respx.mock
async def test_diagnose_timeout_card_null(monkeypatch):
    monkeypatch.setenv("DATA_BASE_URL", FIXTURES.as_uri() + "/")
    _mock_all_ok()
    import httpx as hx
    respx.get(url__regex=r".*isric\.org.*").mock(
        side_effect=hx.ConnectTimeout("slow"))
    r = await client().post("/api/field/diagnose", json=PLOT)
    assert r.status_code == 200
    soil = next(c for c in r.json()["cards"] if c["id"] == "soil")
    assert soil["value"] is None and soil["confidence"] == "low"


async def test_diagnose_invalid_polygon_400(monkeypatch):
    open_ring = {"polygon": {"type": "Polygon", "coordinates":
                             [[[-60.6, -33.9], [-60.5, -33.9],
                               [-60.5, -33.8], [-60.6, -33.8]]]}}
    two_v = {"polygon": {"type": "Polygon", "coordinates":
                         [[[-60.6, -33.9], [-60.5, -33.9], [-60.6, -33.9]]]}}
    huge = {"polygon": {"type": "Polygon", "coordinates":
                        [[[-61.0, -34.0], [-60.0, -34.0], [-60.0, -33.0],
                          [-61.0, -33.0], [-61.0, -34.0]]]}}
    for body in (open_ring, two_v, huge):
        r = await client().post("/api/field/diagnose", json=body)
        assert r.status_code == 400, body


@respx.mock
async def test_diagnose_cache_second_call(monkeypatch):
    monkeypatch.setenv("DATA_BASE_URL", FIXTURES.as_uri() + "/")
    _mock_all_ok()
    r1 = await client().post("/api/field/diagnose", json=PLOT)
    assert r1.status_code == 200
    n_calls = len(respx.calls)
    r2 = await client().post("/api/field/diagnose", json=PLOT)
    assert r2.status_code == 200
    assert len(respx.calls) == n_calls  # nothing re-fetched
    assert r2.json()["diagnosis_id"] == r1.json()["diagnosis_id"]


# ---------------------------------------------------------------- 03b ----

def _frost_series(frost_month_days, years=range(2010, 2020)):
    """T2M_MIN = -2 on (month, day-range) pairs, +8 elsewhere."""
    from datetime import date
    out = {}
    for y in years:
        d = date(y, 1, 1)
        while d.year == y:
            frost = any(m == d.month and lo <= d.day <= hi
                        for m, lo, hi in frost_month_days)
            out[d] = -2.0 if frost else 8.0
            d += timedelta(days=1)
    return out


def test_frost_window_southern():
    from app.routers.field import frost_free_window
    s = _frost_series([(6, 1, 30), (7, 1, 31), (8, 1, 31)])
    lbl0, lbl1, days, _ = frost_free_window(s)
    assert (lbl0, lbl1, days) == ("01/09", "31/05", 273)


def test_frost_window_northern():
    from app.routers.field import frost_free_window
    s = _frost_series([(12, 1, 31), (1, 1, 31), (2, 1, 28)])
    lbl0, lbl1, days, _ = frost_free_window(s)
    assert (lbl0, lbl1) == ("01/03", "30/11")
    assert 270 <= days <= 280


@respx.mock
async def test_failed_source_retried_after_negative_ttl(monkeypatch):
    import time
    import httpx as hx
    monkeypatch.setenv("DATA_BASE_URL", FIXTURES.as_uri() + "/")
    _mock_all_ok()
    respx.get(url__regex=r".*modis\.ornl\.gov.*").respond(
        200, json={"subset": [
            {"calendar_date": "A2025001", "data": [7000]}]})
    respx.get(url__regex=r".*isric\.org.*").mock(
        side_effect=hx.ConnectTimeout("slow"))
    plot = {"point": [42.37, -3.70], "ha": 120}
    r1 = await client().post("/api/field/diagnose", json=plot)
    assert r1.status_code == 200
    n = len(respx.calls)
    # inside the 10-min negative TTL: no retry
    r2 = await client().post("/api/field/diagnose", json=plot)
    assert len(respx.calls) == n
    # 11 min later: failed sources are retried (soilgrids + terrain 404s)
    real = time.monotonic
    monkeypatch.setattr(time, "monotonic", lambda: real() + 661)
    r3 = await client().post("/api/field/diagnose", json=plot)
    assert r3.status_code == 200
    assert len(respx.calls) == n + 2
    retried = {str(c.request.url) for c in respx.calls[n:]}
    assert any("isric.org" in u for u in retried)
    assert any("elevation-tiles" in u for u in retried)

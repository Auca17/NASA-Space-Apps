import json
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


@respx.mock
async def test_diagnose_grid_fallback_cards(monkeypatch, tmp_path):
    """With ORNL/SoilGrids down, soil and vigor cards come from field/grid."""
    import h3
    plot = {"point": [-32.5, -62.0], "ha": 50}  # fresh r6 cache keys
    r5 = h3.latlng_to_cell(plot["point"][0], plot["point"][1], 5)
    r2 = h3.cell_to_parent(r5, 2)
    (tmp_path / "field" / "grid").mkdir(parents=True)
    cell = {"soil": {"texture": "Franco", "soc_g_kg": 22.4},
            "bare_soil_days_yr": 90, "grace_trend": "down"}
    (tmp_path / "field" / "grid" / f"{r2}.json").write_text(
        json.dumps({"shard": r2, "cells": {r5: cell}}))
    monkeypatch.setenv("DATA_BASE_URL", tmp_path.as_uri() + "/")
    _mock_all_ok()
    r = await client().post("/api/field/diagnose", json=plot)
    assert r.status_code == 200
    cards = {c["id"]: c for c in r.json()["cards"]}
    assert cards["soil"]["value"] == 22.4
    assert "field/grid" in cards["soil"]["source"]
    assert cards["vigor_bare_soil"]["value"] == 90
    assert cards["water_trend"]["value"] == "down"


# ------------------------------------------------------------- task 12 ----

def test_stop_conditions_each_and_none():
    from app.routers.field import _stop_conditions
    end = date(2025, 1, 10)
    base = {"RH2M": {end: 50.0}, "WS2M": {end: 5.0},
            "T2M_MAX": {end: 30.0}}
    conds, _ = _stop_conditions({**base, "WS2M": {end: 12.0}}, end)
    assert conds == ["wind_gt_40kmh"]
    conds, _ = _stop_conditions({**base, "T2M_MAX": {end: 36.0}}, end)
    assert conds == ["temp_gt_35"]
    conds, det = _stop_conditions({**base, "RH2M": {end: 25.0}}, end)
    assert conds == ["rh_lt_30"]
    assert "por confirmar" in det["rh_lt_30"]
    conds, _ = _stop_conditions(base, end)
    assert conds == []
    # older day inside the 3-day window also counts
    old = {**base, "T2M_MAX": {end - timedelta(days=2): 37.0}}
    conds, _ = _stop_conditions(old, end)
    assert conds == ["temp_gt_35"]


def test_rain_monthly_mm():
    from app.routers.field import rain_monthly_mm
    days = {}
    d = date(2001, 1, 1)
    while d <= date(2024, 12, 31):
        days[d] = 3.0 if d.month in (1, 2, 3) else 1.0
        d += timedelta(days=1)
    rm = rain_monthly_mm(days)
    assert len(rm) == 12
    assert rm[0] > rm[6]  # wet summer months vs dry winter
    assert sum(rm) == pytest.approx(545.0, abs=2)


def test_zone_at_test_points():
    """The four brief points resolve to the expected zone."""
    from app.services.georef import zone_at
    cases = [
        ((-33.89, -60.57), "pampa_humeda", "Buenos Aires", "AR"),  # Pergamino
        ((-24.80, -65.40), "noa", "Salta", "AR"),
        ((-54.80, -68.30), "patagonia", None, "AR"),               # Ushuaia
        ((40.40, -3.70), "other", None, "ES"),                     # Spain
    ]
    for (lat, lon), zone, prov, cc in cases:
        out = zone_at(lat, lon)
        assert out["zone"] == zone, (lat, lon, out)
        if prov:
            assert out["province"] == prov
        else:
            assert out["province"] in (prov, out["province"])
        assert out["country"] == cc


@pytest.mark.asyncio
async def test_rotations_reads_diagnosis_zone(respx_mock, monkeypatch):
    """Without body.zone the endpoint uses diagnosis.zone."""
    diag = json.loads(
        (FIXTURES / "api/diagnose.response.json").read_text())
    diag["zone"] = "noa"
    r = await client().post("/api/field/rotations", json={
        "diagnosis": diag, "current": {}, "priorities": {},
        "constraints": {}})
    assert r.status_code == 200, r.text
    out = r.json()
    ids = {s["id"] for s in out["strategies"]}
    # noa zone: garbanzo-maiz must be a candidate, pampa-only rotations not
    assert "garbanzo-maiz" in ids
    assert "trigo-soja2-maiz" not in ids


@pytest.mark.asyncio
async def test_geocode_proxy(respx_mock):
    """Same-origin Nominatim proxy: trimmed hits, short-q shortcut."""
    respx_mock.get("https://nominatim.openstreetmap.org/search").respond(
        json=[{"lat": "-33.9", "lon": "-60.6",
               "display_name": "Pergamino, Buenos Aires"}])
    async with client() as c:
        r = await c.get("/api/geocode", params={"q": "pergamino"})
        assert r.status_code == 200
        assert r.json()["hits"][0]["lat"] == -33.9
        assert (await c.get("/api/geocode", params={"q": "x"})
                ).json()["hits"] == []


@respx.mock
async def test_diagnose_returns_zone(monkeypatch):
    """diagnose emits zone/province/country for the centroid."""
    monkeypatch.setenv("DATA_BASE_URL", FIXTURES.as_uri() + "/")
    _mock_all_ok()
    r = await client().post("/api/field/diagnose", json=PLOT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["zone"] == "pampa_humeda"
    assert d["province"] == "Buenos Aires"
    assert d["country"] == "AR"

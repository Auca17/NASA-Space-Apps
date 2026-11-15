import json
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest
import respx
from httpx import ASGITransport, AsyncClient, Response

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
                   "crop_water", "evaporation", "vigor_bare_soil",
                   "slope", "soil", "infiltration", "water_trend",
                   "fire", "fire_weather", "recent_weather"]
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
    # an older day inside the 3-day window stays as context only:
    # no alert, but a dated "hubo ... hace N días" detail
    old = {**base, "T2M_MAX": {end - timedelta(days=2): 37.0}}
    conds, det = _stop_conditions(old, end)
    assert conds == []
    assert det["temp_gt_35"].startswith("hubo")
    assert "hace 2 días" in det["temp_gt_35"]


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


@pytest.mark.asyncio
async def test_field_catalog_uses_the_models_catalog_without_a_data_bucket():
    from app.services.rotations import KNOWLEDGE

    async with client() as c:
        response = await c.get("/api/field/catalog")
    assert response.status_code == 200
    data = response.json()
    assert {rot["id"] for rot in data["rotations"]} == {
        rot.id for rot in KNOWLEDGE.rotations}
    assert {crop["id"] for crop in data["crops"]} == set(KNOWLEDGE.crops)


@pytest.mark.asyncio
async def test_geocode_bias_keeps_global_results_and_retries_failures(respx_mock):
    search = respx_mock.get("https://nominatim.openstreetmap.org/search")
    search.side_effect = [
        Response(503),
        Response(200, json=[{"lat": "40.4", "lon": "-3.7",
                            "display_name": "Madrid, España"}]),
    ]
    async with client() as c:
        params = {"q": "Madrid, España", "bias": "ar"}
        assert (await c.get("/api/geocode", params=params)).status_code == 502
        r = await c.get("/api/geocode", params=params)
        assert r.json()["hits"][0]["name"] == "Madrid, España"
    req = search.calls.last.request
    assert req.url.params["viewbox"] == "-74,-21,-53,-56"
    assert "bounded" not in req.url.params


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


# ------------------------------------------------- task 15 regressions ----

def test_stop_conditions_last_day_only_alert():
    """Threshold met two days before the last valid day -> no alert, but
    the detail keeps the dated, softer 'hubo ... hace 2 días' wording."""
    from app.routers.field import _stop_conditions
    from datetime import date, timedelta
    end = date(2024, 11, 14)
    power = {"RH2M": {}, "WS2M": {},
             "T2M_MAX": {end: 25.0,
                         end - timedelta(days=2): 36.5}}
    conds, det = _stop_conditions(power, end)
    assert "temp_gt_35" not in conds
    assert "hubo" in det["temp_gt_35"]
    assert "hace 2 días" in det["temp_gt_35"]
    assert "12 de noviembre" in det["temp_gt_35"]


def test_stop_conditions_last_day_alert():
    from app.routers.field import _stop_conditions
    from datetime import date
    end = date(2024, 11, 14)
    power = {"RH2M": {}, "WS2M": {end: 12.5}, "T2M_MAX": {}}
    conds, det = _stop_conditions(power, end)
    assert conds == ["wind_gt_40kmh"]
    assert "hay" in det["wind_gt_40kmh"]
    assert "14 de noviembre" in det["wind_gt_40kmh"]


def test_stop_conditions_no_condition():
    from app.routers.field import _stop_conditions
    from datetime import date
    end = date(2024, 11, 14)
    power = {"RH2M": {end: 50}, "WS2M": {end: 5},
             "T2M_MAX": {end: 25}}
    conds, det = _stop_conditions(power, end)
    assert conds == [] and det == {}


def test_stop_conditions_humidity_inta_note():
    from app.routers.field import _stop_conditions
    from datetime import date
    end = date(2024, 11, 14)
    power = {"RH2M": {end: 25}, "WS2M": {}, "T2M_MAX": {}}
    _, det = _stop_conditions(power, end)
    assert "umbral por confirmar con INTA" in det["rh_lt_30"]


# ------------------------------------------------------ i18n (text_en) ----

SPANISH = ("año", "días", "lluvia", "heladas", "Sin datos", "Período",
           "Pendiente", "tendencia", "Temporada", "riesgo", "viento",
           "humedad", "hace ", "Últimos", "suelo desnudo")


@respx.mock
async def test_diagnose_cards_carry_english_text(monkeypatch):
    """Every card keeps its Spanish `text` (the rotations and measures
    engines parse it) and adds an English `text_en` with no Spanish."""
    monkeypatch.setenv("DATA_BASE_URL", FIXTURES.as_uri() + "/")
    _mock_all_ok()
    r = await client().post("/api/field/diagnose", json=PLOT)
    body = r.json()
    for c in body["cards"]:
        assert c["text"], c["id"]
        assert c.get("text_en"), c["id"]
        assert not any(w in c["text_en"] for w in SPANISH), \
            (c["id"], c["text_en"])
    heat = next(c for c in body["cards"] if c["id"] == "heat")
    assert "days/yr above 35" in heat["text_en"]
    assert "días/año" in heat["text"]
    for m in body.get("measures", []):
        assert m.get("name_en") and m.get("why_en"), m["id"]


def test_fire_weather_english_detail():
    from app.routers.field import fire_weather_card
    end = date(2025, 1, 10)
    power = {"RH2M": {end: 25.0}, "WS2M": {end: 12.0},
             "T2M_MAX": {end: 36.0}, "PRECTOTCORR": {end: 5.0}}
    card = fire_weather_card(power, end)
    assert "stop harvesting" in card["text_en"]
    assert set(card["stop_detail_en"]) == set(card["stop_detail"])
    assert "January 10" in card["stop_detail_en"]["temp_gt_35"]


def test_null_card_english():
    from app.routers.field import _null_card
    assert _null_card("soil", "s", "r")["text_en"] == "No data available"


# ------------------------------------------- polygons with holes / multi ----

def _sq(lat, lon, half_deg):
    """Closed [lon, lat] square ring."""
    return [[lon - half_deg, lat - half_deg], [lon + half_deg, lat - half_deg],
            [lon + half_deg, lat + half_deg], [lon - half_deg, lat + half_deg],
            [lon - half_deg, lat - half_deg]]


def test_parse_plot_polygon_with_hole_subtracts_it():
    from app.routers.field import parse_plot
    from app.services.geodesy import ring_area_ha
    outer, hole = _sq(-33.96, -60.69, 0.005), _sq(-33.96, -60.69, 0.001)
    (c, ha, *_), err = parse_plot({"polygon": {"type": "Polygon",
                                               "coordinates": [outer, hole]}})
    assert err is None
    full = ring_area_ha(outer[:-1])
    assert ha == pytest.approx(full - ring_area_ha(hole[:-1]), rel=1e-6)
    assert ha < full


def test_parse_plot_multipolygon_sums_pieces():
    from app.routers.field import parse_plot
    a, b = _sq(-33.96, -60.70, 0.003), _sq(-33.96, -60.68, 0.003)
    (c, ha, r5, r6, bbox), err = parse_plot({"polygon": {
        "type": "MultiPolygon", "coordinates": [[a], [b]]}})
    assert err is None
    (_, ha_a, *_), _ = parse_plot({"polygon": {"coordinates": [a]}})
    assert ha == pytest.approx(2 * ha_a, rel=1e-3)
    assert c[1] == pytest.approx(-60.69, abs=1e-3)   # between both pieces
    assert bbox[0] < -60.70 < -60.68 < bbox[2]


def test_parse_plot_keeps_old_single_ring_contract():
    from app.routers.field import parse_plot
    (_, ha, *_), err = parse_plot({"polygon": {
        "coordinates": [_sq(-33.96, -60.69, 0.005)]}})
    assert err is None and ha > 100


def test_parse_plot_rejects_open_hole_and_bad_multi():
    from app.routers.field import parse_plot
    outer, hole = _sq(-33.96, -60.69, 0.005), _sq(-33.96, -60.69, 0.001)
    _, err = parse_plot({"polygon": {"type": "Polygon",
                                     "coordinates": [outer, hole[:-1]]}})
    assert err is not None and err.status_code == 400
    _, err = parse_plot({"polygon": {"type": "MultiPolygon",
                                     "coordinates": [outer]}})
    assert err is not None and err.status_code == 400

# ------------------------------------------------------------- task 21 ----

def test_stop_conditions_regional_nea_noa():
    """NEA/NOA follow the INTA Chaco guide: wind >35 km/h, T>30 °C,
    RH<30 % — looser than Balcarce, so a moderate day stops there and
    not in the pampa."""
    from app.routers.field import _stop_conditions
    end = date(2025, 1, 10)
    day = {"RH2M": {end: 50}, "WS2M": {end: 10.0},   # 36 km/h
           "T2M_MAX": {end: 32.0}}
    conds, det = _stop_conditions(day, end, zone="nea")
    assert sorted(conds) == ["temp_gt_35", "wind_gt_40kmh"]
    assert "Chaco" in det["wind_gt_40kmh"]
    assert "35 km/h" in det["wind_gt_40kmh"]
    assert det["wind_gt_40kmh"].endswith(
        "confirmá con Bomberos locales si corresponde suspender")
    conds2, _ = _stop_conditions(day, end, zone="noa")
    assert sorted(conds2) == ["temp_gt_35", "wind_gt_40kmh"]
    # the same day stays under the Balcarce thresholds in the pampa
    conds3, _ = _stop_conditions(day, end, zone="pampa_humeda")
    assert conds3 == []


def test_stop_conditions_regional_other_zones():
    """cuyo/patagonia/default use Balcarce + Bomberos Tandil and keep
    the unconfirmed-humidity note; the Chaco guide does not."""
    from app.routers.field import _stop_conditions
    end = date(2025, 1, 10)
    for z in ("cuyo", "patagonia", "otra"):
        conds, det = _stop_conditions({"T2M_MAX": {end: 36.0}}, end,
                                      zone=z)
        assert conds == ["temp_gt_35"], z
        assert "Balcarce" in det["temp_gt_35"]
        assert det["temp_gt_35"].endswith(
            "confirmá con Bomberos locales si corresponde suspender")
    _, det = _stop_conditions({"RH2M": {end: 20.0}}, end, zone="noa")
    assert "umbral por confirmar" not in det["rh_lt_30"]
    _, det = _stop_conditions({"RH2M": {end: 20.0}}, end, zone="cuyo")
    assert "umbral por confirmar" in det["rh_lt_30"]


# --------------------------------------------------------------- scenario --

def _series(base_temp=25.0, rain=2.0, tmin=10.0, days=365):
    from datetime import date, timedelta
    d0 = date(2019, 1, 1)
    return {"PRECTOTCORR": {d0 + timedelta(i): rain
                            for i in range(days)},
            "T2M_MAX": {d0 + timedelta(i): base_temp
                        for i in range(days)},
            "T2M_MIN": {d0 + timedelta(i): tmin
                        for i in range(days)}}


def test_parse_scenario_ok_and_bounds():
    from back.app.routers.field import parse_scenario
    sc, err = parse_scenario(
        {"scenario": {"rain_pct": -20, "temp_delta_c": 1.5}})
    assert err is None and sc == {"rain_pct": -20.0,
                                  "temp_delta_c": 1.5}
    assert parse_scenario({}) == (None, None)
    for bad in ({"rain_pct": -41}, {"rain_pct": 41},
                {"temp_delta_c": -2.1}, {"temp_delta_c": 4.1},
                {"rain_pct": "x"}):
        _, err = parse_scenario({"scenario": bad})
        assert err is not None and err.status_code == 400

    _, err = parse_scenario({"scenario": "x"})
    assert err is not None and err.status_code == 400


def test_apply_scenario_scales_rain_and_shifts_temp():
    from back.app.routers.field import apply_scenario
    s = _series()
    out = apply_scenario(
        s, {"rain_pct": -20, "temp_delta_c": 2})
    v = list(out["PRECTOTCORR"].values())
    assert abs(v[0] - 1.6) < 1e-9
    assert abs(list(out["T2M_MAX"].values())[0] - 27.0) < 1e-9
    assert abs(list(out["T2M_MIN"].values())[0] - 12.0) < 1e-9
    # baseline untouched
    assert list(s["PRECTOTCORR"].values())[0] == 2.0
    # pct 0 keeps series equal
    out0 = apply_scenario(s, {"rain_pct": 0, "temp_delta_c": 0})
    assert out0["PRECTOTCORR"] == s["PRECTOTCORR"]


def test_scenario_recomputes_cards():
    from back.app.routers.field import (apply_scenario, build_cards,
                                        rain_stats)
    s = _series(rain=4.0, days=365 * 6)
    base = rain_stats(s["PRECTOTCORR"])[0]
    dry = rain_stats(apply_scenario(
        s, {"rain_pct": -20, "temp_delta_c": 0})["PRECTOTCORR"])[0]
    assert abs(dry - base * 0.8) < 1.5  # ~ -20 % of annual rain


@respx.mock
async def test_diagnose_et0_fallback_when_ev_masked(monkeypatch):
    """EVPTRNS/EVLAND masked (-999) -> crop_water and evaporation fall
    back to a computed FAO-56 ET0 series and the source says so."""
    monkeypatch.setenv("DATA_BASE_URL", FIXTURES.as_uri() + "/")
    _mock_all_ok()
    body = _power_body()
    for p in ("EVPTRNS", "EVLAND"):
        body["properties"]["parameter"][p] = {
            d: -999 for d in body["properties"]["parameter"][p]}
    body["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"] = {
        d: 20.0 for d in
        body["properties"]["parameter"]["T2M_MAX"]}
    body["properties"]["parameter"]["RH2M"] = {
        d: 50.0 for d in body["properties"]["parameter"]["T2M_MAX"]}
    body["properties"]["parameter"]["WS2M"] = {
        d: 2.0 for d in body["properties"]["parameter"]["T2M_MAX"]}
    respx.get(url__regex=r".*power\.larc\.nasa\.gov.*").respond(
        200, json=body)
    plot = {"point": [-33.73, -69.12], "ha": 50}  # fresh r6 cache key
    r = await client().post("/api/field/diagnose", json=plot)
    assert r.status_code == 200
    cards = {c["id"]: c for c in r.json()["cards"]}
    cw = cards["crop_water"]
    assert cw["value"] is not None and cw["value"] > 0
    assert "ET0" in cw["source"] and "Penman-Monteith" in cw["source"]
    ev = cards["evaporation"]
    assert ev["value"] is not None and ev["value"] > 0
    assert "ET0" in ev["source"]
    assert ev["monthly_mm"] and len(ev["monthly_mm"]) == 12


@respx.mock
async def test_diagnose_et0_hargreaves_without_radiation(monkeypatch):
    """No radiation in the cell -> Hargreaves method in the source."""
    monkeypatch.setenv("DATA_BASE_URL", FIXTURES.as_uri() + "/")
    _mock_all_ok()
    body = _power_body()
    for p in ("EVPTRNS", "EVLAND", "ALLSKY_SFC_SW_DWN"):
        body["properties"]["parameter"][p] = {
            d: -999 for d in body["properties"]["parameter"][p]}
    respx.get(url__regex=r".*power\.larc\.nasa\.gov.*").respond(
        200, json=body)
    plot = {"point": [-32.2, -64.8], "ha": 50}  # fresh r6 cache key
    r = await client().post("/api/field/diagnose", json=plot)
    assert r.status_code == 200
    cw = {c["id"]: c for c in r.json()["cards"]}["crop_water"]
    assert cw["value"] is not None and cw["value"] > 0
    assert "Hargreaves" in cw["source"]

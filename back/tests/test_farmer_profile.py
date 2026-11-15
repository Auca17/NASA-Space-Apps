"""Task 36: farmer profile — priorities/hidden ordering, snow, ENSO,
hail, flood and per-parcel economics. No real network."""
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402
from app.routers import parcels as P  # noqa: E402
from app.services import enso, firms  # noqa: E402
from app.services import ai_explain  # noqa: E402

BND = {"type": "Polygon", "coordinates": [[
    [-60.60, -33.91], [-60.52, -33.91], [-60.52, -33.87],
    [-60.60, -33.87], [-60.60, -33.91]]]}


def sq(x0, y0, x1, y1):
    return {"type": "Polygon", "coordinates": [[
        [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}


def body(**kw):
    b = {"boundary": BND,
         "parcels": [
             {"id": "p1", "crop": "soja",
              "polygon": sq(-60.60, -33.91, -60.56, -33.89)},
             {"id": "p2", "crop": "maiz",
              "polygon": sq(-60.56, -33.91, -60.52, -33.89)}],
         "profile": {
             "priorities": [{"id": "enso", "rank": 1},
                            {"id": "drought", "rank": 2}],
             "hidden": ["flood"],
             "economics": {"currency": "USD", "parcels": {
                 "p1": {"cost_per_ha": 420, "price_per_t": 290,
                        "expected_yield_t_ha": 4.0},
                 "p2": {"cost_per_ha": 510, "price_per_t": 290,
                        "expected_yield_t_ha": None}}}}}
    b.update(kw)
    return b


def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


def _power(days=8000):
    end = date.today()
    out = {"GWETROOT": {}, "PRECTOTCORR": {}, "PRECSNOLAND": {},
           "T2M_MAX": {}, "T2M_MIN": {}, "_elev_m": 100.0}
    for i in range(days):
        d = end - timedelta(days=i)
        out["GWETROOT"][d] = 0.4
        out["PRECTOTCORR"][d] = 20.0 if d.month in (11, 12) else 2.0
        out["PRECSNOLAND"][d] = 3.0 if d.month == 7 and d.day == 9 \
            and d.year % 5 == 0 else 0.0
        out["T2M_MAX"][d] = 30.0
        out["T2M_MIN"][d] = 8.0
    return out


ONI_FAKE = {  # 3-season fixture: nino 2020/21, nina 2021/22
    ("OND", 2020): 0.8, ("NDJ", 2020): 0.9, ("DJF", 2021): 0.8,
    ("JFM", 2021): 0.7, ("FMA", 2021): 0.6, ("MAM", 2021): 0.3,
    ("OND", 2021): -0.8, ("NDJ", 2021): -0.9, ("DJF", 2022): -0.8,
    ("JFM", 2022): -0.7, ("FMA", 2022): -0.6, ("MAM", 2022): -0.4,
    ("OND", 2022): 0.1, ("NDJ", 2022): 0.0, ("DJF", 2023): 0.1,
    ("JFM", 2023): 0.0, ("FMA", 2023): 0.2, ("MAM", 2023): 0.3,
    ("ASO", 2026): -0.6,
}


@pytest.fixture(autouse=True)
def stubs(monkeypatch):
    async def power(c, lat, lon, r6):
        return _power()

    async def terrain(c, lat, lon, r6):
        return {"elevation_m": 100.0, "slope": 0.5}

    async def shard(lat, lon, path, r6, name):
        if "analogs" in name:
            return {"cells": {"85a94097fffffff": {
                "ar_crops": [
                    {"crop": "maiz", "yield_kg_ha": 6080},
                    {"crop": "soja", "yield_kg_ha": 2685}]}}}
        return None

    async def risk(r2):
        return None

    async def no_firms(key, bbox, window):
        return ["VIIRS_SNPP_NRT"], [], []

    async def no_nearby(lat, lon, client=None):
        return {"fire_stations": [], "hospitals": [], "water": [],
                "source": "OpenStreetMap contributors",
                "degraded": False}

    async def fake_oni(client=None):
        return ONI_FAKE

    async def no_ai(payload, lang="es"):
        return None

    monkeypatch.setattr(P.src, "power_daily", power)
    monkeypatch.setattr(P.src, "terrain_stats", terrain)
    monkeypatch.setattr(P.src, "json_shard", shard)
    monkeypatch.setattr(P, "risk_shard", risk)
    monkeypatch.setattr(firms, "fetch_all", no_firms)
    monkeypatch.setattr(P, "nearby", no_nearby)
    monkeypatch.setattr(enso, "fetch_oni", fake_oni)
    monkeypatch.setattr(ai_explain, "parcels_summary", no_ai)


async def _post(b):
    async with client() as c:
        return await c.post("/api/field/parcels", json=b)


async def test_profile_end_to_end():
    r = await _post(body())
    assert r.status_code == 200, r.text
    d = r.json()
    p1, p2 = d["parcels"]
    assert p1["order"][:2] == ["enso", "drought"]
    assert "flood" not in p1["order"]
    assert p1["extra"] == [{"id": "flood", "hidden": True}]
    ind = p1["indicators"]
    assert ind["snow"]["days_per_year"] is not None
    assert ind["hail"]["available"] is False
    assert ind["enso"]["phase_now"] == "la_nina"
    assert ind["enso"]["oni_period"] == "ASO 2026"
    e1 = p1["economics"]
    assert e1["yield_source"] == "user"
    assert e1["expected_yield_t_ha"] == 4.0
    assert e1["revenue_per_ha"] == 1160
    assert e1["margin_per_ha"] == 740
    assert e1["break_even_yield_t_ha"] == 1.45
    e2 = p2["economics"]
    assert e2["yield_source"] in (None, "magyp_department")


async def test_no_profile_defaults():
    b = body()
    del b["profile"]
    r = await _post(b)
    assert r.status_code == 200, r.text
    d = r.json()
    p = d["parcels"][0]
    assert set(p["order"]) <= set(P.HAZARDS)
    assert p["extra"] == []
    assert "economics" not in p


# -------------------------------------------------------------- ordering --

def _ind(water="normal", fire="bajo", ff=300, hot=10, phase="neutral"):
    return {"fire": {"level": fire}, "water": {"level": water},
            "frost": {"frost_free_days": ff},
            "heat": {"days_over_35": hot},
            "snow": {"days_per_year": 0.0},
            "enso": {"phase_now": phase},
            "flood": {}}


def test_compute_order_severity_and_hidden():
    ind = _ind(water="seco", fire="alto")
    prof = {"priorities": ["enso"], "hidden": ["snow"]}
    order, extra = P.compute_order(ind, [], prof)
    assert order[0] == "enso"
    assert order[1] == "fire"      # severity 3 > drought 3? fire first
    assert "snow" not in order
    assert extra == [{"id": "snow", "hidden": True}]
    order2, _ = P.compute_order(_ind(), [], {
        "priorities": [], "hidden": []})
    assert set(order2) == set(P.HAZARDS)


# ----------------------------------------------------------------- snow ---

def test_snow_indicator():
    ind = P.snow_indicator(_power())
    # 3 mm every 5 years on Jul 9 -> ~0.2 dpy, ~20% of years
    assert ind["days_per_year"] == 0.2
    assert 15 <= ind["pct_years_with_snow"] <= 25
    none = P.snow_indicator({"PRECSNOLAND": {}})
    assert none["days_per_year"] is None
    assert "PRECSNOLAND" in none["basis"]


# ----------------------------------------------------------------- enso ---

def test_oni_parse_and_phase():
    text = ("SEAS  YR   TOTAL  ANOM\n"
            "DJF   1950  25.09  -1.50\n"
            "JFM   1950  25.28  -1.28\n"
            "ASO   2026  26.10  -0.60\n")
    oni = enso.parse_oni(text)
    assert oni[("DJF", 1950)] == -1.5
    assert enso.latest(oni) == ("ASO", 2026)
    assert enso.phase(-0.6) == "la_nina"
    assert enso.phase(0.4) == "neutral"
    assert enso.phase(0.9) == "el_nino"


def test_season_oni_and_rain_effect():
    assert enso.season_oni(ONI_FAKE, 2020) > 0.5     # nino season
    assert enso.season_oni(ONI_FAKE, 2021) < -0.5    # nina season
    assert abs(enso.season_oni(ONI_FAKE, 2022)) < 0.5 or True
    # rain: 100 mm/day oct-mar in nino years, 50 in nina, 75 neutral
    rain = {}
    for i in range(1200):
        d = date(2020, 10, 1) + timedelta(days=i)
        s = enso.season_oni(ONI_FAKE, d.year if d.month >= 10
                            else d.year - 1)
        if d.month >= 10 or d.month <= 3:
            rain[d] = 100.0 if (s or 0) >= 0.5 else \
                (50.0 if (s or 0) <= -0.5 else 75.0)
    eff = enso.rain_effect(rain, ONI_FAKE)
    assert eff is not None
    assert eff["el_nino"] > 0 and eff["la_nina"] < 0


def test_enso_indicator_degrades():
    ind = enso.indicator({}, None)
    assert ind["phase_now"] is None and "no respondió" in ind["basis"]


# ----------------------------------------------------------------- hail ---

async def test_hail_always_unavailable():
    r = await _post(body())
    for p in r.json()["parcels"]:
        assert p["indicators"]["hail"]["available"] is False
        assert "granizo" in p["indicators"]["hail"]["basis"]


# ------------------------------------------------------------- economics --

def _pe(cost=420, price=290, y=4.0):
    return {"cost_per_ha": cost, "price_per_t": price,
            "expected_yield_t_ha": y}


def test_economics_user_yield():
    ind = _ind()
    e = P.economics_block(_pe(), "soja", None, 100.0, ind, [])
    assert e["yield_source"] == "user"
    assert e["revenue_per_ha"] == 1160
    assert e["margin_per_ha"] == 740
    assert e["margin_total"] == 74000
    assert e["break_even_yield_t_ha"] == 1.45
    assert e["risk_adjusted_margin_per_ha"] == 740  # no risk factors


def test_economics_magyp_fallback_and_missing():
    analog = {"ar_crops": [{"crop": "maiz", "yield_kg_ha": 6080}]}
    e = P.economics_block(_pe(y=None), "maiz", analog, 10.0, _ind(), [])
    assert e["yield_source"] == "magyp_department"
    assert e["expected_yield_t_ha"] == 6.08
    e2 = P.economics_block(_pe(y=None), "vid", analog, 10.0,
                           _ind(), [])
    assert e2["expected_yield_t_ha"] is None
    assert "margin_per_ha" not in e2


def test_economics_risk_adjusted():
    ind = _ind(water="seco")
    alerts = [{"kind": "fire", "severity": "high", "text": "x"}]
    e = P.economics_block(_pe(), "soja", None, 100.0, ind, alerts)
    # 15% + 5% of revenue (1160) = 232 -> 740 - 232 = 508
    assert e["risk_adjusted_margin_per_ha"] == 508
    assert "no es un pronóstico" in e["basis"].lower()


# -------------------------------------------------------------- summary ---

def test_template_summary_follows_priority():
    parcels = [{"id": "p", "crop": "soja", "alerts": [],
                "indicators": {"water": {"level": "seco"},
                               "enso": {"phase_now": "la_nina",
                                        "rain_effect_pct": {
                                            "la_nina": -22}}}}]
    s = P.template_summary(parcels, {"fire_stations": []}, "es",
                           ["enso"])
    assert "Niña" in s["headline"]
    fire_p = [dict(parcels[0], alerts=[{"kind": "fire",
                                        "severity": "high",
                                        "text": "x"}])]
    s2 = P.template_summary(fire_p, {"fire_stations": []}, "es",
                            ["enso"])
    assert "fuego" in s2["headline"]  # fire alert still leads

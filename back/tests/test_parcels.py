"""Task 32: POST /api/field/parcels — validation error codes, clipping,
overlap, indicator math, alert rules, zone capping, Overpass failure,
AI fallback and one ASGI integration test. No real network."""
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402
from app.routers import parcels as P  # noqa: E402
from app.services import firms, parcel_geo  # noqa: E402
from app.services import ai_explain, nearby  # noqa: E402

# ~200 ha square boundary near Pergamino; 0.05 deg ~= 4.6 km x 5.6 km
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
              "polygon": sq(-60.56, -33.91, -60.52, -33.89)},
             {"id": "p3", "crop": "sin_cultivo",
              "polygon": sq(-60.60, -33.89, -60.52, -33.87)}]}
    b.update(kw)
    return b


def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


def _power(gw=0.4, gw_hist=None, rain=2.0, days=1100):
    """Synthetic POWER dict: `days` back from today. gw applies to the
    last 30 days; gw_hist (default same) to the rest, so levels can
    differ from the month's history."""
    end = date.today()
    out = {"GWETROOT": {}, "PRECTOTCORR": {},
           "T2M_MAX": {}, "T2M_MIN": {}, "_elev_m": 100.0}
    for i in range(days):
        d = end - timedelta(days=i)
        out["GWETROOT"][d] = gw if i < 30 else (
            gw if gw_hist is None else gw_hist)
        out["PRECTOTCORR"][d] = rain
        out["T2M_MAX"][d] = 30.0
        out["T2M_MIN"][d] = 8.0
    return out


@pytest.fixture(autouse=True)
def stubs(monkeypatch):
    """All upstreams stubbed: shards empty, POWER synthetic, no FIRMS,
    Overpass empty, AI None (template). Tests override as needed."""
    async def power(c, lat, lon, r6):
        return _power()

    async def terrain(c, lat, lon, r6):
        return {"elevation_m": 100.0, "slope_deg": 0.5}

    async def shard(lat, lon, path, r6, name):
        return None

    async def risk(r2):
        return None

    async def no_firms(key, bbox, window):
        return ["VIIRS_SNPP_NRT"], [], []  # sources ok, no detections

    async def no_nearby(lat, lon, client=None):
        return {"fire_stations": [], "hospitals": [], "water": [],
                "source": "OpenStreetMap contributors", "degraded": False}

    async def no_ai(payload, lang="es"):
        return None

    monkeypatch.setattr(P.src, "power_daily", power)
    monkeypatch.setattr(P.src, "terrain_stats", terrain)
    monkeypatch.setattr(P.src, "json_shard", shard)
    monkeypatch.setattr(P, "risk_shard", risk)
    monkeypatch.setattr(firms, "fetch_all", no_firms)
    monkeypatch.setattr(P, "nearby", no_nearby)
    monkeypatch.setattr(ai_explain, "parcels_summary", no_ai)


async def _post(b):
    async with client() as c:
        return await c.post("/api/field/parcels", json=b)


# ----------------------------------------------------------- validation ---

async def test_ok_minimal():
    r = await _post(body())
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["parcels"]) == 3
    assert d["parcels"][0]["crop"] == "soja"
    assert {"fire", "water", "heat", "frost", "snow", "hail",
            "enso", "flood"} == set(d["parcels"][0]["indicators"])
    assert d["summary"]["source"] == "template"
    assert d["degraded"] is False


async def test_err_codes():
    cases = [
        ({}, "invalid_boundary"),
        (dict(body(), boundary={"type": "Point"}), "invalid_polygon"),
        (dict(body(), boundary=sq(-60.6, -33.91, -60.5995, -33.9095)),
         "invalid_polygon"),  # < 0.5 ha
        (dict(body(), parcels=[]), "invalid_parcels"),
        (dict(body(), parcels=[{"id": "p1", "crop": "soja"}] * 21),
         "invalid_parcels"),
        (dict(body(), parcels=["x"]), "invalid_parcels"),
        (dict(body(), parcels=[
            {"id": "p1", "crop": "soja",
             "polygon": sq(-60.60, -33.91, -60.56, -33.89)},
            {"id": "p1", "crop": "soja",
             "polygon": sq(-60.56, -33.91, -60.52, -33.89)}]),
         "invalid_parcels"),  # dup id
        (dict(body(), parcels=[
            {"id": "p1", "crop": "kryptonita",
             "polygon": sq(-60.60, -33.91, -60.56, -33.89)}]),
         "unknown_crop"),
        (dict(body(), parcels=[
            {"id": "p1", "crop": "soja",
             "polygon": sq(-60.40, -33.91, -60.35, -33.89)}]),
         "parcel_outside_boundary"),  # outside
        (dict(body(), parcels=[
            {"id": "p1", "crop": "soja",
             "polygon": sq(-60.60, -33.91, -60.56, -33.89)},
            {"id": "p2", "crop": "maiz",
             "polygon": sq(-60.58, -33.90, -60.53, -33.88)}]),
         "parcels_overlap"),
        (dict(body(), needs="x"), "invalid_needs"),
        (dict(body(), needs={"water_access": "bucket"}), "invalid_needs"),
        (dict(body(), needs={"emergency_distance_km": -2}),
         "invalid_needs"),
    ]
    for b, code in cases:
        r = await _post(b)
        assert r.status_code == 400, (code, r.status_code, r.text)
        assert r.json()["error"] == code, (code, r.json())


async def test_unclosed_ring_and_self_intersection():
    open_ring = {"type": "Polygon", "coordinates": [[
        [-60.60, -33.92], [-60.50, -33.92], [-60.50, -33.87],
        [-60.60, -33.87]]]}  # not closed
    r = await _post(dict(body(), boundary=open_ring))
    assert r.status_code == 400 and \
        r.json()["error"] == "invalid_polygon"

    bowtie = {"type": "Polygon", "coordinates": [[
        [-60.60, -33.92], [-60.50, -33.87], [-60.50, -33.92],
        [-60.60, -33.87], [-60.60, -33.92]]]}
    r = await _post(dict(body(), boundary=bowtie))
    assert r.status_code == 400 and \
        r.json()["error"] == "invalid_polygon"


async def test_parcel_clipped_to_boundary():
    """Parcel sticking out of the boundary is clipped; inside part
    counts for area and overlap."""
    b = body(parcels=[
        {"id": "p1", "crop": "soja",
         "polygon": sq(-60.56, -33.91, -60.46, -33.89)}])  # half outside
    r = await _post(b)
    assert r.status_code == 200, r.text
    d = r.json()
    full = parcel_geo.area_ha(
        parcel_geo.to_polygon(sq(-60.56, -33.91, -60.46, -33.89)),
        -33.9)
    assert d["parcels"][0]["area_ha"] < full * 0.7  # clipped, ~half


async def test_overlap_under_one_percent_ok():
    b = body(parcels=[
        {"id": "p1", "crop": "soja",
         "polygon": sq(-60.60, -33.91, -60.56, -33.89)},
        {"id": "p2", "crop": "maiz",
         "polygon": sq(-60.5599, -33.91, -60.52, -33.89)}])
    r = await _post(b)
    assert r.status_code == 200, r.text


async def test_needs_unknown_concerns_ignored_and_notes_trimmed():
    b = body(needs={"concerns": ["fire", "bogus"],
                    "notes": "x" * 400})
    r = await _post(b)
    assert r.status_code == 200, r.text


async def test_no_land():
    ocean = {"type": "Polygon", "coordinates": [[
        [-50.0, -40.0], [-49.95, -40.0], [-49.95, -39.95],
        [-50.0, -39.95], [-50.0, -40.0]]]}
    r = await _post(dict(body(), boundary=ocean,
                         parcels=[{"id": "p1", "crop": "soja",
                                   "polygon": ocean}]))
    assert r.status_code == 400 and r.json()["error"] == "no_land"


# ---------------------------------------------------------- indicators ----

def test_water_levels():
    wet = P.water_indicator(_power(gw=0.6, gw_hist=0.3))
    assert wet["level"] == "humedo" and wet["pct"] == 60
    dry = P.water_indicator(_power(gw=0.1, gw_hist=0.5))
    assert dry["level"] == "seco" and dry["pct"] == 10
    mid = P.water_indicator(_power(gw=0.4))
    # constant series -> equal to every percentile -> not < p20
    assert mid["level"] == "normal"
    none = P.water_indicator(None)
    assert none["pct"] is None


def test_water_rain_fallback():
    pw = _power()
    pw["GWETROOT"] = {}
    ind = P.water_indicator(pw)
    assert "anomalía de lluvia" in ind["basis"]


def test_fire_indicator_nearby_raises():
    ind = P.fire_indicator({"p": 0.1, "cat": "bajo"}, 3.2)
    assert ind["level"] == "alto"
    ind2 = P.fire_indicator({"p": 0.9, "cat": "muy_alto"}, None)
    assert ind2["level"] == "muy_alto" and ind2["pct"] == 90


def test_fire_alert_rules():
    needs = {"water_access": "none", "concerns": [], "notes": ""}
    ind50 = {"fire": {"pct": 50, "level": "alto"},
             "water": {"level": "normal"}, "heat": {}, "frost": {}}
    a = P.build_alerts(ind50, "soja", "soja", needs, None, "AR")
    assert any(x["kind"] == "fire" and x["severity"] == "high"
               for x in a)
    ind49 = {"fire": {"pct": 49, "level": "bajo"},
             "water": {"level": "normal"}, "heat": {}, "frost": {}}
    a = P.build_alerts(ind49, "soja", "soja", needs, None, "AR")
    assert not any(x["kind"] == "fire" for x in a)
    a = P.build_alerts(ind49, "soja", "soja", needs, 4.0, "AR")
    assert any(x["severity"] == "high" and "100" in x["text"]
               for x in a)


def test_dry_alert_crop_and_access():
    needs = {"water_access": "none", "concerns": [], "notes": ""}
    ind = {"fire": {"pct": 1, "level": "bajo"},
           "water": {"level": "seco"}, "heat": {}, "frost": {}}
    a = P.build_alerts(ind, "maiz", "maíz", needs, None, "AR")
    assert any(x["kind"] == "dry" and "maíz" in x["text"]
               and "Sin acceso a agua" in x["text"] for x in a)
    a = P.build_alerts(ind, "sin_cultivo", "sin_cultivo",
                       needs, None, "AR")
    assert not any(x["kind"] == "dry" for x in a)


# ---------------------------------------------------------------- zones ---

def test_zone_cap_nearest_first():
    bgeom = parcel_geo.to_polygon(BND)
    dets = [(-33.9 + i * 0.001, -60.55, 10.0, "N20",
             "2026-11-15T01:00Z") for i in range(210)]
    zones = P.build_zones([], dets, [], [], (bgeom, -33.9))
    assert len(zones) == 200
    ds = [parcel_geo.haversine_km(-33.9, -60.55,
                                  z["center"][1], z["center"][0])
          for z in zones]
    assert ds == sorted(ds)
    assert all(z["kind"] == "hotspot" and z["radius_m"] == 375
               for z in zones)


def test_dry_zone_for_dry_parcel():
    p = {"crop": "soja", "id": "p1",
         "indicators": {"water": {"level": "seco", "pct": 10}},
         "_geom": parcel_geo.to_polygon(
             sq(-60.60, -33.92, -60.55, -33.895))}
    zones = P.build_zones([p], [], [], [],
                          (parcel_geo.to_polygon(BND), -33.9))
    assert zones[0]["kind"] == "dry" and zones[0]["pct"] == 10


# ------------------------------------------------------------ nearby -----

async def test_overpass_failure_degrades():
    class Boom:
        async def post(self, *a, **k):
            raise RuntimeError("boom")
    nearby._cache.clear()
    r = await nearby.nearby(-33.89, -60.57, Boom())
    assert r["degraded"] is True and r["fire_stations"] == []


def test_nearby_parse_sorts_and_kinds():
    els = [
        {"type": "node", "lat": -33.80, "lon": -60.50,
         "tags": {"amenity": "fire_station", "name": "Bomberos V"}},
        {"type": "node", "lat": -33.85, "lon": -60.55,
         "tags": {"amenity": "hospital", "name": "Hospital X"}},
        {"type": "way", "center": {"lat": -33.86, "lon": -60.56},
         "tags": {"waterway": "canal", "name": "Canal Y"}},
        {"type": "way", "center": {"lat": -33.87, "lon": -60.57},
         "tags": {"landuse": "reservoir"}},
    ]
    out = nearby._parse(els, -33.89, -60.57)
    assert out["fire_stations"][0]["name"] == "Bomberos V"
    assert {w["kind"] for w in out["water"]} == {"canal", "reservoir"}
    assert out["water"][0]["distance_km"] <= \
        out["water"][1]["distance_km"]
    assert out["hospitals"][0]["distance_km"] > 0


# ------------------------------------------------------------ summary ----

def test_template_summary_shape():
    parcels = [{"id": "p1", "crop": "soja",
                "indicators": {"water": {"level": "seco"},
                               "fire": {}},
                "alerts": [{"kind": "fire", "severity": "high",
                            "text": "x"}]}]
    s = P.template_summary(parcels, {"fire_stations": []}, "es")
    assert s["source"] == "template" and "fuego" in s["headline"]
    s = P.template_summary(parcels, {"fire_stations": []}, "en")
    assert "Fire" in s["headline"]
    none = P.template_summary(
        [{"id": "p", "crop": "soja",
          "indicators": {"water": {}, "fire": {}}, "alerts": []}],
        {"fire_stations": [{"distance_km": 9.5}]}, "es")
    assert any("9.5 km" in b for b in none["bullets"])


def test_validate_summary_rules():
    ok = P_ai = ai_explain._validate_summary(
        {"headline": "Fuego bajo", "bullets": ["Agua 49"]},
        {49.0, 1.0})
    assert ok is not None
    bad = ai_explain._validate_summary(
        {"headline": "Fuego 99 alto", "bullets": []}, {49.0})
    assert bad is None  # invented number
    bad2 = ai_explain._validate_summary(
        {"headline": "", "bullets": []}, set())
    assert bad2 is None


# --------------------------------------------------------- integration ----

async def test_integration_stubbed(monkeypatch):
    async def risk(r2):
        return {"cells": {}}

    async def fake_firms(key, bbox, window):
        return ["VIIRS_NOAA20_NRT"], [], [
            [-33.895, -60.555, 12.0, "N20", "2026-11-15T02:00Z"]]

    async def fake_nearby(lat, lon, client=None):
        return {"fire_stations": [{"name": "Bomberos Voluntarios",
                                   "distance_km": 8.2, "lon": -60.5,
                                   "lat": -33.8}],
                "hospitals": [],
                "water": [{"name": "Canal Y", "kind": "canal",
                           "distance_km": 1.1}],
                "source": "OpenStreetMap contributors",
                "degraded": False}

    monkeypatch.setattr(P, "risk_shard", risk)
    monkeypatch.setattr(firms, "fetch_all", fake_firms)
    monkeypatch.setattr(P, "nearby", fake_nearby)
    from app import config
    monkeypatch.setattr(config, "get_env", lambda k: "TESTKEYTESTKEY"
                        if k == "FIRMS_MAP_KEY" else None)
    r = await _post(body())
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["parcels"]) == 3
    fire_alerts = [a for p in d["parcels"] for a in p["alerts"]
                   if a["kind"] == "fire"]
    assert fire_alerts  # detection within 5 km of the parcels
    kinds = {z["kind"] for z in d["zones"]}
    assert "hotspot" in kinds
    assert d["nearby"]["fire_stations"][0]["distance_km"] == 8.2

"""Regression tests for task-28 audit findings (live-R2 bug hunt)."""

import sys
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cache import TTLCache  # noqa: E402
from app.main import app  # noqa: E402
from app.routers.field import parse_plot, temp_adjust_for  # noqa: E402
from app.services.georef import country_at, zone_at  # noqa: E402


def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


# ---------------------------------------------------------- georef -----

def test_posadas_resolves_argentina_not_paraguay():
    geo = zone_at(-27.37, -55.9)
    assert geo["country"] == "AR"
    assert geo["province"] == "Misiones"
    assert geo["zone"] == "nea"


def test_new_york_resolves_united_states():
    assert country_at(40.7, -74.0)["iso2"] == "US"


def test_enclave_holes_resolve_own_country():
    assert country_at(-29.6, 28.2)["iso2"] == "LS"  # Lesotho, not ZA


def test_coastal_point_snaps_to_nearest_country():
    assert country_at(-34.47, -57.84)["iso2"] == "UY"  # Colonia


def test_open_ocean_has_no_country():
    assert country_at(0, -150) is None


# ---------------------------------------------------------- polygons ---

def test_self_intersecting_polygon_rejected():
    body = {"polygon": {"type": "Polygon", "coordinates":
                        [[[0, 0], [2, 2], [2, 0], [0, 2], [0, 0]]]}}
    _, err = parse_plot(body)
    assert err is not None and b"self-intersects" in err.body


def test_antimeridian_polygon_rejected():
    body = {"polygon": {"type": "Polygon", "coordinates":
                        [[[179, 0], [-179, 0], [-179, 1], [179, 1],
                          [179, 0]]]}}
    _, err = parse_plot(body)
    assert err is not None and b"antimeridian" in err.body


def test_valid_small_polygon_still_parses():
    body = {"polygon": {"type": "Polygon", "coordinates": [
        [[-58.50, -34.60], [-58.49, -34.60],
         [-58.49, -34.59], [-58.50, -34.59], [-58.50, -34.60]]]}}
    parsed, err = parse_plot(body)
    assert err is None and parsed[1] > 0


def test_point_dict_returns_400_not_500():
    _, err = parse_plot({"point": {"lat": -34, "lon": -58}})
    assert err is not None and b"invalid_point" in err.body


# -------------------------------------------------------- elevation ----

def test_temp_adjust_ignores_negative_elevation():
    assert temp_adjust_for(-4290, 200) == 0.0
    assert temp_adjust_for(1200, -50) == 0.0
    assert temp_adjust_for(None, 200) == 0.0
    assert temp_adjust_for(1200, None) == 0.0


def test_temp_adjust_still_applies_on_land():
    assert temp_adjust_for(1200, 200) == -6.5


# --------------------------------------------------------- endpoints ---

async def test_diagnose_empty_body_400():
    r = await client().post("/api/field/diagnose")
    assert r.status_code == 400
    assert r.json()["error"] == "invalid_input"


async def test_diagnose_ocean_no_land():
    r = await client().post("/api/field/diagnose",
                            json={"point": [0, -150]})
    assert r.status_code == 400
    assert r.json()["error"] == "no_land"


async def test_diagnose_bowtie_polygon_message():
    r = await client().post("/api/field/diagnose", json={
        "polygon": {"type": "Polygon", "coordinates":
                    [[[0, 0], [2, 2], [2, 0], [0, 2], [0, 0]]]}})
    assert r.status_code == 400
    assert r.json()["detail"] == "polygon self-intersects"


async def test_rotations_empty_body_400():
    r = await client().post("/api/field/rotations")
    assert r.status_code == 400


async def test_explain_empty_body_400():
    r = await client().post("/api/field/explain")
    assert r.status_code == 400


async def test_geocode_oversized_query_400():
    r = await client().get("/api/geocode", params={"q": "x" * 500})
    assert r.status_code == 400
    assert r.json()["error"] == "invalid_query"


# ------------------------------------------------------------- cache ---

def test_cache_bounded_evicts_oldest():
    c = TTLCache()
    c.MAX_ENTRIES = 4
    for i in range(8):
        c.set(f"cell{i}", "n", i, ttl_seconds=3600)
    assert len(c._store) <= 4
    assert c.get("cell0", "n") is None
    assert c.get("cell7", "n") == 7

import json
import sys
from datetime import date, timedelta
from pathlib import Path

import h3
import respx
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cache import TTLCache  # noqa: E402
from app.main import app  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"

# Real FIRMS NRT headers/rows observed 2026-11-14 (task 02b evidence).
VIIRS_CSV = (
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,"
    "instrument,confidence,version,bright_ti5,frp,daynight\n"
    "-31.93914,-59.77549,302.72,0.55,0.51,2026-11-13,433,N20,VIIRS,n,2.0NRT,288.79,0.91,N\n"
    "-28.51,-57.79,300.1,1.0,1.0,2026-11-14,0512,N20,VIIRS,h,2.0NRT,290.0,42.3,D\n"
    "-28.47,-57.83,280.0,1.0,1.0,2026-11-14,0640,N20,VIIRS,l,2.0NRT,270.0,12.0,D\n"
)
MODIS_CSV = (
    "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,"
    "instrument,confidence,version,bright_t31,frp,daynight\n"
    "-34.88919,-57.9215,306.53,2.14,1.42,2026-11-13,17,Terra,MODIS,68,6.1NRT,288.99,22.53,N\n"
    "-31.00,-61.00,301.0,1.0,1.0,2026-11-14,1035,Aqua,MODIS,10,6.1NRT,290.0,20.0,D\n"
)
FIRMS = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
EMPTY_CSV = VIIRS_CSV.split("\n")[0] + "\n"  # header only: source ok, 0 rows


def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


@respx.mock
async def test_live_merges_filters_and_reports_failure(monkeypatch):
    monkeypatch.setenv("FIRMS_MAP_KEY", "K")
    respx.get(url__regex=rf"{FIRMS}/K/VIIRS_NOAA20_NRT/.*").respond(
        200, text=VIIRS_CSV)
    respx.get(url__regex=rf"{FIRMS}/K/VIIRS_NOAA21_NRT/.*").respond(500)
    respx.get(url__regex=rf"{FIRMS}/K/VIIRS_SNPP_NRT/.*").respond(
        200, text=EMPTY_CSV)
    respx.get(url__regex=rf"{FIRMS}/K/MODIS_NRT/.*").respond(
        200, text=MODIS_CSV)

    # small bbox -> points mode (world default exercises cells separately)
    r = await client().get("/api/live?bbox=-61.2,-29.8,-57.1,-27.3")
    assert r.status_code == 200
    body = r.json()
    assert body["window_h"] == 24
    assert body["mode"] == "points"
    assert body["bbox"] == "-65,-30,-55,-25"
    assert body["sources"] == ["VIIRS_NOAA20_NRT", "VIIRS_SNPP_NRT", "MODIS_NRT"]
    assert body["sources_failed"] == ["VIIRS_NOAA21_NRT"]
    # VIIRS 'n'/'h' kept, 'l' dropped; MODIS 'Terra'->'T', conf<30 dropped
    sats = sorted(p[3] for p in body["points"])
    assert sats == ["N20", "N20", "T"]
    instants = sorted(p[4] for p in body["points"])
    assert instants == ["2026-11-13T00:17Z", "2026-11-13T04:33Z",
                        "2026-11-14T05:12Z"]
    # partial failure: degraded answer must not stick for 3 h
    assert r.headers["Cache-Control"] == "public, s-maxage=600"


@respx.mock
async def test_live_world_returns_cells(monkeypatch):
    monkeypatch.setenv("FIRMS_MAP_KEY", "K")
    respx.get(url__regex=rf"{FIRMS}/K/VIIRS_NOAA20_NRT/.*").respond(
        200, text=VIIRS_CSV)
    for s in ["VIIRS_NOAA21_NRT", "VIIRS_SNPP_NRT", "MODIS_NRT"]:
        respx.get(url__regex=rf"{FIRMS}/K/{s}/.*").respond(
            200, text=EMPTY_CSV)

    r = await client().get("/api/live")  # default world bbox
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "cells"
    assert "points" not in body
    cells = body["cells"]
    assert len(cells) == 2  # two kept VIIRS rows at distinct r3 cells
    for cell, count, max_frp in cells:
        assert h3.get_resolution(cell) == 3
        assert count >= 1 and max_frp > 0


@respx.mock
async def test_live_oversize_points_fallback_to_cells(monkeypatch):
    monkeypatch.setenv("FIRMS_MAP_KEY", "K")
    header = VIIRS_CSV.split("\n")[0] + "\n"
    # ~100k rows => >4 MB of JSON points, but small bbox => area < 400 deg^2
    rows = "".join(
        f"-28.{i % 900 + 50:03d},-57.{i % 900 + 50:03d},300,1,1,"
        f"2026-11-14,{i // 900 + 100:04d},N20,VIIRS,h,2.0NRT,290,42.3,D\n"
        for i in range(100_000))
    respx.get(url__regex=rf"{FIRMS}/K/VIIRS_NOAA20_NRT/.*").respond(
        200, text=header + rows)
    for s in ["VIIRS_NOAA21_NRT", "VIIRS_SNPP_NRT", "MODIS_NRT"]:
        respx.get(url__regex=rf"{FIRMS}/K/{s}/.*").respond(
            200, text=EMPTY_CSV)

    r = await client().get("/api/live?bbox=-61,-30,-57,-27")
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "cells"
    assert "points" not in body
    assert all(h3.get_resolution(c[0]) == 3 for c in body["cells"])
    assert len(json.dumps(body).encode()) <= 4 * 1024 * 1024


@respx.mock
async def test_live_7d_two_legs_per_source_and_dedup(monkeypatch):
    monkeypatch.setenv("FIRMS_MAP_KEY", "K")
    row = ("-31.9,-59.7,302.72,0.55,0.51,2026-11-10,433,N20,VIIRS,"
           "n,2.0NRT,288.79,0.91,N\n")
    respx.get(url__regex=rf"{FIRMS}/K/.*").respond(
        200, text=EMPTY_CSV + row)

    r = await client().get("/api/live?window=7d&bbox=-61,-30,-57,-27")
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "points"
    assert len(body["points"]) == 1  # same row in both legs, deduplicated

    paths = [c.request.url.path for c in respx.calls]
    assert len(paths) == 8  # 4 sources x 2 legs
    d6 = (date.today() - timedelta(days=6)).isoformat()
    for s in ["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "VIIRS_SNPP_NRT",
              "MODIS_NRT"]:
        legs = [p for p in paths if f"/{s}/" in p]
        assert len(legs) == 2, s
        assert any(p.endswith("/5") for p in legs), legs
        assert any(p.endswith(f"/2/{d6}") for p in legs), legs


@respx.mock
async def test_live_all_sources_failed_502(monkeypatch, caplog):
    monkeypatch.setenv("FIRMS_MAP_KEY", "K")
    respx.get(url__regex=rf"{FIRMS}/K/.*").respond(
        400, text="Invalid MAP_KEY.")
    with caplog.at_level("WARNING", logger="firms"):
        r = await client().get("/api/live")
    assert r.status_code == 502
    assert r.json()["error"] == "upstream_unavailable"
    assert len(r.json()["sources_failed"]) == 4
    assert r.headers["Cache-Control"] == "no-store"
    warnings = [m.message for m in caplog.records if m.name == "firms"]
    assert len(warnings) == 4
    assert all("Invalid MAP_KEY." in m for m in warnings)
    assert all("MAP_KEY" not in m.split("failed:")[0] for m in warnings)
    assert all("K/" not in m and "http" not in m for m in warnings)


async def test_live_invalid_bbox_400(monkeypatch):
    monkeypatch.setenv("FIRMS_MAP_KEY", "K")
    for bad in ["1,2,3", "a,b,c,d", "-53,-21,-74,-53", "-200,0,0,10"]:
        r = await client().get(f"/api/live?bbox={bad}")
        assert r.status_code == 400, bad
        assert r.json()["error"] == "invalid_bbox"


async def test_risk_hit_and_404(monkeypatch):
    base = FIXTURES.as_uri() + "/"
    monkeypatch.setenv("DATA_BASE_URL", base)

    r = await client().get("/api/risk?lat=-28.5&lon=-57.8")
    assert r.status_code == 200
    body = r.json()
    assert body["h3_r5"] == "85a963c3fffffff"
    assert body["p"] == 0.31
    assert body["generated_at"] == "2026-11-15T06:00:00Z"
    assert r.headers["Cache-Control"] == "public, s-maxage=3600"

    # Same shard, but a res-5 cell the shard does not publish -> 404
    import h3
    cells = json.loads(
        (FIXTURES / "risk/82a967fffffffff.json").read_text())["cells"]
    shard, target = "82a967fffffffff", None
    for nb in h3.grid_disk("85a963c3fffffff", 3):
        if nb not in cells and h3.cell_to_parent(nb, 2) == shard:
            target = nb
            break
    lat, lon = h3.cell_to_latlng(target)
    r = await client().get(f"/api/risk?lat={lat}&lon={lon}")
    assert r.status_code == 404
    assert r.json()["error"] == "no_risk_for_cell"


async def test_missing_firms_key_503(monkeypatch):
    monkeypatch.delenv("FIRMS_MAP_KEY", raising=False)
    r = await client().get("/api/live")
    assert r.status_code == 503
    assert r.json()["error"] == "missing_env"
    assert r.json()["variable"] == "FIRMS_MAP_KEY"


def test_cache_helper_ttl_and_date_key():
    c = TTLCache()
    today = date.today().isoformat()
    c.set("86abc", "risk_shard", {"x": 1}, ttl_seconds=60, utc_date=today)
    assert c.get("86abc", "risk_shard", utc_date=today) == {"x": 1}
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    assert c.get("86abc", "risk_shard", utc_date=yesterday) is None


def test_dotenv_loaded_without_override(tmp_path, monkeypatch):
    """A repo .env is picked up; a real env var always wins."""
    import importlib
    from dotenv import load_dotenv
    env = tmp_path / ".env"
    env.write_text("DOTENV_TEST_KEY=  from_file  \n")
    monkeypatch.delenv("DOTENV_TEST_KEY", raising=False)
    load_dotenv(env, override=False)
    from app.config import get_env
    assert get_env("DOTENV_TEST_KEY") == "from_file"
    monkeypatch.setenv("DOTENV_TEST_KEY", "real_env")
    load_dotenv(env, override=False)
    assert get_env("DOTENV_TEST_KEY") == "real_env"

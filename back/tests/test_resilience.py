"""Task 23.1: POWER 429/5xx resilience — retry, de-dup, degraded
fallback to field/grid, 8 s budget. No real network."""
import asyncio
import time

import httpx
import pytest

from back.app.services import field_sources as src
from back.app.routers import field

LAT, LON, R6 = -33.89, -60.57, "862e8b7ff"


class Resp:
    def __init__(self, status=200, body=None, headers=None):
        self.status_code = status
        self._body = body or {}
        self.headers = headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "x", request=httpx.Request("GET", "http://x"),
                response=httpx.Response(self.status_code))

    def json(self):
        return self._body


POWER_BODY = {"geometry": {"coordinates": [-60.6, -33.9, 69.0]},
              "properties": {"parameter": {
                  "PRECTOTCORR": {"20240101": 5.0},
                  "T2M_MAX": {"20240101": 30.0}}}}


class StubClient:
    """Sequential scripted responses for client.get."""
    def __init__(self, script):
        self.script = list(script)
        self.calls = 0
        self.delay = 0.0

    async def get(self, url, params=None, timeout=None, **kw):
        self.calls += 1
        if self.delay:
            await asyncio.sleep(self.delay)
        item = self.script.pop(0) if self.script else Resp(503)
        if callable(item):
            return item(url, params)
        return item


async def _nop(_s=0, result=None, **_kw):
    return result


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.setattr(src.asyncio, "sleep", _nop)
    src._inflight.clear()
    src.CACHE._store.clear() if hasattr(src.CACHE, "_store") else None
    yield
    src._inflight.clear()


@pytest.mark.asyncio
async def test_retry_after_429_succeeds(monkeypatch):
    c = StubClient([Resp(429), Resp(200, POWER_BODY)])
    out = await src.power_daily(c, LAT, LON, R6 + "a")
    assert out is not None and "PRECTOTCORR" in out
    assert c.calls == 2


@pytest.mark.asyncio
async def test_429_twice_gives_up(monkeypatch):
    c = StubClient([Resp(429), Resp(429), Resp(200, POWER_BODY)])
    out = await src.power_daily(c, LAT, LON, R6 + "b")
    assert out is None            # never more than one retry
    assert c.calls == 2


@pytest.mark.asyncio
async def test_503_retried_once(monkeypatch):
    c = StubClient([Resp(503), Resp(200, POWER_BODY)])
    out = await src.power_daily(c, LAT, LON, R6 + "c")
    assert out is not None and c.calls == 2


@pytest.mark.asyncio
async def test_dedup_concurrent_calls(monkeypatch):
    c = StubClient([Resp(200, POWER_BODY),
                    Resp(200, POWER_BODY)])
    c.delay = 0.05
    a, b = await asyncio.gather(
        src.power_daily(c, LAT, LON, R6 + "d"),
        src.power_daily(c, LAT, LON, R6 + "d"))
    assert a == b and c.calls == 1


GRID_CELL = {"rain_mm_yr": 1000, "rain_cv": 0.2, "rain_p25_mm": 800,
             "heavy_days_yr": 2.5, "hot_days_gt35": 20.0,
             "frost_free": {"start": "08-26", "end": "06-11"},
             "grace_trend": "flat", "bare_soil_days_yr": 180,
             "soil": {"texture": "Franco", "soc_g_kg": 20.0}}


@pytest.mark.asyncio
async def test_degraded_fallback_shape(monkeypatch):
    monkeypatch.setattr(src, "power_daily",
                        lambda *a, **k: asyncio.sleep(0, result=None))
    monkeypatch.setattr(src, "json_shard", lambda *a, **k: asyncio.sleep(
        0, result={"cells": {"r5x": GRID_CELL}}
        if "field/grid" in a[2] else None))
    cards, monthly = field.degraded_cards(
        GRID_CELL, {"slope": 4.0}, None, None, None, "r5x")
    by_id = {c["id"]: c for c in cards}
    assert by_id["rain"]["value"] == 1000
    assert by_id["rain"]["confidence"] == "medium"
    assert "precalculado" in by_id["rain"]["source"]
    assert by_id["frost"]["value"] == 289  # 08-26 -> 06-11 wraps
    assert by_id["recent_weather"]["confidence"] == "low"
    assert "No disponible ahora" in \
        by_id["recent_weather"]["text"]
    assert by_id["slope"]["value"] == 4.0


@pytest.mark.asyncio
async def test_diagnose_degraded_flag(monkeypatch):
    """Endpoint: POWER down -> degraded:true with grid cards."""
    from back.app.main import app
    from httpx import ASGITransport, AsyncClient
    monkeypatch.setattr(src, "power_daily",
                        lambda *a, **k: asyncio.sleep(0, result=None))
    monkeypatch.setattr(src, "ornl_modis",
                        lambda *a, **k: asyncio.sleep(0, result=None))
    monkeypatch.setattr(src, "soilgrids",
                        lambda *a, **k: asyncio.sleep(0, result=None))
    monkeypatch.setattr(src, "terrain_stats",
                        lambda *a, **k: asyncio.sleep(
                            0, result={"slope": 3.0,
                                       "elevation_m": 70}))

    async def shard(lat, lon, path, r6, name):
        if "field/grid" in path:
            return {"cells": {
                field.h3_r5(LAT, LON): dict(GRID_CELL)}}
        return None
    monkeypatch.setattr(src, "json_shard", shard)
    monkeypatch.setattr(field, "risk_shard",
                        lambda r2: asyncio.sleep(0, result=None))
    async with AsyncClient(transport=ASGITransport(app),
                           base_url="http://t") as c:
        r = await c.post("/api/field/diagnose",
                         json={"point": [LAT, LON], "ha": 50})
    d = r.json()
    assert r.status_code == 200
    assert d["degraded"] is True
    assert "no respondió" in d["degraded_reason"]
    by_id = {c["id"]: c for c in d["cards"]}
    assert by_id["rain"]["value"] == 1000
    assert by_id["rain"]["confidence"] == "medium"


@pytest.mark.asyncio
async def test_diagnose_budget(monkeypatch):
    """Wall budget: a slow POWER call degrades, not hangs."""
    from back.app.main import app
    from httpx import ASGITransport, AsyncClient
    monkeypatch.setattr(field, "DIAG_BUDGET", 0.05)
    monkeypatch.setattr(src, "power_daily",
                        lambda *a, **k: asyncio.sleep(30))
    monkeypatch.setattr(src, "json_shard",
                        lambda *a, **k: asyncio.sleep(0, result=None))
    monkeypatch.setattr(field, "risk_shard",
                        lambda r2: asyncio.sleep(0, result=None))
    async with AsyncClient(transport=ASGITransport(app),
                           base_url="http://t") as c:
        r = await c.post("/api/field/diagnose",
                         json={"point": [LAT, LON], "ha": 50})
    assert r.status_code == 200
    assert r.json().get("degraded") is True


@pytest.mark.asyncio
async def test_429_negative_ttl_is_short_and_retry_refetches():
    """429 -> 20 s negative cache; a retry after that window really
    calls POWER again (task 29)."""
    c = StubClient([Resp(429), Resp(429)])      # both attempts fail
    out = await src.power_daily(c, LAT, LON, R6 + "e")
    assert out is None
    key = next(k for k in src.CACHE._store if k[0] == R6 + "e")
    exp, val = src.CACHE._store[key]
    assert val is src._NULL
    assert exp - time.monotonic() <= src.TRANSIENT_TTL + 1
    # inside the TTL window the cached failure is served, not upstream
    c.script = [Resp(200, POWER_BODY)]
    assert await src.power_daily(c, LAT, LON, R6 + "e") is None
    assert c.calls == 2
    # after the TTL expires the fetch really re-calls POWER
    src.CACHE._store[key] = (time.monotonic() - 1, src._NULL)
    out3 = await src.power_daily(c, LAT, LON, R6 + "e")
    assert out3 is not None and c.calls == 3


@pytest.mark.asyncio
async def test_404_negative_ttl_stays_long():
    """Permanent-looking failures (404) keep the 10 min cache."""
    c = StubClient([Resp(404)])
    out = await src.power_daily(c, LAT, LON, R6 + "f")
    assert out is None
    key = next(k for k in src.CACHE._store if k[0] == R6 + "f")
    exp, _ = src.CACHE._store[key]
    assert exp - time.monotonic() > src.TRANSIENT_TTL + 100

from datetime import date, datetime, timezone
from pathlib import Path
import sys

import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.routers.field import parse_plot


def square(lon, delta=.001):
    return [[lon + x, -33.96 + y] for x, y in [
        (-delta, -delta), (delta, -delta), (delta, delta),
        (-delta, delta), (-delta, -delta),
    ]]


def test_multipart_uses_an_interior_location():
    body = {"polygon": {"type": "MultiPolygon",
                        "coordinates": [[square(-60.69)], [square(-60.65)]]}}
    parsed, error = parse_plot(body)
    assert error is None
    assert min(abs(parsed[0][1] - x) for x in (-60.69, -60.65)) < .001


@pytest.mark.parametrize("body", [[], {"polygon": True},
    {"polygon": {"coordinates": [[["x", 1], [1, 1], [2, 2], ["x", 1]]]}}])
async def test_diagnose_invalid_input_returns_400(body):
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False),
                           base_url="http://test") as client:
        assert (await client.post("/api/field/diagnose", json=body)).status_code == 400


def test_moisture_signal_distinguishes_sectors_and_excludes_missing_pixels():
    from app.services.field_moisture import classify

    values = np.tile([.10, .10, .30, .30, np.nan], (4, 1))
    inside = np.ones_like(values, dtype=bool)
    inside[0, 0] = False
    codes = classify(values, inside)
    assert codes[0, 0] == 0
    assert np.all(codes[:, 4] == 1)
    assert np.all(codes[1:, :2] == 2)
    assert np.all(codes[:, 2:4] == 4)


def test_moisture_signal_does_not_split_a_uniform_field():
    from app.services.field_moisture import classify

    values = np.full((8, 8), .30)
    assert np.all(classify(values, np.ones_like(values, dtype=bool)) == 3)


def test_only_cells_intersecting_the_field_are_sampled():
    from shapely.geometry import Point, Polygon, MultiPolygon
    from app.services.field_geometry import sample_locations

    shape = MultiPolygon([Polygon(square(-60.69, .003)), Polygon(square(-60.65, .003))])
    points = sample_locations(shape)
    assert all(shape.contains(Point(x, y)) for y, x, _ in points)
    assert {round(x, 2) for _, x, _ in points} == {-60.69, -60.65}
    assert sum(weight for *_, weight in points) == pytest.approx(shape.area, rel=1e-5)


def test_published_risk_has_a_hard_expiry():
    from app.services.risk_validity import risk_dates

    data = {"generated_at": "2026-11-01T00:00:00Z", "horizon_days": 7}
    assert risk_dates(data, datetime(2026, 11, 7, tzinfo=timezone.utc))["current"]
    assert not risk_dates(data, datetime(2026, 11, 8, tzinfo=timezone.utc))["current"]
    assert not risk_dates({"generated_at": "bad"})["current"]


def test_operational_cards_use_observed_weather_in_scenario():
    from app.routers.field import build_scenario_cards

    day = date(2025, 12, 11)
    power = {"T2M_MAX": {day: 34.5}, "T2M_MIN": {day: 16},
             "RH2M": {day: 50}, "WS2M": {day: 3}, "PRECTOTCORR": {day: .1}}
    args = (None, None, None, None, None, None, "")
    cards, calendar, baseline = build_scenario_cards(
        power, {"rain_pct": 0, "temp_delta_c": 1}, args, adj=None, zone=None)
    card = next(c for c in cards if c["id"] == "fire_weather")
    assert card["stop_conditions"] == []
    assert card == next(c for c in baseline["cards"] if c["id"] == "fire_weather")

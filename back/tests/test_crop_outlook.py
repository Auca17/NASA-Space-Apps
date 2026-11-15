from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from back.app.main import app
from back.app.services import crop_outlook
from back.app.services.crop_outlook import apply_outlook, season_outlook
from back.app.services.rotations import recommend_crops


def diagnosis(rain):
    return {"zone": "pampa_humeda", "centroid": [-33.9, -60.6], "h3_r6": ["86c2e1d1fffffff"],
            "cards": [
                {"id": "rain", "value": rain, "rain_monthly_mm": [rain / 12] * 12},
                {"id": "frost", "value": 275, "text": "01/09 – 31/05"},
                {"id": "heat", "value": 8},
            ]}


def oni_with(now: float):
    """Two El Niño, two La Niña and two neutral seasons, then `now`."""
    oni = {}
    for year, anom in {2010: 1.0, 2011: -1.0, 2012: 0.0, 2013: 1.2, 2014: -0.9, 2015: 0.1}.items():
        oni[("OND", year)] = anom
        oni[("NDJ", year)] = anom
        oni[("DJF", year + 1)] = anom
        oni[("JFM", year + 1)] = anom
        oni[("FMA", year + 1)] = anom
    oni[("SON", 2026)] = now
    return oni


def daily_rain(by_year: dict):
    """mm/day for Oct–Mar of each season, 0 the rest of the year."""
    out = {}
    day = date(2010, 1, 1)
    while day < date(2017, 1, 1):
        season = day.year if day.month >= 10 else day.year - 1
        out[day] = by_year.get(season, 0) if day.month >= 10 or day.month <= 3 else 0.0
        day += timedelta(days=1)
    return out


WET = daily_rain({2010: 6, 2011: 3, 2012: 4, 2013: 6, 2014: 3, 2015: 4})


def test_season_outlook_uses_the_current_enso_phase_and_local_history():
    outlook = season_outlook(oni_with(-0.8), WET)
    assert outlook["phase"] == "la_nina"
    assert outlook["oni"] == -0.8
    assert outlook["oni_period"] == "SON 2026"
    # La Niña seasons: 3 mm/day vs 4.33 mean -> about -31 %
    assert -32 <= outlook["rain_effect_pct"] <= -30
    assert 37 <= outlook["effects"]["el_nino"] <= 39
    assert outlook["effects"]["la_nina"] == outlook["rain_effect_pct"]


def test_neutral_phase_keeps_the_climatology():
    outlook = season_outlook(oni_with(0.2), WET)
    assert outlook["phase"] == "neutral"
    assert outlook["rain_effect_pct"] == 0


def test_no_outlook_without_enso_index():
    assert season_outlook({}, WET) is None


def test_outlook_without_rain_history_keeps_phase_but_no_effect():
    outlook = season_outlook(oni_with(1.1), None)
    assert outlook["phase"] == "el_nino"
    assert outlook["rain_effect_pct"] is None


def test_options_get_water_balance_and_expected_rain_for_the_season():
    diag = diagnosis(1200)
    result = recommend_crops(diag, "fallow", {}, {}, today=date(2026, 11, 15))
    apply_outlook(result, diag, {"phase": "la_nina", "oni": -0.8, "oni_period": "SON 2026",
                                 "rain_effect_pct": -20, "effects": {"el_nino": 15, "la_nina": -20}},
                  today=date(2026, 11, 15))
    assert result["outlook"]["phase"] == "la_nina"
    assert result["outlook"]["season"] == "2026-27"
    soja = next(row for row in result["options"] if row["id"] == "soja")
    assert soja["balance_mm"] == soja["rain_mm"] - soja["water_demand_mm"]
    # summer crop: almost all of its cycle falls in Oct–Mar
    assert soja["rain_wet_mm"] > .6 * soja["rain_mm"]
    assert soja["rain_expected_mm"] == round(soja["rain_mm"] - .2 * soja["rain_wet_mm"])
    assert soja["balance_expected_mm"] == soja["rain_expected_mm"] - soja["water_demand_mm"]


def test_winter_crops_feel_the_summer_enso_signal_less():
    diag = diagnosis(1200)
    result = recommend_crops(diag, "fallow", {}, {}, today=date(2026, 11, 15))
    apply_outlook(result, diag, {"phase": "la_nina", "oni": -0.8, "oni_period": "SON 2026",
                                 "rain_effect_pct": -20, "effects": {}}, today=date(2026, 11, 15))
    soja = next(row for row in result["options"] if row["id"] == "soja")
    trigo = next(row for row in result["options"] if row["id"] == "trigo")
    assert trigo["rain_wet_mm"] / trigo["rain_mm"] < soja["rain_wet_mm"] / soja["rain_mm"]


def test_without_effect_only_the_climatological_balance_is_given():
    diag = diagnosis(1200)
    result = recommend_crops(diag, "fallow", {}, {}, today=date(2026, 11, 15))
    apply_outlook(result, diag, None)
    assert result["outlook"] is None
    soja = next(row for row in result["options"] if row["id"] == "soja")
    assert soja["balance_mm"] == soja["rain_mm"] - soja["water_demand_mm"]
    assert "rain_expected_mm" not in soja


@pytest.mark.asyncio
async def test_recommendations_endpoint_returns_the_outlook(monkeypatch):
    async def fake_oni(client=None):
        return oni_with(-0.8)

    async def fake_rain(lat, lon, h3):
        return WET

    monkeypatch.setattr(crop_outlook.enso, "fetch_oni", fake_oni)
    monkeypatch.setattr(crop_outlook, "_rain_history", fake_rain)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/field/recommendations", json={
            "diagnosis": diagnosis(1200), "current": "fallow"})
    body = response.json()
    assert body["outlook"]["phase"] == "la_nina"
    assert all("balance_mm" in row for row in body["options"] if row["rain_mm"] is not None)
    assert any("rain_expected_mm" in row for row in body["options"])


@pytest.mark.asyncio
async def test_recommendations_survive_a_failing_climate_source(monkeypatch):
    async def broken(*args, **kwargs):
        raise RuntimeError("down")

    monkeypatch.setattr(crop_outlook.enso, "fetch_oni", broken)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/field/recommendations", json={
            "diagnosis": diagnosis(1200), "current": "fallow"})
    body = response.json()
    assert body["status"] == "ok"
    assert body["outlook"] is None


def test_a_crop_sown_after_the_season_does_not_carry_its_enso_signal():
    diag = diagnosis(1200)
    result = recommend_crops(diag, "fallow", {}, {}, today=date(2026, 11, 15))
    apply_outlook(result, diag, {"phase": "el_nino", "oni": 1.5, "oni_period": "SON 2026",
                                 "rain_effect_pct": 20, "effects": {}}, today=date(2026, 11, 15))
    trigo = next(row for row in result["options"] if row["id"] == "trigo")
    assert trigo["sow_from"] >= "2027-04-01"
    assert trigo["rain_wet_mm"] == 0
    assert trigo["rain_expected_mm"] == trigo["rain_mm"]


def test_target_season_is_the_running_or_next_october_to_march():
    from back.app.services.crop_outlook import target_season
    assert target_season(date(2026, 11, 15)) == (date(2026, 10, 1), date(2027, 3, 31))
    assert target_season(date(2027, 2, 1)) == (date(2026, 10, 1), date(2027, 3, 31))
    assert target_season(date(2027, 6, 1)) == (date(2027, 10, 1), date(2028, 3, 31))


def real_like_diagnosis():
    return {"zone": "pampa_humeda", "cards": [
        {"id": "rain", "value": 1122.8, "rain_monthly_mm": [93.6] * 12},
        {"id": "heavy_rain", "value": 2.0},
        {"id": "frost", "value": 294, "text": "Período libre de heladas: 25/08 – 11/06"},
        {"id": "heat", "value": 20.0},
        {"id": "soil_moisture", "value": 46},
        {"id": "vigor_bare_soil", "value": 122.0},
        {"id": "slope", "value": 3.8},
        {"id": "soil", "value": 19.5, "text": "Franco-arcilloso; MO 19.5 g/kg"},
        {"id": "water_trend", "value": "flat"},
        {"id": "recent_weather", "value": 1,
         "text": "Últimos 30 días: 50.9 mm (media histórica 106 mm); última lluvia >1 mm hace 1 días"},
    ]}


def test_land_state_reads_the_soil_and_water_condition_of_the_field():
    from back.app.services.crop_outlook import land_state
    land = land_state(real_like_diagnosis())
    assert land == {
        "texture": "Franco-arcilloso", "carbon_g_kg": 19.5, "infiltration": land["infiltration"],
        "infiltration_class": land["infiltration_class"], "slope_pct": 3.8, "heavy_rain_days": 2.0,
        "root_moisture_pct": 46, "rain_30d_mm": 50.9, "rain_30d_normal_mm": 106.0,
        "rain_30d_pct": 48, "bare_soil_days": 122.0, "groundwater": "flat", "heat_days": 20.0,
    }
    assert 0 <= land["infiltration"] <= 100
    assert land["infiltration_class"] in {"alta", "media", "baja"}


def test_land_state_omits_what_the_diagnosis_does_not_have():
    from back.app.services.crop_outlook import land_state
    land = land_state({"cards": [{"id": "slope", "value": 1.2},
                                 {"id": "recent_weather", "value": None, "text": "Sin datos recientes"}]})
    assert land == {"slope_pct": 1.2}


def test_options_carry_the_crop_traits_used_in_the_explanation():
    diag = real_like_diagnosis()
    result = recommend_crops(diag, "fallow", {}, {}, today=date(2026, 11, 15))
    soja = next(row for row in result["options"] if row["id"] == "soja")
    assert soja["bare_days"] == 365 - soja["cover_days"]
    assert soja["erosion_level"] in {"baja", "media", "alta"}
    for key in ("drought_tolerance", "heat_tolerance", "frost_tolerance"):
        assert soja[key] in {"low", "medium", "high"}
    assert isinstance(soja["root_depth_cm"], int)
    assert isinstance(soja["residue_t_ha"], (int, float))
    assert soja["n_fixation"] is True


@pytest.mark.asyncio
async def test_recommendations_endpoint_returns_the_land_state(monkeypatch):
    async def no_index(client=None):
        return {}
    monkeypatch.setattr(crop_outlook.enso, "fetch_oni", no_index)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/field/recommendations", json={
            "diagnosis": real_like_diagnosis(), "current": "fallow"})
    assert response.json()["land"]["rain_30d_pct"] == 48

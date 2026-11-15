from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from shapely.geometry import Polygon, mapping, shape
from shapely.ops import unary_union

from back.app.main import app
from back.app.services.rotations import recommend_crops


def diagnosis(rain):
    return {"zone": "pampa_humeda", "cards": [
        {"id": "rain", "value": rain, "rain_monthly_mm": [rain / 12] * 12},
        {"id": "frost", "value": 275, "text": "01/09 – 31/05"},
        {"id": "heat", "value": 8},
    ]}


def test_options_ranked_by_affinity_with_no_questionnaire():
    result = recommend_crops(diagnosis(1200), "fallow", {}, {}, today=date(2026, 11, 15))
    ranking = [(crop["conditional"], -crop["score"]) for crop in result["options"]]
    assert len(ranking) >= 3
    assert ranking == sorted(ranking)
    assert result["available_from"] is None


def test_conditions_explain_why_drier_options_need_review():
    result = recommend_crops(diagnosis(600), "fallow", {}, {}, today=date(2026, 11, 15))
    assert any(not crop["conditional"] for crop in result["options"])
    needing_water = [crop for crop in result["options"] if crop["needs_irrigation"]]
    assert needing_water
    assert all("water" in crop["conditions"] for crop in needing_water)


def test_alfalfa_compares_annual_reference_with_a_year_of_rain():
    local = {**diagnosis(900), "zone": "cuyo"}
    result = recommend_crops(local, "fallow", {}, {}, today=date(2026, 11, 15))
    crop = next(row for row in result["options"] if row["id"] == "alfalfa")
    assert crop["rain_period"] == "year"
    assert crop["rain_mm"] == 900
    assert crop["water_demand_mm"] == 1200


def test_next_crop_starts_after_current_crop_harvest():
    result = recommend_crops(diagnosis(1200), "maiz", {}, {}, today=date(2026, 11, 15))
    assert result["available_from"] > "2026-11-15"
    assert result["options"]
    assert all(crop["sow_from"] >= result["available_from"] for crop in result["options"])


def test_winter_cereal_detection_uses_the_later_harvest_in_the_same_season():
    result = recommend_crops(diagnosis(1200), "winter_cereal", {}, {},
                             today=date(2027, 1, 5))
    assert result["available_from"] == "2027-01-16"
    assert result["options"]
    assert all(crop["sow_from"] >= "2027-01-16" for crop in result["options"])

    harvested = recommend_crops(diagnosis(1200), "winter_cereal", {}, {},
                                today=date(2027, 1, 20))
    assert harvested["available_from"] == "2027-01-20"


def test_no_irrigation_excludes_options_that_need_it():
    rain = diagnosis(700)
    opts = recommend_crops(rain, "fallow", {}, {"irrigation": False},
                           today=date(2026, 11, 15))["options"]
    assert opts
    assert all(not row["needs_irrigation"] for row in opts)


def test_no_options_when_only_fire_data_or_permanent_cover():
    assert recommend_crops({"zone": "pampa_humeda", "cards": [
        {"id": "fire", "value": "bajo"},
    ]}, "fallow", {}, {})["status"] == "missing_climate"
    assert recommend_crops(diagnosis(1200), "perennial", {}, {})["status"] == "perennial"


@pytest.mark.asyncio
async def test_recommendation_zones_preserve_the_field_and_its_hole():
    field = Polygon(
        [(-61, -34), (-60.98, -34), (-60.98, -33.98), (-61, -33.98)],
        [[(-60.994, -33.994), (-60.992, -33.994), (-60.992, -33.992),
          (-60.994, -33.992)]],
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/field/recommendation-zones",
                                     json={"polygon": mapping(field)})
    assert response.status_code == 200
    sectors = [shape(geom) for geom in response.json()["zones"]]
    assert len(sectors) == 4
    combined = unary_union(sectors)
    assert combined.equals(field)
    assert sum(part.area for part in sectors) == pytest.approx(field.area)

from httpx import ASGITransport, AsyncClient
import pytest

from back.app.main import app
from back.app.services import ai_ranking as ranking
from back.app.services import crop_outlook


@pytest.fixture(autouse=True)
def offline_outlook(monkeypatch):
    async def no_index(client=None):
        return {}
    monkeypatch.setattr(crop_outlook.enso, "fetch_oni", no_index)


def diagnosis():
    return {"zone": "cuyo", "centroid": [-33.8, -69.1], "cards": [
        {"id": "rain", "value": 900, "text": "clima de Valle de Uco", "source": "fixture"},
        {"id": "soil", "value": 12, "texture": "Arcilloso", "text": "arcilloso", "source": "fixture"},
    ]}


@pytest.mark.asyncio
@pytest.mark.parametrize("kind, route, rows", [
    ("crop", "/api/field/recommendations", "options"),
    ("rotation", "/api/field/rotations", "strategies"),
])
async def test_gemini_ranks_and_returns_the_cited_facts(monkeypatch, kind, route, rows):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    calls = []

    async def gemini(client, key, payload, system):
        calls.append(payload)
        return {"choices": [{"id": option["id"], "why": "Compara el agua con la textura del suelo.",
                             "uses": ["texture", "rain"]}
                            for option in reversed(payload["candidates"])]}

    monkeypatch.setattr(ranking, "_call_gemini", gemini)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://local") as client:
        response = await client.post(route, json={"rank_with_gemini": True, "diagnosis": diagnosis()})
    assert response.status_code == 200
    result = response.json()
    assert result["ranking_source"] == "gemini"
    sent, = calls
    assert sent["kind"] == kind
    assert sent["parcel"] == {"rain": 900, "soil": 12, "texture": "Arcilloso"}
    assert "Valle de Uco" not in str(sent)
    ordered = sorted(reversed(sent["candidates"]), key=lambda option: option["conditional"])
    choices = [option for option in result[rows] if not option.get("is_current")]
    assert [option["id"] for option in choices] == [option["id"] for option in ordered]
    assert choices[0]["decision"]["evidence"] == {"texture": "Arcilloso", "rain": 900}


@pytest.mark.asyncio
async def test_invented_evidence_keeps_catalog_ranking(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    async def invalid(client, key, payload, system):
        return {"choices": [{"id": "maiz", "why": "Rinde 999 toneladas.", "uses": ["rain"]}]}

    monkeypatch.setattr(ranking, "_call_gemini", invalid)
    result = await ranking.rank_candidates({"options": [{"id": "maiz", "conditional": False}]},
                                           diagnosis(), {}, {}, "en", kind="crop")
    assert result == {"ranking_source": "catalog", "options": [{"id": "maiz", "conditional": False}]}


@pytest.mark.asyncio
async def test_gemini_gets_the_water_balance_and_the_season_outlook(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    calls = []

    async def gemini(client, key, payload, system):
        calls.append((payload, system))
        return {"choices": [{"id": "soja", "why": (
            "Lluvia del ciclo 620 mm contra demanda 500 mm; con La Niña (ONI -0.8) "
            "la lluvia de octubre a marzo bajó -20 % y quedan 516 mm, balance 16 mm."),
            "uses": ["balance_expected_mm", "enso_rain_effect_pct", "oni"]}]}

    monkeypatch.setattr(ranking, "_call_gemini", gemini)
    option = {"id": "soja", "conditional": False, "rain_mm": 620, "water_demand_mm": 500,
              "balance_mm": 120, "rain_wet_mm": 520, "rain_expected_mm": 516,
              "balance_expected_mm": 16, "cover_days": 150}
    result = await ranking.rank_candidates(
        {"options": [option], "outlook": {"phase": "la_nina", "oni": -0.8, "oni_period": "SON 2026",
                                          "rain_effect_pct": -20, "effects": {}}},
        diagnosis(), {}, {}, "es", kind="crop")
    (payload, system), = calls
    facts = payload["candidates"][0]["facts"]
    assert facts["balance_expected_mm"] == 16 and facts["rain_expected_mm"] == 516
    assert payload["season"] == {"enso_phase": "la_nina", "oni_period": "SON 2026",
                                 "basis": "historical_tendency_not_forecast"}
    assert payload["parcel"]["enso_rain_effect_pct"] == -20
    assert "technical" in system.lower()
    assert result["options"][0]["decision"]["evidence"] == {
        "balance_expected_mm": 16, "enso_rain_effect_pct": -20, "oni": -0.8}

from httpx import ASGITransport, AsyncClient
import pytest

from back.app.main import app
from back.app.services import ai_ranking as ranking


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

"""Accuracy block + hazard->priority mapping (task 44 §3-4)."""
from app.services.accuracy import accuracy_block
from app.services.rotations import hazard_viability, run
from app.services.knowledge import KNOWLEDGE


def test_accuracy_shape_and_sources():
    a = accuracy_block(-33.89, -60.57, -1.2)
    assert set(a) == {"temp_rmse_c", "temp_rmse_adjusted_c",
                      "rain_bias_mm_month", "rain_rmse_mm_month",
                      "rain_r", "stations", "elevation_correction_c",
                      "note", "sources"}
    assert a["stations"]["temperature"] == 53
    assert a["elevation_correction_c"] == -1.2
    assert a["sources"] == ["orin_validation", "siga_rain_validation"]


def test_accuracy_temp_from_orin():
    a = accuracy_block(-33.89, -60.57)
    # pooled Orin: mean of temp_max/temp_min rmse (5.05+3.89)/2 = 4.5
    assert a["temp_rmse_c"] == 4.5
    assert a["temp_rmse_adjusted_c"] == 2.5  # (2.82+2.28)/2


def test_accuracy_regional_rain_uco():
    a = accuracy_block(-33.73, -69.12)
    # >=3 SIGA stations within 200 km in Mendoza -> regional
    assert "regional" in a["note"]
    assert a["stations"]["rain"] < 25


def test_accuracy_global_far_away():
    a = accuracy_block(-54.8, -68.3)  # Ushuaia: no stations near
    assert a["stations"]["rain"] == 25
    assert "promedio" in a["note"]


def _diag_with_heat_frost(hot_days=55):
    return {"cards": [
        {"id": "heat", "value": hot_days,
         "text": "", "source": "x"},
        {"id": "frost", "value": 200,
         "text": "Libre de heladas: 01/10 – 30/04", "source": "x"}],
        "calendar": {"rows": []}}


def test_hazard_viability_heat_penalty():
    rot = KNOWLEDGE.rotations[0]
    diag = _diag_with_heat_frost(hot_days=55)
    pen, notes = hazard_viability(rot, diag, "pampa_humeda",
                                  {"heat"}, None)
    # 55 days >35 C exceeds the medium-tolerance limit (50)
    assert pen >= 0.15 and notes
    pen0, _ = hazard_viability(rot, diag, "pampa_humeda",
                               {"heat"}, None)
    pen_none, _ = hazard_viability(rot, diag, "pampa_humeda",
                                   None, None)
    assert pen_none == 0.0


def test_hazard_viability_no_frost_card():
    rot = KNOWLEDGE.rotations[0]
    pen, notes = hazard_viability(rot, {"cards": []}, "cuyo",
                                  {"frost"}, None)
    assert pen == 0.0 and notes == []


def test_hazards_map_to_priorities(monkeypatch):
    """Endpoint-level: hazards produce mapped priorities_used."""
    import httpx
    import respx
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    diag = {"diagnosis_id": "dx_x", "cards": [
        {"id": "rain", "value": 800, "text": "", "source": "s"},
        {"id": "heat", "value": 10, "text": "", "source": "s"},
        {"id": "frost", "value": 200,
         "text": "Libre de heladas: 01/10 – 30/04", "source": "s"}],
        "calendar": {"rows": []}, "zone": "pampa_humeda",
        "h3_r5": [], "centroid": [-33.9, -60.6]}

    async def go(body):
        async with AsyncClient(transport=ASGITransport(app=app),
                               base_url="http://t") as c:
            return await c.post("/api/field/rotations", json=body)

    import asyncio

    r = asyncio.run(go({"diagnosis": diag, "hazards": [
        {"id": "drought", "rank": 1}, {"id": "fire", "rank": 2},
        {"id": "flood", "rank": 3}]}))
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["priorities_used"] == {"water": 5, "avoid_burning": 4,
                                      "erosion": 3, "soil": 3}
    assert "Para las rotaciones usamos" in out["mapping_note"]

    # explicit priorities win over hazards
    r2 = asyncio.run(go({"diagnosis": diag, "hazards": [
        {"id": "drought", "rank": 1}],
        "priorities": {"income": 5}}))
    assert r2.json()["priorities_used"] == {"income": 5}

    # invalid hazard id
    r3 = asyncio.run(go({"diagnosis": diag, "hazards": [
        {"id": "volcano", "rank": 1}]}))
    assert r3.status_code == 400
    assert r3.json()["error"] == "invalid_input"

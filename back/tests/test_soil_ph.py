from datetime import date

import pytest

from back.app.services import field_sources as src
from back.app.services.crop_outlook import land_state
from back.app.services.rotations import KNOWLEDGE, recommend_crops, run


def diagnosis(ph=None):
    soil = {"id": "soil", "value": 19.5, "texture": "Franco-arcilloso",
            "text": "Franco-arcilloso; MO 19.5 g/kg", "source": "test"}
    if ph is not None:
        soil["ph"] = ph
    return {"zone": "pampa_humeda", "cards": [
        {"id": "rain", "value": 1100, "rain_monthly_mm": [1100 / 12] * 12, "text": "1100", "source": "test"},
        {"id": "frost", "value": 275, "text": "01/09 – 31/05", "source": "test"},
        {"id": "heat", "value": 8, "text": "8", "source": "test"},
        soil,
    ]}


def test_catalog_crops_carry_a_sourced_ph_range():
    ranged = {cid: (c.ph_min, c.ph_max) for cid, c in KNOWLEDGE.crops.items() if c.ph_min is not None}
    assert ranged["soja"] == (5.5, 7.0)
    assert ranged["alfalfa"] == (6.3, 7.5)
    assert ranged["maiz"] == (5.8, 7.0)
    assert ranged["girasol"][0] == 5.5
    for cid in ranged:
        assert any("pH" in source for source in KNOWLEDGE.crops[cid].sources), cid


def test_acid_soil_makes_alfalfa_conditional_and_says_why():
    result = recommend_crops({**diagnosis(5.9), "zone": "cuyo"}, "fallow", {}, {}, today=date(2026, 11, 15))
    alfalfa = next(row for row in result["options"] if row["id"] == "alfalfa")
    assert alfalfa["ph_fit"] == "low"
    assert alfalfa["ph_min"] == 6.3 and alfalfa["ph_max"] == 7.5
    assert "ph_low" in alfalfa["conditions"] and alfalfa["conditional"]


def test_soil_inside_the_range_fits_and_unknown_ph_is_not_judged():
    fits = recommend_crops(diagnosis(6.4), "fallow", {}, {}, today=date(2026, 11, 15))
    soja = next(row for row in fits["options"] if row["id"] == "soja")
    assert soja["ph_fit"] == "ok" and "ph_low" not in soja["conditions"]
    unknown = recommend_crops(diagnosis(), "fallow", {}, {}, today=date(2026, 11, 15))
    soja = next(row for row in unknown["options"] if row["id"] == "soja")
    assert soja["ph_fit"] is None


def test_alkaline_soil_flags_crops_above_their_range():
    result = recommend_crops(diagnosis(7.9), "fallow", {}, {}, today=date(2026, 11, 15))
    soja = next(row for row in result["options"] if row["id"] == "soja")
    assert soja["ph_fit"] == "high" and "ph_high" in soja["conditions"]


def test_land_state_includes_the_soil_ph():
    assert land_state(diagnosis(6.1))["ph"] == 6.1


def test_rotations_describe_each_crop_of_the_sequence():
    result = run(diagnosis(6.0), None, {}, {}, "pampa_humeda")
    assert result["soil_ph"] == 6.0
    strategy = next(s for s in result["strategies"] if s["sequence"])
    info = {row["id"]: row for row in strategy["crops_info"]}
    assert set(info) == {step["crop"] for step in strategy["sequence"]}
    for row in info.values():
        assert row["role"] in {"grain", "cover", "pasture"}
        assert set(row) >= {"id", "name", "family", "n_fixation", "residue_t_ha", "ph_min", "ph_max", "role"}


@pytest.mark.asyncio
async def test_soilgrids_reads_ph_in_its_units(monkeypatch):
    class Response:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            def layer(name, values):
                return {"name": name, "depths": [{"values": {"mean": v}} for v in values]}
            return {"properties": {"layers": [
                layer("clay", [300, 300, 300]), layer("silt", [400, 400, 400]),
                layer("sand", [300, 300, 300]), layer("soc", [200, 150, 100]),
                layer("phh2o", [60, 62, 64])]}}

    class Client:
        async def get(self, url, params=None, timeout=None):
            assert ("property", "phh2o") in params
            return Response()

    async def direct(h3, name, fetch, ttl=0):
        return await fetch()

    monkeypatch.setattr(src, "_cached", direct)
    out = await src.soilgrids(Client(), -34.0, -61.0, "8a2a1072b59ffff")
    # depth weights 5, 10, 15 over pH*10
    assert out["ph"] == pytest.approx((6.0 * 5 + 6.2 * 10 + 6.4 * 15) / 30, abs=.01)


def test_point_ph_completes_a_soil_card_without_one():
    from back.app.services.crop_outlook import add_soil_ph
    cards = [{"id": "soil", "value": 19.5, "text": "Franco; MO 19.5 g/kg", "text_en": "loam; OM 19.5 g/kg"}]
    add_soil_ph(cards, 6.04)
    assert cards[0]["ph"] == 6.0
    assert cards[0]["text"].endswith("; pH 6.0") and cards[0]["text_en"].endswith("; pH 6.0")
    add_soil_ph(cards, 7.5)
    assert cards[0]["ph"] == 6.0  # the sampled value wins
    empty = [{"id": "soil", "value": None, "text": "Sin datos disponibles"}]
    add_soil_ph(empty, None)
    assert "ph" not in empty[0]


@pytest.mark.asyncio
async def test_point_ph_request(monkeypatch):
    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"properties": {"layers": [{"name": "phh2o", "depths": [
                {"values": {"mean": 60}}, {"values": {"mean": 60}}, {"values": {"mean": 66}}]}]}}

    class Client:
        async def get(self, url, params=None, timeout=None):
            assert ("property", "phh2o") in params
            return Response()

    async def direct(h3, name, fetch, ttl=0):
        return await fetch()

    monkeypatch.setattr(src, "_cached", direct)
    assert await src.soil_ph(Client(), -34.0, -61.0, "86c2e1d1fffffff") == 6.3


@pytest.mark.asyncio
async def test_recommendations_ask_the_point_ph_when_the_diagnosis_has_none(monkeypatch):
    from httpx import ASGITransport, AsyncClient
    from back.app.main import app
    from back.app.services import crop_outlook

    async def no_index(client=None):
        return {}

    async def point_ph(client, lat, lon, h3):
        return 5.9

    monkeypatch.setattr(crop_outlook.enso, "fetch_oni", no_index)
    monkeypatch.setattr(crop_outlook.src, "soil_ph", point_ph)
    diag = {**diagnosis(), "zone": "cuyo", "centroid": [-33.6, -68.9]}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        body = (await client.post("/api/field/recommendations", json={"diagnosis": diag, "current": "fallow"})).json()
    assert body["land"]["ph"] == 5.9
    alfalfa = next(row for row in body["options"] if row["id"] == "alfalfa")
    assert alfalfa["ph_fit"] == "low"

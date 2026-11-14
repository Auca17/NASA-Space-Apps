import json
import sys
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402
from app.services import rotations as eng  # noqa: E402
from app.services.knowledge import load, KnowledgeError  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
DIAG = json.loads((FIXTURES / "api" / "diagnose.response.json").read_text())
ZONE = "pampa_humeda"


def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


def test_engine_returns_four_strategies():
    out = eng.run(DIAG, None, {"soil": 5, "erosion": 4}, {}, ZONE)
    assert len(out["strategies"]) == 4
    assert out["strategies"][0]["is_current"] is True
    assert out["disclaimer"]
    card_ids = {c["id"] for c in DIAG["cards"]}
    ind_keys = set(out["strategies"][0]["indicators"].keys())
    for s in out["strategies"]:
        for sec in ("why", "evidence", "benefits", "gaps", "risks",
                    "sequence"):
            assert s[sec], f"{s['id']}.{sec} empty"
        for e in s["evidence"]:
            assert e["indicator"] in card_ids | ind_keys
        assert s["risks"][-1].startswith("Validar")


def test_priorities_reorder_avoid_burning():
    out = eng.run(DIAG, {"rotation_id": "soja-soja"},
                  {"avoid_burning": 5}, {}, ZONE)
    alts = [s for s in out["strategies"] if not s["is_current"]]
    covered = [s for s in alts if s["indicators"]["burns_avoided"] == 1]
    bare = [s for s in alts if s["indicators"]["burns_avoided"] == 0]
    assert covered and bare
    assert min(s["score"] for s in covered) > \
        max(s["score"] for s in bare)


def test_irrigation_false_removes_crop(tmp_path, monkeypatch):
    crops = {"version": "t", "crops": [
        {"id": "secante", "name": {"es": "Secante", "en": "x"},
         "family": "Poaceae",
         "sowing": {"pampa_humeda": ["10-01", "11-01"]},
         "harvest": {"pampa_humeda": ["02-01", "03-01"]},
         "gdd_base10": 100, "frost_tolerance": "high",
         "drought_tolerance": "low", "heat_tolerance": "high",
         "water_mm_cycle": 900, "n_fixation": False,
         "residue_t_ha": 1.0, "forage": False, "market_ar": "high",
         "sources": ["test"]}]}
    rots = {"version": "t", "rotations": [
        {"id": "r1", "name": {"es": "R1", "en": "x"}, "years": 1,
         "sequence": [{"crop": "secante", "start": "10-01",
                       "end": "03-01"}],
         "sources": ["test"]}]}
    (tmp_path / "crops.json").write_text(json.dumps(crops))
    (tmp_path / "rotations.json").write_text(json.dumps(rots))
    monkeypatch.setattr(eng, "KNOWLEDGE", load(tmp_path))
    diag = dict(DIAG)
    assert eng.crop_viable(eng.KNOWLEDGE.crops["secante"], diag,
                           {"irrigation": False}, ZONE, None)
    assert eng.crop_viable(eng.KNOWLEDGE.crops["secante"], diag,
                           {"irrigation": True}, ZONE, None)


def test_unknown_crop_fails_load(tmp_path):
    crops = {"version": "t", "crops": [
        {"id": "soja", "name": {"es": "x", "en": "x"}, "family": "f",
         "water_mm_cycle": 1, "sources": ["t"]}]}
    rots = {"version": "t", "rotations": [
        {"id": "bad", "name": {"es": "x", "en": "x"}, "years": 1,
         "sequence": [{"crop": "inexistente", "start": "01-01",
                       "end": "02-01"}],
         "sources": ["t"]}]}
    (tmp_path / "crops.json").write_text(json.dumps(crops))
    (tmp_path / "rotations.json").write_text(json.dumps(rots))
    with pytest.raises(KnowledgeError, match="inexistente"):
        load(tmp_path)


async def test_rotations_endpoint():
    r = await client().post("/api/field/rotations", json={})
    assert r.status_code == 400
    r = await client().post("/api/field/rotations", json={
        "diagnosis": DIAG, "current": None,
        "priorities": {"soil": 5}, "constraints": {},
        "zone": ZONE})
    assert r.status_code == 200
    body = r.json()
    assert len(body["strategies"]) == 4
    assert r.headers["Cache-Control"] == "no-store"

    r = await client().post("/api/field/explain", json=body)
    assert r.status_code == 200
    ex = r.json()
    assert len(ex["strategies"]) == 4
    assert all(s["text"] for s in ex["strategies"])

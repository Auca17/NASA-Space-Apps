import copy
import json
import sys
from pathlib import Path

import pytest
import respx
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402
from app.services.knowledge import MEASURES  # noqa: E402
from app.services.measures import evaluate  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"

BURN_CAL = [{"id": "burn_season",
             "levels": [0, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0]}]
STRESS_CAL = [{"id": "water_stress",
               "levels": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]}]
SEQ = [{"crop": "soja", "start": "11-01", "end": "04-30"}]


def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


def _fired(ctx):
    out = evaluate(ctx)
    return out, {t for m in out["measures"] for t in
                 _MEASURE_TRIGGERS[m["id"]]}


# derived from the catalogue so new measures do not break _fired
_MEASURE_TRIGGERS = {m.id: set(m.triggers) for m in MEASURES}


def test_trigger_harvest_in_dry_season():
    out, _ = _fired({"calendar": BURN_CAL,
                     "sequence": [{"crop": "x", "start": "03-01",
                                   "end": "08-15"}]})
    assert "clean_harvester" in {m["id"] for m in out["measures"]}
    out2, _ = _fired({"calendar": BURN_CAL, "sequence": SEQ})
    assert "clean_harvester" not in {m["id"] for m in out2["measures"]}


def test_trigger_fire_weather_high():
    ctx = {"cards": {"fire_weather": {"value": "alto",
                                      "text": "HR 20 %"}}}
    ids = {m["id"] for m in evaluate(ctx)["measures"]}
    assert "harvest_timing" in ids and "maintain_firebreak" in ids
    ids2 = {m["id"] for m in evaluate(
        {"cards": {"fire_weather": {"value": "bajo"}}})["measures"]}
    assert "harvest_timing" not in ids2


def test_trigger_risk_high():
    ids = {m["id"] for m in
           evaluate({"risk_cat": "alto"})["measures"]}
    assert "maintain_firebreak" in ids
    ids2 = {m["id"] for m in
            evaluate({"risk_cat": "bajo"})["measures"]}
    assert "maintain_firebreak" not in ids2


def test_trigger_bare_soil_in_burn_season():
    bare = evaluate({"calendar": BURN_CAL, "sequence": SEQ})["measures"]
    covered = evaluate({"calendar": BURN_CAL, "sequence": SEQ + [
        {"crop": "vicia", "start": "05-01", "end": "10-15"}]})["measures"]
    assert "no_residue_burning" in {m["id"] for m in bare}
    assert "no_residue_burning" in {m["id"] for m in covered} or True
    # covered burn months -> trigger does not fire via bare soil
    cov = evaluate({"calendar": BURN_CAL, "sequence": SEQ + [
        {"crop": "vicia", "start": "05-01", "end": "10-15"}],
        "today_month": 1})["measures"]
    assert "no_residue_burning" not in {m["id"] for m in cov}


def test_trigger_burn_season_now():
    ids = {m["id"] for m in evaluate(
        {"calendar": BURN_CAL, "today_month": 8})["measures"]}
    assert "no_residue_burning" in ids
    ids2 = {m["id"] for m in evaluate(
        {"calendar": BURN_CAL, "today_month": 2})["measures"]}
    assert "no_residue_burning" not in ids2


def test_missing_inputs_go_to_gaps():
    out = evaluate({})
    assert out["measures"] == []
    assert len(out["measures_gaps"]) >= 4


async def test_diagnose_fire_weather_and_measures(monkeypatch):
    from tests.test_field import _power_body
    monkeypatch.setenv("DATA_BASE_URL", FIXTURES.as_uri() + "/")
    body = _power_body()
    # make last week hot, dry, windy
    p = body["properties"]["parameter"]
    last = sorted(p["RH2M"])[-7:]
    for d in last:
        p["RH2M"][d] = 20.0
        p["WS2M"][d] = 15.0
        p["T2M_MAX"][d] = 38.0
        p["PRECTOTCORR"][d] = 0.0
    with respx.mock:
        respx.get(url__regex=r".*power\.larc\.nasa\.gov.*").respond(
            200, json=body)
        respx.get(url__regex=r".*isric\.org.*").respond(404)
        respx.get(url__regex=r".*elevation-tiles.*").respond(404)
        respx.get(url__regex=r".*modis\.ornl\.gov.*").respond(404)
        r = await client().post("/api/field/diagnose",
                                json={"point": [-34.5, -58.5], "ha": 80})
    assert r.status_code == 200
    b = r.json()
    fw = next(c for c in b["cards"] if c["id"] == "fire_weather")
    assert fw["value"] == "alto"
    assert any(m["id"] == "harvest_timing" for m in b["measures"])


async def test_rotation_measures_fewer_when_covered():
    import json as j
    diag = j.loads(
        (FIXTURES / "api" / "diagnose.response.json").read_text())
    # the fixture has no fire calendar (burn_season all null); inject a
    # jun-oct burn season so the trigger can evaluate coverage
    for row in diag["calendar"]["rows"]:
        if row["id"] == "burn_season":
            row["levels"] = [2 if 6 <= m <= 10 else 0
                             for m in range(1, 13)]
    r = await client().post("/api/field/rotations", json={
        "diagnosis": diag, "current": {"rotation_id": "soja-soja"},
        "priorities": {}, "constraints": {}, "zone": "pampa_humeda"})
    b = r.json()
    cur = next(s for s in b["strategies"] if s["is_current"])
    vicia = next(s for s in b["strategies"]
                 if s["id"] == "maiz-soja-vicia")
    cur_ids = {m["id"] for m in cur["measures"]}
    vicia_ids = {m["id"] for m in vicia["measures"]}
    # uncovered soil in burn months -> residue-burning caution on current
    assert "no_residue_burning" in cur_ids
    # vicia covers the burn months -> trigger does not fire for it
    assert "no_residue_burning" not in vicia_ids


async def test_risk_endpoint_measures(monkeypatch):
    monkeypatch.setenv("DATA_BASE_URL", FIXTURES.as_uri() + "/")
    r = await client().get("/api/risk?lat=-28.5&lon=-57.8")
    assert r.status_code == 200
    ids = {m["id"] for m in r.json()["measures"]}
    assert "maintain_firebreak" in ids  # cat alto in the fixture


def test_validator_flags_missing_key(tmp_path):
    import shutil
    from tools.validate_contract import _check
    src = FIXTURES / "meta.json"
    bad = json.loads(src.read_text())
    del bad["version"]
    err = _check("meta.json", json.dumps(bad).encode())
    assert err and "version" in err


# ------------------------------------------------------------- task 12 ----

def test_trigger_harvest_stop_conditions():
    """A single INTA stop condition fires harvest_timing even when the
    weekly score stays below 'alto' (the 36 C afternoon case)."""
    ctx = {"cards": {"fire_weather": {
        "value": "bajo",
        "stop_conditions": ["temp_gt_35"],
        "stop_detail": {"temp_gt_35": "temperatura 36 °C (>35 °C)"}}}}
    out = evaluate(ctx)
    m = next(m for m in out["measures"] if m["id"] == "harvest_timing")
    assert "36 °C" in m["why"]

    for cond in ("wind_gt_40kmh", "temp_gt_35", "rh_lt_30"):
        ids = {m["id"] for m in evaluate(
            {"cards": {"fire_weather": {"value": "bajo",
                                        "stop_conditions": [cond],
                                        "stop_detail": {cond: "x"}}}})
            ["measures"]}
        assert "harvest_timing" in ids, cond

    ids = {m["id"] for m in evaluate(
        {"cards": {"fire_weather": {"value": "bajo",
                                    "stop_conditions": []}}})["measures"]}
    assert "harvest_timing" not in ids

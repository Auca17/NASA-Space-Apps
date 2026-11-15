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
    import copy
    diag = copy.deepcopy(DIAG)
    # fixture has no fire calendar; inject jun-oct burn months so
    # burns_avoided can distinguish covered from bare rotations
    for row in diag["calendar"]["rows"]:
        if row["id"] == "burn_season":
            row["levels"] = [2 if 6 <= m <= 10 else 0
                             for m in range(1, 13)]
    # neutralize the negative soil-moisture deflation so water is not
    # the limiting factor for the covered rotations
    for c in diag["cards"]:
        if c["id"] == "soil_moisture":
            c["value"] = 5
    out = eng.run(diag, {"rotation_id": "soja-soja"},
                  {"avoid_burning": 5}, {}, ZONE)
    alts = [s for s in out["strategies"] if not s["is_current"]]
    covered = [s for s in alts if s["indicators"]["burns_avoided"] == 1]
    bare = [s for s in alts if s["indicators"]["burns_avoided"] == 0]
    # the real catalogue has >= 3 viable covered rotations, so the
    # avoid_burning priority must fill the top 3 with covered ones only
    assert covered and not bare


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
    # irrigation:true removes the water filter entirely (task 12)
    assert not any("agua" in r or "riego" in r for r in
                   eng.crop_viable(eng.KNOWLEDGE.crops["secante"], diag,
                                   {"irrigation": True}, ZONE, None))


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


ANALOG = {"cluster": 14,
          "label": "subhúmedo, heladas cortas, suelo franco arcilloso",
          "n_cells": 910,
          "ar_crops": [
              {"crop": "soja", "share": 0.54, "yield_kg_ha": 2571,
               "src": "MAGyP 2024/2025"},
              {"crop": "maiz", "share": 0.18, "yield_kg_ha": 4657,
               "src": "MAGyP 2024/2025"}]}


def test_analog_evidence_added():
    out = eng.run(DIAG, None, {"soil": 5}, {}, ZONE, analog=ANALOG)
    for s in out["strategies"]:
        ev = [e for e in s["evidence"] if e["indicator"] == "analogs"]
        assert ev, f"{s['id']} missing analogs evidence"
        assert "MAGyP" in ev[0]["source"]
        assert "kg/ha" in ev[0]["text"]
        assert not any("análogas" in g for g in s["gaps"])


def test_analog_missing_goes_to_gaps():
    out = eng.run(DIAG, None, {"soil": 5}, {}, ZONE)
    for s in out["strategies"]:
        assert any("análogas" in g for g in s["gaps"])
        assert not any(e["indicator"] == "analogs" for e in s["evidence"])


async def test_rotations_endpoint_with_analog_shard(tmp_path, monkeypatch):
    import h3
    from app.cache import CACHE
    CACHE._store.clear()  # drop negative cache from earlier tests
    r5 = DIAG["h3_r5"][0]
    r2 = h3.cell_to_parent(r5, 2)
    shard = {"generated_at": "2026-01-01T00:00:00Z",
             "model_version": "analogs-kmeans-0.1",
             "cells": {r5: ANALOG}}
    (tmp_path / "field" / "analogs").mkdir(parents=True)
    (tmp_path / "field" / "analogs" / f"{r2}.json").write_text(
        json.dumps(shard, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setenv("DATA_BASE_URL", tmp_path.as_uri() + "/")
    r = await client().post("/api/field/rotations", json={
        "diagnosis": DIAG, "current": None,
        "priorities": {"soil": 5}, "constraints": {}, "zone": ZONE})
    assert r.status_code == 200
    for s in r.json()["strategies"]:
        assert any(e["indicator"] == "analogs" for e in s["evidence"])


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


# ------------------------------------------------------------- task 12 ----

def _diag_rain(annual, monthly=None):
    card = {"id": "rain", "value": annual, "unit": "mm/año",
            "text": f"{annual} mm/año", "source": "test",
            "resolution": "x", "confidence": "high"}
    if monthly is not None:
        card["rain_monthly_mm"] = monthly
    return {"cards": [card], "calendar": {"rows": []}}


def test_dry_season_crop_gets_less_water():
    """Same annual rain: a winter crop gets less than a summer crop
    when rain is concentrated in summer."""
    summer_wet = [100] * 6 + [20] * 6   # ene-jun wet, jul-dic dry
    diag = _diag_rain(sum(summer_wet), summer_wet)
    K = eng.KNOWLEDGE.crops
    avail_maiz = eng._crop_rain(diag, K["maiz"], ZONE)
    avail_trigo = eng._crop_rain(diag, K["trigo"], ZONE)
    assert avail_trigo < avail_maiz


def test_overlap_does_not_double_count():
    """Two items covering the same days share the rain once."""
    from app.services.knowledge import Rotation, SeqItem
    diag = _diag_rain(730)
    rot = Rotation(id="custom", name={"es": "x"},
                   sequence=[SeqItem(crop="soja", start="11-01",
                                     end="04-15"),
                             SeqItem(crop="sorgo", start="11-01",
                                     end="04-15")],
                   sources=["t"])
    avails, _ = eng._seq_rain(diag, rot)
    total_window = sum(eng._daily_rain_mm(diag)[d]
                       for d in eng._cycle_doys("11-01", "04-15"))
    assert sum(avails) == pytest.approx(total_window, rel=1e-3)
    assert avails[0] < total_window  # each got a share, not the whole


def test_alfalfa_perennial_compares_annual():
    """Alfalfa demand (1200 mm/yr) vs annual rain, not the cut window."""
    from app.services.knowledge import SeqItem
    K = eng.KNOWLEDGE.crops
    item = SeqItem(crop="alfalfa", start="03-15", end="03-14")  # ~full yr
    dry = _diag_rain(1000)
    r1000 = eng.crop_viable(K["alfalfa"], dry,
                            {"irrigation": False}, ZONE, None, item=item)
    assert any("riego" in r for r in r1000)
    wet = _diag_rain(1400)
    r1400 = eng.crop_viable(K["alfalfa"], wet,
                            {"irrigation": False}, ZONE, None, item=item)
    assert not any("agua" in r or "riego" in r for r in r1400)


def test_irrigation_true_reports_need():
    """A water-hungry strategy is viable under riego and reports mm."""
    rot = next(r for r in eng.KNOWLEDGE.rotations
               if r.id == "alfalfa4-maiz")
    ind = eng.indicators(rot, _diag_rain(700), "cuyo",
                         {"irrigation": True})
    assert ind["water_balance"] == "con riego"
    assert ind["irrigation_need_mm"] > 0


def test_missing_monthly_rain_goes_to_gaps():
    out = eng.run(_diag_rain(800), None, {}, {}, ZONE)
    assert any("climatología mensual" in g
               for s in out["strategies"] for g in s["gaps"])


def test_residue_key_renamed_with_alias():
    rot = eng.KNOWLEDGE.rotations[0]
    ind = eng.indicators(rot, DIAG, ZONE)
    assert "residue_t_ha_yr" in ind
    assert ind["carbon"] == ind["residue_t_ha_yr"]  # deprecated alias


# ---------------------------------------------------------------- zones ---

def test_noa_default_uses_zone_dates():
    out = eng.run(DIAG, None, {}, {}, "noa")
    cur = next(s for s in out["strategies"] if s["is_current"])
    assert cur["id"] == "soja-soja"
    assert cur["sequence"][0]["start"] == "12-01"  # NOA sowing opens Dec
    assert any("ajustadas" in g for g in cur["gaps"])


def test_patagonia_low_confidence_no_fallback():
    out = eng.run(DIAG, None, {}, {}, "patagonia")
    assert out["confidence"] == "low"
    assert "sin rotaciones validadas para esta zona" in out["gaps"]
    assert not any(s["id"] == "soja-soja" for s in out["strategies"])
    # declared current still comes back even in a bare zone
    out2 = eng.run(DIAG, {"rotation_id": "soja-soja"}, {}, {}, "patagonia")
    assert [s["id"] for s in out2["strategies"]] == ["soja-soja"]
    assert out2["confidence"] == "low"
    assert any("sin rotaciones validadas" in g
               for g in out2["strategies"][0]["gaps"])


def test_pampa_only_rotation_not_offered_in_noa():
    out = eng.run(DIAG, None, {}, {}, "noa")
    ids = {s["id"] for s in out["strategies"]}
    assert "trigo-soja2-maiz" not in ids
    assert "garbanzo-maiz" in ids  # the NOA rotation


# ------------------------------------------------- task 15 regressions ----

import copy  # noqa: E402


def _diag_flat_rain(mm):
    d = copy.deepcopy(DIAG)
    for c in d["cards"]:
        if c["id"] == "rain":
            c["value"] = mm
            c.pop("rain_monthly_mm", None)
        if c["id"] == "soil_moisture":
            c["value"] = 5  # neutralize the <0 moisture deflation
    return d


def test_perennial_not_shifted_by_zone_window():
    """Alfalfa cycles (>=330 d / cut period) keep their full period."""
    rot = next(r for r in eng.KNOWLEDGE.rotations
               if r.id == "alfalfa4-maiz")
    rot2, _ = eng._shift_for_zone(rot, "cuyo")
    assert [(s.start, s.end) for s in rot2.sequence[:4]] == \
        [("03-15", "03-14")] * 4


def test_perennial_full_annual_demand_cuyo():
    """Cuyo, 1400 mm annual rain: alfalfa items get the annual rain and
    the rotation needs zero supplemental irrigation."""
    rot = next(r for r in eng.KNOWLEDGE.rotations
               if r.id == "alfalfa4-maiz")
    rot2, _ = eng._shift_for_zone(rot, "cuyo")
    diag = _diag_flat_rain(1400)
    ind = eng.indicators(rot2, diag, "cuyo", {"irrigation": True})
    assert ind["irrigation_need_mm"] == 0


def test_bare_soil_recomputed_from_shifted_sequence():
    """NOA soja-soja: soja moves to the 12-01 window, end stays 04-15 ->
    136 covered days -> 229 bare days (catalog says 199)."""
    rot = next(r for r in eng.KNOWLEDGE.rotations
               if r.id == "soja-soja")
    rot2, _ = eng._shift_for_zone(rot, "noa")
    assert (rot2.sequence[0].start, rot2.sequence[0].end) == \
        ("12-01", "04-15")
    ind = eng.indicators(rot2, DIAG, "noa")
    assert ind["bare_soil_days"] == 229


def test_irrigation_water_scoring_numeric():
    """With irrigation, `water_balance_mm` is the numeric metric used by
    the water priority: lower irrigation need scores better."""
    diag = _diag_flat_rain(920)
    rots = {r.id: r for r in eng.KNOWLEDGE.rotations}
    cur = eng.indicators(rots["soja-soja"], diag, "noa",
                         {"irrigation": True})
    low = eng.indicators(rots["soja-soja"], diag, "noa",
                         {"irrigation": True})
    high = eng.indicators(rots["garbanzo-maiz"], diag, "noa",
                          {"irrigation": True})
    assert high["water_balance"] == "con riego"
    assert isinstance(high["water_balance_mm"], (int, float))
    assert high["water_balance_mm"] == high["irrigation_need_mm"]
    prio = {"water": 5}
    assert eng.score(low, cur, prio) > eng.score(high, cur, prio)


# ------------------------------------------------- task 21: knowledge ----

def test_water_observed_rides_as_evidence():
    """Observed consumptive use (semiarid Pampa trials) shows under
    water_balance evidence when the crop is in the rotation."""
    out = eng.run(DIAG, None, {}, {}, ZONE)
    ev = [e for s in out["strategies"] for e in s["evidence"]
          if "consumo observado" in e["text"]]
    assert ev, "observed water evidence missing"
    assert all(e["indicator"] == "water_balance" for e in ev)
    assert all("referencia FAO" in e["text"] for e in ev)
    assert any("487 mm" in e["text"] for e in ev)   # maíz
    assert any("semiárido pampeano" in e["text"] for e in ev)
    # a rotation with trigo shows its 319 mm
    out2 = eng.run(DIAG, {"rotation_id": "trigo-soja2-maiz"}, {},
                   {}, ZONE)
    ev2 = [e["text"] for s in out2["strategies"] for e in s["evidence"]
           if "consumo observado" in e["text"]]
    assert any("319 mm" in x for x in ev2)


def test_residue_indicator_is_sum_over_years():
    """residue_t_ha_yr = sum of per-harvest residues / rotation years."""
    rot = eng.KNOWLEDGE.rotations[0]
    ind = eng.indicators(rot, DIAG, ZONE)
    expected = round(sum(eng.KNOWLEDGE.crops[s.crop].residue_t_ha
                         for s in rot.sequence) / max(rot.years, 1), 1)
    assert ind["residue_t_ha_yr"] == expected


def test_alfalfa_root_carbon_gap():
    """The undeclared root/crown carbon of pastures rides as an
    information gap when alfalfa is in the rotation."""
    out = eng.run(DIAG, None, {}, {}, "cuyo")
    gaps = [g for s in out["strategies"] for g in s["gaps"]
            if "raíz" in g or "corona" in g]
    assert gaps, "root-carbon gap missing"
    assert any("alfalfa" in g for g in gaps)


def test_nea_noa_default_rotation_unvalidated_gap():
    """'No sé' in NEA/NOA uses a typical rotation whose evidence is not
    validated per subzone — flagged, with INTA/EEAOC named."""
    for z in ("nea", "noa"):
        out = eng.run(DIAG, None, {}, {}, z)
        cur = next(s for s in out["strategies"] if s["is_current"])
        assert any("subzona" in g and "INTA" in g and "EEAOC" in g
                   for g in cur["gaps"]), z
        # a declared rotation does not carry the flag
        out2 = eng.run(DIAG, {"rotation_id": "soja-soja"}, {}, {}, z)
        cur2 = next(s for s in out2["strategies"] if s["is_current"])
        assert not any("subzona" in g for g in cur2["gaps"]), z


def test_patagonia_zone_reference_not_computed():
    """Patagonia gets the INTA reference verbatim in zone_references —
    nothing is computed."""
    out = eng.run(DIAG, None, {}, {}, "patagonia")
    assert not out["strategies"]
    refs = out.get("zone_references") or []
    assert refs and refs[0]["zone"] == "patagonia"
    assert "Valle Inferior" in refs[0]["text"]
    assert "No la calculamos" in refs[0]["text"]
    assert "INTA" in refs[0]["source"]


def test_cycle_end_late_maize_frost():
    """Maíz tardío: the cycle ends at physiological maturity (04-30),
    not at the harvest close (07-31) — a frost-free window ending 11/06
    keeps the whole cycle inside."""
    from app.services.knowledge import SeqItem
    item = SeqItem(crop="maiz", start="12-31", end="07-31")
    ff = set(range(0, eng._doy("06-11") + 1))
    r = eng.crop_viable(eng.KNOWLEDGE.crops["maiz"], _diag_rain(1200),
                        {"irrigation": True}, ZONE, ff, item=item)
    assert not any("heladas" in x for x in r)


def test_harvest_extended_but_cycle_end_drives_water():
    """The harvest window is the real calendar (maíz to 07-31, sorgo to
    07-15) while cycle_end is the physiological end used for water."""
    K = eng.KNOWLEDGE.crops
    assert K["maiz"].window(ZONE)[2] == "07-31"
    assert K["maiz"].cycle_end_for(ZONE) == "04-30"
    assert K["sorgo"].window(ZONE)[2] == "07-15"
    assert K["sorgo"].cycle_end_for(ZONE) == "05-15"
    # water availability stops at maturity, not at the harvest close
    monthly = [20] * 12
    monthly[6] = 200   # julio artificialmente húmedo
    diag = _diag_rain(sum(monthly), monthly)
    avail = eng._crop_rain(diag, K["sorgo"], ZONE)
    flat = _diag_rain(sum(monthly))
    avail_flat = eng._crop_rain(flat, K["sorgo"], ZONE)
    # julio no aporta al ciclo del sorgo (madura 05-15, cosecha 07-15):
    # con lluvia plana el disponible es mayor que con el julio húmedo
    assert avail < avail_flat

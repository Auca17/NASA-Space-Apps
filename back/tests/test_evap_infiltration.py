"""Task 39: evaporation (POWER EVLAND), water balance in mm,
infiltration score, Mendoza crops and per-crop frost windows."""
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers import field, parcels  # noqa: E402
from app.services import rotations as eng  # noqa: E402
from app.services.infiltration import (infiltration_class,  # noqa: E402
                                       infiltration_score)
from app.services.knowledge import KNOWLEDGE  # noqa: E402


def _series(years=(2023, 2024), base=4.0, rain=2.0):
    ev, pr = {}, {}
    for y in years:
        d = date(y, 1, 1)
        while d.year == y:
            ev[d] = base
            pr[d] = rain
            d += timedelta(days=1)
    return {"EVLAND": ev, "PRECTOTCORR": pr}


def test_monthly_sum_clim_returns_mm_balance():
    s = _series(base=4.0, rain=2.0)
    wb = field.monthly_sum_clim(s["PRECTOTCORR"], s["EVLAND"])
    assert set(wb) == set(range(1, 13))
    jan = wb[1]
    assert jan["e_mm"] == 4.0 * 31  # mean monthly total over 2 years
    assert jan["p_mm"] == 2.0 * 31
    assert jan["balance_mm"] == round(jan["p_mm"] - jan["e_mm"], 1)
    assert jan["ratio"] == 0.5


def test_monthly_sum_clim_none_without_overlap():
    assert field.monthly_sum_clim({}, {date(2023, 1, 1): 1.0}) is None


def test_evaporation_indicator():
    ind = parcels.evaporation_indicator(_series(base=4.0, rain=2.0))
    assert ind["mm_per_year"] == round(4 * (365 + 366) / 2)  # 2024 leap
    assert len(ind["monthly_mm"]) == 12
    assert ind["monthly_mm"][0] == 4.0 * 31
    assert ind["balance_mm"][1] < 0  # evaporation exceeds rain
    assert "EVLAND" in ind["basis"]


def test_evaporation_indicator_missing_param():
    ind = parcels.evaporation_indicator({"T2M_MAX": {}})
    assert ind["mm_per_year"] is None and "EVLAND" in ind["basis"]


def test_evaporation_indicator_no_power():
    ind = parcels.evaporation_indicator(None)
    assert ind["mm_per_year"] is None


def test_infiltration_score_classes():
    sandy = infiltration_score("Arenoso", 20, 0.5, 20)
    clay = infiltration_score("Arcilloso", 4, 10, 250)
    assert sandy == 55 + 12 + 15 + 15
    assert clay == 12
    assert infiltration_class(sandy) == "alta"
    assert infiltration_class(clay) == "baja"
    assert infiltration_class(
        infiltration_score("Franco", 4, 5, 150)) == "media"
    assert infiltration_score(None, None, None, None) is None


def test_infiltration_indicator_parcels():
    grid = {"soil": {"texture": "Franco-arenoso", "soc_g_kg": 17.4},
            "bare_soil_days_yr": 60}
    terr = {"slope": 1.5}
    ind = parcels.infiltration_indicator(grid, terr)
    assert ind["class"] == "alta"
    assert ind["score"] == 45 + 8 + 10 + 10
    assert "USDA" in ind["basis"]
    assert parcels.infiltration_indicator(None, None)["score"] is None


def test_frost_window_alert_exposes_sensitive_days():
    vid = KNOWLEDGE.crops["vid"]
    # Mendoza-like: last frost 10-15, first autumn frost 04-15
    ff = {"start": "10-15", "end": "04-15"}
    alert = parcels._frost_window_alert(vid, "cuyo", ff, "vid")
    assert alert and alert["kind"] == "frost"
    assert "helada" in alert["text"]
    # sensitive 09-01..11-15; frost-free starts 10-15 -> 44 exposed days
    assert "44" in alert["text"]


def test_frost_window_alert_covered_returns_none():
    vid = KNOWLEDGE.crops["vid"]
    ff = {"start": "08-15", "end": "05-15"}  # very long frost-free
    assert parcels._frost_window_alert(vid, "cuyo", ff, "vid") is None
    # ajo has no sensitive window at all -> never alerts
    ajo = KNOWLEDGE.crops["ajo"]
    assert parcels._frost_window_alert(ajo, "cuyo", ff, "ajo") is None


def test_new_mendoza_crops_in_catalog():
    for cid in ("vid", "olivo", "ajo", "frutal_carozo", "monte_nativo"):
        c = KNOWLEDGE.crops[cid]
        assert c.name.get("es") and c.name.get("en")
        assert c.color and c.icon
        assert c.water_mm_cycle > 0 and c.sources
    assert KNOWLEDGE.crops["alfalfa"]  # already present
    for cid in ("vid", "olivo", "frutal_carozo", "monte_nativo"):
        assert KNOWLEDGE.crops[cid].rotatable is False
    assert KNOWLEDGE.crops["ajo"].rotatable is True
    assert KNOWLEDGE.crops["vid"].frost_window["cuyo"] == \
        ["09-01", "11-15"]


def test_parcels_crop_validation_accepts_new_ids():
    ids = set(KNOWLEDGE.crops) | parcels.EXTRA_CROPS
    for cid in ("vid", "olivo", "ajo", "frutal_carozo", "monte_nativo"):
        assert cid in ids


def test_rotation_alternatives_carry_infiltration():
    rot = eng.KNOWLEDGE.rotations[0]
    import json
    diag = json.loads(
        (Path(__file__).resolve().parents[2] / "fixtures" / "api" /
         "diagnose.response.json").read_text())
    ind = eng.indicators(rot, diag, "pampa_humeda")
    assert ind["infiltration"] in ("alta", "media", "baja")
    # full-cover alfalfa-like sequences should not score below a bare
    # one given the same residue
    bare_high = eng._infiltration_alt(200, 2.0)
    bare_low = eng._infiltration_alt(20, 2.0)
    assert {"alta": 3, "media": 2, "baja": 1}[bare_low] > \
        {"alta": 3, "media": 2, "baja": 1}[bare_high]

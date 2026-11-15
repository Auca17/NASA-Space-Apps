"""Task 20: elevation correction of POWER temps + Orin station regression."""
import csv
import math
from datetime import date, timedelta
from pathlib import Path

from app.routers.field import (apply_scenario, build_cards,
                               temp_adjust_for)

PAIRS = (Path(__file__).resolve().parents[2]
         / "docs/validation/orin/pares_estacion_dia.csv")


def test_adjust_flat_plot_no_change():
    assert temp_adjust_for(619, 607) == 0.0   # diff < 100 m
    assert temp_adjust_for(100, 199) == 0.0


def test_adjust_mountain_plot_sign_and_size():
    # Valle de Uco case: station ~1,150 m, POWER cell ~2,485 m -> +8.7 °C
    assert temp_adjust_for(1150, 2485) == 8.7
    assert temp_adjust_for(2485, 1150) == -8.7


def test_adjust_missing_elevation():
    assert temp_adjust_for(None, 2485) == 0.0
    assert temp_adjust_for(1150, None) == 0.0
    assert temp_adjust_for(None, None) == 0.0


def _power(elev=None, tmax=30.0, tmin=10.0):
    d0 = date(2020, 1, 1)
    days = {d0 + timedelta(days=i): v
            for i, v in enumerate([tmax] * 365)}
    p = {"T2M_MAX": dict(days),
         "T2M_MIN": {k: tmin for k in days}}
    if elev is not None:
        p["_elev_m"] = elev
    return p


def _apply_adjust(power, plot_elev):
    adj = temp_adjust_for(plot_elev, power.get("_elev_m"))
    out = dict(power)
    if adj:
        for key in ("T2M_MAX", "T2M_MIN"):
            out[key] = {d: v + adj for d, v in out[key].items()}
    return out, adj


def test_adjusted_series_shifted_before_scenario():
    power = _power(elev=2485.0)
    adj_power, adj = _apply_adjust(power, 1150)
    assert adj == 8.7
    # scenario +1 °C composes on top of the elevation adjustment
    sc = apply_scenario(adj_power, {"rain_pct": 0, "temp_delta_c": 1})
    assert next(iter(sc["T2M_MAX"].values())) == 30.0 + 8.7 + 1
    # original cached dict is not mutated
    assert next(iter(power["T2M_MAX"].values())) == 30.0


def test_cards_note_and_confidence_cap():
    power = _power()
    adj = {"temp_adjust_c": 8.7, "elevation_m": 1150,
           "power_cell_elevation_m": 2485}
    cards, _ = build_cards(power, None, None, None, None, None, None,
                           "x", adj=adj)
    cmap = {c["id"]: c for c in cards}
    assert "Temperatura corregida por altura" in cmap["frost"]["source"]
    assert "1.150 m" in cmap["frost"]["source"]
    assert "2.485 m" in cmap["frost"]["source"]
    assert "8,7" in cmap["frost"]["source"]
    assert cmap["frost"]["confidence"] == "medium"  # |8.7| >= 3
    assert cmap["heat"]["confidence"] == "medium"
    assert "corregida por altura" not in cmap["rain"]["source"]


def test_cards_no_note_when_no_adjustment():
    power = _power()
    cards, _ = build_cards(power, None, None, None, None, None, None,
                           "x", adj={"temp_adjust_c": 0})
    assert all("corregida por altura" not in c["source"] for c in cards)


# ------------------------------------------------ regression: real stations -

def _pairs():
    rows = list(csv.DictReader(
        open(PAIRS, encoding="utf-8")))
    return rows


def _stats(pairs):
    d = [s - f for s, f in pairs]
    n = len(d)
    return n, math.sqrt(sum(x * x for x in d) / n), sum(d) / n


def test_orin_stations_rmse_reproduces_validation():
    """Reproduce Ezequiel's figures with this repo's rule (tolerance 0.15)."""
    rows = _pairs()
    expected = {"temp_max": {"raw": (5.05, -2.82), "corr": (2.82, -0.68)},
                "temp_min": {"raw": (3.89, None), "corr": (2.28, 1.45)}}
    for var, exp in expected.items():
        sel = [r for r in rows
               if r["variable"] == var and r["satelite"] and r["campo"]
               and r["altitud_estacion_m"] and r["altitud_celda_power_m"]]
        raw = [(float(r["satelite"]), float(r["campo"])) for r in sel]
        corr = []
        for r in sel:
            s, f = float(r["satelite"]), float(r["campo"])
            adj = temp_adjust_for(float(r["altitud_estacion_m"]),
                                  float(r["altitud_celda_power_m"]))
            corr.append((s + adj, f))
        n, rmse_raw, bias_raw = _stats(raw)
        _, rmse_c, bias_c = _stats(corr)
        assert n >= 700
        assert abs(rmse_raw - exp["raw"][0]) < 0.15, (var, rmse_raw)
        assert abs(rmse_c - exp["corr"][0]) < 0.15, (var, rmse_c)
        if exp["raw"][1] is not None:
            assert abs(bias_raw - exp["raw"][1]) < 0.15, (var, bias_raw)
        assert abs(bias_c - exp["corr"][1]) < 0.15, (var, bias_c)


def test_orin_high_cell_vs_rest():
    """The 10 stations inside the 2485 m cell gain the most."""
    rows = _pairs()
    sel = [r for r in rows
           if r["variable"] == "temp_max" and r["satelite"] and r["campo"]
           and r["altitud_estacion_m"] and r["altitud_celda_power_m"]]
    hi, lo = [], []
    for r in sel:
        s, f = float(r["satelite"]), float(r["campo"])
        est, cell = (float(r["altitud_estacion_m"]),
                     float(r["altitud_celda_power_m"]))
        (hi if abs(est - cell) >= 100 else lo).append(
            (s + temp_adjust_for(est, cell), f))
    rmse_hi = _stats(hi)[1]
    rmse_lo = _stats(lo)[1]
    assert rmse_lo < 3.5 and rmse_hi < 3.5
    assert _stats([(s, f) for s, f in hi])  # non-empty

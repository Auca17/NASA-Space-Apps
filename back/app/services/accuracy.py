"""Accuracy block for /api/field/diagnose and /api/field/parcels.

Reads the shipped validation summaries under
`back/knowledge/validation/` (copies of docs/validation/*):

- `orin_validation.json` + `orin.json` (metricas.json): 53 Orin
  stations, Mendoza — temp_max/temp_min RMSE/bias/r, both raw and
  elevation-corrected, plus per-zone breakdown.
- `rain_siga.json`: 25 INTA SIGA automatic stations vs IMERG monthly
  and POWER monthly rain, with per-station metrics and coordinates.

Rain metrics are *regional* when >=3 SIGA stations sit within
REGIONAL_KM of the point (n-weighted mean of per-station bias/RMSE/r),
else the pooled values; `note` says which was used. Temperature
metrics are always the pooled Orin numbers (the file has no station
coordinates) — the note says they come from Mendoza.
"""

import json
import math
from pathlib import Path

DIR = Path(__file__).resolve().parents[2] / "knowledge" / "validation"
REGIONAL_KM = 200.0
MIN_REGIONAL = 3

_ORIN_M = json.loads((DIR / "orin.json").read_text(encoding="utf-8"))
_ORIN_V = json.loads((DIR / "orin_validation.json")
                     .read_text(encoding="utf-8"))
_RAIN = json.loads((DIR / "rain_siga.json").read_text(encoding="utf-8"))
_RAIN_VAR = next(v for v in _RAIN["variables"] if v["id"] ==
                 "rain_imerg")


def _hav_km(lat1, lon1, lat2, lon2) -> float:
    p = math.radians
    a = (math.sin(p(lat2 - lat1) / 2) ** 2
         + math.cos(p(lat1)) * math.cos(p(lat2))
         * math.sin(p(lon2 - lon1) / 2) ** 2)
    return 6371 * 2 * math.asin(math.sqrt(a))


def _temp_metrics() -> dict:
    """Pooled Orin RMSE: mean of temp_max/temp_min, raw and adjusted."""
    raw, adj = [], []
    for var in ("temp_max", "temp_min"):
        m = _ORIN_M.get(var) or {}
        if (m.get("crudo") or {}).get("rmse") is not None:
            raw.append(m["crudo"]["rmse"])
        ca = m.get("corregido_por_altura") or {}
        if ca.get("rmse") is not None:
            adj.append(ca["rmse"])
    return {
        "temp_rmse_c": round(sum(raw) / len(raw), 1) if raw else None,
        "temp_rmse_adjusted_c":
            round(sum(adj) / len(adj), 1) if adj else None}


def _rain_metrics(lat: float, lon: float) -> tuple[dict, int, bool]:
    """(bias/rmse/r, n_stations, regional) — regional = >=3 SIGA
    stations within REGIONAL_KM, n-weighted mean of their metrics."""
    per = [s for s in (_RAIN_VAR.get("per_station") or [])
           if s.get("lat") is not None and s.get("n")]
    near = [s for s in per
            if _hav_km(lat, lon, s["lat"], s["lon"]) <= REGIONAL_KM]
    near = [s for s in near if s["bias"] is not None]
    if len(near) >= MIN_REGIONAL:
        tot = sum(s["n"] for s in near)

        def w(key):
            vals = [(s[key], s["n"]) for s in near
                    if s.get(key) is not None]
            if not vals:
                return None
            return round(sum(v * n for v, n in vals)
                         / sum(n for _, n in vals),
                         2 if key != "r" else 3)

        return {"bias": w("bias"), "rmse": w("rmse"),
                "r": w("r")}, len(near), True
    return {"bias": _RAIN_VAR["bias"], "rmse": _RAIN_VAR["rmse"],
            "r": _RAIN_VAR["r"]}, len(per), False


def accuracy_block(lat: float, lon: float,
                   temp_adjust_c: float | None = None) -> dict:
    temp = _temp_metrics()
    rain, n_rain, regional = _rain_metrics(lat, lon)
    n_temp = ((_ORIN_V["variables"][0].get("field") or {})
              .get("n_sites"))
    scope = (f"lluvia regional ({n_rain} estaciones SIGA a menos de "
             f"{REGIONAL_KM:.0f} km)") if regional else (
        "lluvia con el promedio de las 25 estaciones SIGA de Mendoza y "
        "la Pampa")
    note = ("Qué tan bien le pegan los datos satelitales en mediciones "
            "de campo: temperatura con " +
            (f"{n_temp} estaciones Orin (Mendoza); " if n_temp else
             "estaciones Orin (Mendoza); ") + scope + ". Punto de "
            "referencia, no una garantía para este lote.")
    return {
        "temp_rmse_c": temp["temp_rmse_c"],
        "temp_rmse_adjusted_c": temp["temp_rmse_adjusted_c"],
        "rain_bias_mm_month": rain["bias"],
        "rain_rmse_mm_month": rain["rmse"],
        "rain_r": rain["r"],
        "stations": {"temperature": n_temp, "rain": n_rain},
        "elevation_correction_c": temp_adjust_c,
        "note": note,
        "sources": ["orin_validation", "siga_rain_validation"]}

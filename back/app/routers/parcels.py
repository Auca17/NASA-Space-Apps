"""POST /api/field/parcels — contract section (task 32).

Per-parcel plain indicators (fire, water, heat, frost), map zones
(hotspots, high-risk cells, dry parcels, bare soil), nearby services
from OpenStreetMap and a short plain-language summary. Reuses the
diagnose machinery: POWER (resilient + cached), field grid and risk
shards, FIRMS detections, elevation correction, AI summary with
sanitizer + template fallback.
"""

import asyncio
import logging
import os
import statistics
from datetime import date, timedelta

import h3
import httpx
from shapely.geometry import LinearRing
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..cache import utc_today
from ..h3util import h3_r5, h3_r6
from ..services import field_sources as src
from ..services import parcel_geo as geo
from ..services.data import risk_shard
from ..services.georef import zone_at
from ..services.nearby import nearby
from ..services import enso
from ..services.infiltration import (infiltration_class,
                                     infiltration_score)
from ..services.et0 import (METHOD_LABEL, et0_series,
                            series_is_masked)
from ..services.accuracy import accuracy_block
from ..services.timeline import build_timeline
from ..services.knowledge import KNOWLEDGE
from .field import (json_object, _err, parse_plot,
                    days_per_year, frost_free_window,
                    rain_monthly_mm, monthly_sum_clim,
                    temp_adjust_for, DEGRADED_REASON, EVLAND_MIN)

log = logging.getLogger("parcels")

router = APIRouter()

TIMEOUT = httpx.Timeout(6.0)
MAX_PARCELS = 20
MIN_PARCEL_HA = 0.1
MAX_OVERLAP = 0.01
HOTSPOT_KM = 25.0
DETECTION_NEAR_KM = 5.0
RISK_ZONE_KM = 10.0
FIRMS_BBOX_PAD = 0.3  # ~30 km around the boundary
MAX_ZONES = 200
POWER_CELL_HA = 300_000  # ~0.5°x0.625° — parcels are always smaller

CONCERNS = {"fire", "water", "frost", "heat", "flood", "access"}
WATER_ACCESS = {"none", "well", "channel", "irrigation", "unknown"}
EXTRA_CROPS = {"otro", "sin_cultivo"}
LEVELS = ("bajo", "moderado", "alto", "muy_alto")
HAZARDS = ("fire", "drought", "frost", "heat", "snow", "hail",
           "enso", "flood")

# emergency fire numbers by ISO A2 (public, generic knowledge)
FIRE_NUMBER = {"AR": "100", "BR": "193", "CL": "131", "UY": "104",
               "PY": "132", "BO": "119", "US": "911", "CA": "911",
               "MX": "911", "ES": "112", "PT": "112"}

SAT_LABEL = {"N": "VIIRS SNPP NRT", "N20": "VIIRS NOAA-20 NRT",
             "N21": "VIIRS NOAA-21 NRT",
             "T": "MODIS Terra NRT", "A": "MODIS Aqua NRT"}


# ------------------------------------------------------------ validation ---

def _rings_ok(geom: dict, code: str = "invalid_polygon"):
    """Same ring rules as parse_plot (closed, 3+, ranges, antimeridian,
    self-intersection) but without area bounds — parcels have their
    own minimum after clipping. Returns rings or (None, JSONResponse).
    """
    kind = (geom or {}).get("type") or "Polygon"
    coords = (geom or {}).get("coordinates") or []
    polys = coords if kind == "MultiPolygon" else [coords]
    if kind not in ("Polygon", "MultiPolygon"):
        return None, _err("invalid_polygon",
                          "type must be Polygon or MultiPolygon")[1]
    rings = []
    for pr in polys:
        for raw in pr:
            ring = [[float(q[0]), float(q[1])] for q in raw
                    if isinstance(q, (list, tuple)) and len(q) >= 2]
            if len(ring) >= 2 and ring[0] == ring[-1]:
                ring = ring[:-1]
            elif len(ring) >= 2:
                return None, _err(code, "ring must be closed")[1]
            if len(ring) < 3:
                return None, _err(code, "each ring needs 3+ vertices")[1]
            if any(not (-90 <= q[1] <= 90 and -180 <= q[0] <= 180)
                   for q in ring):
                return None, _err(code, "vertex out of lat/lon range")[1]
            n = len(ring)
            if any(abs(ring[(i + 1) % n][0] - ring[i][0]) > 180
                   for i in range(n)):
                return None, _err(
                    code, "polygon crosses the antimeridian")[1]
            if not LinearRing(ring).is_simple:
                return None, _err(code, "polygon self-intersects")[1]
            rings.append(ring)
    if not rings:
        return None, _err(code, "polygon needs a coordinates ring")[1]
    return rings, None


def parse_needs(body: dict):
    needs = body.get("needs")
    if needs is None:
        return {"water_access": "unknown", "emergency_distance_km": None,
                "concerns": [], "notes": ""}, None
    if not isinstance(needs, dict):
        return None, _err("invalid_needs", "needs must be an object")[1]
    wa = needs.get("water_access", "unknown")
    if wa not in WATER_ACCESS:
        return None, _err(
            "invalid_needs",
            f"water_access must be one of {sorted(WATER_ACCESS)}")[1]
    dist = needs.get("emergency_distance_km")
    if dist is not None:
        try:
            dist = float(dist)
            if dist < 0:
                raise ValueError
        except (TypeError, ValueError):
            return None, _err(
                "invalid_needs",
                "emergency_distance_km must be a positive number")[1]
    concerns = [c for c in (needs.get("concerns") or [])
                if c in CONCERNS]  # unknown concerns ignored per brief
    notes = str(needs.get("notes") or "")[:300]
    return {"water_access": wa, "emergency_distance_km": dist,
            "concerns": concerns, "notes": notes}, None


def parse_profile(body: dict):
    """Optional `profile`: priorities (hazard ids ranked 1..8, unique),
    hidden ids and per-parcel economics. Unknown ids ignored."""
    prof = body.get("profile")
    if prof is None:
        return {"priorities": [], "hidden": [], "economics": {}}, None
    if not isinstance(prof, dict):
        return None, _err("invalid_profile",
                          "profile must be an object")[1]
    seen_rank, seen_id, prio = set(), set(), []
    for e in prof.get("priorities") or []:
        if not isinstance(e, dict):
            continue
        hid, rk = e.get("id"), e.get("rank")
        if hid not in HAZARDS or hid in seen_id:
            continue
        try:
            rk = int(rk)
        except (TypeError, ValueError):
            continue
        if not 1 <= rk <= len(HAZARDS) or rk in seen_rank:
            continue
        seen_rank.add(rk)
        seen_id.add(hid)
        prio.append(hid)
    hidden = {h for h in (prof.get("hidden") or []) if h in HAZARDS}
    econ_raw = prof.get("economics") or {}
    if not isinstance(econ_raw, dict):
        return None, _err("invalid_profile",
                          "profile.economics must be an object")[1]
    parcels_econ = {}
    for pid, e in (econ_raw.get("parcels") or {}).items():
        if not isinstance(e, dict):
            continue
        try:
            cost = float(e["cost_per_ha"])
            price = float(e["price_per_t"])
            y = e.get("expected_yield_t_ha")
        except (KeyError, TypeError, ValueError):
            continue
        parcels_econ[pid] = {
            "cost_per_ha": cost, "price_per_t": price,
            "expected_yield_t_ha": float(y) if y is not None else None}
    return {"priorities": prio, "hidden": hidden,
            "economics": {"currency": econ_raw.get("currency") or "USD",
                          "parcels": parcels_econ}}, None


# ------------------------------------------------------------ indicators ---

def _monthly_means(series: dict, month: int,
                   y0: int = 2001) -> list[float]:
    """Mean of `series` for `month` in every covered year >= y0."""
    by_year: dict[int, list[float]] = {}
    for d, v in series.items():
        if v is not None and d.month == month and d.year >= y0:
            by_year.setdefault(d.year, []).append(v)
    return [statistics.fmean(vs) for vs in by_year.values()
            if len(vs) >= 25]


def _pctile(vals: list[float], q: float) -> float | None:
    if not vals:
        return None
    s = sorted(vals)
    return s[min(len(s) - 1, int(q * (len(s) - 1)))]


def water_indicator(power: dict | None, shared_note: str = ""):
    """GWETROOT 30-day mean vs the cell's own monthly history."""
    if not power:
        return {"pct": None, "level": None,
                "basis": "Sin datos de humedad: el servicio de clima "
                         "no respondió." + shared_note}
    gw = power.get("GWETROOT") or {}
    vals = sorted((d, v) for d, v in gw.items() if v is not None)
    if len(vals) >= 30:
        recent = statistics.fmean(v for _, v in vals[-30:])
        hist = _monthly_means(gw, vals[-1][0].month)
        p20, p80 = _pctile(hist, 0.2), _pctile(hist, 0.8)
        level = ("seco" if p20 is not None and recent < p20
                 else "humedo" if p80 is not None and recent > p80
                 else "normal")
        month_names = ["enero", "febrero", "marzo", "abril", "mayo",
                       "junio", "julio", "agosto", "septiembre",
                       "octubre", "noviembre", "diciembre"]
        mname = month_names[vals[-1][0].month - 1]
        word = {"seco": "está por debajo del percentil 20",
                "humedo": "está por encima del percentil 80"}.get(
            level, "está dentro de lo normal")
        return {"pct": round(recent * 100), "level": level,
                "basis": f"Humedad de la raíz (NASA POWER GWETROOT), "
                         f"promedio de los últimos 30 días; {word} "
                         f"de {mname} en la historia de esta zona."
                         + shared_note}
    # fallback: 30-day rain anomaly
    rain = power.get("PRECTOTCORR") or {}
    vals = sorted((d, v) for d, v in rain.items() if v is not None)
    if not vals:
        return {"pct": None, "level": None,
                "basis": "Sin datos de humedad ni lluvia reciente."
                + shared_note}
    end = vals[-1][0]
    recent = sum(v for d, v in vals if end - timedelta(days=30) < d <= end)
    hist = []
    for y in range(end.year - 25, end.year):
        tot = sum(v for d, v in rain.items()
                  if v is not None and d.year == y and
                  (date(y, end.month, min(end.day, 28))
                   - timedelta(days=30)) < d <=
                  date(y, end.month, min(end.day, 28)))
        hist.append(tot)
    mean_hist = statistics.fmean(hist) if hist else None
    ratio = recent / mean_hist if mean_hist else None
    level = ("seco" if ratio is not None and ratio < 0.7
             else "humedo" if ratio is not None and ratio > 1.3
             else "normal")
    pct = round(min(ratio, 2) * 50) if ratio is not None else None
    return {"pct": pct, "level": level,
            "basis": "Sin humedad de raíz: se usa la anomalía de lluvia "
                     "de los últimos 30 días contra el promedio "
                     "histórico de esas mismas fechas." + shared_note}


def fire_indicator(risk_cell: dict | None, det_km: float | None):
    """7-day model probability; level raised by a nearby detection."""
    p = (risk_cell or {}).get("p")
    pct = round(p * 100) if p is not None else None
    level = (risk_cell or {}).get("cat")
    if level not in LEVELS:
        level = "bajo" if pct is not None else None
    near = det_km is not None
    if near and level in (None, "bajo", "moderado"):
        level = "alto"
    if pct is None:
        basis = "Sin salida del modelo de riesgo para esta celda."
    else:
        basis = ("Probabilidad de fuego en los próximos 7 días según "
                 "el modelo de la zona")
        if near:
            basis += ("; subió a alto porque hay un foco satelital "
                      f"detectado a {det_km:.1f} km en las últimas 72 h.")
        else:
            basis += "."
    return {"pct": pct, "level": level, "basis": basis}


def heat_indicator(grid_cell: dict | None, power: dict | None,
                   shared_note: str = ""):
    v = (grid_cell or {}).get("hot_days_gt35")
    if v is not None:
        return {"days_over_35": v,
                "basis": "Promedio anual de días por encima de 35 °C "
                         "(serie diaria NASA POWER, con corrección "
                         "por altura)." + shared_note}
    if power and power.get("T2M_MAX"):
        v = days_per_year(power["T2M_MAX"], lambda x: x > 35)
        if v is not None:
            return {"days_over_35": round(v, 1),
                    "basis": "Promedio anual de días por encima de "
                             "35 °C (serie diaria NASA POWER)."
                    + shared_note}
    return {"days_over_35": None,
            "basis": "Sin datos de calor extremo." + shared_note}


def _ff_days(ff: dict | None) -> int | None:
    """{start,end} MM-DD -> number of days (wraps year end)."""
    if not ff or not ff.get("start") or not ff.get("end"):
        return None
    try:
        sm, sd = map(int, ff["start"].split("-"))
        em, ed = map(int, ff["end"].split("-"))
        s = date(2001, sm, sd).timetuple().tm_yday
        e = date(2001, em, ed).timetuple().tm_yday
        return (e - s) % 365 or 365
    except (ValueError, AttributeError):
        return None


def frost_indicator(grid_cell: dict | None, power: dict | None,
                    shared_note: str = ""):
    ff = (grid_cell or {}).get("frost_free")
    days = _ff_days(ff)
    if days is not None:
        return {"frost_free_days": days, "window": ff,
                "basis": "Días del año entre la última helada de "
                         "primavera y la primera de otoño (mediana "
                         "de años completos, NASA POWER, con "
                         "corrección por altura)." + shared_note}
    if grid_cell and "frost_free" in grid_cell:
        return {"frost_free_days": 365, "window": None,
                "basis": "No se miden heladas: todo el año es libre "
                         "de heladas en la historia de esta zona."
                + shared_note}
    if power and power.get("T2M_MIN"):
        win = frost_free_window(power["T2M_MIN"])
        days = _ff_days(win)
        if days is not None:
            return {"frost_free_days": days, "window": win,
                    "basis": "Días del año entre la última helada de "
                             "primavera y la primera de otoño "
                             "(NASA POWER)." + shared_note}
    return {"frost_free_days": None, "window": None,
            "basis": "Sin datos de heladas." + shared_note}


def evaporation_indicator(power: dict | None, lat: float | None = None,
                          crop: str | None = None,
                          shared_note: str = ""):
    """Annual evaporation (POWER EVLAND, mm/day), the monthly profile
    and the implied monthly water balance (rain - evaporation, mm).

    When POWER EVLAND is missing/masked, falls back to a FAO-56 ET0
    series computed from the cell's own T/RH/wind/radiation (the basis
    says which method was used). `crop_water_mm_day` multiplies the
    ET0 daily mean by the catalog Kc of the parcel's crop."""
    ev = (power or {}).get("EVLAND")
    # EVLAND sometimes comes back degraded rather than empty (mean
    # far below any plausible land evaporation) -- same guard as
    # /diagnose: treat it as masked and fall back to computed ET0.
    if ev and series_is_masked(ev, EVLAND_MIN):
        ev = None
    et0, method = {}, None
    if not ev and lat is not None:
        et0, method = et0_series(power or {}, lat)
    if not ev and not et0:
        return {"mm_per_year": None, "monthly_mm": None,
                "balance_mm": None,
                "basis": "Sin datos de evaporación: el servicio de "
                         "clima no devolvió el parámetro EVLAND ni "
                         "temperaturas para estimar ET0."
                + shared_note}
    src = ev if ev else et0
    by_year: dict[int, list[float]] = {}
    for d, v in src.items():
        if v is not None:
            by_year.setdefault(d.year, []).append(v)
    years = [vs for vs in by_year.values() if len(vs) >= 300]
    annual = statistics.fmean(sum(vs) for vs in years) if years else None
    wb = monthly_sum_clim((power or {}).get("PRECTOTCORR") or {}, src)
    basis = ("Cuánta agua pierde el suelo y las plantas al aire "
             "por año (NASA POWER EVLAND, mm/día sumada por mes y "
             "por año); el balance mensual es lluvia menos "
             "evaporación en mm." + shared_note) if ev else (
            f"Estimación de referencia {METHOD_LABEL.get(method, '')} "
            "— EVLAND no está disponible en esta celda; el balance "
            "mensual es lluvia menos ET0 en mm." + shared_note)
    out = {
        "mm_per_year": round(annual) if annual is not None else None,
        "monthly_mm": rain_monthly_mm(src),
        "balance_mm": ({m: v["balance_mm"] for m, v in wb.items()}
                       if wb else None),
        "basis": basis}
    if et0 and crop:
        kc = getattr(KNOWLEDGE.crops.get(crop), "kc_mid", None)
        if kc is not None:
            out["crop_water_mm_day"] = round(
                statistics.fmean(et0.values()) * kc, 1)
            out["basis"] += (f" Agua de cultivo ≈ ET0 × Kc {kc:g} "
                             "(FAO-56) del catálogo.")
    return out


def infiltration_indicator(grid_cell: dict | None, terr: dict | None,
                           shared_note: str = ""):
    """Soil texture + organic carbon + slope + bare-soil days -> 0-100
    score and alta/media/baja class (formula: knowledge/README)."""
    soil = (grid_cell or {}).get("soil") or {}
    tex = soil.get("texture")
    soc = soil.get("soc_g_kg")
    slope = (terr or {}).get("slope")  # mean slope %, Terrarium SRTM
    bare = (grid_cell or {}).get("bare_soil_days_yr")
    score = infiltration_score(tex, soc, slope, bare)
    if score is None:
        return {"class": None, "score": None,
                "basis": "Sin datos de suelo, pendiente ni cobertura "
                         "para estimar la infiltración." + shared_note}
    parts = [f"textura {tex}" if tex else "textura desconocida",
             f"MO {soc:g} g/kg" if soc is not None else None,
             f"pendiente {slope:g} %" if slope is not None else None,
             f"{bare:g} días/año de suelo desnudo"
             if bare is not None else None]
    return {"class": infiltration_class(score), "score": score,
            "basis": "Puntaje 0-100 a partir de " +
                     ", ".join(p for p in parts if p) +
                     " (grupos hidrológicos de suelo USDA; fórmula en "
                     "knowledge/README). Ordena el riesgo relativo, "
                     "no es una medición." + shared_note}


def snow_indicator(power: dict | None, shared_note: str = ""):
    """Days per year with snowfall >1 mm water equivalent and the share
    of years with at least one snow day (POWER PRECSNOLAND)."""
    sn = (power or {}).get("PRECSNOLAND")
    if not sn:
        return {"days_per_year": None, "pct_years_with_snow": None,
                "basis": "Sin datos de nieve: el servicio de clima no "
                         "devolvió el parámetro PRECSNOLAND."
                + shared_note}
    by_year: dict[int, int] = {}
    for d, v in sn.items():
        if v is not None and v > 1:
            by_year[d.year] = by_year.get(d.year, 0) + 1
    years = {d.year for d, v in sn.items() if v is not None}
    n = len(years)
    if not n:
        return {"days_per_year": None, "pct_years_with_snow": None,
                "basis": "Sin datos de nieve." + shared_note}
    total = sum(by_year.values())
    dpy = round(total / n, 1)
    pct = round(100 * len(by_year) / n)
    word = ("casi nunca nieva en esta zona" if pct <= 10 else
            "nieva algunos años en esta zona")
    return {"days_per_year": dpy, "pct_years_with_snow": pct,
            "basis": f"Días por año con nevada sobre 1 mm (NASA POWER "
                     f"PRECSNOLAND, 2001–hoy); {word}." + shared_note}


HAIL_INDICATOR = {
    "available": False,
    "basis": "No hay un dato satelital de granizo para tu zona en "
             "esta app; consultá el servicio meteorológico y tu "
             "aseguradora."}


def flood_indicator(grid_cell: dict | None, terr: dict | None,
                    shared_note: str = ""):
    """Anegamiento: días de lluvia fuerte de la grilla + pendiente del
    terreno. No hay dataset de inundaciones; esto solo ordena el
    riesgo relativo."""
    heavy = (grid_cell or {}).get("heavy_days_yr")
    slope = (terr or {}).get("slope")  # mean slope %, Terrarium SRTM
    if heavy is None and slope is None:
        return {"available": False,
                "basis": "Sin datos suficientes para estimar "
                         "anegamiento en esta zona." + shared_note}
    low = slope is None or slope < 1.0
    if heavy is None:
        basis = "Sin dato de lluvias fuertes; "
    else:
        basis = (f"{heavy:g} días por año con lluvia fuerte "
                 "(sobre 20 mm) y ")
    basis += ("terreno casi plano" if low else "terreno con pendiente")
    basis += (": riesgo de anegamiento bajo pero no nulo tras "
              "tormentas." if low else
              ": el agua escurre, riesgo de anegamiento menor.")
    return {"heavy_rain_days_yr": heavy, "low_slope": low,
            "basis": basis + shared_note}


# ------------------------------------------------------ order + economics --

_SEV_FIRE = {"muy_alto": 4, "alto": 3, "moderado": 2, "bajo": 1}


def _severity(hid: str, ind: dict, alerts: list) -> int:
    """0..4 how much attention a hazard deserves on this parcel, for
    the default ordering of non-priority ids."""
    if hid == "fire":
        if any(a["kind"] == "fire" and a["severity"] == "high"
               for a in alerts):
            return 4
        return _SEV_FIRE.get(ind["fire"].get("level"), 0)
    if hid == "drought":
        return {"seco": 3, "normal": 1, "humedo": 0}.get(
            ind["water"].get("level"), 0)
    if hid == "frost":
        ff = ind["frost"].get("frost_free_days")
        return 2 if ff is not None and ff <= 150 else \
            (1 if ff is not None and ff <= 240 else 0)
    if hid == "heat":
        hot = ind["heat"].get("days_over_35")
        return 2 if hot is not None and hot >= 60 else \
            (1 if hot is not None and hot >= 30 else 0)
    if hid == "snow":
        return 1 if (ind["snow"].get("days_per_year") or 0) > 0 else 0
    if hid == "enso":
        return 1 if ind["enso"].get("phase_now") in (
            "el_nino", "la_nina") else 0
    if hid == "flood":
        return 1 if ind["flood"].get("heavy_rain_days_yr") or \
            ind["flood"].get("low_slope") else 0
    return 0  # hail: never available


def compute_order(ind: dict, alerts: list, profile: dict):
    """-> (order, extra). Profile ranks first, then the rest by
    severity; hidden ids go to `extra` (still computed)."""
    hidden = set(profile["hidden"])
    ranked = [h for h in profile["priorities"] if h not in hidden]
    rest = [h for h in HAZARDS
            if h not in profile["priorities"] and h not in hidden]
    rest.sort(key=lambda h: -_severity(h, ind, alerts))
    extra_ranked = [h for h in profile["priorities"] if h in hidden]
    extra_rest = [h for h in HAZARDS
                  if h not in profile["priorities"] and h in hidden]
    extra_rest.sort(key=lambda h: -_severity(h, ind, alerts))
    return (ranked + rest,
            [{"id": h, "hidden": True} for h in extra_ranked + extra_rest])


# rough, documented loss shares on revenue for the risk-adjusted margin
LOSS_FACTORS = {"drought_seco": 0.15, "fire_high_alert": 0.05,
                "frost_short": 0.05, "heat_many": 0.05}


def economics_block(pe: dict, crop: str, analog_cell: dict | None,
                    area_ha: float, ind: dict, alerts: list) -> dict:
    """Margin per ha from declared costs/price and a yield (user's or
    MAGyP department). All factors are rough assumptions, stated in
    the basis — never a forecast."""
    y = pe.get("expected_yield_t_ha")
    ysrc = "user"
    if y is None:
        kg = next((c.get("yield_kg_ha") for c in
                   (analog_cell or {}).get("ar_crops") or []
                   if c.get("crop") == crop), None)
        if kg is not None:
            y = kg / 1000
            ysrc = "magyp_department"
    cost, price = pe["cost_per_ha"], pe["price_per_t"]
    out = {"expected_yield_t_ha": y,
           "yield_source": ysrc if y is not None else None}
    if y is None:
        out["basis"] = ("Sin rinde esperado: el productor no lo "
                        "declaró y no hay un rinde departamental "
                        "MAGyP para este cultivo en la zona.")
        return out
    revenue = y * price
    margin = revenue - cost
    share, why = 0.0, []
    if ind["water"].get("level") == "seco":
        share += LOSS_FACTORS["drought_seco"]
        why.append("suelo seco −15 %")
    if any(a["kind"] == "fire" and a["severity"] == "high"
           for a in alerts):
        share += LOSS_FACTORS["fire_high_alert"]
        why.append("alerta de fuego −5 %")
    if (ind["frost"].get("frost_free_days") or 999) <= 150:
        share += LOSS_FACTORS["frost_short"]
        why.append("período sin heladas corto −5 %")
    if (ind["heat"].get("days_over_35") or 0) >= 60:
        share += LOSS_FACTORS["heat_many"]
        why.append("muchos días de calor −5 %")
    adjusted = margin - revenue * share
    src_txt = ("declarado por el productor" if ysrc == "user" else
               "departamental MAGyP para la zona")
    factors = "; ".join(why) if why else "sin factores de riesgo"
    out.update({
        "revenue_per_ha": round(revenue),
        "cost_per_ha": round(cost),
        "margin_per_ha": round(margin),
        "margin_total": round(margin * area_ha),
        "break_even_yield_t_ha": round(cost / price, 2)
        if price else None,
        "risk_adjusted_margin_per_ha": round(adjusted),
        "basis": f"Rinde {src_txt} ({y:g} t/ha). Margen ajustado "
                 f"con supuestos aproximados: {factors} del ingreso. "
                 "No es un pronóstico."})
    return out


# ---------------------------------------------------------------- alerts ---

def _fire_number(country: str | None) -> str:
    return FIRE_NUMBER.get(country or "", "emergencias")


def _doy(mmdd: str) -> int:
    m, d = map(int, mmdd.split("-"))
    return date(2001, m, d).timetuple().tm_yday


def _in_window(doy: int, start: int, end: int) -> bool:
    return start <= doy <= end if start <= end \
        else doy >= start or doy <= end


def _window_doys(ws: int, we: int) -> range:
    return range(ws, we + 1) if we >= ws else range(0)


def _frost_window_alert(crop_obj, zone: str | None, ff: dict | None,
                        crop_name: str) -> dict | None:
    """Alert when the crop's frost-sensitive window (catalog) is not
    fully covered by the frost-free window of this cell."""
    win = (crop_obj.frost_window.get(zone)
           if crop_obj and zone else None) or (
        next(iter(crop_obj.frost_window.values()), None)
        if crop_obj else None)
    if not win or not ff or not ff.get("start") or not ff.get("end"):
        return None
    ws, we = _doy(win[0]), _doy(win[1])
    fs, fe = _doy(ff["start"]), _doy(ff["end"])
    days = _window_doys(ws, we) if we >= ws else \
        list(range(ws, 366)) + list(range(1, we + 1))
    exposed = sum(1 for d in days if not _in_window(d, fs, fe))
    if exposed < 7:
        return None
    return {
        "kind": "frost", "severity": "medium",
        "text": f"El/La {crop_name} pasa su etapa más sensible entre "
                f"{win[0]} y {win[1]}; la última helada típica de esta "
                f"zona cae el {ff['start']} — unos {exposed} días "
                "sensibles quedan expuestos a heladas tardías."}


def build_alerts(ind: dict, crop: str, crop_name: str,
                 needs: dict, det_km: float | None,
                 country: str | None, crop_obj=None,
                 zone: str | None = None) -> list[dict]:
    out = []
    fire = ind["fire"]
    num = _fire_number(country)
    if det_km is not None:
        out.append({
            "kind": "fire", "severity": "high",
            "text": f"Hay un foco satelital a {det_km:.1f} km del lote. "
                    f"Llamá al {num} (bomberos) si ves fuego o humo, "
                    "mantené los guardafuegos despejados y no quemes "
                    "rastrojos."})
    elif (fire.get("pct") or 0) >= 50 or \
            fire.get("level") in ("alto", "muy_alto"):
        out.append({
            "kind": "fire", "severity": "high",
            "text": f"Riesgo de fuego {fire.get('level')} en esta "
                    f"parcela: no quemes rastrojos, revisá los "
                    f"guardafuegos y ante fuego o humo llamá al {num}."})
    water = ind["water"]
    if water.get("level") == "seco" and crop != "sin_cultivo":
        wa = needs.get("water_access", "unknown")
        how = {
            "none": "Sin acceso a agua: priorizá el monitoreo y el "
                    "riego en esta parcela.",
            "well": "Con pozo: verificá que el caudal alcance para "
                    "la demanda del cultivo.",
            "channel": "Con canal: coordiná el próximo turno de riego.",
            "irrigation": "Con riego: adelantá el próximo riego si el "
                          "cultivo lo pide.",
        }.get(wa, "Revisá la humedad en campo antes de decidir el "
                  "riego.")
        out.append({
            "kind": "dry", "severity": "medium",
            "text": f"El suelo está más seco que lo normal y el lote "
                    f"tiene {crop_name}. {how}"})
    hot = ind["heat"].get("days_over_35")
    if hot is not None and hot >= 60:
        out.append({
            "kind": "heat", "severity": "medium",
            "text": f"Muchos días sobre 35 °C al año "
                    f"({hot:g}): programá labores y siembras evitando "
                    "los picos de calor."})
    ffd = ind["frost"].get("frost_free_days")
    if ffd is not None and ffd <= 150:
        out.append({
            "kind": "frost", "severity": "medium",
            "text": f"Período sin heladas corto ({ffd} días): cuidado "
                    "con siembras tardías y cultivos de ciclo largo."})
    cw = _frost_window_alert(crop_obj, zone,
                             ind["frost"].get("window"), crop_name)
    if cw:
        out.append(cw)
    return out


# ------------------------------------------------------------------ zones --

def build_zones(parcels: list[dict], detections: list,
                risk_cells: list[tuple], bare_cells: list[tuple],
                bgeom_lat0: float) -> list[dict]:
    """kind/geometry/center/radius/pct/label/source/date, nearest first."""
    zones = []
    for lat, lon, frp, sat, instant in detections:
        viirs = sat in ("N", "N20", "N21")
        zones.append({
            "kind": "hotspot",
            "geometry": geo.circle_polygon(
                lon, lat, 375 if viirs else 1000),
            "center": [round(lon, 5), round(lat, 5)],
            "radius_m": 375 if viirs else 1000,
            "pct": None,
            "label": "Foco detectado por satélite",
            "source": SAT_LABEL.get(sat, sat),
            "date": str(instant)[:10],
            "_d": geo.dist_km_point_geom(lat, lon, bgeom_lat0[0],
                                         bgeom_lat0[1])})
    for cell_id, cell, lat, lon in risk_cells:
        ring = [[round(q[1], 6), round(q[0], 6)]
                for q in h3.cell_to_boundary(cell_id)]
        ring.append(ring[0])
        zones.append({
            "kind": "fire_risk",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "center": [round(lon, 5), round(lat, 5)],
            "radius_m": None,
            "pct": round((cell.get("p") or 0) * 100),
            "label": f"Zona de riesgo {cell.get('cat')} de fuego",
            "source": f"modelo {cell.get('model_version') or 'ar-lgbm'}",
            "date": utc_today(),
            "_d": geo.dist_km_point_geom(lat, lon, bgeom_lat0[0],
                                         bgeom_lat0[1])})
    for p in parcels:
        if (p["indicators"]["water"].get("level") == "seco"
                and p.get("_geom") is not None):
            c = p["_geom"].centroid
            zones.append({
                "kind": "dry",
                "geometry": geo.geojson(p["_geom"]),
                "center": [round(c.x, 5), round(c.y, 5)],
                "radius_m": None,
                "pct": p["indicators"]["water"].get("pct"),
                "label": f"Suelo más seco que lo normal ({p['crop']})",
                "source": "NASA POWER GWETROOT",
                "date": utc_today(),
                "_d": 0})
    for cell_id, cell, lat, lon, pct in bare_cells:
        ring = [[round(q[1], 6), round(q[0], 6)]
                for q in h3.cell_to_boundary(cell_id)]
        ring.append(ring[0])
        zones.append({
            "kind": "bare_soil",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "center": [round(lon, 5), round(lat, 5)],
            "radius_m": None,
            "pct": pct,
            "label": "Suelo desnudo la mayor parte del año",
            "source": "Sentinel-2 / grid",
            "date": utc_today(),
            "_d": geo.dist_km_point_geom(lat, lon, bgeom_lat0[0],
                                         bgeom_lat0[1])})
    zones.sort(key=lambda z: z.pop("_d"))
    return zones[:MAX_ZONES]


# ---------------------------------------------------------------- summary --

def template_summary(parcels: list[dict], nearby_res: dict,
                     lang: str, priorities: list | None = None) -> dict:
    """Deterministic fallback mirroring the AI output shape. The
    headline follows the farmer's first priority, unless a fire
    alert fires — fire always leads."""
    fire_high = [p for p in parcels if any(
        a["kind"] == "fire" and a["severity"] == "high"
        for a in p["alerts"])]
    dry = [p for p in parcels
           if p["indicators"]["water"].get("level") == "seco"]
    en = lang == "en"
    first = (priorities or [None])[0]
    if fire_high:
        head = ("Hay focos o riesgo alto de fuego: vigilancia y "
                "guardafuegos al día." if not en else
                "Fire risk is high or detections are nearby: stay "
                "watchful and keep firebreaks clear.")
    elif first == "enso" and parcels:
        e = parcels[0]["indicators"]["enso"]
        ph, eff = e.get("phase_now"), e.get("rain_effect_pct") or {}
        if ph in ("el_nino", "la_nina") and eff:
            pct = eff.get(ph)
            sign = "más" if (pct or 0) >= 0 else "menos"
            head = (f"{'El Niño' if ph == 'el_nino' else 'La Niña'} "
                    f"activo: en esta zona suele llover {abs(pct)} % "
                    f"{sign} en la temporada." if not en else
                    f"{'El Niño' if ph == 'el_nino' else 'La Niña'} "
                    f"is active: this area tends to get {abs(pct)} % "
                    f"{'more' if (pct or 0) >= 0 else 'less'} rain in "
                    "the season.")
        else:
            head = ("ENSO está neutro: sin señal fuerte para la "
                    "lluvia de la temporada." if not en else
                    "ENSO is neutral: no strong signal for seasonal "
                    "rain.")
    elif first == "drought" and dry:
        head = ("El agua es la prioridad: hay parcelas más secas "
                "que lo normal." if not en else
                "Water is the priority: some parcels are drier "
                "than usual.")
    else:
        head = ("El riesgo de fuego está bajo; lo que más conviene "
                "mirar es el agua." if not en else
                "Fire risk is low; water is what most deserves "
                "attention.")
    bullets = []
    for p in dry[:2]:
        bullets.append(
            f"La parcela {p['id']} ({p['crop']}) tiene el suelo más "
            "seco que lo normal." if not en else
            f"Parcel {p['id']} ({p['crop']}) is drier than usual.")
    b = (nearby_res.get("fire_stations") or [])
    if b:
        bullets.append(
            f"El servicio de bomberos más cercano está a unos "
            f"{b[0]['distance_km']:g} km." if not en else
            f"The nearest fire station is about "
            f"{b[0]['distance_km']:g} km away.")
    return {"headline": head, "bullets": bullets[:3],
            "source": "template"}


# --------------------------------------------------------------- endpoint --

@router.post("/api/field/parcels")
async def parcels(request: Request):
    body = await json_object(request)
    if body is None:
        return _err("invalid_input", "body must be a JSON object")[1]
    lang = "en" if body.get("lang") == "en" else "es"

    boundary = body.get("boundary")
    if not isinstance(boundary, dict):
        return _err("invalid_boundary",
                    "boundary must be a GeoJSON polygon")[1]
    parsed, err = parse_plot({"polygon": boundary})
    if err:
        return err
    (clat, clon), b_area, r5s, r6s, _bgeom = parsed
    bgeom = geo.to_polygon(boundary)
    if bgeom is None or bgeom.is_empty:
        return _err("invalid_boundary", "boundary polygon invalid")[1]
    bbox = bgeom.bounds  # (west, south, east, north)
    # r5s/r6s are {cell: weight} dicts (cell_weights): the first key is
    # the largest covered cell — the fallback covers sub-cell plots.
    r6_rep = next(iter(r6s), h3_r6(clat, clon))

    plist = body.get("parcels")
    if not isinstance(plist, list) or not 1 <= len(plist) <= MAX_PARCELS:
        return _err("invalid_parcels",
                    f"parcels must be a list of 1..{MAX_PARCELS}")[1]

    crop_ids = set(KNOWLEDGE.crops) | EXTRA_CROPS
    items, seen_ids = [], set()
    for i, p in enumerate(plist):
        pid = f"parcels[{i}]"
        if not isinstance(p, dict):
            return _err("invalid_parcels", f"{pid} must be an object")[1]
        par_id = p.get("id")
        if not isinstance(par_id, str) or not par_id or \
                par_id in seen_ids:
            return _err("invalid_parcels",
                        f"{pid}: id must be a unique string")[1]
        seen_ids.add(par_id)
        crop = p.get("crop")
        if crop not in crop_ids:
            return _err("unknown_crop",
                        f"{pid}: crop '{crop}' is not in the catalog "
                        "(use 'otro' or 'sin_cultivo' if unknown)")[1]
        poly = p.get("polygon")
        if not isinstance(poly, dict):
            return _err("invalid_parcels",
                        f"{pid}: polygon required")[1]
        _, rerr = _rings_ok(poly)
        if rerr:
            return rerr
        pgeom = geo.to_polygon(poly)
        if pgeom is None or pgeom.is_empty:
            return _err("invalid_parcels",
                        f"{pid}: polygon invalid")[1]
        clip = pgeom.intersection(bgeom)
        clip_ha = geo.area_ha(clip, clat) if not clip.is_empty else 0.0
        if clip_ha < MIN_PARCEL_HA:
            return _err("parcel_outside_boundary",
                        f"{pid} ({par_id}) lies outside the boundary "
                        f"or below {MIN_PARCEL_HA} ha inside it")[1]
        for q in items:
            inter = clip.intersection(q["_geom"])
            if inter.is_empty:
                continue
            iha = geo.area_ha(inter, clat)
            if iha > MAX_OVERLAP * min(clip_ha, q["_ha"]):
                return _err("parcels_overlap",
                            f"{par_id} overlaps {q['id']} by more "
                            "than 1% of the smaller parcel")[1]
        cent = clip.centroid
        items.append({"id": par_id, "crop": crop,
                      "name": p.get("name"), "_geom": clip,
                      "_ha": clip_ha, "_cent": (cent.y, cent.x)})

    needs, nerr = parse_needs(body)
    if nerr:
        return nerr
    profile, perr = parse_profile(body)
    if perr:
        return perr

    g = zone_at(clat, clon)
    if g["country"] is None:
        return _err("no_land",
                    "boundary centroid is not on land")[1]

    # ---- shared fetches ----------------------------------------------------
    r6_by = {p["id"]: h3_r6(*p["_cent"]) for p in items}
    r5_by = {p["id"]: h3_r5(*p["_cent"]) for p in items}
    r6_count = {r: sum(1 for v in r6_by.values() if v == r)
                for r in set(r6_by.values())}
    buffer_cells = set()
    for r5 in r5s:
        buffer_cells |= set(h3.grid_disk(r5, 1))
    r2s = sorted({h3.cell_to_parent(c, 2)
                  for c in buffer_cells | set(r5_by.values())})

    fbox = (f"{bbox[0] - FIRMS_BBOX_PAD:.4f},{bbox[1] - FIRMS_BBOX_PAD:.4f},"
            f"{bbox[2] + FIRMS_BBOX_PAD:.4f},{bbox[3] + FIRMS_BBOX_PAD:.4f}")

    from ..config import get_env
    from ..services import firms
    map_key = get_env("FIRMS_MAP_KEY")

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        coros = {
            "power": asyncio.gather(*[
                src.power_daily(client, *p["_cent"], r6_by[p["id"]])
                for p in items], return_exceptions=True),
            "terrain": asyncio.gather(*[
                src.terrain_stats(client, *p["_cent"], r6_by[p["id"]])
                for p in items], return_exceptions=True),
            "grids": asyncio.gather(*[
                src.json_shard(clat, clon, f"field/grid/{r2}.json",
                               r6_rep, f"grid_{r2}")
                for r2 in r2s], return_exceptions=True),
            "risks": asyncio.gather(*[
                risk_shard(r2) for r2 in r2s], return_exceptions=True),
            "analogs": asyncio.gather(*[
                src.json_shard(clat, clon, f"field/analogs/{r2}.json",
                               r6_rep, f"analogs_{r2}")
                for r2 in r2s], return_exceptions=True),
            "firms": (firms.fetch_all(map_key, fbox, "72h")
                      if map_key else asyncio.sleep(0, result=None)),
            "nearby": nearby(clat, clon, client),
            "oni": enso.fetch_oni(client),
        }
        # every source bounds itself (POWER 5 s + one retry, shards 3 s,
        # Overpass 6 s, FIRMS 10 s); a global cap covers pathological
        # fan-outs (20 parcels x concurrent POWER calls share the
        # in-flight dedup and the cache)
        todo = asyncio.gather(*coros.values(), return_exceptions=True)
        try:
            results = await asyncio.wait_for(todo, timeout=18.0)
        except TimeoutError:
            log.warning("parcels: 18s total budget exceeded")
            results = [TimeoutError("budget")] * len(coros)

    def ok(v, default=None):
        return default if isinstance(v, Exception) else v

    powers = ok(results[0], []) or []
    terrs = ok(results[1], []) or []
    grids = [gg for gg in (ok(results[2], []) or []) if gg]
    risks = [rr for rr in (ok(results[3], []) or []) if rr]
    analogs = [aa for aa in (ok(results[4], []) or []) if aa]
    fres = ok(results[5])
    nearby_res = ok(results[6]) or {
        "fire_stations": [], "hospitals": [], "water": [],
        "source": "OpenStreetMap contributors", "degraded": True}
    oni = ok(results[7], {}) or {}

    # ---- detections --------------------------------------------------------
    detections = []
    if fres and map_key:
        _, _, pts = fres
        fbuf = geo.buffer_km(bgeom, HOTSPOT_KM, clat)
        for pt in pts or []:
            plat, plon = pt[0], pt[1]
            if geo.dist_km_point_geom(plat, plon, fbuf, clat) <= 0.0001:
                detections.append(pt)

    # ---- cells -------------------------------------------------------------
    def cell_of(shards, key):
        for s in shards:
            c = (s.get("cells") or {}).get(key)
            if c is not None:
                return c
        return None

    grid_cells = {cid: c for s in grids
                  for cid, c in (s.get("cells") or {}).items()}
    risk_cells_all = {cid: c for s in risks
                      for cid, c in (s.get("cells") or {}).items()}
    analog_cells = {cid: c for s in analogs
                    for cid, c in (s.get("cells") or {}).items()}

    # regional bare-soil p80 across the fetched shards
    bare_vals = sorted(c["bare_soil_days_yr"] for c in
                       grid_cells.values()
                       if c.get("bare_soil_days_yr") is not None)
    bare_p80 = _pctile(bare_vals, 0.8)

    rbuf = geo.buffer_km(bgeom, RISK_ZONE_KM, clat)
    risk_zone_cells = []
    for cid, c in risk_cells_all.items():
        if c.get("cat") not in ("alto", "muy_alto"):
            continue
        try:
            lat, lon = h3.cell_to_latlng(cid)
        except Exception:
            continue
        if geo.dist_km_point_geom(lat, lon, rbuf, clat) <= 0.0001:
            risk_zone_cells.append((cid, c, lat, lon))

    bare_zone_cells = []
    for cid, c in grid_cells.items():
        v = c.get("bare_soil_days_yr")
        if v is None or bare_p80 is None or v <= bare_p80:
            continue
        try:
            lat, lon = h3.cell_to_latlng(cid)
        except Exception:
            continue
        if geo.dist_km_point_geom(lat, lon, bgeom, clat) <= 0.0001:
            bare_zone_cells.append(
                (cid, c, lat, lon, round(v / 365 * 100)))

    # ---- per parcel --------------------------------------------------------
    out_parcels = []
    any_power = any(p for p in powers)
    for p, power_raw, terr in zip(items, powers, terrs):
        power = ok(power_raw)
        terr = ok(terr)
        r5c = r5_by[p["id"]]
        grid_cell = cell_of(grids, r5c)
        risk_cell = cell_of(risks, r5c)

        elev_m = (terr or {}).get("elevation_m")
        cell_elev = (power or {}).get("_elev_m")
        adj = temp_adjust_for(elev_m, cell_elev)
        if adj and power:
            power = dict(power)
            for key in ("T2M_MAX", "T2M_MIN"):
                if power.get(key):
                    power[key] = {d: (v + adj if v is not None else None)
                                  for d, v in power[key].items()}

        det_km = None
        for pt in detections:
            d = geo.dist_km_point_geom(pt[0], pt[1], p["_geom"], clat)
            if det_km is None or d < det_km:
                det_km = d
        det_km = det_km if det_km is not None and \
            det_km <= DETECTION_NEAR_KM else None

        note = (" Esta parcela comparte la celda de datos climáticos "
                "con otra parcela del lote."
                if r6_count[r6_by[p["id"]]] > 1 else "")
        ind = {
            "fire": fire_indicator(risk_cell, det_km),
            "water": water_indicator(power, note),
            "heat": heat_indicator(grid_cell, power, note),
            "frost": frost_indicator(grid_cell, power, note),
            "snow": snow_indicator(power, note),
            "hail": dict(HAIL_INDICATOR),
            "enso": enso.indicator(
                oni, (power or {}).get("PRECTOTCORR")),
            "flood": flood_indicator(grid_cell, terr, note),
            "evaporation": evaporation_indicator(
                power, lat=p["_cent"][0], crop=p["crop"],
                shared_note=note),
            "infiltration": infiltration_indicator(grid_cell, terr,
                                                   note),
        }
        cinfo = KNOWLEDGE.crops.get(p["crop"])
        cname = ((cinfo.name or {}).get(lang)
                 if cinfo and cinfo.name else p["crop"])
        alerts = build_alerts(ind, p["crop"], cname or p["crop"],
                              needs, det_km, g["country"],
                              crop_obj=cinfo, zone=g["zone"])
        order, extra = compute_order(ind, alerts, profile)
        row = {"id": p["id"], "crop": p["crop"],
               "area_ha": round(p["_ha"], 1),
               "indicators": ind,
               "timeline": build_timeline(power, p["_cent"][0], lang),
               "alerts": alerts,
               "order": order, "extra": extra,
               "accuracy": accuracy_block(p["_cent"][0], p["_cent"][1],
                                          adj),
               "_geom": p["_geom"]}
        pe = profile["economics"].get("parcels", {}).get(p["id"])
        if pe is not None:
            econ = economics_block(
                pe, p["crop"], analog_cells.get(r5c), p["_ha"],
                ind, alerts)
            econ["currency"] = profile["economics"]["currency"]
            row["economics"] = econ
        out_parcels.append(row)

    zones = build_zones(out_parcels, detections, risk_zone_cells,
                        bare_zone_cells, (bgeom, clat))
    for p in out_parcels:
        p.pop("_geom", None)

    # ---- summary -------------------------------------------------------------
    payload = {
        "parcels": [{"crop": p["crop"],
                     "fire_pct": p["indicators"]["fire"]["pct"],
                     "fire_level": p["indicators"]["fire"]["level"],
                     "water_pct": p["indicators"]["water"]["pct"],
                     "water_level": p["indicators"]["water"]["level"],
                     "hot_days_over_threshold":
                     p["indicators"]["heat"]["days_over_35"],
                     "hot_threshold_c": 35,
                     "frost_free_days":
                     p["indicators"]["frost"]["frost_free_days"],
                     "snow_days_per_year":
                     p["indicators"]["snow"]["days_per_year"],
                     "enso_phase":
                     p["indicators"]["enso"]["phase_now"],
                     "margin_per_ha": (p.get("economics") or {})
                     .get("margin_per_ha"),
                     "alerts": [{"kind": a["kind"],
                                 "severity": a["severity"],
                                 "text": a["text"]}
                                for a in p["alerts"]]}
                    for p in out_parcels],
        "needs": needs, "fire_horizon_days": 7,
        "priorities": profile["priorities"],
        "enso_phase": (out_parcels[0]["indicators"]["enso"]
                       .get("phase_now") if out_parcels else None)}
    from ..services.ai_explain import parcels_summary
    summ = None
    try:
        summ = await parcels_summary(payload, lang)
    except Exception:
        summ = None
    if summ is None:
        summ = template_summary(out_parcels, nearby_res, lang,
                                profile["priorities"])
    else:
        summ["source"] = os.environ.get("AI_PROVIDER", "gemini")

    reasons = []
    if not any_power:
        reasons.append(DEGRADED_REASON)
    if nearby_res.get("degraded"):
        reasons.append("los servicios cercanos (OpenStreetMap) no "
                       "respondieron")
    if map_key and (fres is None or not fres[0]):
        reasons.append("las detecciones satelitales (FIRMS) no "
                       "respondieron")
    return JSONResponse({
        "parcels": out_parcels,
        "zones": zones,
        "nearby": nearby_res,
        "summary": summ,
        "sources": [
            {"id": "power",
             "text": "NASA POWER — clima diario 0,5°×0,625° (lluvia, "
                     "temperatura, humedad de raíz GWETROOT)"},
            {"id": "risk_model",
             "text": "Modelo de riesgo de fuego — probabilidad a "
                     "7 días por celda H3"},
            {"id": "firms",
             "text": "NASA FIRMS — detecciones activas VIIRS/MODIS "
                     "de las últimas 72 h"},
            {"id": "enso",
             "text": "NOAA CPC — índice ONI (El Niño / La Niña) y "
                     "efecto histórico sobre la lluvia de la zona"},
            {"id": "magyp",
             "text": "MAGyP — rindes departamentales por cultivo "
                     "cuando el productor no declara el propio"},
            {"id": "field_grid",
             "text": "Grilla de campo precalculada (IMERG lluvia, "
                     "SRTM elevación, cobertura de suelo)"},
            {"id": "osm",
             "text": "OpenStreetMap contributors — servicios "
                     "cercanos (bomberos, hospitales, agua)"}],
        "degraded": bool(reasons),
        "degraded_reason": "; ".join(reasons) or None,
    }, headers={"Cache-Control": "no-store"})

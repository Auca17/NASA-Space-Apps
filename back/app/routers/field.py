"""POST /api/field/diagnose — contract 4.2 (D16, D18, D23, D25)."""

import asyncio
import hashlib
import logging
import statistics
from datetime import date, timedelta

import h3
import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..cache import utc_today
from ..h3util import h3_r2, h3_r5, h3_r6
from ..services import field_sources as src
from ..services.geodesy import ring_area_ha, ring_centroid
from ..services.data import risk_shard

log = logging.getLogger("field")

router = APIRouter()

TIMEOUT = httpx.Timeout(6.0)
MIN_HA, MAX_HA = 0.5, 5_000.0
NDVI_BARE = 0.25          # NDVI below this counts as bare soil
POWER_RES = "0.5°×0.625°"
MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun",
             "jul", "ago", "sep", "oct", "nov", "dic"]


# ----------------------------------------------------------- validation -----

def _err(code: str, detail: str):
    return None, JSONResponse(status_code=400,
                              content={"error": code, "detail": detail})


def parse_plot(body: dict):
    """-> (centroid(lat,lon), area_ha, r5_list, r6_list, bbox|None) or 400."""
    polygon, point = body.get("polygon"), body.get("point")
    if bool(polygon) == bool(point):
        return _err("invalid_input", "send exactly one of 'polygon' or 'point'")

    if point is not None:
        try:
            lat, lon = float(point[0]), float(point[1])
        except (TypeError, IndexError, ValueError):
            return _err("invalid_point", "point must be [lat, lon]")
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return _err("invalid_point", "lat -90..90, lon -180..180")
        ha = body.get("ha", 50)
        try:
            ha = float(ha)
        except (TypeError, ValueError):
            return _err("invalid_input", "ha must be a number")
        if not (MIN_HA <= ha <= MAX_HA):
            return _err("invalid_input",
                        f"ha must be between {MIN_HA} and {MAX_HA}")
        return ((lat, lon), ha, [h3_r5(lat, lon)], [h3_r6(lat, lon)], None), None

    coords = (polygon or {}).get("coordinates") or []
    if not coords or not isinstance(coords[0], list):
        return _err("invalid_polygon", "polygon needs a coordinates ring")
    ring = [[float(p[0]), float(p[1])] for p in coords[0]
            if isinstance(p, (list, tuple)) and len(p) >= 2]
    if len(ring) >= 2 and ring[0] == ring[-1]:
        ring = ring[:-1]  # closed ring -> unclosed for h3
    elif len(ring) >= 2:
        return _err("invalid_polygon", "ring must be closed (first == last)")
    if not (3 <= len(ring) <= 500):
        return _err("invalid_polygon", "polygon needs 3..500 vertices")
    if any(not (-90 <= p[1] <= 90 and -180 <= p[0] <= 180) for p in ring):
        return _err("invalid_polygon", "vertex out of lat/lon range")
    area_ha = ring_area_ha(ring)
    if not (MIN_HA <= area_ha <= MAX_HA):
        return _err("invalid_polygon",
                    f"area must be between {MIN_HA} and {MAX_HA} ha "
                    f"(got {area_ha:.1f})")
    centroid = ring_centroid(ring)
    try:
        shape = h3.LatLngPoly([(p[1], p[0]) for p in ring])  # lat,lng
        r5 = sorted(h3.polygon_to_cells(shape, 5))
        r6 = sorted(h3.polygon_to_cells(shape, 6))
    except Exception:
        r5 = r6 = []
    # plots smaller than a cell contain no cell centre -> use centroid's cell
    r5 = r5 or [h3_r5(*centroid)]
    r6 = r6 or [h3_r6(*centroid)]
    lats, lons = [p[1] for p in ring], [p[0] for p in ring]
    bbox = (min(lons), min(lats), max(lons), max(lats))
    return (centroid, area_ha, r5, r6, bbox), None


# ----------------------------------------------------------- derivation -----

def _years(series: dict, min_days: int = 300):
    """Group daily values by year keeping only well-covered years."""
    by_year = {}
    for d, v in series.items():
        if v is not None:
            by_year.setdefault(d.year, []).append(v)
    return {y: vs for y, vs in by_year.items() if len(vs) >= min_days}


def _last_valid_day(series: dict) -> date | None:
    return max((d for d, v in series.items() if v is not None), default=None)


def rain_stats(series: dict):
    """Annual totals (mm) per covered year -> mean, cv, p25."""
    annual = {y: sum(vs) for y, vs in _years(series).items() if y <= 2025}
    if len(annual) < 5:
        return None
    vals = sorted(annual.values())
    mean = statistics.fmean(vals)
    cv = statistics.pstdev(vals) / mean if mean else None
    p25 = vals[int(0.25 * (len(vals) - 1))]
    return round(mean), round(cv, 2), round(p25)


def days_per_year(series: dict, cond, years=None):
    by = _years(series)
    if years:
        by = {y: v for y, v in by.items() if y in years}
    if not by:
        return None
    return round(statistics.fmean(
        sum(1 for v in vs if cond(v)) for vs in by.values()), 1)


def frost_free_window(series: dict):
    """Frost-free window, hemisphere-agnostic.

    The frost year starts on the first day of the climatologically coldest
    month (lowest median T2M_MIN), so winter sits mid-window: July in the
    south, January in the north. Within each frost year the last frost of
    the first half and the first frost of the second half bound the
    frost-free stretch. Labels are the calendar days just outside each
    bounding frost; the day count is the days strictly between them
    (frosts Jun 1 - Aug 31 -> 01/09 - 31/05, 273 days).
    """
    month_vals = {}
    for d, v in series.items():
        if v is not None:
            month_vals.setdefault(d.month, []).append(v)
    if len(month_vals) < 12:
        return None
    min_med = min(statistics.median(vs) for vs in month_vals.values())
    tied = [m for m, vs in month_vals.items()
            if statistics.median(vs) == min_med]
    if len(tied) > 1:
        # break ties toward the circular centre of the frost days
        import math
        ang = [2 * math.pi * d.timetuple().tm_yday / 365
               for d, v in series.items() if v is not None and v <= 0]
        center = math.degrees(math.atan2(
            statistics.fmean(math.sin(a) for a in ang),
            statistics.fmean(math.cos(a) for a in ang))) % 360 if ang else 0
        def dist(m):
            mc = (m - 1) * 30.4 + 15  # month centre doy
            return abs((mc - center + 180) % 360 - 180)
        cold = min(tied, key=dist)
    else:
        cold = tied[0]

    free_days, last_doys, first_doys = [], [], []
    no_frost = both = 0
    for y in sorted({d.year for d in series}):
        start = date(y, cold, 1)
        end = date(y + 1, cold, 1)
        days = [(d, v) for d, v in series.items() if start <= d < end]
        if sum(1 for _, v in days if v is not None) < 300:
            continue
        frosts = sorted(d for d, v in days if v is not None and v <= 0)
        spr = [d for d in frosts if (d - start).days < 184]
        aut = [d for d in frosts if (d - start).days >= 184]
        if not frosts:  # whole frost year frost-free
            no_frost += 1
            free_days.append(365)
        elif spr and aut:
            both += 1
            free_days.append((aut[0] - spr[-1]).days - 1)
            last_doys.append((spr[-1] + timedelta(days=1))
                             .timetuple().tm_yday)
            first_doys.append((aut[0] - timedelta(days=1))
                              .timetuple().tm_yday)
        elif spr:  # frost reached into the frost-free season's start only
            free_days.append((end - spr[-1]).days - 1)
            last_doys.append((spr[-1] + timedelta(days=1))
                             .timetuple().tm_yday)
        else:  # only an early-season frost
            free_days.append((aut[0] - start).days - 1)
            first_doys.append((aut[0] - timedelta(days=1))
                              .timetuple().tm_yday)
    if both < 3:
        return None

    def fmt(doy):
        d = date(2001, 1, 1) + timedelta(days=doy - 1)
        return f"{d.day:02d}/{d.month:02d}"
    return (fmt(int(statistics.median(last_doys or first_doys))),
            fmt(int(statistics.median(first_doys or last_doys))),
            int(statistics.median(free_days)), no_frost)


def monthly_frac(series: dict, cond) -> dict[int, float] | None:
    """Fraction of days per month (climatology) matching cond."""
    num, den = {}, {}
    for d, v in series.items():
        if v is None:
            continue
        den[d.month] = den.get(d.month, 0) + 1
        if cond(v):
            num[d.month] = num.get(d.month, 0) + 1
    if not den:
        return None
    return {m: num.get(m, 0) / n for m, n in den.items()}


def monthly_sum_clim(p_series, e_series) -> dict[int, float] | None:
    """Water balance ratio per month: mean monthly P / mean monthly ET."""
    months = {}
    for d, p in p_series.items():
        e = e_series.get(d)
        if p is not None and e is not None:
            months.setdefault(d.month, []).append((p, e))
    if not months:
        return None
    out = {}
    for m, pairs in months.items():
        sp = sum(p for p, _ in pairs)
        se = sum(e for _, e in pairs)
        out[m] = sp / se if se > 0 else 1.0
    return out


def burn_season_months(fire_cal: dict, r5: str):
    """Months with burn-season activity from the 52-week climatology."""
    cell = (fire_cal or {}).get("cells", {}).get(r5)
    clim = (cell or {}).get("clim")
    if not clim:
        return None, None
    by_month = [[] for _ in range(12)]
    for w, f in enumerate(clim):
        month = min(11, int(w * 12 / len(clim)))
        by_month[month].append(f)
    monthly = [statistics.fmean(vs) for vs in by_month]
    peak = max(monthly)
    active = {m + 1 for m, f in enumerate(monthly)
              if peak > 0 and f >= 0.5 * peak}
    return monthly, active


def recent_weather(series: dict):
    """Rain last 30/90 d vs 2003-2022 baseline + days since last rain >1 mm."""
    end = _last_valid_day(series)
    if end is None:
        return None
    def win(days):
        return sum(v for d, v in series.items()
                   if v is not None and 0 <= (end - d).days < days)
    def baseline(days):
        totals = []
        for y in range(2003, 2023):
            try:
                anchor = date(y, end.month, end.day)
            except ValueError:  # Feb 29 on non-leap years
                anchor = date(y, end.month, end.day - 1)
            totals.append(sum(v for d, v in series.items()
                              if v is not None
                              and 0 <= (anchor - d).days < days))
        return statistics.fmean(totals) if totals else None
    since = next(
        (i for i in range(3650)
         if (v := series.get(end - timedelta(days=i))) is not None and v > 1),
        None)
    return {"p30": round(win(30), 1), "b30": baseline(30),
            "p90": round(win(90), 1), "b90": baseline(90),
            "since": since}


# ---------------------------------------------------------------- cards -----

def _card(cid, value, unit, text, source, resolution, confidence):
    return {"id": cid, "value": value, "unit": unit, "text": text,
            "source": source, "resolution": resolution,
            "confidence": confidence}


def _null_card(cid, source, resolution):
    return _card(cid, None, None, "Sin datos disponibles",
                 source, resolution, "low")


def build_cards(power, soilg, slope, ndvi, grid_cell, fire_cal,
                risk_cell, r5):
    P = (power or {}).get
    cards = []

    rs = rain_stats(P("PRECTOTCORR") or {})
    cards.append(
        _card("rain", rs[0], "mm/año",
              f"{rs[0]} mm/año; 1 de cada 4 años < {rs[2]} mm",
              "NASA POWER", POWER_RES, "high")
        if rs else _null_card("rain", "NASA POWER", POWER_RES))

    heavy = days_per_year(P("PRECTOTCORR") or {}, lambda v: v > 50)
    cards.append(
        _card("heavy_rain", heavy, "días/año",
              f"{heavy:g} días/año con más de 50 mm",
              "NASA POWER", POWER_RES, "high")
        if heavy is not None
        else _null_card("heavy_rain", "NASA POWER", POWER_RES))

    fw = frost_free_window(P("T2M_MIN") or {})
    fw_text = f"Período libre de heladas: {fw[0]} – {fw[1]}" if fw else ""
    if fw and fw[3]:
        fw_text += f"; sin heladas en {fw[3]} años"
    cards.append(
        _card("frost", fw[2], "días", fw_text,
              "NASA POWER", POWER_RES, "high")
        if fw else
        _card("frost", None, None,
              "Sin heladas registradas en la serie"
              if P("T2M_MIN") else "Sin datos disponibles",
              "NASA POWER", POWER_RES,
              "high" if P("T2M_MIN") else "low"))

    hot = days_per_year(P("T2M_MAX") or {}, lambda v: v > 35)
    cards.append(
        _card("heat", hot, "días/año",
              f"{hot:g} días/año por encima de 35 °C",
              "NASA POWER", POWER_RES, "high")
        if hot is not None else _null_card("heat", "NASA POWER", POWER_RES))

    # soil_moisture: SMAP grid first (9 km), GWETROOT fallback (D25)
    sm = (grid_cell or {}).get("sm_anom_pct")
    if sm is not None:
        cards.append(_card("soil_moisture", sm, "%",
                           f"Hoy {abs(sm)} % "
                           f"{'bajo' if sm < 0 else 'sobre'} lo normal",
                           "SMAP L3", "9 km", "medium"))
    else:
        gw = P("GWETROOT") or {}
        last = _last_valid_day(gw)
        if last:
            v = round(gw[last] * 100)
            cards.append(_card("soil_moisture", v, "%",
                               f"Humedad de la zona de raíces: {v} %",
                               "NASA POWER (GWETROOT)", POWER_RES, "medium"))
        else:
            cards.append(_null_card("soil_moisture", "SMAP L3", "9 km"))

    et = P("EVPTRNS") or {}
    et_years = _years(et)
    if et_years:
        mean_et = statistics.fmean(
            statistics.fmean(vs) for vs in et_years.values())
        cards.append(_card("crop_water", round(mean_et, 1), "mm/día",
                           f"Demanda hídrica potencial: {mean_et:.1f} mm/día",
                           "NASA POWER (EVPTRNS)", POWER_RES, "medium"))
    else:
        cards.append(_null_card("crop_water", "NASA POWER", POWER_RES))

    if ndvi:
        bare = days_per_year({d: v for d, v in ndvi},
                             lambda v: v < NDVI_BARE)
        cards.append(_card("vigor_bare_soil", bare, "días/año",
                           f"{bare:g} días/año con suelo desnudo (NDVI<0.25)",
                           "MODIS MOD13Q1", "250 m", "medium")
                     if bare is not None else
                     _null_card("vigor_bare_soil", "MODIS MOD13Q1", "250 m"))
    else:
        cards.append(_null_card("vigor_bare_soil", "MODIS MOD13Q1", "250 m"))

    cards.append(
        _card("slope", slope, "%", f"Pendiente media: {slope:g} %",
              "AWS Terrain Tiles (SRTM)", "~30 m", "high")
        if slope is not None
        else _null_card("slope", "AWS Terrain Tiles (SRTM)", "~30 m"))

    if soilg:
        tex = texture_class(soilg)
        soc = soilg.get("soc")
        parts = [t for t in (tex, f"MO {soc:.1f} g/kg" if soc else None) if t]
        cards.append(_card("soil", round(soc, 1) if soc else None, "g/kg",
                           "; ".join(parts) or "Sin datos",
                           "ISRIC SoilGrids v2", "250 m", "medium"))
    else:
        cards.append(_null_card("soil", "ISRIC SoilGrids v2", "250 m"))

    gt = (grid_cell or {}).get("grace_trend")
    trend_txt = {"down": "descendente", "flat": "estable",
                 "up": "ascendente"}.get(gt or "", "")
    cards.append(
        _card("water_trend", gt, None,
              f"Agua subterránea: tendencia {trend_txt}",
              "GRACE-FO", "regional", "medium")
        if gt else _null_card("water_trend", "GRACE-FO", "regional"))

    monthly, active = burn_season_months(fire_cal, r5)
    cat = (risk_cell or {}).get("cat")
    if monthly is not None or cat:
        season = months_range_es(active) if active else "sin temporada marcada"
        text = f"Temporada de quemas: {season}"
        if cat:
            text += f"; riesgo 7 días: {cat}"
        cards.append(_card("fire", cat, None, text,
                           "Serie armonizada MODIS+VIIRS",
                           "H3 res 5 (~250 km²)", "high"))
    else:
        cards.append(_null_card("fire", "Serie armonizada MODIS+VIIRS",
                                "H3 res 5 (~250 km²)"))

    cards.append(fire_weather_card(power, _last_valid_day(
        P("PRECTOTCORR") or {})))

    rw = recent_weather(P("PRECTOTCORR") or {})
    if rw:
        text = (f"Últimos 30 días: {rw['p30']:g} mm "
                f"(media histórica {rw['b30']:.0f} mm); "
                f"última lluvia >1 mm hace {rw['since']} días"
                if rw["b30"] is not None and rw["since"] is not None else
                "Sin datos recientes")
        cards.append(_card("recent_weather", rw["since"], "días", text,
                           "NASA POWER", POWER_RES, "high"))
    else:
        cards.append(_null_card("recent_weather", "NASA POWER", POWER_RES))
    return cards, monthly


def texture_class(s: dict) -> str | None:
    clay, sand, silt = s.get("clay"), s.get("sand"), s.get("silt")
    if clay is None or sand is None or silt is None:
        return None
    if clay >= 40:
        return "Arcilloso"
    if sand >= 70:
        return "Arenoso"
    if silt >= 60:
        return "Franco-limoso"
    if clay >= 27:
        return "Franco-arcilloso"
    if sand >= 45:
        return "Franco-arenoso"
    return "Franco"


def months_range_es(active: set[int]) -> str:
    if not active:
        return "sin temporada marcada"
    ms = sorted(active)
    # shortest contiguous arc wrapping the year
    best, cur = [ms[0]], [ms[0]]
    for m in ms[1:]:
        cur = cur + [m] if m == cur[-1] + 1 else [m]
        if len(cur) > len(best):
            best = cur
    if len(best) == 1:
        return MONTHS_ES[best[0] - 1]
    return f"{MONTHS_ES[best[0] - 1]}–{MONTHS_ES[best[-1] - 1]}"


# --------------------------------------------------------------- calendar ---

def _lvl(frac, t1, t2, t3):
    return 3 if frac >= t3 else 2 if frac >= t2 else 1 if frac >= t1 else 0


def build_calendar(power, ndvi, monthly_burn):
    P = (power or {}).get
    rows = []

    if ndvi:
        num, den = {}, {}
        for d, v in ndvi:
            den[d.month] = den.get(d.month, 0) + 1
            if v < NDVI_BARE:
                num[d.month] = num.get(d.month, 0) + 1
        lv = [_lvl(num.get(m, 0) / den[m], .1, .3, .6) if m in den else 0
              for m in range(1, 13)]
    else:
        lv = [None] * 12
    rows.append({"id": "bare_soil", "label": "Suelo desnudo", "levels": lv})

    fr = monthly_frac(P("T2M_MIN") or {}, lambda v: v <= 0)
    rows.append({"id": "frost", "label": "Heladas",
                 "levels": [_lvl(fr.get(m, 0), .02, .1, .3)
                            for m in range(1, 13)] if fr else [None] * 12})

    wb = monthly_sum_clim(P("PRECTOTCORR") or {}, P("EVPTRNS") or {})
    rows.append({"id": "water_stress", "label": "Estrés hídrico",
                 "levels": [3 if wb.get(m, 1) < .5 else
                            2 if wb.get(m, 1) < .8 else
                            1 if wb.get(m, 1) < 1.0 else 0
                            for m in range(1, 13)] if wb else [None] * 12})

    ht = monthly_frac(P("T2M_MAX") or {}, lambda v: v > 35)
    rows.append({"id": "heat", "label": "Calor",
                 "levels": [_lvl(ht.get(m, 0), .02, .1, .25)
                            for m in range(1, 13)] if ht else [None] * 12})

    if monthly_burn:
        peak = max(monthly_burn)
        rows.append({"id": "burn_season", "label": "Temporada de quemas",
                     "levels": [_lvl(f / peak if peak else 0, .15, .4, .7)
                                for f in monthly_burn]})
    else:
        rows.append({"id": "burn_season", "label": "Temporada de quemas",
                     "levels": [None] * 12})

    return {"months": MONTHS_ES, "rows": rows,
            "scale": {"0": "sin exposición", "1": "baja",
                      "2": "media", "3": "alta"}}


def fire_weather_card(power, end: date | None):
    """Last 7 valid days: mean RH2M, max WS2M, max T2M_MAX + dry days.

    Level score (INTA harvest guidance: stop work at wind>40 km/h,
    T>35 °C, RH<30 %): +1 each for mean RH<30 %, max wind>11 m/s,
    max T>35 °C, >10 days since rain. 3+ alto, 2 moderado, else bajo.
    """
    P = (power or {}).get
    rh, ws, tx = P("RH2M") or {}, P("WS2M") or {}, P("T2M_MAX") or {}
    if end is None or not (rh or ws or tx):
        return _null_card("fire_weather", "NASA POWER", POWER_RES)
    week = [end - timedelta(days=i) for i in range(7)]
    def vals(s): return [s[d] for d in week if s.get(d) is not None]
    rhm = statistics.fmean(v) if (v := vals(rh)) else None
    wsm = max(vals(ws), default=None)
    txm = max(vals(tx), default=None)
    since = next(
        (i for i in range(365)
         if (v := (P("PRECTOTCORR") or {}).get(end - timedelta(days=i)))
         is not None and v > 1), None)
    score = sum([rhm is not None and rhm < 30,
                 wsm is not None and wsm > 11,
                 txm is not None and txm > 35,
                 since is not None and since > 10])
    level = "alto" if score >= 3 else "moderado" if score >= 2 else "bajo"
    parts = [f"HR media {rhm:.0f} %" if rhm is not None else None,
             f"viento máx {wsm:.1f} m/s" if wsm is not None else None,
             f"T máx {txm:.0f} °C" if txm is not None else None,
             f"{since} días sin lluvia" if since is not None else None]
    return _card("fire_weather", level, None,
                 "; ".join(p for p in parts if p),
                 "NASA POWER", POWER_RES, "high")


# -------------------------------------------------------------- endpoint ----

@router.post("/api/field/diagnose")
async def diagnose(request: Request):
    body = await request.json()
    parsed, err = parse_plot(body)
    if err:
        return err
    (clat, clon), area_ha, r5s, r6s, bbox = parsed
    r6c = r6s[0]
    r2 = h3_r2(clat, clon)
    r5c = r5s[0]

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        power, soilg, slope, ndvi, fire_cal, grid = await asyncio.gather(
            src.power_daily(client, clat, clon, r6c),
            src.soilgrids(client, clat, clon, r6c),
            src.terrain_slope(client, clat, clon, r6c, bbox),
            src.ornl_modis(client, "MOD13Q1", "250m_16_days_NDVI",
                           clat, clon, r6c, scale=1e-4),
            src.json_shard(clat, clon, f"fire/cal/{r2}.json",
                           r6c, "fire_cal"),
            src.json_shard(clat, clon, f"field/grid/{r2}.json",
                           r6c, "field_grid"),
            return_exceptions=True)

    def ok(v):
        return None if isinstance(v, Exception) else v
    power, soilg, slope, ndvi, fire_cal, grid = \
        map(ok, (power, soilg, slope, ndvi, fire_cal, grid))

    grid_cell = (grid or {}).get("cells", {}).get(r5c)
    try:
        risk = await risk_shard(r2)  # shares the 6 h cache with /api/risk
    except Exception:  # missing DATA_BASE_URL etc. -> fire card degrades, not 503
        risk = None
    risk_cell = (risk or {}).get("cells", {}).get(r5c)

    cards, monthly_burn = build_cards(power, soilg, slope, ndvi, grid_cell,
                                      fire_cal, risk_cell, r5c)
    calendar = build_calendar(power, ndvi, monthly_burn)
    dx = hashlib.sha256(
        (";".join(sorted(r6s)) + "|" + utc_today()).encode()).hexdigest()[:8]

    from ..services.measures import evaluate
    card_map = {c["id"]: c for c in cards}
    msr = evaluate({"cards": card_map,
                    "calendar": calendar["rows"],
                    "risk_cat": (risk_cell or {}).get("cat")})

    return JSONResponse(
        {"diagnosis_id": f"dx_{dx}", "area_ha": round(area_ha, 1),
         "centroid": [round(clat, 4), round(clon, 4)],
         "h3_r5": r5s, "h3_r6": r6s, "cards": cards, "calendar": calendar,
         **msr},
        headers={"Cache-Control": "no-store"})


# ----------------------------------------------------- rotations / explain -

ROTATIONS_ZONES = {"pampa_humeda", "nea", "noa", "cuyo", "patagonia",
                   "other"}


@router.post("/api/field/rotations")
async def rotations(request: Request):
    from ..services.rotations import run, PRIORITY_MAP
    body = await request.json()
    diag = body.get("diagnosis")
    if not isinstance(diag, dict) or not isinstance(diag.get("cards"), list):
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_input",
                     "detail": "diagnosis must be the full diagnose response"})
    zone = body.get("zone")
    if zone is not None and zone not in ROTATIONS_ZONES:
        return JSONResponse(status_code=400, content={
            "error": "invalid_input",
            "detail": f"zone must be one of {sorted(ROTATIONS_ZONES)}"})
    priorities = body.get("priorities") or {}
    if not isinstance(priorities, dict) or any(
            k not in PRIORITY_MAP or
            not isinstance(v, (int, float)) or not 0 <= v <= 5
            for k, v in priorities.items()):
        return JSONResponse(status_code=400, content={
            "error": "invalid_input",
            "detail": f"priorities keys: {sorted(PRIORITY_MAP)}, values 0-5"})
    constraints = body.get("constraints") or {}
    if not isinstance(constraints, dict):
        return JSONResponse(status_code=400, content={
            "error": "invalid_input",
            "detail": "constraints must be an object"})
    try:
        out = run(diag, body.get("current"), priorities, constraints, zone)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={
            "error": "invalid_input", "detail": str(exc)})
    return JSONResponse(out, headers={"Cache-Control": "no-store"})


@router.post("/api/field/explain")
async def explain(request: Request):
    from ..services.rotations import explain as explain_fn
    body = await request.json()
    if not isinstance(body, dict) or not isinstance(
            body.get("strategies"), list):
        return JSONResponse(status_code=400, content={
            "error": "invalid_input",
            "detail": "body must be the full rotations response"})
    return JSONResponse(explain_fn(body),
                        headers={"Cache-Control": "no-store"})

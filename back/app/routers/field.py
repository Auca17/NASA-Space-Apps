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
from ..h3util import h3_r5, h3_r6
from ..services import field_sources as src
from ..services.geodesy import ring_area_ha, ring_centroid
from ..services.data import risk_shard
from ..services.infiltration import (infiltration_class,
                                     infiltration_score)
from ..services.et0 import METHOD_LABEL, et0_series

log = logging.getLogger("field")

router = APIRouter()

TIMEOUT = httpx.Timeout(6.0)
DIAG_BUDGET = 8.0  # total wall-time for the whole diagnosis (task 23)
MIN_HA, MAX_HA = 0.5, 5_000.0
# total vertices over all rings (freehand pieces + holes)
MAX_VERTICES = 2_000
NDVI_BARE = 0.25          # NDVI below this counts as bare soil
POWER_RES = "0.5°×0.625°"
# Yearly-mean EVPTRNS energy flux below this (MJ/m2/day) is treated as
# masked/degraded: real land ET0 fluxes are ~2-15 MJ/m2/day.
EVPTRNS_MIN = 1.0
# Same for EVLAND (mm/day): a yearly mean below this (~365 mm/yr) is
# implausible for Argentina -- even Patagonian land evaporates more --
# and in practice flags POWER cells where the field is degraded.
EVLAND_MIN = 1.0
MONTH_FULL_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                 "julio", "agosto", "septiembre", "octubre", "noviembre",
                 "diciembre"]
MONTH_FULL_EN = ["January", "February", "March", "April", "May", "June",
                 "July", "August", "September", "October", "November",
                 "December"]
MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
             "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
# English for the Spanish values the cards carry (texture, risk, trend)
TEXTURE_EN = {"Arcilloso": "clay", "Arenoso": "sandy",
              "Franco-limoso": "silt loam", "Franco-arcilloso": "clay loam",
              "Franco-arenoso": "sandy loam", "Franco": "loam"}
CAT_EN = {"bajo": "low", "moderado": "moderate", "alto": "high",
          "muy_alto": "very high"}
MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun",
             "jul", "ago", "sep", "oct", "nov", "dic"]


# ----------------------------------------------------------- validation -----

def _err(code: str, detail: str):
    return None, JSONResponse(status_code=400,
                              content={"error": code, "detail": detail})


async def _json_body(request: Request):
    """Parsed JSON object body or a 400 (empty/malformed must not 500)."""
    try:
        body = await request.json()
    except Exception:
        return None, JSONResponse(
            status_code=400,
            content={"error": "invalid_input",
                     "detail": "body must be a JSON object"})
    if not isinstance(body, dict):
        return None, JSONResponse(
            status_code=400,
            content={"error": "invalid_input",
                     "detail": "body must be a JSON object"})
    return body, None


def _seg_intersect(a, b, c, d) -> bool:
    """Proper intersection of segments ab and cd (excl. shared endpoints)."""
    def orient(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    o1, o2 = orient(a, b, c), orient(a, b, d)
    o3, o4 = orient(c, d, a), orient(c, d, b)
    return ((o1 > 0) != (o2 > 0) and (o1 != 0 or o2 != 0)
            and (o3 > 0) != (o4 > 0) and (o3 != 0 or o4 != 0))


def _self_intersects(ring) -> bool:
    """True if any non-adjacent edges of the ring properly cross."""
    n = len(ring)
    edges = [(ring[i], ring[(i + 1) % n]) for i in range(n)]
    for i in range(n):
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue  # closing edge shares vertex 0 with edge 0
            if _seg_intersect(edges[i][0], edges[i][1],
                              edges[j][0], edges[j][1]):
                return True
    return False


def parse_plot(body: dict):
    """-> (centroid(lat,lon), area_ha, r5_list, r6_list, bbox|None) or 400."""
    polygon, point = body.get("polygon"), body.get("point")
    if bool(polygon) == bool(point):
        return _err("invalid_input", "send exactly one of 'polygon' or 'point'")

    if point is not None:
        try:
            lat, lon = float(point[0]), float(point[1])
        except (TypeError, IndexError, KeyError, ValueError):
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

    # Polygon: coordinates = [outer, hole...]; MultiPolygon: a list of
    # those. A single closed ring (the original contract) still works.
    kind = (polygon or {}).get("type") or "Polygon"
    coords = (polygon or {}).get("coordinates") or []
    if kind == "MultiPolygon":
        polys_raw = coords
    elif kind == "Polygon":
        polys_raw = [coords]
    else:
        return _err("invalid_polygon", "type must be Polygon or MultiPolygon")
    if not polys_raw or not all(
            isinstance(pr, list) and pr and isinstance(pr[0], list)
            and pr[0] and isinstance(pr[0][0], (list, tuple))
            for pr in polys_raw):
        return _err("invalid_polygon", "polygon needs a coordinates ring")

    polys: list[list[list[list[float]]]] = []  # [[outer, hole..], ..]
    n_vertices = 0
    for pr in polys_raw:
        rings = []
        for raw in pr:
            ring = [[float(q[0]), float(q[1])] for q in raw
                    if isinstance(q, (list, tuple)) and len(q) >= 2]
            if len(ring) >= 2 and ring[0] == ring[-1]:
                ring = ring[:-1]  # closed ring -> unclosed for h3
            elif len(ring) >= 2:
                return _err("invalid_polygon",
                            "ring must be closed (first == last)")
            if len(ring) < 3:
                return _err("invalid_polygon", "each ring needs 3+ vertices")
            if any(not (-90 <= q[1] <= 90 and -180 <= q[0] <= 180)
                   for q in ring):
                return _err("invalid_polygon", "vertex out of lat/lon range")
            n = len(ring)
            if any(abs(ring[(i + 1) % n][0] - ring[i][0]) > 180
                   for i in range(n)):
                return _err("invalid_polygon",
                            "polygon crosses the antimeridian, not supported")
            if _self_intersects(ring):
                return _err("invalid_polygon", "polygon self-intersects")
            n_vertices += len(ring)
            rings.append(ring)
        polys.append(rings)
    if n_vertices > MAX_VERTICES:
        return _err("invalid_polygon",
                    f"polygon needs at most {MAX_VERTICES} vertices")

    areas = [max(0.0, ring_area_ha(rs[0]) - sum(ring_area_ha(h)
                                               for h in rs[1:]))
             for rs in polys]
    area_ha = sum(areas)
    if not (MIN_HA <= area_ha <= MAX_HA):
        return _err("invalid_polygon",
                    f"area must be between {MIN_HA} and {MAX_HA} ha "
                    f"(got {area_ha:.1f})")
    # area-weighted centroid of the pieces (vertex mean inside each)
    cents = [ring_centroid(rs[0]) for rs in polys]
    w = area_ha or 1.0
    centroid = (sum(c[0] * a for c, a in zip(cents, areas)) / w,
                sum(c[1] * a for c, a in zip(cents, areas)) / w)
    try:
        shape = h3.LatLngMultiPoly(*[
            h3.LatLngPoly(*[[(q[1], q[0]) for q in r] for r in rs])
            for rs in polys])
        r5 = sorted(h3.polygon_to_cells(shape, 5))
        r6 = sorted(h3.polygon_to_cells(shape, 6))
    except Exception:
        r5 = r6 = []
    # plots smaller than a cell contain no cell centre -> use centroid's cell
    r5 = r5 or [h3_r5(*centroid)]
    r6 = r6 or [h3_r6(*centroid)]
    outer = [q for rs in polys for q in rs[0]]
    lats, lons = [q[1] for q in outer], [q[0] for q in outer]
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


def rain_monthly_mm(series: dict) -> list[float] | None:
    """Mean mm per calendar month, 2001 -> last fully-covered year."""
    end = _last_valid_day(series)
    if end is None:
        return None
    last_full = end.year if (end.month, end.day) >= (12, 31) \
        else end.year - 1
    years = [y for y in _years(series) if 2001 <= y <= last_full]
    if not years:
        return None
    sums = {}
    for d, v in series.items():
        if v is not None and d.year in set(years):
            sums[(d.year, d.month)] = sums.get((d.year, d.month), 0) + v
    out = []
    for m in range(1, 13):
        vals = [sums[(y, m)] for y in years if (y, m) in sums]
        if not vals:
            return None
        out.append(round(statistics.fmean(vals), 1))
    return out


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


def monthly_sum_clim(p_series, e_series) -> dict[int, dict] | None:
    """Water balance per month: mean monthly rain and evaporation in
    mm, their ratio and the rain - evaporation difference in mm.

    `e_series` must be in mm/day (POWER EVLAND), the same units as
    PRECTOTCORR, so the difference is a real mm water balance."""
    months = {}
    years = set()
    for d, p in p_series.items():
        e = e_series.get(d)
        if p is not None and e is not None:
            months.setdefault(d.month, []).append((p, e))
            years.add(d.year)
    if not months or not years:
        return None
    ny = len(years)
    out = {}
    for m, pairs in months.items():
        sp = sum(p for p, _ in pairs) / ny
        se = sum(e for _, e in pairs) / ny
        out[m] = {"p_mm": round(sp, 1), "e_mm": round(se, 1),
                  "balance_mm": round(sp - se, 1),
                  "ratio": sp / se if se > 0 else 1.0}
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

def _card(cid, value, unit, text, source, resolution, confidence,
          text_en=None):
    """`text` stays Spanish (the rotations/measures engines parse it);
    `text_en` is the English rendering for the front."""
    return {"id": cid, "value": value, "unit": unit, "text": text,
            "text_en": text_en or text,
            "source": source, "resolution": resolution,
            "confidence": confidence}


def _null_card(cid, source, resolution):
    return _card(cid, None, None, "Sin datos disponibles",
                 source, resolution, "low", "No data available")


def _texture_en(tex: str | None) -> str | None:
    return TEXTURE_EN.get(tex, tex) if tex else tex


LAPSE_C_PER_M = 0.0065  # 6.5 °C per km
MIN_ELEV_DIFF_M = 100


def temp_adjust_for(plot_elev_m, cell_elev_m) -> float:
    """Lapse-rate correction added to POWER temps (task 20).

    Negative elevations are not trusted: terrain tiles encode ocean
    bathymetry, so a sub-zero "elevation" would manufacture a huge
    warming correction (observed: -4 290 m -> +27.9 °C)."""
    if plot_elev_m is None or cell_elev_m is None:
        return 0.0
    if plot_elev_m < 0 or cell_elev_m < 0:
        return 0.0
    if abs(plot_elev_m - cell_elev_m) < MIN_ELEV_DIFF_M:
        return 0.0
    return round(-LAPSE_C_PER_M * (plot_elev_m - cell_elev_m), 1)


def _fmt_es(v, dec=1):
    """Locale-ish number: 1150 -> '1.150', 8.7 -> '8,7'."""
    if v is None:
        return "?"
    s = f"{v:,.{dec}f}" if dec else f"{v:,}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def build_cards(power, soilg, slope, ndvi, grid_cell, fire_cal,
                risk_cell, r5, adj=None, zone=None):
    P = (power or {}).get
    cards = []

    rs = rain_stats(P("PRECTOTCORR") or {})
    gc = grid_cell or {}
    imerg = "IMERG" in str(((gc.get("src") or {}).get("rain_mm_yr") or {})
                         .get("dataset", ""))
    if imerg and gc.get("rain_mm_yr") is not None:
        rain = gc["rain_mm_yr"]
        p25 = gc.get("rain_p25_mm")
        rain_card = _card(
            "rain", rain, "mm/año",
            f"{_fmt_es(rain, 0)} mm/año"
            + (f"; 1 de cada 4 años < {_fmt_es(p25, 0)} mm" if p25 else ""),
            "GPM IMERG", "0,1°", "high")
        rm = rain_monthly_mm(P("PRECTOTCORR") or {})
        if rm:
            rain_card["rain_monthly_mm"] = rm
        cards.append(rain_card)
    elif rs:
        rain_card = _card("rain", rs[0], "mm/año",
                          f"{rs[0]} mm/año; 1 de cada 4 años < {rs[2]} mm",
                          "NASA POWER", POWER_RES, "high",
                          f"{rs[0]} mm/yr; 1 year in 4 below {rs[2]} mm")
        rm = rain_monthly_mm(P("PRECTOTCORR") or {})
        if rm:
            rain_card["rain_monthly_mm"] = rm
        cards.append(rain_card)
    else:
        cards.append(_null_card("rain", "NASA POWER", POWER_RES))

    heavy = days_per_year(P("PRECTOTCORR") or {}, lambda v: v > 50)
    cards.append(
        _card("heavy_rain", heavy, "días/año",
              f"{heavy:g} días/año con más de 50 mm",
              "NASA POWER", POWER_RES, "high",
              f"{heavy:g} days/yr with more than 50 mm")
        if heavy is not None
        else _null_card("heavy_rain", "NASA POWER", POWER_RES))

    fw = frost_free_window(P("T2M_MIN") or {})
    fw_text = f"Período libre de heladas: {fw[0]} – {fw[1]}" if fw else ""
    fw_en = f"Frost-free period: {fw[0]} – {fw[1]}" if fw else ""
    if fw and fw[3]:
        fw_text += f"; sin heladas en {fw[3]} años"
        fw_en += f"; no frost in {fw[3]} years"
    cards.append(
        _card("frost", fw[2], "días", fw_text,
              "NASA POWER", POWER_RES, "high", fw_en)
        if fw else
        _card("frost", None, None,
              "Sin heladas registradas en la serie"
              if P("T2M_MIN") else "Sin datos disponibles",
              "NASA POWER", POWER_RES,
              "high" if P("T2M_MIN") else "low",
              "No frost recorded in the series"
              if P("T2M_MIN") else "No data available"))

    hot = days_per_year(P("T2M_MAX") or {}, lambda v: v > 35)
    cards.append(
        _card("heat", hot, "días/año",
              f"{hot:g} días/año por encima de 35 °C",
              "NASA POWER", POWER_RES, "high",
              f"{hot:g} days/yr above 35 °C")
        if hot is not None else _null_card("heat", "NASA POWER", POWER_RES))

    # elevation transparency (task 20): note on temp cards + confidence cap
    if adj and adj.get("temp_adjust_c"):
        sign = "+" if adj["temp_adjust_c"] > 0 else ""
        note = (f"Temperatura corregida por altura: lote a "
                f"{_fmt_es(adj['elevation_m'], 0)} m, celda de NASA POWER a "
                f"{_fmt_es(adj['power_cell_elevation_m'], 0)} m, ajuste "
                f"{sign}{_fmt_es(adj['temp_adjust_c'], 1)} °C")
        for c in cards:
            if c["id"] in ("frost", "heat"):
                c["source"] = f"{c['source']} · {note}"
                if abs(adj["temp_adjust_c"]) >= 3:
                    c["confidence"] = "medium"

    # soil_moisture: SMAP grid first (9 km), GWETROOT fallback (D25)
    sm = (grid_cell or {}).get("sm_anom_pct")
    if sm is not None:
        sm_days = (grid_cell or {}).get("sm_valid_days") or 0
        cards.append(_card("soil_moisture", sm, "%",
                           f"Hoy {abs(sm)} % "
                           f"{'bajo' if sm < 0 else 'sobre'} lo normal",
                           "SMAP L3", "9 km", "high" if sm_days >= 20 else "low",
                           f"Today {abs(sm)} % "
                           f"{'below' if sm < 0 else 'above'} normal"))
    else:
        gw = P("GWETROOT") or {}
        last = _last_valid_day(gw)
        if last:
            v = round(gw[last] * 100)
            cards.append(_card("soil_moisture", v, "%",
                               f"Humedad de la zona de raíces: {v} %",
                               "NASA POWER (GWETROOT)", POWER_RES, "medium",
                               f"Root-zone moisture: {v} %"))
        else:
            cards.append(_null_card("soil_moisture", "SMAP L3", "9 km"))

    # EVPTRNS is an evapotranspiration ENERGY flux (MJ/m^2/day per the
    # POWER catalogue), not a mm depth: convert with the FAO-56 latent
    # heat of vaporization ~2.45 MJ/kg so the card stays in mm/day.
    # When POWER returns it masked or empty (e.g. Valle de Uco), fall
    # back to a computed FAO-56 ET0 series and say so in `source`.
    et = P("EVPTRNS") or {}
    et_years = _years(et)
    # EVPTRNS sometimes comes back not missing but *masked*: e.g. the
    # Valle de Uco cell returns a mean of 0.05 MJ/m2/day, an order of
    # magnitude below any plausible ET0 energy flux. Treat a yearly
    # mean under EVPTRNS_MIN as unusable and fall back to ET0.
    et_suspect = et_years and statistics.fmean(
        statistics.fmean(vs) for vs in et_years.values()) < EVPTRNS_MIN
    et0, et0_method = (None, None)
    if (not et_years or et_suspect) and adj.get("lat") is not None:
        et0, et0_method = et0_series(
            power, adj["lat"], adj.get("elevation_m") or 0.0)
    if et_years and not et_suspect:
        mean_et = statistics.fmean(
            statistics.fmean(vs) for vs in et_years.values()) / 2.45
        cards.append(_card("crop_water", round(mean_et, 1), "mm/día",
                           f"Demanda hídrica potencial: {mean_et:.1f} mm/día",
                           "NASA POWER (EVPTRNS, MJ/m²/día ÷ 2,45)",
                           POWER_RES, "medium",
                           f"Potential water demand: {mean_et:.1f} mm/day"))
    elif et0:
        mean_et = statistics.fmean(et0.values())
        cards.append(_card("crop_water", round(mean_et, 1), "mm/día",
                           f"Demanda hídrica potencial: {mean_et:.1f} mm/día",
                           METHOD_LABEL[et0_method],
                           POWER_RES, "medium",
                           f"Potential water demand (ET0 {et0_method}): "
                           f"{mean_et:.1f} mm/day"))
    else:
        cards.append(_null_card("crop_water", "NASA POWER", POWER_RES))

    # EVLAND is evaporation over land, mm/day (POWER catalogue). When
    # POWER returns it masked/empty, fall back to the same computed
    # FAO-56 ET0 series used by crop_water (ET0 is a reference estimate,
    # not a direct evaporation measurement — the basis says so).
    ev = P("EVLAND") or {}
    ev_years = _years(ev)
    # Same masked-data guard as EVPTRNS: a yearly mean under
    # EVLAND_MIN mm/day is implausible for land with rain ~350 mm/yr
    # and almost always means POWER returned a degraded field.
    ev_suspect = ev_years and statistics.fmean(
        statistics.fmean(vs) for vs in ev_years.values()) < EVLAND_MIN
    if (not ev_years or ev_suspect) and et0 is None \
            and adj.get("lat") is not None:
        et0, et0_method = et0_series(
            power, adj["lat"], adj.get("elevation_m") or 0.0)
    if ev_years and not ev_suspect:
        annual_ev = statistics.fmean(
            sum(v for v in vs if v is not None)
            for vs in ev_years.values())
        card = _card("evaporation", round(annual_ev), "mm/año",
                     f"El suelo y las plantas pierden al aire unos "
                     f"{_fmt_es(annual_ev, 0)} mm de agua por año",
                     "NASA POWER (EVLAND)", POWER_RES, "medium",
                     f"Soil and plants lose ~{round(annual_ev)} mm of "
                     "water to the air per year")
        card["monthly_mm"] = rain_monthly_mm(ev)
        wb = monthly_sum_clim(P("PRECTOTCORR") or {}, ev)
        card["balance_mm"] = ({m: v["balance_mm"] for m, v in wb.items()}
                              if wb else None)
        cards.append(card)
    elif et0:
        ev_y = _years(et0)
        annual_ev = statistics.fmean(
            sum(v for v in vs if v is not None)
            for vs in ev_y.values())
        card = _card("evaporation", round(annual_ev), "mm/año",
                     f"El suelo y las plantas pierden al aire unos "
                     f"{_fmt_es(annual_ev, 0)} mm de agua por año "
                     "(estimación ET0, no medida directa)",
                     METHOD_LABEL[et0_method], POWER_RES, "medium",
                     f"Soil and plants lose ~{round(annual_ev)} mm of "
                     "water to the air per year (ET0 estimate)")
        card["monthly_mm"] = rain_monthly_mm(et0)
        wb = monthly_sum_clim(P("PRECTOTCORR") or {}, et0)
        card["balance_mm"] = ({m: v["balance_mm"] for m, v in wb.items()}
                              if wb else None)
        cards.append(card)
    else:
        cards.append(_null_card("evaporation",
                                "NASA POWER (EVLAND)", POWER_RES))

    grid_bare = (grid_cell or {}).get("bare_soil_days_yr")
    if ndvi:
        bare = days_per_year({d: v for d, v in ndvi},
                             lambda v: v < NDVI_BARE)
        cards.append(_card("vigor_bare_soil", bare, "días/año",
                           f"{bare:g} días/año con suelo desnudo (NDVI<0.25)",
                           "MODIS MOD13Q1", "250 m", "medium",
                           f"{bare:g} days/yr with bare ground (NDVI<0.25)")
                     if bare is not None else
                     _null_card("vigor_bare_soil", "MODIS MOD13Q1", "250 m"))
    elif grid_bare is not None:
        cards.append(_card(
            "vigor_bare_soil", grid_bare, "días/año",
            f"~{grid_bare:g} días/año con suelo desnudo "
            "(NDVI mensual <0.2, precalculado)",
            "MODIS MOD13C2 (field/grid)", "0.05°", "low",
            f"~{grid_bare:g} days/yr with bare ground "
            "(monthly NDVI <0.2, precomputed)"))
    else:
        cards.append(_null_card("vigor_bare_soil", "MODIS MOD13Q1", "250 m"))

    cards.append(
        _card("slope", slope, "%", f"Pendiente media: {slope:g} %",
              "AWS Terrain Tiles (SRTM)", "~30 m", "high",
              f"Average slope: {slope:g} %")
        if slope is not None
        else _null_card("slope", "AWS Terrain Tiles (SRTM)", "~30 m"))

    grid_soil = (grid_cell or {}).get("soil") or {}
    if soilg:
        tex = texture_class(soilg)
        soc = soilg.get("soc")
        parts = [t for t in (tex, f"MO {soc:.1f} g/kg" if soc else None) if t]
        parts_en = [t for t in (_texture_en(tex),
                                f"OM {soc:.1f} g/kg" if soc else None) if t]
        cards.append(_card("soil", round(soc, 1) if soc else None, "g/kg",
                           "; ".join(parts) or "Sin datos",
                           "ISRIC SoilGrids v2", "250 m", "medium",
                           "; ".join(parts_en) or "No data"))
    elif grid_soil.get("texture") or grid_soil.get("soc_g_kg") is not None:
        soc = grid_soil.get("soc_g_kg")
        parts = [t for t in (grid_soil.get("texture"),
                             f"MO {soc:.1f} g/kg" if soc else None) if t]
        parts_en = [t for t in (_texture_en(grid_soil.get("texture")),
                                f"OM {soc:.1f} g/kg" if soc else None) if t]
        cards.append(_card("soil", soc, "g/kg",
                           "; ".join(parts) or "Sin datos",
                           "ISRIC SoilGrids v2 (field/grid)", "250 m",
                           "medium", "; ".join(parts_en) or "No data"))
    else:
        cards.append(_null_card("soil", "ISRIC SoilGrids v2", "250 m"))

    bare_days = None
    if ndvi:
        bare_days = days_per_year({d: v for d, v in ndvi},
                                  lambda v: v < NDVI_BARE)
    if bare_days is None:
        bare_days = grid_bare
    inf_score = infiltration_score(
        texture_class(soilg) if soilg else grid_soil.get("texture"),
        (soilg or {}).get("soc") if soilg else grid_soil.get("soc_g_kg"),
        slope, bare_days)
    if inf_score is not None:
        icls = infiltration_class(inf_score)
        cards.append(_card(
            "infiltration", inf_score, "0-100",
            f"Infiltración {icls}: cuánta agua de lluvia entra al suelo "
            "en vez de escurrir",
            "SoilGrids textura+MO, pendiente SRTM y suelo desnudo "
            "(fórmula en knowledge/README)", "~250 m", "low",
            f"{icls} infiltration: how much rain soaks in instead of "
            "running off"))
    else:
        cards.append(_null_card("infiltration", "SoilGrids + SRTM",
                                "~250 m"))

    gt = (grid_cell or {}).get("grace_trend")
    trend_txt = {"down": "descendente", "flat": "estable",
                 "up": "ascendente"}.get(gt or "", "")
    cards.append(
        _card("water_trend", gt, None,
              f"Agua subterránea: tendencia {trend_txt}",
              "GRACE-FO", "regional", "medium",
              "Groundwater: " + {"down": "falling", "flat": "stable",
                                 "up": "rising"}.get(gt or "", "")
              + " trend")
        if gt else _null_card("water_trend", "GRACE-FO", "regional"))

    monthly, active = burn_season_months(fire_cal, r5)
    cat = (risk_cell or {}).get("cat")
    if monthly is not None or cat:
        season = months_range_es(active) if active else "sin temporada marcada"
        text = f"Temporada de quemas: {season}"
        text_en = "Burning season: " + (
            months_range(active, MONTHS_EN) if active
            else "no marked season")
        if cat:
            text += f"; riesgo 7 días: {cat}"
            text_en += f"; 7-day risk: {CAT_EN.get(cat, cat)}"
        cards.append(_card("fire", cat, None, text,
                           "Serie armonizada MODIS+VIIRS",
                           "H3 res 5 (~250 km²)", "high", text_en))
    else:
        cards.append(_null_card("fire", "Serie armonizada MODIS+VIIRS",
                                "H3 res 5 (~250 km²)"))

    cards.append(fire_weather_card(power, _last_valid_day(
        P("PRECTOTCORR") or {}), zone=zone))

    rw = recent_weather(P("PRECTOTCORR") or {})
    if rw:
        full = rw["b30"] is not None and rw["since"] is not None
        text = (f"Últimos 30 días: {rw['p30']:g} mm "
                f"(media histórica {rw['b30']:.0f} mm); "
                f"última lluvia >1 mm hace {rw['since']} días"
                if full else "Sin datos recientes")
        text_en = (f"Last 30 days: {rw['p30']:g} mm "
                   f"(long-term mean {rw['b30']:.0f} mm); "
                   f"last rain >1 mm {rw['since']} days ago"
                   if full else "No recent data")
        cards.append(_card("recent_weather", rw["since"], "días", text,
                           "NASA POWER", POWER_RES, "high", text_en))
    else:
        cards.append(_null_card("recent_weather", "NASA POWER", POWER_RES))
    return cards, monthly


DEGRADED_SRC = ("Dato precalculado (NASA POWER, 0,5°) porque el "
                "servicio no respondió")
DEGRADED_REASON = ("El servicio de datos del clima no respondió; "
                   "probá de nuevo en un minuto")


def _grid_ff_days(ff: dict | None):
    """frost_free {"start","end"} MM-DD -> free days between them."""
    if not ff:
        return None
    try:
        a = date(2001, int(ff["start"][:2]), int(ff["start"][3:]))
        b = date(2001, int(ff["end"][:2]), int(ff["end"][3:]))
        return (b - a).days % 365
    except (KeyError, ValueError):
        return None


def _unavailable(cid):
    return _card(cid, None, None,
                 "No disponible ahora: el servicio del clima no "
                 "respondió", "NASA POWER", POWER_RES, "low")


def degraded_cards(grid_cell, terr, soilg, fire_cal, risk_cell, r5):
    """Cards built from the precomputed field/grid cell when the POWER
    daily series is unavailable (task 23). Everything capped at
    confidence medium; series-only cards say unavailable."""
    cards, gc = [], (grid_cell or {})

    rain = gc.get("rain_mm_yr")
    p25 = gc.get("rain_p25_mm")
    imerg = "IMERG" in str(((gc.get("src") or {}).get("rain_mm_yr") or {})
                         .get("dataset", ""))
    rain_src = ("Dato precalculado (GPM IMERG 0,1°) porque el servicio "
                "no respondió" if imerg else DEGRADED_SRC)
    cards.append(
        _card("rain", rain, "mm/año",
              f"{rain} mm/año"
              + (f"; 1 de cada 4 años < {p25} mm" if p25 else ""),
              rain_src, POWER_RES, "medium")
        if rain is not None else _unavailable("rain"))

    heavy = gc.get("heavy_days_yr")
    cards.append(
        _card("heavy_rain", heavy, "días/año",
              f"{heavy:g} días/año con más de 50 mm",
              DEGRADED_SRC, POWER_RES, "medium")
        if heavy is not None else _unavailable("heavy_rain"))

    ff = gc.get("frost_free")
    days = _grid_ff_days(ff)
    if ff and days is not None:
        sm, sd = ff["start"].split("-")
        em, ed = ff["end"].split("-")
        cards.append(_card(
            "frost", days, "días",
            f"Período libre de heladas: {sd}/{sm} – {ed}/{em}",
            DEGRADED_SRC, POWER_RES, "medium"))
    else:
        cards.append(_unavailable("frost"))

    hot = gc.get("hot_days_gt35")
    cards.append(
        _card("heat", hot, "días/año",
              f"{hot:g} días/año por encima de 35 °C",
              DEGRADED_SRC, POWER_RES, "medium")
        if hot is not None else _unavailable("heat"))

    sm = gc.get("sm_anom_pct")
    if sm is not None:
        cards.append(_card("soil_moisture", sm, "%",
                           f"Última lectura {abs(sm)} % "
                           f"{'bajo' if sm < 0 else 'sobre'} lo normal",
                           "SMAP L3 (precalculado)", "9 km", "low"))
    else:
        cards.append(_unavailable("soil_moisture"))

    cards.append(_unavailable("crop_water"))
    cards.append(_unavailable("evaporation"))

    bare = gc.get("bare_soil_days_yr")
    cards.append(
        _card("vigor_bare_soil", bare, "días/año",
              f"~{bare:g} días/año con suelo desnudo (precalculado)",
              "MODIS MOD13C2 (field/grid)", "0.05°", "low")
        if bare is not None else _unavailable("vigor_bare_soil"))

    slope = (terr or {}).get("slope")
    cards.append(
        _card("slope", slope, "%", f"Pendiente media: {slope:g} %",
              "AWS Terrain Tiles (SRTM)", "~30 m", "high")
        if slope is not None
        else _null_card("slope", "AWS Terrain Tiles (SRTM)", "~30 m"))

    gsoil = gc.get("soil") or {}
    if soilg:
        tex = texture_class(soilg)
        soc = soilg.get("soc")
        parts = [t for t in (tex, f"MO {soc:.1f} g/kg" if soc else None)
                 if t]
        cards.append(_card("soil", round(soc, 1) if soc else None,
                           "g/kg", "; ".join(parts) or "Sin datos",
                           "ISRIC SoilGrids v2", "250 m", "medium"))
    elif gsoil.get("texture") or gsoil.get("soc_g_kg") is not None:
        soc = gsoil.get("soc_g_kg")
        parts = [t for t in (gsoil.get("texture"),
                             f"MO {soc:.1f} g/kg" if soc else None) if t]
        cards.append(_card("soil", soc, "g/kg",
                           "; ".join(parts) or "Sin datos",
                           "ISRIC SoilGrids v2 (field/grid)", "250 m",
                           "medium"))
    else:
        cards.append(_null_card("soil", "ISRIC SoilGrids v2", "250 m"))

    gt = gc.get("grace_trend")
    trend_txt = {"down": "descendente", "flat": "estable",
                 "up": "ascendente"}.get(gt or "", "")
    cards.append(
        _card("water_trend", gt, None,
              f"Agua subterránea: tendencia {trend_txt}",
              "GRACE-FO (precalculado)", "regional", "low")
        if gt else _unavailable("water_trend"))

    monthly, active = burn_season_months(fire_cal, r5)
    cat = (risk_cell or {}).get("cat")
    if monthly is not None or cat:
        season = months_range_es(active) if active else \
            "sin temporada marcada"
        text = f"Temporada de quemas: {season}"
        if cat:
            text += f"; riesgo 7 días: {cat}"
        cards.append(_card("fire", cat, None, text,
                           "Serie armonizada MODIS+VIIRS",
                           "H3 res 5 (~250 km²)", "high"))
    else:
        cards.append(_null_card("fire", "Serie armonizada MODIS+VIIRS",
                                "H3 res 5 (~250 km²)"))

    cards.append(_unavailable("fire_weather"))
    cards.append(_unavailable("recent_weather"))
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
    return months_range(active, MONTHS_ES) if active \
        else "sin temporada marcada"


def months_range(active: set[int], names: list[str]) -> str:
    ms = sorted(active)
    # shortest contiguous arc wrapping the year
    best, cur = [ms[0]], [ms[0]]
    for m in ms[1:]:
        cur = cur + [m] if m == cur[-1] + 1 else [m]
        if len(cur) > len(best):
            best = cur
    if len(best) == 1:
        return names[best[0] - 1]
    return f"{names[best[0] - 1]}–{names[best[-1] - 1]}"


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

    wb = monthly_sum_clim(P("PRECTOTCORR") or {}, P("EVLAND") or {})
    rows.append({"id": "water_stress", "label": "Estrés hídrico",
                 "levels": [3 if wb.get(m, {}).get("ratio", 1) < .5 else
                            2 if wb.get(m, {}).get("ratio", 1) < .8 else
                            1 if wb.get(m, {}).get("ratio", 1) < 1.0
                            else 0
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


def _stop_conditions(power, end: date, n_days: int = 3,
                     zone: str | None = None):
    """Spanish (conds, detail); see `_stop_conditions_full`."""
    conds, detail, _ = _stop_conditions_full(power, end, n_days, zone=zone)
    return conds, detail


def _stop_conditions_full(power, end: date, n_days: int = 3,
                     zone: str | None = None):
    """Regional single-condition harvest stop rules over the last n days.

    Thresholds come from `stop_thresholds` in knowledge/measures.json,
    keyed by the plot zone — the guides disagree by region: NEA/NOA use
    the INTA Chaco guide (T > 30 °C, RH < 30 %, mean wind > 35 km/h);
    the other zones and the default use INTA Balcarce + Bomberos de
    Tandil (wind > 40 km/h, T > 35 °C, RH < 30 %, humidity threshold
    still unconfirmed there). Any one condition alone stops work.
    """
    from ..services.knowledge import stop_thresholds_for
    th = stop_thresholds_for(zone)
    wind_kmh = th.wind_gt_kmh if th else 40.0
    temp_c = th.temp_gt_c if th else 35.0
    rh_pct = th.rh_lt_pct if th else 30.0
    guide = th.guide if th else "INTA / UIB Balcarce + Bomberos de Tandil"
    rh_note = (", umbral por confirmar con INTA"
               if th is None or th.rh_unconfirmed else "")
    confirm = "confirmá con Bomberos locales si corresponde suspender"
    P = (power or {}).get
    rh, ws, tx = P("RH2M") or {}, P("WS2M") or {}, P("T2M_MAX") or {}
    checks = (
        ("wind_gt_40kmh", ws, lambda v: v > wind_kmh / 3.6,
         lambda v: f"viento {v:.1f} m/s (>{wind_kmh:g} km/h, {guide})",
         lambda v: f"wind {v:.1f} m/s (>{wind_kmh:g} km/h, {guide})"),
        ("temp_gt_35", tx, lambda v: v > temp_c,
         lambda v: f"{v:.0f} °C (>{temp_c:g} °C, {guide})",
         lambda v: f"{v:.0f} °C (>{temp_c:g} °C, {guide})"),
        ("rh_lt_30", rh, lambda v: v < rh_pct,
         lambda v: f"humedad {v:.0f} % (<{rh_pct:g} %{rh_note}, {guide})",
         lambda v: f"humidity {v:.0f} % (<{rh_pct:g} %"
                   + (", threshold pending INTA confirmation" if rh_note else "")
                   + f", {guide})"),
    )
    conds, detail = [], {}
    detail_en = {}
    for name, series, pred, fmt, fmt_en in checks:
        # most recent day the condition was met inside the window;
        # only the last valid day raises the alert, earlier days are
        # context with dated, age-aware wording
        for i in range(n_days):
            d = end - timedelta(days=i)
            v = series.get(d)
            if v is None or not pred(v):
                continue
            day = f"{d.day} de {MONTH_FULL_ES[d.month - 1]}"
            detail[name] = ((f"hay {fmt(v)} el {day}" if i == 0 else
                             f"hubo {fmt(v)} el {day} (hace {i} días)")
                            + f"; {confirm}")
            day_en = f"{MONTH_FULL_EN[d.month - 1]} {d.day}"
            detail_en[name] = (
                f"{fmt_en(v)} on {day_en}" if i == 0 else
                f"{fmt_en(v)} on {day_en} ({i} days ago)")
            if i == 0:
                conds.append(name)
            break
    return sorted(conds), detail, detail_en


def fire_weather_card(power, end: date | None,
                      zone: str | None = None):
    """Last 7 valid days: mean RH2M, max WS2M, max T2M_MAX + dry days.

    Level score (INTA harvest guidance: stop work at wind>40 km/h,
    T>35 °C, RH<30 %): +1 each for mean RH<30 %, max wind>11 m/s,
    max T>35 °C, >10 days since rain. 3+ alto, 2 moderado, else bajo.
    `stop_conditions` lists each single condition met in the last 3
    days, evaluated against the thresholds of the plot zone.
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
    parts_en = [f"mean RH {rhm:.0f} %" if rhm is not None else None,
                f"max wind {wsm:.1f} m/s" if wsm is not None else None,
                f"max T {txm:.0f} °C" if txm is not None else None,
                f"{since} days without rain" if since is not None else None]
    conds, detail, detail_en = _stop_conditions_full(power, end, zone=zone)
    if conds:
        parts.append("parar la cosecha: " + "; ".join(detail[c]
                                                     for c in conds))
        parts_en.append("stop harvesting: " + "; ".join(detail_en[c]
                                                       for c in conds))
    ctx = [detail[c] for c in detail if c not in conds]
    if ctx:
        parts.append("días previos: " + "; ".join(ctx))
        parts_en.append("previous days: " + "; ".join(
            detail_en[c] for c in detail if c not in conds))
    card = _card("fire_weather", level, None,
                 "; ".join(p for p in parts if p),
                 "NASA POWER", POWER_RES, "high",
                 "; ".join(p for p in parts_en if p))
    card["stop_conditions"] = conds
    card["stop_detail"] = detail
    card["stop_detail_en"] = detail_en
    return card


# ------------------------------------------------------------ scenarios ----

def parse_scenario(body: dict):
    """Optional climate scenario {rain_pct -40..40, temp_delta_c -2..4}
    -> dict or a 400 response."""
    sc = body.get("scenario")
    if sc is None:
        return None, None
    def bad(detail):
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_scenario", "detail": detail})

    if not isinstance(sc, dict):
        return None, bad("scenario must be an object")
    try:
        rp = float(sc.get("rain_pct", 0))
        td = float(sc.get("temp_delta_c", 0))
    except (TypeError, ValueError):
        return None, bad("rain_pct and temp_delta_c must be numbers")
    if not -40 <= rp <= 40:
        return None, bad("rain_pct must be -40..40")
    if not -2 <= td <= 4:
        return None, bad("temp_delta_c must be -2..4")
    return {"rain_pct": rp, "temp_delta_c": td}, None


def apply_scenario(power: dict | None, sc: dict) -> dict:
    """In-memory scenario on the daily POWER series: rain scaled by
    1+pct/100, T2M_MAX/MIN shifted by temp_delta_c."""
    out = dict(power or {})
    k = 1 + sc["rain_pct"] / 100
    if sc["rain_pct"] and out.get("PRECTOTCORR"):
        out["PRECTOTCORR"] = {
            d: (v * k if v is not None else None)
            for d, v in out["PRECTOTCORR"].items()}
    if sc["temp_delta_c"]:
        for key in ("T2M_MAX", "T2M_MIN"):
            if out.get(key):
                out[key] = {
                    d: (v + sc["temp_delta_c"] if v is not None else None)
                    for d, v in out[key].items()}
    return out


# -------------------------------------------------------------- endpoint ----

@router.post("/api/field/diagnose")
async def diagnose(request: Request):
    body, err = await _json_body(request)
    if err:
        return err
    scenario, err = parse_scenario(body)
    if err:
        return err
    parsed, err = parse_plot(body)
    if err:
        return err
    (clat, clon), area_ha, r5s, r6s, bbox = parsed
    r6c = r6s[0]
    r5c = r5s[0]
    # shard index is the res-2 parent of the res-5 cell, NOT the res-2
    # of the centroid: ~6% of res-5 centroids fall across a res-2
    # boundary, which would fetch a shard missing this cell (audit, t29)
    r2 = h3.cell_to_parent(r5c, 2)

    from ..services.georef import zone_at
    geo = zone_at(clat, clon)
    if geo["country"] is None:
        return JSONResponse(
            status_code=400,
            content={"error": "no_land",
                     "detail": "plot centroid is not on land "
                               "(ocean or unmapped area)"})

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        fetches = asyncio.gather(
            src.power_daily(client, clat, clon, r6c),
            src.soilgrids(client, clat, clon, r6c),
            src.terrain_stats(client, clat, clon, r6c, bbox),
            src.ornl_modis(client, "MOD13Q1", "250m_16_days_NDVI",
                           clat, clon, r6c, scale=1e-4),
            src.json_shard(clat, clon, f"fire/cal/{r2}.json",
                           r6c, "fire_cal"),
            src.json_shard(clat, clon, f"field/grid/{r2}.json",
                           r6c, "field_grid"),
            return_exceptions=True)
        try:
            results = await asyncio.wait_for(fetches, DIAG_BUDGET)
        except TimeoutError:
            log.warning("diagnose: %.0fs budget exceeded", DIAG_BUDGET)
            results = [TimeoutError("budget")] * 6

    def ok(v):
        return None if isinstance(v, Exception) else v
    power, soilg, terr, ndvi, fire_cal, grid = \
        map(ok, results)

    slope = (terr or {}).get("slope")
    elevation_m = (terr or {}).get("elevation_m")
    cell_elev_m = (power or {}).get("_elev_m")
    temp_adjust = temp_adjust_for(elevation_m, cell_elev_m)
    if temp_adjust and power:  # copy: never mutate the cached dict
        power = dict(power)
        for key in ("T2M_MAX", "T2M_MIN"):
            if power.get(key):
                power[key] = {
                    d: (v + temp_adjust if v is not None else None)
                    for d, v in power[key].items()}

    grid_cell = (grid or {}).get("cells", {}).get(r5c)
    try:
        risk = await risk_shard(r2)  # shares the 6 h cache with /api/risk
    except Exception:  # missing DATA_BASE_URL etc. -> fire card degrades, not 503
        risk = None
    risk_cell = (risk or {}).get("cells", {}).get(r5c)

    degraded = power is None
    adj = {"temp_adjust_c": temp_adjust, "elevation_m": elevation_m,
           "power_cell_elevation_m": cell_elev_m, "lat": clat}
    if degraded:
        cards, monthly_burn = degraded_cards(
            grid_cell, terr, soilg, fire_cal, risk_cell, r5c)
        calendar = build_calendar(None, ndvi, monthly_burn)
    else:
        cards, monthly_burn = build_cards(
            power, soilg, slope, ndvi, grid_cell, fire_cal, risk_cell,
            r5c, adj=adj, zone=geo["zone"])
    baseline = None
    if scenario and not degraded:
        baseline = {"cards": cards,
                    "calendar": build_calendar(power, ndvi, monthly_burn)}
        spower = apply_scenario(power, scenario)
        sgrid = grid_cell
        if grid_cell and scenario["rain_pct"]:
            k = 1 + scenario["rain_pct"] / 100
            sgrid = dict(grid_cell)
            for key in ("rain_mm_yr", "rain_p25_mm"):
                if sgrid.get(key) is not None:
                    sgrid[key] = round(sgrid[key] * k, 1)
        base_map = {c["id"]: c["value"] for c in cards}
        cards, monthly_burn = build_cards(
            spower, soilg, slope, ndvi, sgrid, fire_cal, risk_cell,
            r5c, adj=adj, zone=geo["zone"])
        calendar = build_calendar(spower, ndvi, monthly_burn)
        for c in cards:
            bv = base_map.get(c["id"])
            if bv is not None and c["value"] != bv:
                c["baseline_value"] = bv
                if isinstance(bv, (int, float)) and \
                        isinstance(c["value"], (int, float)):
                    c["delta"] = round(c["value"] - bv, 1)
    else:
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
         "zone": geo["zone"], "province": geo["province"],
         "country": geo["country"],
         "elevation_m": elevation_m,
         "power_cell_elevation_m": cell_elev_m,
         "temp_adjust_c": temp_adjust,
         "h3_r5": r5s, "h3_r6": r6s, "cards": cards, "calendar": calendar,
         **({"degraded": True,
             "degraded_reason": DEGRADED_REASON} if degraded else {}),
         **({"scenario": scenario} if scenario else {}),
         **({"baseline": baseline} if baseline else {}),
         **msr},
        headers={"Cache-Control": "no-store"})


# ----------------------------------------------------- rotations / explain -

ROTATIONS_ZONES = {"pampa_humeda", "nea", "noa", "cuyo", "patagonia",
                   "other"}


@router.get("/api/field/catalog")
def field_catalog():
    """Public catalog read from the same knowledge used by the rotation motor."""
    from ..services.rotations import KNOWLEDGE

    return {
        "rotations": [rot.model_dump() for rot in KNOWLEDGE.rotations],
        "crops": [crop.model_dump() for crop in KNOWLEDGE.crops.values()],
    }


@router.post("/api/field/rotations")
async def rotations(request: Request):
    from ..services.rotations import run, PRIORITY_MAP
    body, err = await _json_body(request)
    if err:
        return err
    diag = body.get("diagnosis")
    if not isinstance(diag, dict) or not isinstance(diag.get("cards"), list):
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_input",
                     "detail": "diagnosis must be the full diagnose response"})
    zone = body.get("zone")
    if zone is None:
        dz = diag.get("zone")
        zone = dz if dz in ROTATIONS_ZONES else None
    elif zone not in ROTATIONS_ZONES:
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
    analog = None
    r5s = diag.get("h3_r5") or []
    cent = diag.get("centroid") or []
    r6s = diag.get("h3_r6") or ["x"]
    if r5s and len(cent) == 2:
        try:
            r2a = h3.cell_to_parent(r5s[0], 2)
            shard = await src.json_shard(
                cent[0], cent[1], f"field/analogs/{r2a}.json",
                r6s[0], "field_analogs")
            analog = (shard or {}).get("cells", {}).get(r5s[0])
        except Exception:
            analog = None  # malformed h3 ids in a replayed diagnosis
    try:
        out = run(diag, body.get("current"), priorities, constraints,
                  zone, analog=analog)
        if diag.get("scenario"):
            base = diag.get("baseline") or {
                "cards": [dict(c, value=c.get("baseline_value",
                                              c["value"]))
                          if c.get("baseline_value") is not None
                          else dict(c) for c in diag["cards"]],
                "calendar": diag.get("calendar", {"rows": []})}
            bout = run(base, body.get("current"), priorities,
                       constraints, zone, analog=analog)
            out["baseline_order"] = [
                s["id"] for s in sorted(
                    bout.get("strategies", []),
                    key=lambda s: -s.get("score", 0))]
    except ValueError as exc:
        return JSONResponse(status_code=400, content={
            "error": "invalid_input", "detail": str(exc)})
    if abs(diag.get("temp_adjust_c") or 0) >= 2:
        out.setdefault("gaps", []).append(
            "La corrección por altura usa un gradiente fijo de 6,5 °C "
            "por km; confirmá las heladas con una estación cercana")
    return JSONResponse(out, headers={"Cache-Control": "no-store"})


@router.post("/api/field/explain")
async def explain(request: Request):
    from ..services.rotations import explain as explain_fn
    from ..services.ai_explain import ai_explain
    body, err = await _json_body(request)
    if err:
        return err
    if not isinstance(body.get("strategies"), list):
        return JSONResponse(status_code=400, content={
            "error": "invalid_input",
            "detail": "body must be the full rotations response"})
    ai = await ai_explain(body)
    if ai:
        ai["mode"] = "ai"
        return JSONResponse(ai, headers={"Cache-Control": "no-store"})
    out = explain_fn(body)
    out["mode"] = "template"
    return JSONResponse(out, headers={"Cache-Control": "no-store"})

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
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..cache import utc_today
from ..h3util import h3_r5, h3_r6
from ..services import field_sources as src
from ..services import parcel_geo as geo
from ..services.data import risk_shard
from ..services.georef import zone_at
from ..services.nearby import nearby
from ..services.knowledge import KNOWLEDGE
from .field import (_json_body, _err, _self_intersects, parse_plot,
                    days_per_year, frost_free_window,
                    temp_adjust_for, DEGRADED_REASON)

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
            if _self_intersects(ring):
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
        return {"frost_free_days": days,
                "basis": "Días del año entre la última helada de "
                         "primavera y la primera de otoño (mediana "
                         "de años completos, NASA POWER, con "
                         "corrección por altura)." + shared_note}
    if grid_cell and "frost_free" in grid_cell:
        return {"frost_free_days": 365,
                "basis": "No se miden heladas: todo el año es libre "
                         "de heladas en la historia de esta zona."
                + shared_note}
    if power and power.get("T2M_MIN"):
        days = _ff_days(frost_free_window(power["T2M_MIN"]))
        if days is not None:
            return {"frost_free_days": days,
                    "basis": "Días del año entre la última helada de "
                             "primavera y la primera de otoño "
                             "(NASA POWER)." + shared_note}
    return {"frost_free_days": None,
            "basis": "Sin datos de heladas." + shared_note}


# ---------------------------------------------------------------- alerts ---

def _fire_number(country: str | None) -> str:
    return FIRE_NUMBER.get(country or "", "emergencias")


def build_alerts(ind: dict, crop: str, crop_name: str,
                 needs: dict, det_km: float | None,
                 country: str | None) -> list[dict]:
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
                     lang: str) -> dict:
    """Deterministic fallback mirroring the AI output shape."""
    fire_high = [p for p in parcels if any(
        a["kind"] == "fire" and a["severity"] == "high"
        for a in p["alerts"])]
    dry = [p for p in parcels
           if p["indicators"]["water"].get("level") == "seco"]
    en = lang == "en"
    if fire_high:
        head = ("Hay focos o riesgo alto de fuego: vigilancia y "
                "guardafuegos al día." if not en else
                "Fire risk is high or detections are nearby: stay "
                "watchful and keep firebreaks clear.")
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
    body, err = await _json_body(request)
    if err:
        return err
    lang = "en" if body.get("lang") == "en" else "es"

    boundary = body.get("boundary")
    if not isinstance(boundary, dict):
        return _err("invalid_boundary",
                    "boundary must be a GeoJSON polygon")[1]
    parsed, err = parse_plot({"polygon": boundary})
    if err:
        return err
    (clat, clon), b_area, r5s, r6s, bbox = parsed
    bgeom = geo.to_polygon(boundary)
    if bgeom is None or bgeom.is_empty:
        return _err("invalid_boundary", "boundary polygon invalid")[1]

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
                               r6s[0], f"grid_{r2}")
                for r2 in r2s], return_exceptions=True),
            "risks": asyncio.gather(*[
                risk_shard(r2) for r2 in r2s], return_exceptions=True),
                "firms": (firms.fetch_all(map_key, fbox, "72h")
                      if map_key else asyncio.sleep(0, result=None)),
            "nearby": nearby(clat, clon, client),
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
    fres = ok(results[4])
    nearby_res = ok(results[5]) or {
        "fire_stations": [], "hospitals": [], "water": [],
        "source": "OpenStreetMap contributors", "degraded": True}

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
        }
        cinfo = KNOWLEDGE.crops.get(p["crop"])
        cname = ((cinfo.name or {}).get(lang)
                 if cinfo and cinfo.name else p["crop"])
        alerts = build_alerts(ind, p["crop"], cname or p["crop"],
                              needs, det_km, g["country"])
        out_parcels.append({
            "id": p["id"], "crop": p["crop"],
            "area_ha": round(p["_ha"], 1),
            "indicators": ind, "alerts": alerts,
            "_geom": p["_geom"]})

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
                     "alerts": [{"kind": a["kind"],
                                 "severity": a["severity"],
                                 "text": a["text"]}
                                for a in p["alerts"]]}
                    for p in out_parcels],
        "needs": needs, "fire_horizon_days": 7}
    from ..services.ai_explain import parcels_summary
    summ = None
    try:
        summ = await parcels_summary(payload, lang)
    except Exception:
        summ = None
    if summ is None:
        summ = template_summary(out_parcels, nearby_res, lang)
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
            {"id": "field_grid",
             "text": "Grilla de campo precalculada (IMERG lluvia, "
                     "SRTM elevación, cobertura de suelo)"},
            {"id": "osm",
             "text": "OpenStreetMap contributors — servicios "
                     "cercanos (bomberos, hospitales, agua)"}],
        "degraded": bool(reasons),
        "degraded_reason": "; ".join(reasons) or None,
    }, headers={"Cache-Control": "no-store"})

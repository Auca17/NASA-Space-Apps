"""Rotation engine — PRD 10.2, deterministic and explainable.

Every number in the output traces to a diagnosis card or a knowledge entry.
Priority -> indicator weight mapping (contract 4.3):

  water         -> water_balance   (lower deficit is better)
  soil          -> residue_t_ha_yr (t/ha/yr of stubble, higher better;
                                    `carbon` kept as deprecated alias)
  erosion       -> erosion_risk    (lower level is better)
  income        -> income          (market_ar bucket, higher better)
  forage        -> forage          (has forage crop)
  nitrogen      -> nitrogen        (N-fixing crops per cycle)
  pests         -> pest_break      (distinct families per cycle)
  avoid_burning -> burns_avoided   (residue cover through burn season)

Viability thresholds (documented choices):
  - frost: non frost-tolerant crops must keep their whole cycle inside the
    diagnosis frost-free window; `frost_tolerance: high` skips the check.
  - water: rain available in the crop's sowing->harvest days from the
    monthly climatology (`rain_monthly_mm` on the rain card), day-weighted
    inside each month. Each calendar day's rain is allocated once: when
    several crops of the rotation cover the same day it is split in
    proportion to their daily demand (water_mm_cycle / cycle days).
    Perennial items (cycles of >=330 days, e.g. alfalfa years) compare
    their annual demand against the full annual rain instead of the
    window. Rain is deflated 10 % when the soil_moisture card is negative.
    Viable when availability >= 70 % of `water_mm_cycle`.
  - `irrigation: true` removes the water viability filter; the indicator
    reports "con riego" plus `irrigation_need_mm` (demand - rain).
    `irrigation: false` additionally drops crops needing > 110 % of
    availability (they would need irrigation to close the gap).
  - `livestock: false` drops forage-only crops; a non-empty `markets` list
    drops crops with `market_ar: low` unless the crop id is listed.
  - zones: when the plot zone is known, candidate rotations must list it
    in `zones` (knowledge file). The "no sé" current rotation comes from
    `typical_for`; a zone with no valid rotation returns confidence low
    and "sin rotaciones validadas para esta zona". Sequence dates are
    snapped into each crop's zone sowing/harvest windows and the shift is
    reported in `gaps`.
  - erosion_risk = bare_soil_days/yr x heavy_rain_days/yr x slope %, as a
    score: < 30 bajo, < 120 medio, else alto.
"""

import json
import logging
import re
import statistics
from pathlib import Path

from .knowledge import KNOWLEDGE, LEVEL, Crop, Rotation, SeqItem
from .measures import evaluate as eval_measures, uncovered_burn_months

log = logging.getLogger("rotations")

CAUTIONS = json.loads((Path(__file__).with_name("cautions.json"))
                      .read_text(encoding="utf-8"))

DISCLAIMER = ("Herramienta de apoyo: no reemplaza tu experiencia ni la de "
              "un agrónomo local.")
# Shown when the "no sé" default rotation is used in NEA/NOA: the
# typical-rotation evidence there is mixed (INTA, EEAOC), not validated
# per subzone.
TYPICAL_UNVALIDATED_GAP = (
    "La rotación típica de esta zona no está validada con datos por "
    "subzona; elegí la tuya si la conocés (fuentes: INTA, EEAOC)")
PRIORITY_LABEL = {"water": "cuidar el agua", "soil": "mejorar el suelo",
                  "erosion": "reducir la erosión", "income": "el ingreso",
                  "forage": "producir forraje", "nitrogen": "el nitrógeno",
                  "pests": "cortar plagas", "avoid_burning": "evitar quemas"}
# Nouns for "mejora en ... / queda peor en ..." in the why sentence.
MOVE_LABEL = {"water": "uso del agua", "soil": "materia orgánica",
              "erosion": "erosión", "income": "ingreso",
              "forage": "forraje", "nitrogen": "nitrógeno",
              "pests": "corte de plagas", "avoid_burning": "quemas evitadas"}
# Winter covers are rolled or desiccated in place: they protect the
# soil without animals, so "no livestock" must not discard them.
COVER_CROPS = {"centeno", "vicia", "avena"}
PRIORITY_MAP = {"water": "water_balance_mm", "soil": "residue_t_ha_yr",
                "erosion": "erosion_risk", "income": "income",
                "forage": "forage", "nitrogen": "nitrogen",
                "pests": "pest_break", "avoid_burning": "burns_avoided"}
INDICATOR_LABEL = {
    "water_balance": "balance hídrico (mm/año)",
    "water_balance_mm": "agua tomada del sistema (mm/año)",
    "residue_t_ha_yr": "t/ha por año de rastrojo",
    "carbon": "t/ha por año de rastrojo",  # deprecated alias
    "irrigation_need_mm": "mm de riego suplementario por año",
    "nitrogen": "cultivos fijadores de N",
    "bare_soil_days": "días sin cultivo vivo",
    "erosion_risk": "riesgo de erosión",
    "infiltration": "infiltración estimada (relativa)",
    "pest_break": "campañas seguidas con la misma plaga",
    "families": "familias en el ciclo",
    "income": "ingreso",
    "forage": "forraje",
    "burns_avoided": "quemas evitadas",
}
ZONE_CROPS = {"pampa_humeda", "nea", "noa", "cuyo", "patagonia"}


def _zone_valid(rot: "Rotation", zone: str) -> bool:
    """True when the rotation is allowed in `zone` (empty list = all)."""
    return not rot.zones or zone in rot.zones


MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun",
             "jul", "ago", "sep", "oct", "nov", "dic"]
MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
WATER_MIN_FRAC = 0.70      # availability must cover 70 % of crop demand
IRRIGATION_MARGIN = 1.10   # >110 % of availability => needs irrigation
FROST_GRACE_DAYS = 14      # cycle days allowed outside the frost-free window
PERENNIAL_MIN_DAYS = 330   # cycles this long compare annual demand vs rain
EROSION_MED, EROSION_HIGH = 30, 120


def _doy(md: str) -> int:
    import datetime as dt
    m, d = int(md[:2]), int(md[3:])
    return (dt.date(2001, m, d) - dt.date(2001, 1, 1)).days


def _md(doy: int) -> str:
    import datetime as dt
    d = dt.date(2001, 1, 1) + dt.timedelta(days=doy % 365)
    return f"{d.month:02d}-{d.day:02d}"


def _cycle_doys(start: str, end: str) -> set[int]:
    s, e = _doy(start), _doy(end)
    if e >= s:
        return set(range(s, e + 1))
    return set(range(s, 365)) | set(range(0, e + 1))


# ------------------------------------------------------- diagnosis input ---

def _card(diag: dict, cid: str) -> dict | None:
    for c in diag.get("cards", []):
        if c.get("id") == cid:
            return c
    return None


def _frost_free_doys(diag: dict) -> set[int] | None:
    """Frost-free day-of-year set, parsed from the frost card text."""
    card = _card(diag, "frost") or {}
    m = re.search(r"(\d{2})/(\d{2})\s*[–-]\s*(\d{2})/(\d{2})",
                  card.get("text") or "")
    if not m:
        return None
    a = _doy(f"{m.group(2)}-{m.group(1)}")
    b = _doy(f"{m.group(4)}-{m.group(3)}")
    if a <= b:
        return set(range(a, b + 1))
    return set(range(a, 365)) | set(range(0, b + 1))


def _burn_months(diag: dict) -> set[int]:
    for row in (diag.get("calendar") or {}).get("rows", []):
        if row.get("id") == "burn_season":
            return {i + 1 for i, l in enumerate(row.get("levels") or [])
                    if isinstance(l, int) and l >= 1}
    card = _card(diag, "fire") or {}
    m = re.search(r"quemas:\s*([a-z]{3})[–-]([a-z]{3})",
                  card.get("text") or "")
    if m and m.group(1) in MONTHS_ES and m.group(2) in MONTHS_ES:
        a, b = MONTHS_ES.index(m.group(1)), MONTHS_ES.index(m.group(2))
        rng = range(a, b + 1) if a <= b else \
            list(range(a, 12)) + list(range(0, b + 1))
        return {i + 1 for i in rng}
    return set()


def _rain_annual(diag: dict) -> float | None:
    v = (_card(diag, "rain") or {}).get("value")
    return float(v) if isinstance(v, (int, float)) else None


def _rain_monthly(diag: dict) -> list[float] | None:
    rm = (_card(diag, "rain") or {}).get("rain_monthly_mm")
    if isinstance(rm, list) and len(rm) == 12 and \
            all(isinstance(v, (int, float)) for v in rm):
        return [float(v) for v in rm]
    return None


def _doy_month(doy: int) -> int:
    acc = 0
    for m, nd in enumerate(MONTH_DAYS):
        if doy < acc + nd:
            return m
        acc += nd
    return 11


def _daily_rain_mm(diag: dict) -> list[float] | None:
    """mm of rain per day-of-year (365 entries).

    Monthly climatology from `rain_monthly_mm` spread uniformly inside
    each month; uniform annual/365 when the monthly series is missing.
    """
    monthly = _rain_monthly(diag)
    if monthly is not None:
        return [monthly[_doy_month(d)] / MONTH_DAYS[_doy_month(d)]
                for d in range(365)]
    rain = _rain_annual(diag)
    return [rain / 365.0] * 365 if rain is not None else None


def _crop_rain(diag: dict, crop: Crop, zone: str | None) -> float | None:
    """mm available during the crop cycle (standalone estimate).

    The window ends at `cycle_end` (physiological maturity) when the
    knowledge file has one — grain drying past maturity does not drink
    water; `harvest` stays the real harvest date for bare soil etc.
    """
    win = crop.window(zone)
    if not win:
        return None
    end = crop.cycle_end_for(zone) or win[2]
    return _window_rain(diag, _cycle_doys(win[0], end))


def _window_rain(diag: dict, doys: set[int]) -> float | None:
    daily = _daily_rain_mm(diag)
    if daily is None:
        return None
    avail = sum(daily[d] for d in doys)
    sm = (_card(diag, "soil_moisture") or {}).get("value")
    if isinstance(sm, (int, float)) and sm < 0:
        avail *= 0.9
    return avail


def _abs_windows(rot: Rotation) -> list[tuple[int, int]]:
    """Absolute cycle-time [start, end] day span per sequence item.

    Catalog sequences are chronological laps: each item starts on the
    first day after the previous item's end whose day-of-year matches
    (maiz year 1 -> soja year 2 in `maiz-soja`; the last item may spill
    past years x 365, which is normal for the closing crop). A
    producer-declared `custom` sequence is taken literally: all items
    live in the same year, so declared same-season overlaps stay real
    for the rain split.
    """
    spans = []
    for s in rot.sequence:
        sd = _doy(s.start)
        spans.append((sd, sd + (_doy(s.end) - sd) % 365))
    if rot.id == "custom":
        return spans
    out, prev_end = [], -1
    for sd, ed in spans:
        start = sd + 365 * max(0, -(-(prev_end + 1 - sd) // 365))
        end = start + (ed - sd)
        out.append((start, end))
        prev_end = end
    return out


def _seq_rain(diag: dict, rot: Rotation,
              zone: str | None = None) -> \
        tuple[list[float] | None, list[float] | None]:
    """(allocated rain mm per item, demand mm per item); None if no rain.

    Each absolute cycle day is credited once: items whose absolute
    windows overlap share the day's rain in proportion to their daily
    demand (water_mm_cycle / cycle days). Perennial items (cycles of
    >=PERENNIAL_MIN_DAYS days, e.g. alfalfa years) stay out of the
    split and get the full annual rain against their annual demand.
    Items of crops with a zone `cycle_end` drink only until
    physiological maturity, not until the (possibly much later)
    harvest date.
    """
    daily = _daily_rain_mm(diag)
    if daily is None:
        return None, None
    sm = (_card(diag, "soil_moisture") or {}).get("value")
    deflate = 0.9 if isinstance(sm, (int, float)) and sm < 0 else 1.0
    wins = _abs_windows(rot)
    seq = rot.sequence
    for i, s in enumerate(seq):
        ce = KNOWLEDGE.crops[s.crop].cycle_end_for(zone)
        if ce:
            a, b = wins[i]
            wins[i] = (a, min(b, a + (_doy(ce) - _doy(s.start)) % 365))
    demands = [KNOWLEDGE.crops[s.crop].water_mm_cycle for s in seq]
    peren = [b - a + 1 >= PERENNIAL_MIN_DAYS for a, b in wins]
    per_day = [demands[i] / (wins[i][1] - wins[i][0] + 1)
               for i in range(len(seq))]
    cover = {}
    for i, (a, b) in enumerate(wins):
        if peren[i]:
            continue
        for t in range(a, b + 1):
            cover.setdefault(t, []).append(i)
    avails = [0.0] * len(seq)
    for t, idx in cover.items():
        tot = sum(per_day[i] for i in idx)
        for i in idx:
            avails[i] += daily[t % 365] * per_day[i] / tot
    annual = sum(daily)
    for i in range(len(seq)):
        if peren[i]:
            avails[i] = annual
    return [a * deflate for a in avails], demands


# ------------------------------------------------------------- viability ---

def crop_viable(crop: Crop, diag: dict, constraints: dict,
                zone: str | None, ff: set[int] | None,
                item: SeqItem | None = None,
                avail: float | None = None) -> list[str]:
    """Reasons the crop is NOT viable (empty list = viable).

    `item` is the rotation's own sequence entry (its dates are used);
    `avail` is its allocated rain. Without them the crop's zone window
    and a standalone rain estimate are used.
    """
    reasons = []
    win = crop.window(zone)
    if not win:
        return [f"sin ventana de siembra para la zona {zone or 'desconocida'}"]
    ce = crop.cycle_end_for(zone)
    cyc = _cycle_doys(item.start, ce or item.end) if item is not None \
        else _cycle_doys(win[0], ce or win[2])
    if ff is not None and crop.frost_tolerance != "high":
        outside = cyc - ff
        if len(outside) > FROST_GRACE_DAYS:
            reasons.append("ciclo fuera de la ventana libre de heladas")
    if constraints.get("irrigation") is not True:
        if avail is None:
            if item is not None:
                avail = _window_rain(
                    diag, set(range(365))
                    if len(cyc) >= PERENNIAL_MIN_DAYS else cyc)
            else:
                avail = _crop_rain(diag, crop, zone)
        if avail is not None:
            if avail < crop.water_mm_cycle * WATER_MIN_FRAC:
                reasons.append(
                    f"agua disponible ~{avail:.0f} mm < "
                    f"{crop.water_mm_cycle} mm del ciclo")
            elif constraints.get("irrigation") is False and \
                    crop.water_mm_cycle > avail * IRRIGATION_MARGIN:
                reasons.append("necesitaría riego para cubrir su demanda")
        elif crop.water_mm_cycle >= 500:
            reasons.append("demanda hídrica alta sin dato de lluvia")
    if constraints.get("livestock") is False and crop.forage and \
            crop.id not in COVER_CROPS:
        reasons.append("cultivo exclusivamente forrajero")
    markets = constraints.get("markets") or []
    if crop.market_ar == "low" and (constraints.get("limited_market") is True
                                    or (markets and crop.id not in markets)):
        reasons.append("sin mercado local definido")
    return reasons


def rotation_viable(rot: Rotation, diag, constraints, zone, ff):
    avails, _ = _seq_rain(diag, rot, zone)
    bad = {}
    for i, s in enumerate(rot.sequence):
        r = crop_viable(KNOWLEDGE.crops[s.crop], diag, constraints,
                        zone, ff, item=s,
                        avail=avails[i] if avails is not None else None)
        if r:
            bad[f"{s.crop}#{i}"] = r
    return bad


def host_sharing_pairs(rot: Rotation) -> list[tuple]:
    """Consecutive pairs (incl. wrap-around last→first, the cycle
    repeats) whose two crops share at least one cataloged
    pest/disease host (pests.json). Each entry is
    (crop_a, crop_b, [Pest...])."""
    seq = [s.crop for s in rot.sequence]
    pairs = []
    for i in range(len(seq)):
        a, b = seq[i], seq[(i + 1) % len(seq)]
        shared = [p for p in KNOWLEDGE.pests
                  if a in p.hosts and b in p.hosts]
        if shared:
            pairs.append((a, b, shared))
    return pairs


def hazard_viability(rot: Rotation, diag, zone: str | None,
                     hazards: set | None,
                     ff: set[int] | None) -> tuple[float, list[str]]:
    """Score penalty + notes for hazard-profile viability checks.

    When the farmer ranked "frost" or "heat" as a hazard, crops whose
    sensitive frost window falls outside this cell's frost-free days,
    or whose heat tolerance can't take the cell's hot-day count, get a
    score penalty and a plain-language note."""
    if not hazards or not (hazards & {"frost", "heat"}):
        return 0.0, []
    hot = None
    card = _card(diag, "heat") or {}
    if isinstance(card.get("value"), (int, float)):
        hot = card["value"]
    penalty, notes = 0.0, []
    for crop in crops_unique(rot):
        if "frost" in hazards and ff and crop.frost_window:
            span = (crop.frost_window.get(zone or "") or
                    crop.frost_window.get("other"))
            if span:
                a, b = _doy(span[0]), _doy(span[1])
                doys = (range(a, b + 1) if a <= b else
                        list(range(a, 366)) + list(range(1, b + 1)))
                out = sum(1 for d in doys if d not in ff)
                if out >= 14:
                    penalty += 0.15
                    notes.append(
                        f"{crop.id}: {out} días sensibles a helada "
                        "fuera de la ventana libre de la celda")
        if "heat" in hazards and hot is not None:
            tol = crop.heat_tolerance or "medium"
            lim = {"low": 10, "medium": 50}.get(tol)
            if lim is not None and hot > lim:
                penalty += 0.15
                notes.append(
                    f"{crop.id}: tolerancia al calor {tol} con "
                    f"{hot:g} días >35 °C en la celda")
    return min(penalty, 0.45), notes


# ------------------------------------------------------------- indicators --

def indicators(rot: Rotation, diag: dict, zone: str | None,
               constraints: dict | None = None) -> dict:
    crops = [KNOWLEDGE.crops[s.crop] for s in rot.sequence]
    years = max(rot.years, 1)

    avails, demands = _seq_rain(diag, rot, zone)
    need_mm = None
    if avails is not None and \
            (constraints or {}).get("irrigation") is True:
        # irrigated: water does not constrain viability; the indicator
        # reports "con riego" plus the supplemental mm the strategy needs
        wb = "con riego"
        need_mm = round(sum(max(0.0, d - a)
                            for d, a in zip(demands, avails)) / years)
        wb_mm = need_mm
    elif avails is not None:
        wb = wb_mm = round(
            sum(d - a for d, a in zip(demands, avails)) / years)
    else:
        wb = wb_mm = None  # cannot compute -> null, surfaced in gaps

    # bare_soil_days is recomputed from the RETURNED (possibly
    # zone-shifted) sequence over absolute days; the catalog value stays
    # a fixture-time cross-check only
    covered = set()
    for a, b in _abs_windows(rot):
        covered.update(range(a, b + 1))
    bare = max(0, round((years * 365 - len(covered)) / years))

    heavy = (_card(diag, "heavy_rain") or {}).get("value") or 0
    slope = (_card(diag, "slope") or {}).get("value") or 0
    eros_score = bare * heavy * slope / 100
    erosion = ("alto" if eros_score >= EROSION_HIGH
               else "medio" if eros_score >= EROSION_MED else "bajo")

    # burns_avoided stays consistent with the bare_soil_in_burn_season
    # trigger (D26): 1 iff every burn-season month (level>=2) is covered
    cal_rows = (diag.get("calendar") or {}).get("rows") or []
    uncovered = uncovered_burn_months(
        [s.model_dump() for s in rot.sequence], cal_rows)
    burns = 1 if uncovered == set() else 0

    income_lvl = statistics.fmean({"low": 1, "medium": 2, "high": 3}
                                  [c.market_ar] for c in crops)

    out = {
        "water_balance": wb,
        "water_balance_mm": wb_mm,
        # consecutive crop pairs that share a pest/disease host
        # (pests.json); fewer = better, inverted in score()
        "pest_break": len(host_sharing_pairs(rot)),
        # botanical diversity kept as the secondary, coarser note
        "families": len({c.family for c in crops}),
        "residue_t_ha_yr":
            round(sum(c.residue_t_ha for c in crops) / years, 1),
        "nitrogen": sum(1 for c in crops if c.n_fixation),
        "bare_soil_days": bare,
        "erosion_risk": erosion,
        # relative, qualitative: how this alternative moves the
        # infiltration drivers a rotation controls (cover days and
        # residue). Texture, OM and slope do not change.
        "infiltration": _infiltration_alt(
            bare, sum(c.residue_t_ha for c in crops) / years),
        "income": {1: "low", 2: "medium", 3: "high"}[round(income_lvl)],
        "forage": any(c.forage for c in crops),
        "burns_avoided": burns,
    }
    out["carbon"] = out["residue_t_ha_yr"]  # deprecated alias, one release
    if need_mm is not None:
        out["irrigation_need_mm"] = need_mm
    return out


# ----------------------------------------------------------------- score ---

def _infiltration_alt(bare_soil_days: float,
                      residue_t_ha_yr: float) -> str:
    """alta/media/baja — RELATIVE and qualitative only.

    Cover days and residue are the infiltration drivers a rotation can
    change; texture, organic matter and slope stay fixed, so the class
    here only orders alternatives against each other (same inputs as
    the parcel infiltration score in services/infiltration.py)."""
    score = round((365 - bare_soil_days) / 365 * 70 +
                  min(residue_t_ha_yr, 10) * 3)
    return "alta" if score >= 60 else "media" if score >= 30 else "baja"


def _numeric_delta(a, b, invert=False):
    if a is None or b is None:
        return 0.0
    d = (b - a) if invert else (a - b)
    return max(-1.0, min(1.0, d / max(abs(b), 1)))


def _metric_value(ind: dict, key: str):
    v = ind.get(key)
    if key == "erosion_risk":
        return {"bajo": 0, "medio": 1, "alto": 2}.get(v)
    if key == "income":
        return {"low": 1, "medium": 2, "high": 3}.get(v)
    if isinstance(v, bool):
        return 1 if v else 0
    return v if isinstance(v, (int, float)) else None


def score(alt: dict, cur: dict, priorities: dict) -> float:
    """0..1; >0.5 means better than current on the weighted indicators."""
    used = {p: w for p, w in priorities.items()
            if p in PRIORITY_MAP and w}
    if not used:
        return 0.5
    num = 0.0
    for p, w in used.items():
        key = PRIORITY_MAP[p]
        a = _metric_value(alt, key)
        b = _metric_value(cur, key)
        invert = key in ("water_balance_mm", "erosion_risk",
                         "pest_break")
        num += w * _numeric_delta(a, b, invert)
    return round(0.5 + num / (2 * sum(used.values())), 3)


# --------------------------------------------------------------- sections --

def _fmt_evidence(diag: dict) -> list[dict]:
    out = []
    for cid, ind in (("rain", "rain"), ("heavy_rain", "heavy_rain"),
                     ("frost", "frost"), ("fire", "fire"),
                     ("soil_moisture", "soil_moisture"),
                     ("slope", "slope")):
        c = _card(diag, cid)
        if c and c.get("value") is not None or \
                (c and c.get("text") and c["confidence"] != "low"):
            out.append({"text": c["text"], "indicator": ind,
                        "source": c["source"]})
        if len(out) >= 4:
            break
    return out


def _analog_evidence(rot: Rotation, analog: dict | None) -> dict | None:
    """Evidence item: the strategy's crops in analog zones (2.8)."""
    if not analog:
        return None
    crops = analog.get("ar_crops") or []
    seq = [s.crop for s in rot.sequence]
    tgt = next((c for c in crops if c.get("crop") in seq), None)
    if tgt is None and crops:
        tgt = crops[0]  # no strategy crop grown there -> dominant crop
    if not tgt:
        return None
    zona = analog.get("label") or "zonas análogas"
    if analog.get("n_cells"):
        zona += f" ({analog['n_cells']} celdas)"
    return {"text": f"En zonas análogas ({zona}), {tgt['crop']} ocupa "
                    f"el {round(tgt['share'] * 100)} % del área sembrada "
                    f"y rinde ~{tgt['yield_kg_ha']} kg/ha",
            "indicator": "analogs",
            "source": tgt.get("src") or "field/analogs"}


# Card ids -> the same plain titles the front shows (`card.<id>` in
# web/src/i18n). Gaps name the card, never its internal id.
_CARD_TITLES = {
    "rain": "Lluvia anual",
    "heavy_rain": "Días de lluvia fuerte",
    "soil_moisture": "Humedad del suelo",
    "frost": "Período sin heladas",
    "heat": "Días de calor extremo",
    "gdd_year": "Grados-día anuales",
    "crop_water": "Agua que pide el cultivo",
    "vigor_bare_soil": "Cobertura del suelo",
    "slope": "Pendiente",
    "soil": "Suelo",
    "water_trend": "Agua subterránea",
    "fire": "Fuego en la zona",
    "fire_weather": "Clima de fuego",
    "recent_weather": "Últimas semanas",
}


def _card_title(c: dict) -> str:
    return _CARD_TITLES.get(c.get("id") or "", c.get("id") or "la tarjeta")


def _join_es(items: list[str]) -> str:
    return items[0] if len(items) == 1 else \
        ", ".join(items[:-1]) + " y " + items[-1]


def _gaps(diag: dict, analog_missing: bool = False,
          extra: list[str] | None = None) -> list[str]:
    """Information gaps, most useful first: missing data, then coarse
    resolution (one sentence per resolution, not one per card), then
    low confidence and the remaining notes."""
    missing, low, coarse = [], [], {}
    for c in diag.get("cards", []):
        title = _card_title(c)
        if c.get("value") is None:
            missing.append(f"Sin dato de {title} ({c.get('source')})")
            continue
        if c.get("confidence") == "low":
            low.append(title)
        if c.get("resolution") in ("9 km", "0.5°×0.625°"):
            coarse.setdefault(c["resolution"], []).append(title)
    res_txt = []
    for res in ("9 km", "0.5°×0.625°"):
        titles = coarse.get(res)
        if not titles:
            continue
        verb = "tiene" if len(titles) == 1 else "tienen"
        nota = " (~55 km)" if res == "0.5°×0.625°" else ""
        res_txt.append(f"{_join_es(titles)} {verb} resolución {res}{nota}: "
                       "no distingue diferencias dentro del lote")
    out = list(extra or []) + missing + res_txt
    if low:
        out.append(f"Confianza baja en: {_join_es(low)}")
    rain = _card(diag, "rain") or {}
    if rain.get("value") is not None and \
            not isinstance(rain.get("rain_monthly_mm"), list):
        out.append("Sin climatología mensual de lluvia: el balance "
                   "hídrico usa el promedio anual")
    if analog_missing:
        return out[:4] + ["Sin datos de zonas análogas (field/analogs)"]
    return out[:5]


def _risks(rot: Rotation, viable: bool, reasons: list[str]) -> list[str]:
    per = CAUTIONS.get("per_crop", {})
    risks = [r for s in rot.sequence for r in per.get(s.crop, [])]
    # host-sharing consecutive pairs get a specific warning, e.g.
    # "maíz sobre maíz mantiene Fusarium y chicharrita"
    for a, b, pests in host_sharing_pairs(rot):
        names = ", ".join(p.name_es.split(" (")[0] for p in pests[:3])
        how = pests[0].survival.split(":")[0]
        risks.append(
            f"{_crop_name(a)} seguido de {_crop_name(b)} mantiene {names} "
            f"(inóculo: {how}).")
    risks += CAUTIONS.get("generic", [])
    if not viable:
        risks += [f"No viable: {r}" for r in reasons]
    risks.append("Validar estas opciones con tu agrónomo de cabecera.")
    seen, out = set(), []
    for r in risks:
        if r not in seen:
            seen.add(r)
            out.append(r)
    return out


_MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago",
              "sep", "oct", "nov", "dic"]
# sowing months of a winter crop or winter cover in Argentina (apr-jul)
_WINTER_START = {4, 5, 6, 7}


def _seq_text(rot: Rotation) -> tuple[str, list[str]]:
    """'Maíz (sep–mar) → Soja (nov–abr)' and the winter crops in it,
    straight from the scenario's crops and dates."""
    parts, winter, seen = [], [], set()
    for s in rot.sequence:
        crop = KNOWLEDGE.crops.get(s.crop)
        name = (crop.name.get("es") if crop else None) or s.crop
        m0, m1 = int(s.start[:2]), int(s.end[:2])
        label = f"{name} ({_MONTHS_ES[m0 - 1]}–{_MONTHS_ES[m1 - 1]})"
        perennial = (m1 - m0) % 12 in (0, 11) and s.start != s.end
        if perennial:
            label = f"{name} (todo el año)"
        if label in seen:
            continue
        seen.add(label)
        parts.append(label)
        if m0 in _WINTER_START and not perennial:
            winter.append(label)
    return " → ".join(parts), winter


def _priority_moves(ind: dict, cur_ind: dict,
                    priorities: dict) -> tuple[list[str], list[str]]:
    """Priorities this strategy improves / worsens against the current
    one, heaviest first (same direction rules as score())."""
    better, worse = [], []
    for p, w in sorted(priorities.items(), key=lambda kv: -kv[1]):
        if not w or p not in PRIORITY_MAP:
            continue
        key = PRIORITY_MAP[p]
        a, b = _metric_value(ind, key), _metric_value(cur_ind, key)
        if a is None or b is None or a == b:
            continue
        invert = key in ("water_balance_mm", "erosion_risk", "pest_break")
        good = (a < b) if invert else (a > b)
        (better if good else worse).append(MOVE_LABEL.get(p, p))
    return better, worse


def _why(rot: Rotation, is_current: bool, priorities: dict,
         diag: dict, constraints: dict, ind: dict | None = None,
         cur_ind: dict | None = None) -> str:
    """Explanation built from the scenario itself: what it improves
    against the current rotation (never a goal it makes worse), its
    crops and dates, winter crop and days without a living crop."""
    if is_current:
        return "Es tu rotación actual; sirve de referencia."
    seq, winter = _seq_text(rot)
    ind = ind if ind is not None else indicators(rot, diag, None,
                                                 constraints)
    bare = ind.get("bare_soil_days")
    winter_txt = ("incluye cultivo de invierno: " + ", ".join(winter)
                  if winter else "sin cultivo de invierno")
    bare_txt = (f"; deja el suelo sin cultivo vivo unos {bare} días por año"
                if bare is not None else "")
    lead = ""
    if cur_ind:
        better, worse = _priority_moves(ind, cur_ind, priorities)
        if better:
            lead = "Frente a tu rotación actual mejora en " + \
                ", ".join(better[:3])
            lead += (f"; queda peor en {', '.join(worse[:2])}. "
                     if worse else ". ")
        elif worse:
            lead = ("No mejora tu rotación actual en lo que se mide acá; "
                    "se muestra para comparar. ")
    return f"{lead}Secuencia: {seq}; {winter_txt}{bare_txt}."


_ECON_PATH = Path(__file__).resolve().parents[2] / "knowledge" / "economics.json"
try:
    ECON = json.loads(_ECON_PATH.read_text())
except (OSError, ValueError):  # missing file: no cost-benefit block
    ECON = {"crops": {}}


def _crop_name(crop_id: str) -> str:
    c = KNOWLEDGE.crops.get(crop_id)
    return (c.name.get("es") if c else None) or crop_id.capitalize()


def economics(rot: Rotation, area_ha, analog: dict | None = None) -> dict | None:
    """Cost-benefit estimate for one campaign of the rotation (the
    sequence total divided by its years), per hectare and for the
    analysed area. Reference values from knowledge/economics.json;
    MAGyP analog-zone yields replace the reference yield when present."""
    table = ECON.get("crops") or {}
    if not table or not all(s.crop in table for s in rot.sequence):
        return None
    share = float(ECON.get("harvest_and_sale_share") or 0)
    analog_yield = {c.get("crop"): c.get("yield_kg_ha")
                    for c in (analog or {}).get("ar_crops") or []}
    years = max(1, rot.years)
    crops, cost_sum, rev_sum = [], 0.0, 0.0
    for item in rot.sequence:
        ref = table[item.crop]
        direct = float(sum(ref.get("cost", {}).values()))
        y, src = ref.get("yield_t_ha"), "referencia"
        if isinstance(analog_yield.get(item.crop), (int, float)):
            y, src = round(analog_yield[item.crop] / 1000, 1), "MAGyP zonas análogas"
        price = ref.get("price_usd_t")
        revenue = y * price if y and price else 0.0
        cost = direct + revenue * share
        cost_sum += cost
        rev_sum += revenue
        crops.append({"crop": item.crop, "name": _crop_name(item.crop),
                      "cost_ha": round(cost), "cost_lines": ref.get("cost", {}),
                      "yield_t_ha": y, "yield_source": src if y else None,
                      "price_usd_t": price, "revenue_ha": round(revenue),
                      "harvest": bool(y)})
    per_ha = {"cost": round(cost_sum / years),
              "revenue": round(rev_sum / years),
              "margin": round((rev_sum - cost_sum) / years)}
    ha = float(area_ha) if isinstance(area_ha, (int, float)) and area_ha > 0 \
        else None
    out = {"currency": ECON.get("currency", "USD"), "years": years,
           "per_ha": per_ha, "area_ha": round(ha, 1) if ha else None,
           "crops": crops,
           "cost_includes": ECON.get("cost_includes", []),
           "cost_excludes": ECON.get("cost_excludes", []),
           "sources": ECON.get("sources", [])}
    if ha:
        out["total"] = {k: round(v * ha) for k, v in per_ha.items()}
        out["harvest_t_total"] = [
            {"crop": c["crop"], "name": c["name"],
             "t": round(c["yield_t_ha"] * ha / years)}
            for c in crops if c["harvest"]]
    return out


def _sections(rot: Rotation, ind: dict, cur_ind: dict,
              is_current: bool, priorities: dict, diag: dict,
              viable: bool, reasons: list[str],
              analog: dict | None = None,
              constraints: dict | None = None,
              extra_gaps: list[str] | None = None) -> dict:
    benefits = {}
    for k, v in ind.items():
        c = cur_ind.get(k)
        if isinstance(v, (int, float)) and isinstance(c, (int, float)):
            benefits[k] = round(v - c, 1)
        else:
            benefits[k] = v
    evidence = _fmt_evidence(diag)
    ev_analog = _analog_evidence(rot, analog)
    if ev_analog:
        evidence = evidence[:3] + [ev_analog]
    # observed consumptive use (semiarid Pampa trials etc.) rides as
    # evidence under the water_balance indicator when the crop appears
    water_ev = []
    for c in crops_unique(rot):
        if c.water_mm_observed is not None:
            water_ev.append({
                "text": f"{_crop_name(c.id)}: consumo observado en "
                        f"{c.water_observed_note or 'ensayos locales'}: "
                        f"{c.water_mm_observed:g} mm (referencia FAO: "
                        f"{c.water_mm_cycle} mm)",
                "indicator": "water_balance",
                "source": c.water_observed_note or c.sources[0]})
    # thermal-time check (task 44): "este lote acumula X °C·día por
    # año; el maíz necesita Y" — viability visible per crop
    gdd_ev = []
    gdd_cell = (_card(diag, "gdd_year") or {}).get("value")
    if isinstance(gdd_cell, (int, float)):
        for c in crops_unique(rot):
            if c.gdd_base10 is None:
                continue
            name = c.name.get("es", c.id)
            short = ("" if gdd_cell >= c.gdd_base10
                     else " — no alcanza en años típicos")
            gdd_ev.append({
                "text": f"{name}: este lote acumula "
                        f"~{gdd_cell:g} °C·día por año; necesita "
                        f"~{c.gdd_base10} para completar el ciclo "
                        f"(base 10 °C){short}",
                "indicator": "gdd_year",
                "source": "gdd_base10 del catálogo (FAO/INTA, "
                          "pendiente de validación local)"})
    # root/crown carbon of pastures is a declared knowledge gap
    root_gaps = [f"{_crop_name(c.id)}: {c.root_carbon_note}"
                 for c in crops_unique(rot) if c.root_carbon_note]
    own_ev = []
    if not is_current:
        parts = []
        if isinstance(ind.get("water_balance_mm"), (int, float)):
            parts.append(f"toma ~{ind['water_balance_mm']:.0f} mm de agua "
                         "por año")
        if isinstance(ind.get("bare_soil_days"), (int, float)):
            parts.append(f"deja ~{ind['bare_soil_days']:.0f} días por año "
                         "sin cultivo vivo")
        if isinstance(ind.get("residue_t_ha_yr"), (int, float)):
            parts.append(f"aporta ~{ind['residue_t_ha_yr']:g} t/ha de "
                         "rastrojo por año")
        if parts:
            own_ev.append({"text": "Esta secuencia " + ", ".join(parts)
                           + " (motor de rotaciones con el clima del lote).",
                           "indicator": "water_balance",
                           "source": "Motor de rotaciones + NASA POWER"})
    return {
        "why": _why(rot, is_current, priorities, diag, constraints or {},
                    ind, cur_ind),
        "evidence": own_ev + water_ev + gdd_ev + evidence[:4],
        "benefits": benefits,
        "gaps": _gaps(diag, analog is None,
                      (extra_gaps or []) + root_gaps)
        or ["Sin vacíos relevantes en el diagnóstico"],
        "risks": _risks(rot, viable, reasons),
        "sequence": [{"crop": s.crop, "name": _crop_name(s.crop),
                      "start": s.start, "end": s.end,
                      "cover": s.cover} for s in rot.sequence],
    }


def crops_unique(rot: Rotation) -> list[Crop]:
    """The rotation's crops, deduped in sequence order."""
    seen, out = set(), []
    for s in rot.sequence:
        if s.crop not in seen:
            seen.add(s.crop)
            out.append(KNOWLEDGE.crops[s.crop])
    return out


# ---------------------------------------------------------------- engine ---

def _current_rotation(current: dict | None,
                      zone: str | None) -> Rotation | None:
    """Resolve 'current': id, ad-hoc sequence, or the zone's typical one.

    With a known zone the "no sé" default comes from `typical_for` —
    never file order; None when the zone has no typical rotation.
    """
    if current and current.get("rotation_id"):
        rid = current["rotation_id"]
        for r in KNOWLEDGE.rotations:
            if r.id == rid:
                return r
        raise ValueError(f"rotation_id desconocido: {rid}")
    if current and current.get("sequence"):
        seq = [SeqItem(**s) for s in current["sequence"]]
        for s in seq:
            if s.crop not in KNOWLEDGE.crops:
                raise ValueError(f"cultivo desconocido: {s.crop}")
        return Rotation(id="custom", name={"es": "Tu rotación", "en": "Custom"},
                        years=1, sequence=seq,
                        sources=["declarada por el productor"])
    if zone in ZONE_CROPS:
        for r in KNOWLEDGE.rotations:
            if zone in r.typical_for:
                return r
        return None
    # unknown zone (non-AR plots): first rotation with a usable window
    for r in KNOWLEDGE.rotations:
        if all(KNOWLEDGE.crops[s.crop].window(zone) for s in r.sequence):
            return r
    return KNOWLEDGE.rotations[0]


def _in_window(doy: int, a: str, b: str) -> bool:
    a, b = _doy(a), _doy(b)
    return a <= doy <= b if a <= b else (doy >= a or doy <= b)


def _shift_for_zone(rot: Rotation,
                    zone: str | None) -> tuple[Rotation, list[str]]:
    """Snap sequence dates inside each crop's zone sowing/harvest windows.

    Dates already inside the zone windows are kept; a start outside the
    zone sowing window moves to its opening day and an end past the zone
    harvest end moves to the window's close. Returns the (possibly new)
    rotation plus human-readable notes for `gaps`.
    """
    if zone not in ZONE_CROPS:
        return rot, []
    items, notes = [], []
    for s in rot.sequence:
        crop = KNOWLEDGE.crops[s.crop]
        win = crop.window(zone)
        if not win:
            items.append(s)
            continue
        # perennial / cut-period items (e.g. alfalfa years) keep their
        # own dates and full annual water demand: the zone window bounds
        # annual crops, not a standing pasture
        length = (_doy(s.end) - _doy(s.start)) % 365
        if length + 1 >= PERENNIAL_MIN_DAYS:
            items.append(s)
            continue
        start, end = s.start, s.end
        if not _in_window(_doy(start), win[0], win[1]):
            start = win[0]
        sd = _doy(start)
        if (_doy(end) - sd) % 365 > (_doy(win[2]) - sd) % 365:
            # end past the harvest close: slide the whole cycle earlier
            # so it ends at the close with its own declared length
            sd = (_doy(win[2]) - length) % 365
            start, end = _md(sd), win[2]
        if (start, end) != (s.start, s.end):
            notes.append(f"{crop.id}: fechas ajustadas a la ventana de "
                         f"{zone} ({s.start}–{s.end} → {start}–{end})")
        items.append(SeqItem(crop=s.crop, start=start, end=end,
                             cover=s.cover))
    if not notes:
        return rot, []
    return rot.model_copy(update={"sequence": items}), notes


def run(diagnosis: dict, current: dict | None, priorities: dict,
        constraints: dict, zone: str | None,
        analog: dict | None = None,
        hazards: set | None = None) -> dict:
    zone = zone if zone in ZONE_CROPS else ("other" if zone else None)
    known = zone in ZONE_CROPS
    ff = _frost_free_doys(diagnosis)

    cand_pool = [r for r in KNOWLEDGE.rotations
                 if not known or _zone_valid(r, zone)]
    no_zone_rots = known and not cand_pool
    zone_gaps = ["sin rotaciones validadas para esta zona"] \
        if no_zone_rots else []
    confidence = "low" if (not zone or no_zone_rots) else "high"

    cur_rot = _current_rotation(current, zone)
    cur_notes = []
    if cur_rot is not None:
        cur_rot, cur_notes = _shift_for_zone(cur_rot, zone)
        # a "no sé" default in NEA/NOA rides on mixed evidence: flag it
        defaulted = not (current and
                         (current.get("rotation_id") or
                          current.get("sequence")))
        if defaulted and zone in ("nea", "noa"):
            cur_notes.append(TYPICAL_UNVALIDATED_GAP)
        cur_ind = indicators(cur_rot, diagnosis, zone, constraints)
        cur_bad = rotation_viable(cur_rot, diagnosis, constraints,
                                  zone, ff)
    else:
        cur_ind, cur_bad = {}, {}

    cand = []
    for rot in cand_pool:
        if cur_rot is not None and rot.id == cur_rot.id:
            continue
        rot2, notes = _shift_for_zone(rot, zone)
        bad = rotation_viable(rot2, diagnosis, constraints, zone, ff)
        ind = indicators(rot2, diagnosis, zone, constraints)
        sc = score(ind, cur_ind, priorities)
        hpen, hnotes = hazard_viability(rot2, diagnosis, zone,
                                        hazards, ff)
        if hpen:
            sc = max(0.0, round(sc - hpen, 3))
            notes += hnotes
        cand.append({"rot": rot2, "ind": ind, "score": sc,
                     "bad": bad, "viable": not bad, "notes": notes})
    viable = [c for c in cand if c["viable"]]
    notviable = sorted((c for c in cand if not c["viable"]),
                       key=lambda c: -c["score"])
    top = sorted(viable, key=lambda c: -c["score"])[:3]
    top += notviable[:3 - len(top)]  # least-bad fill; up to 3 alternatives

    def _measures(rot: Rotation) -> dict:
        cat = None
        m = re.search(r"riesgo 7 días:\s*(\w+)",
                      (_card(diagnosis, "fire") or {}).get("text") or "")
        if m:
            cat = m.group(1)
        return eval_measures({
            "cards": {c["id"]: c for c in diagnosis.get("cards", [])},
            "calendar": (diagnosis.get("calendar") or {}).get("rows"),
            "risk_cat": cat,
            "sequence": [s.model_dump() for s in rot.sequence]})

    strategies = []
    if cur_rot is not None:
        strategies.append({
            "id": cur_rot.id,
            "name": cur_rot.name.get("es", cur_rot.id),
            "name_en": cur_rot.name.get("en") or cur_rot.name.get("es", cur_rot.id),
            "is_current": True,
            "score": score(cur_ind, cur_ind, priorities),
            "confidence": confidence,
            "indicators": cur_ind,
            **_sections(cur_rot, cur_ind, cur_ind, True, priorities,
                        diagnosis, not cur_bad,
                        [r for v in cur_bad.values() for r in v], analog,
                        constraints,
                        zone_gaps + cur_notes),
            **_measures(cur_rot),
            "economics": economics(cur_rot, diagnosis.get("area_ha"), analog),
        })
    for c in top:
        reasons = [r for v in c["bad"].values() for r in v]
        strategies.append({
            "id": c["rot"].id,
            "name": c["rot"].name.get("es", c["rot"].id),
            "name_en": c["rot"].name.get("en") or c["rot"].name.get("es", c["rot"].id),
            "is_current": False,
            "score": c["score"],
            "confidence": confidence,
            "indicators": c["ind"],
            **_sections(c["rot"], c["ind"], cur_ind, False, priorities,
                        diagnosis, c["viable"], reasons, analog,
                        constraints, zone_gaps + c["notes"]),
            **_measures(c["rot"]),
            "economics": economics(c["rot"], diagnosis.get("area_ha"),
                                   analog),
        })
    out = {"diagnosis_id": diagnosis.get("diagnosis_id"),
           "strategies": strategies, "disclaimer": DISCLAIMER,
           "confidence": confidence}
    if zone_gaps or not strategies:
        out["gaps"] = zone_gaps or \
            ["sin rotaciones validadas para esta zona"]
    refs = [r.model_dump() for r in KNOWLEDGE.zone_references
            if r.zone == zone]
    if refs:
        # documented references for zones without a computed rotation;
        # shown in the front empty state, nothing is computed
        out["zone_references"] = refs
    return out


def _calendar_date(year, month_day):
    from datetime import date
    return date.fromisoformat(f"{year}-{month_day}")


def _next_sowing(earliest, start, end):
    from datetime import timedelta
    for year in range(earliest.year - 1, earliest.year + 2):
        opening = _calendar_date(year, start)
        closing = _calendar_date(year + (end < start), end)
        if closing >= earliest and opening <= earliest + timedelta(days=365):
            return max(opening, earliest), closing
    return None


def recommend_crops(diagnosis, current, priorities, constraints, *, today=None):
    """Individual crop affinity, using the same windows and viability as rotations."""
    from datetime import date, timedelta

    zone = diagnosis.get("zone")
    today = today or date.today()
    empty = {"available_from": None, "options": []}
    if current == "perennial":
        return {**empty, "status": "perennial"}
    if not isinstance(zone, str) or zone not in ZONE_CROPS:
        return {**empty, "status": "no_catalog"}
    ff = _frost_free_doys(diagnosis)
    daily = _daily_rain_mm(diagnosis)
    heat = (_card(diagnosis, "heat") or {}).get("value")
    if daily is None and ff is None and not isinstance(heat, (int, float)):
        return {**empty, "status": "missing_climate"}

    previous_ids = ("trigo", "cebada") if current == "winter_cereal" else (current,)
    previous = [KNOWLEDGE.crops[crop_id] for crop_id in previous_ids if crop_id in KNOWLEDGE.crops]
    harvests = []
    for crop in previous:
        window = crop.window(zone)
        if window is None:
            return {**empty, "status": "missing_harvest"}
        sow_start, _, harvest_end = window
        if current == "winter_cereal":
            # A recently harvested cereal can still leave the same seasonal signal.
            sow_year = today.year - (today < _calendar_date(today.year, sow_start))
            harvest = _calendar_date(sow_year + (harvest_end < sow_start), harvest_end)
        else:
            harvest = _calendar_date(today.year, harvest_end)
            if harvest < today:
                harvest = _calendar_date(today.year + 1, harvest_end)
        harvests.append(harvest)
    earliest = max(today, max(harvests) + timedelta(days=1)) if harvests else today
    result = []
    slope = (_card(diagnosis, "slope") or {}).get("value")
    heavy_rain = (_card(diagnosis, "heavy_rain") or {}).get("value")
    burns = _burn_months(diagnosis)
    for crop in KNOWLEDGE.crops.values():
        window = crop.window(zone)
        if not window or not (sowing := _next_sowing(earliest, *window[:2])):
            continue
        start, end = sowing
        cycle_end = crop.cycle_end_for(zone) or window[2]
        start_day = start.strftime("%m-%d").replace("02-29", "02-28")
        cycle = set(range(365)) if crop.water_period == "year" else _cycle_doys(start_day, cycle_end)
        rain = sum(daily[d] for d in cycle) if daily is not None else None
        item = SeqItem(crop=crop.id, start=start_day, end=window[2])
        reasons = crop_viable(crop, diagnosis, constraints, zone, ff, item, rain)
        needs_irrigation = rain is not None and crop.water_mm_cycle > rain * IRRIGATION_MARGIN
        if ((constraints.get("irrigation") is False and needs_irrigation)
                or (constraints.get("livestock") is False and crop.forage)
                or (constraints.get("limited_market") is True and crop.market_ar == "low")):
            continue

        fit = [1.0]
        if rain is not None:
            fit.append(1 if constraints.get("irrigation") is True
                       else min(1, rain / max(crop.water_mm_cycle, 1)))
        if ff is not None:
            fit.append(1 if crop.frost_tolerance == "high"
                       else len(cycle & ff) / len(cycle))
        if isinstance(heat, (int, float)) and crop.heat_tolerance != "high":
            fit.append(1 - min(.4, heat / 100))
        different_family = bool(previous) and all(prior.family != crop.family for prior in previous)
        if previous:
            fit.append(1 if different_family else .65)
        residue = min(1, crop.residue_t_ha / 6)
        erosion = ((365 - len(cycle)) * slope * heavy_rain / 100
                   if isinstance(slope, (int, float)) and
                   isinstance(heavy_rain, (int, float)) else None)
        if erosion is not None:
            fit.append(1 / (1 + max(0, erosion) / EROSION_HIGH))
        match = {
            "water": min(1, (rain or 0) / max(crop.water_mm_cycle, 1)) if rain is not None else None,
            "soil": residue, "nitrogen": float(crop.n_fixation), "forage": float(crop.forage),
            "erosion": 1 / (1 + max(0, erosion) / EROSION_HIGH) if erosion is not None else None,
            "income": LEVEL[crop.market_ar] / 3,
            "pests": float(different_family) if previous else None,
            "avoid_burning": (len(burns & {_doy_month(d) + 1 for d in cycle}) / len(burns)
                              if burns else None),
        }
        weighted = [(v, priorities[k]) for k, v in match.items()
                    if v is not None and priorities.get(k, 0) > 0]
        affinity = statistics.fmean(fit)
        if weighted:
            affinity = .75 * affinity + .25 * (
                sum(v * w for v, w in weighted) / sum(w for _, w in weighted))
        if reasons:
            affinity = min(.59, affinity * .7)
        fits_frost = (crop.frost_tolerance == "high" or
                      len(cycle - ff) <= FROST_GRACE_DAYS) if ff is not None else None
        conditions = []
        if needs_irrigation:
            conditions.append("water")
        if fits_frost is False:
            conditions.append("frost")
        if rain is None and crop.water_mm_cycle >= 500 and constraints.get("irrigation") is not True:
            conditions.append("rain_missing")
        result.append({"id": crop.id, "name": crop.name, "score": round(affinity, 3),
                       "sow_from": start.isoformat(), "sow_until": end.isoformat(),
                       "water_demand_mm": crop.water_mm_cycle,
                       "rain_period": crop.water_period,
                       "rain_mm": round(rain) if rain is not None else None,
                       "needs_irrigation": needs_irrigation,
                       "fits_frost": fits_frost,
                       "erosion": erosion, "different_family": different_family,
                       "same_family": bool(previous and not different_family),
                       "conditional": bool(conditions), "conditions": conditions,
                       "source": crop.sources[0]})
    result.sort(key=lambda item: (item["conditional"], -item["score"],
                                  item["sow_from"], item["id"]))
    return {"status": "ok", "available_from": earliest.isoformat() if harvests else None,
            "options": result}


def explain(rotations_response: dict) -> dict:
    """POST /api/field/explain (4.5): one template paragraph per strategy."""
    out = []
    for s in rotations_response.get("strategies", []):
        name = s.get("name") or s.get("id")
        if s.get("is_current"):
            text = (f"{name}: es tu rotación actual; los cambios se "
                    f"miden contra ella.")
        else:
            b = s.get("benefits", {})
            deltas = [f"{INDICATOR_LABEL.get(k, k)} {v:+g}"
                      for k, v in b.items()
                      if isinstance(v, (int, float)) and v
                      and k not in {"water_balance", "carbon", "burns_avoided"}]
            why = s.get("why", "")
            risk = (s.get("risks") or [""])[0]
            text = (f"{name}: {why} "
                    f"Cambios frente a la actual: "
                    f"{', '.join(deltas) or 'sin cambios medibles'}. "
                    f"Riesgo principal: {risk}")
        out.append({"id": s.get("id"), "text": text})
    return {"strategies": out}

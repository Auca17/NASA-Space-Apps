"""Rotation engine — PRD 10.2, deterministic and explainable.

Every number in the output traces to a diagnosis card or a knowledge entry.
Priority -> indicator weight mapping (contract 4.3):

  water         -> water_balance   (lower deficit is better)
  soil          -> carbon          (residue t/ha/yr, higher better)
  erosion       -> erosion_risk    (lower level is better)
  income        -> income          (market_ar bucket, higher better)
  forage        -> forage          (has forage crop)
  nitrogen      -> nitrogen        (N-fixing crops per cycle)
  pests         -> pest_break      (distinct families per cycle)
  avoid_burning -> burns_avoided   (residue cover through burn season)

Viability thresholds (documented choices):
  - frost: non frost-tolerant crops must keep their whole cycle inside the
    diagnosis frost-free window; `frost_tolerance: high` skips the check.
  - water: rain available in the crop's cycle = annual rain x cycle
    fraction, deflated 10 % when the soil_moisture card is negative.
    Viable when availability >= 70 % of `water_mm_cycle`.
  - `irrigation: false` additionally drops crops needing > 110 % of
    availability (they would need irrigation to close the gap).
  - `livestock: false` drops forage-only crops; a non-empty `markets` list
    drops crops with `market_ar: low` unless the crop id is listed.
  - erosion_risk = bare_soil_days/yr x heavy_rain_days/yr x slope %, as a
    score: < 30 bajo, < 120 medio, else alto.
"""

import json
import logging
import re
import statistics
from pathlib import Path

from .knowledge import KNOWLEDGE, Crop, Rotation, SeqItem
from .measures import evaluate as eval_measures, uncovered_burn_months

log = logging.getLogger("rotations")

CAUTIONS = json.loads((Path(__file__).with_name("cautions.json"))
                      .read_text(encoding="utf-8"))

DISCLAIMER = ("Herramienta de apoyo: no reemplaza tu experiencia ni la de "
              "un agrónomo local.")
PRIORITY_LABEL = {"water": "cuidar el agua", "soil": "mejorar el suelo",
                  "erosion": "reducir la erosión", "income": "el ingreso",
                  "forage": "producir forraje", "nitrogen": "el nitrógeno",
                  "pests": "cortar plagas", "avoid_burning": "evitar quemas"}
PRIORITY_MAP = {"water": "water_balance", "soil": "carbon",
                "erosion": "erosion_risk", "income": "income",
                "forage": "forage", "nitrogen": "nitrogen",
                "pests": "pest_break", "avoid_burning": "burns_avoided"}
ZONE_CROPS = {"pampa_humeda", "nea", "noa", "cuyo", "patagonia"}
MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun",
             "jul", "ago", "sep", "oct", "nov", "dic"]
WATER_MIN_FRAC = 0.70      # availability must cover 70 % of crop demand
IRRIGATION_MARGIN = 1.10   # >110 % of availability => needs irrigation
FROST_GRACE_DAYS = 14      # cycle days allowed outside the frost-free window
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


def _crop_rain(diag: dict, crop: Crop, zone: str | None) -> float | None:
    """mm available during the crop cycle (uniform rain assumption)."""
    rain = _rain_annual(diag)
    win = crop.window(zone)
    if rain is None or not win:
        return None
    days = len(_cycle_doys(win[0], win[2]))
    avail = rain * days / 365
    sm = (_card(diag, "soil_moisture") or {}).get("value")
    if isinstance(sm, (int, float)) and sm < 0:
        avail *= 0.9
    return avail


# ------------------------------------------------------------- viability ---

def crop_viable(crop: Crop, diag: dict, constraints: dict,
                zone: str | None, ff: set[int] | None) -> list[str]:
    """Reasons the crop is NOT viable (empty list = viable)."""
    reasons = []
    win = crop.window(zone)
    if not win:
        return [f"sin ventana de siembra para la zona {zone or 'desconocida'}"]
    if ff is not None and crop.frost_tolerance != "high":
        outside = _cycle_doys(win[0], win[2]) - ff
        if len(outside) > FROST_GRACE_DAYS:
            reasons.append("ciclo fuera de la ventana libre de heladas")
    avail = _crop_rain(diag, crop, zone)
    if avail is not None:
        if avail < crop.water_mm_cycle * WATER_MIN_FRAC:
            reasons.append(
                f"agua disponible ~{avail:.0f} mm < "
                f"{crop.water_mm_cycle} mm del ciclo")
        elif constraints.get("irrigation") is False and \
                crop.water_mm_cycle > avail * IRRIGATION_MARGIN:
            reasons.append("necesitaría riego para cubrir su demanda")
    else:
        if crop.water_mm_cycle >= 500:
            reasons.append("demanda hídrica alta sin dato de lluvia")
    if constraints.get("livestock") is False and crop.forage:
        reasons.append("cultivo exclusivamente forrajero")
    markets = constraints.get("markets") or []
    if markets and crop.market_ar == "low" and crop.id not in markets:
        reasons.append("sin mercado local definido")
    return reasons


def rotation_viable(rot: Rotation, diag, constraints, zone, ff):
    bad = {s.crop: crop_viable(KNOWLEDGE.crops[s.crop], diag, constraints,
                               zone, ff)
           for s in rot.sequence}
    bad = {k: v for k, v in bad.items() if v}
    return bad


# ------------------------------------------------------------- indicators --

def indicators(rot: Rotation, diag: dict, zone: str | None) -> dict:
    crops = [KNOWLEDGE.crops[s.crop] for s in rot.sequence]
    years = max(rot.years, 1)

    uses, avails = [], []
    for c in crops:
        uses.append(c.water_mm_cycle)
        avails.append(_crop_rain(diag, c, zone))
    if all(a is not None for a in avails):
        wb = round(sum(u - a for u, a in zip(uses, avails)) / years)
    else:
        wb = None  # cannot compute -> null, surfaced in gaps

    bare = rot.bare_soil_days
    if bare is None:
        covered = set()
        for s in rot.sequence:
            covered |= _cycle_doys(s.start, s.end)
        bare = 365 - len(covered)

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

    return {
        "water_balance": wb,
        "carbon": round(sum(c.residue_t_ha for c in crops) / years, 1),
        "nitrogen": sum(1 for c in crops if c.n_fixation),
        "bare_soil_days": bare,
        "erosion_risk": erosion,
        "pest_break": len({c.family for c in crops}),
        "income": {1: "low", 2: "medium", 3: "high"}[round(income_lvl)],
        "forage": any(c.forage for c in crops),
        "burns_avoided": burns,
    }


# ----------------------------------------------------------------- score ---

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
    return v


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
        invert = key in ("water_balance", "erosion_risk")
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


def _gaps(diag: dict, analog_missing: bool = False) -> list[str]:
    out = []
    for c in diag.get("cards", []):
        if c.get("value") is None:
            out.append(f"Sin dato de {c['id']} ({c.get('source')})")
        elif c.get("confidence") == "low":
            out.append(f"{c['id']} con confianza baja")
        if c.get("resolution") in ("9 km", "0.5°×0.625°"):
            out.append(f"{c['id']} tiene resolución {c['resolution']}: "
                       "no distingue diferencias dentro del lote")
    if analog_missing:
        return out[:3] + ["Sin datos de zonas análogas (field/analogs)"]
    return out[:4]


def _risks(rot: Rotation, viable: bool, reasons: list[str]) -> list[str]:
    per = CAUTIONS.get("per_crop", {})
    risks = [r for s in rot.sequence for r in per.get(s.crop, [])]
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


def _why(rot: Rotation, is_current: bool, priorities: dict,
         diag: dict) -> str:
    if is_current:
        return "Es tu rotación actual; sirve de referencia."
    top = sorted(priorities.items(), key=lambda kv: -kv[1])[:2]
    goals = " y ".join(PRIORITY_LABEL.get(p, p) for p, _ in top) \
        or "diversificar"
    problem = "ataca los días de suelo desnudo" \
        if (indicators(rot, diag, None).get("bare_soil_days") or 0) < 100 \
        else "suma un cultivo de invierno al ciclo"
    return f"Atiende tus prioridades de {goals}; {problem}."


def _sections(rot: Rotation, ind: dict, cur_ind: dict,
              is_current: bool, priorities: dict, diag: dict,
              viable: bool, reasons: list[str],
              analog: dict | None = None) -> dict:
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
    return {
        "why": _why(rot, is_current, priorities, diag),
        "evidence": evidence[:4],
        "benefits": benefits,
        "gaps": _gaps(diag, analog is None)
        or ["Sin vacíos relevantes en el diagnóstico"],
        "risks": _risks(rot, viable, reasons),
        "sequence": [{"crop": s.crop, "start": s.start, "end": s.end,
                      "cover": s.cover} for s in rot.sequence],
    }


# ---------------------------------------------------------------- engine ---

def _current_rotation(current: dict | None, zone: str | None) -> Rotation:
    """Resolve 'current': id, ad-hoc sequence, or the zone's typical one."""
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
    # null -> "no sé": first rotation whose crops all have a window for
    # the zone (file order = agronomic typicality for now)
    for r in KNOWLEDGE.rotations:
        if all(KNOWLEDGE.crops[s.crop].window(zone) for s in r.sequence):
            return r
    return KNOWLEDGE.rotations[0]


def run(diagnosis: dict, current: dict | None, priorities: dict,
        constraints: dict, zone: str | None,
        analog: dict | None = None) -> dict:
    zone = zone if zone in ZONE_CROPS else ("other" if zone else None)
    ff = _frost_free_doys(diagnosis)
    confidence = "high" if zone else "low"

    cur_rot = _current_rotation(current, zone)
    cur_ind = indicators(cur_rot, diagnosis, zone)
    cur_bad = rotation_viable(cur_rot, diagnosis, constraints, zone, ff)

    cand = []
    for rot in KNOWLEDGE.rotations:
        if rot.id == cur_rot.id:
            continue
        bad = rotation_viable(rot, diagnosis, constraints, zone, ff)
        ind = indicators(rot, diagnosis, zone)
        sc = score(ind, cur_ind, priorities)
        cand.append({"rot": rot, "ind": ind, "score": sc,
                     "bad": bad, "viable": not bad})
    viable = [c for c in cand if c["viable"]]
    notviable = sorted((c for c in cand if not c["viable"]),
                       key=lambda c: -c["score"])
    top = sorted(viable, key=lambda c: -c["score"])[:3]
    top += notviable[:3 - len(top)]  # least-bad fill; always 3 alternatives

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

    strategies = [{
        "id": cur_rot.id,
        "name": cur_rot.name.get("es", cur_rot.id),
        "is_current": True,
        "score": score(cur_ind, cur_ind, priorities),
        "confidence": confidence,
        "indicators": cur_ind,
        **_sections(cur_rot, cur_ind, cur_ind, True, priorities,
                    diagnosis, not cur_bad,
                    [r for v in cur_bad.values() for r in v], analog),
        **_measures(cur_rot),
    }]
    for c in top:
        reasons = [r for v in c["bad"].values() for r in v]
        strategies.append({
            "id": c["rot"].id,
            "name": c["rot"].name.get("es", c["rot"].id),
            "is_current": False,
            "score": c["score"],
            "confidence": confidence,
            "indicators": c["ind"],
            **_sections(c["rot"], c["ind"], cur_ind, False, priorities,
                        diagnosis, c["viable"], reasons, analog),
            **_measures(c["rot"]),
        })
    return {"diagnosis_id": diagnosis.get("diagnosis_id"),
            "strategies": strategies, "disclaimer": DISCLAIMER}


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
            deltas = [f"{k} {v:+g}" for k, v in b.items()
                      if isinstance(v, (int, float)) and v]
            why = s.get("why", "")
            risk = (s.get("risks") or [""])[0]
            text = (f"{name}: {why} "
                    f"Cambios frente a la actual: "
                    f"{', '.join(deltas) or 'sin cambios medibles'}. "
                    f"Riesgo principal: {risk}")
        out.append({"id": s.get("id"), "text": text})
    return {"strategies": out}

"""Fire prevention measures — D26, contract 4.6.

`evaluate(context)` is a pure function. Context keys (all optional):
  cards      dict id -> card          (diagnosis cards)
  calendar   list of {id, levels[12]} (diagnosis calendar rows)
  risk_cat   str                      (risk cell category)
  sequence   list of {crop, start, end} (rotation being evaluated)
  today_month  int 1..12              (defaults to current UTC month)

A trigger whose input is missing is skipped and reported in `gaps`.
"""

import logging
from datetime import datetime, timezone

from .knowledge import MEASURES

log = logging.getLogger("measures")

COST_ORDER = {"low": 0, "medium": 1, "high": 2}
HIGH_RISK_CATS = {"alto", "muy_alto"}
BURN_LEVEL = 2          # calendar level that counts as burn/dry season


def _level_map(calendar, row_id):
    for row in calendar or []:
        if row.get("id") == row_id:
            return {i + 1: l for i, l in enumerate(row.get("levels") or [])
                    if isinstance(l, int)}
    return None


def _seq_months(sequence):
    """Months covered by at least one period of the sequence."""
    months = set()
    for s in sequence or []:
        try:
            a, b = int(s["start"][:2]), int(s["end"][:2])
        except (KeyError, TypeError, ValueError):
            continue
        months |= (set(range(a, b + 1)) if a <= b
                   else set(range(a, 13)) | set(range(1, b + 1)))
    return months


def uncovered_burn_months(sequence, calendar) -> set[int] | None:
    """Burn-season months (level>=2) left bare; None if input missing."""
    burn = _level_map(calendar, "burn_season")
    if not burn or sequence is None:
        return None
    hot = {m for m, l in burn.items() if l >= BURN_LEVEL}
    if not hot:
        return set()
    return hot - _seq_months(sequence)


def _triggers(ctx) -> tuple[set, list[str]]:
    fired, gaps = set(), []
    cal = ctx.get("calendar")
    cards = ctx.get("cards") or {}
    seq = ctx.get("sequence")
    today = ctx.get("today_month") or datetime.now(timezone.utc).month

    burn = _level_map(cal, "burn_season") if cal else None
    stress = _level_map(cal, "water_stress") if cal else None
    dry = ({m for m, l in (burn or {}).items() if l >= BURN_LEVEL} |
           {m for m, l in (stress or {}).items() if l >= BURN_LEVEL})

    if seq is not None and dry:
        end_months = {int(s["end"][:2]) for s in seq
                      if isinstance(s, dict) and s.get("end")}
        hit = sorted(end_months & dry)
        if hit:
            fired.add("harvest_in_dry_season")
            ctx["_why"]["harvest_in_dry_season"] = \
                f"cosecha en meses secos/de quemas: {hit}"
    else:
        gaps.append("harvest_in_dry_season (falta rotación o calendario)")

    fwc = cards.get("fire_weather") or {}
    fw = fwc.get("value")
    if fw is not None:
        if fw == "alto":
            fired.add("fire_weather_high")
            ctx["_why"]["fire_weather_high"] = \
                f"clima de fuego: {(fwc.get('text') or '')[:90]}"
    else:
        gaps.append("fire_weather_high (sin tarjeta fire_weather)")

    stop = fwc.get("stop_conditions")
    if stop is not None:
        if stop:
            fired.add("harvest_stop_conditions")
            det = fwc.get("stop_detail") or {}
            ctx["_why"]["harvest_stop_conditions"] = \
                "condición de parada: " + "; ".join(
                    det.get(c, c) for c in stop)
    else:
        gaps.append("harvest_stop_conditions (sin tarjeta fire_weather)")

    cat = ctx.get("risk_cat")
    if cat is not None:
        if cat in HIGH_RISK_CATS:
            fired.add("risk_high")
            ctx["_why"]["risk_high"] = f"riesgo 7 días: {cat}"
    else:
        gaps.append("risk_high (sin celda de riesgo)")

    uncovered = uncovered_burn_months(seq, cal)
    if uncovered is not None:
        if uncovered:
            fired.add("bare_soil_in_burn_season")
            ctx["_why"]["bare_soil_in_burn_season"] = \
                f"suelo desnudo en meses de quemas: {sorted(uncovered)}"
    else:
        gaps.append("bare_soil_in_burn_season (falta rotación o calendario)")

    if burn is not None:
        if burn.get(today, 0) >= BURN_LEVEL:
            fired.add("burn_season_now")
            ctx["_why"]["burn_season_now"] = \
                f"este mes es temporada de quemas (nivel {burn[today]})"
    else:
        gaps.append("burn_season_now (sin calendario)")

    return fired, gaps


def evaluate(context: dict) -> dict:
    ctx = dict(context or {})
    ctx["_why"] = {}
    fired, gaps = _triggers(ctx)
    out = []
    for m in MEASURES:
        hits = [t for t in m.triggers if t in fired]
        if not hits:
            continue
        why = "; ".join(ctx["_why"].get(t, t) for t in hits) or \
            m.addresses
        out.append({
            "id": m.id, "name": m.name.get("es", m.id),
            "factor": m.factor,
            "why": f"{m.addresses}: {why}",
            "benefit": m.benefit,
            "requires": m.requires.model_dump(),
            "cost": m.requires.cost,
            "source": m.sources[0],
            "_n": len(hits)})
    out.sort(key=lambda m: (-m["_n"], COST_ORDER.get(m["cost"], 9)))
    for m in out:
        del m["_n"]
    return {"measures": out, "measures_gaps": gaps}

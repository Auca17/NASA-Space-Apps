"""Gemini ranks catalog candidates using computed parcel facts only."""
import asyncio
import hashlib
import json
import logging
import math
import time

import httpx

from .ai_explain import BLOCKLIST, CACHE_TTL, _allowed_numbers, _cache, _call_gemini, _key, _numbers
from .infiltration import TEXTURE_BASE

log = logging.getLogger(__name__)
CLIMATE = {"rain", "heavy_rain", "frost", "heat", "slope", "soil", "infiltration"}
CROP_FACTS = ("rain_mm", "water_demand_mm", "cover_days", "fits_frost", "same_family")
ROTATION_FACTS = ("water_balance_mm", "bare_soil_days", "soil_cover_fit", "residue_t_ha_yr", "pest_break")
SYSTEM = (
    "Rank the supplied crop or rotation candidates for this parcel. Use the available climate and soil facts, "
    "candidate water needs, soil cover, frost and previous crop where relevant. Honor the priorities and constraints. "
    "Keep unconditioned candidates before conditional ones. Rank each supplied id exactly once. "
    "Use only facts provided, no assumed irrigation, yield, or suitability. Say in plain language why each candidate "
    "fits, or what limits it. Write in the requested language, with Argentine voseo for es, fewer than 28 words per choice. "
    'Return JSON only: {"choices":[{"id":"candidate id","why":"reason","uses":["provided fact key"]}]}. '
    "Use one to three fact keys per choice, including its specific facts where possible."
)


def _number_facts(row: dict, keys) -> dict:
    return {k: row[k] for k in keys if isinstance(row.get(k), (int, float)) and math.isfinite(row[k])}


async def rank_candidates(result: dict, diag: dict, priorities: dict, constraints: dict,
                          lang: str, *, kind: str, current: str | None = None) -> dict:
    rows = result.get("options" if kind == "crop" else "strategies", [])
    baseline = [row for row in rows if row.get("is_current")]
    candidates = [row for row in rows if not row.get("is_current")]
    shortlist = candidates[:6]
    key = _key("gemini")
    if key and shortlist:
        climate = {}
        for card in diag.get("cards", []):
            if isinstance(cid := card.get("id"), str) and cid in CLIMATE:
                value = _number_facts(card, ("value",)).get("value")
                if value is not None:
                    climate[cid] = value
            texture = card.get("texture")
            if cid == "soil" and isinstance(texture, str) and texture in TEXTURE_BASE:
                climate["texture"] = texture
        facts = {row["id"]: _number_facts(row if kind == "crop" else row["indicators"],
                                         CROP_FACTS if kind == "crop" else ROTATION_FACTS)
                 for row in shortlist}
        conditional = {row["id"]: bool(row.get("conditional") if kind == "crop" else not row["viable"])
                       for row in shortlist}
        payload = {"language": lang, "kind": kind, "parcel": climate, "current_crop": current,
                   "priorities": priorities,
                   "resources": {k: constraints[k] for k in ("irrigation", "livestock", "limited_market")
                                 if isinstance(constraints.get(k), bool)},
                   "candidates": [{"id": row["id"], "conditional": conditional[row["id"]],
                                   "facts": facts[row["id"]],
                                   **({"sequence": [step["crop"] for step in row["sequence"]]} if kind == "rotation" else {})}
                                  for row in shortlist]}
        cache_key = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        cached = _cache.get(cache_key)
        decision = cached[1] if cached and time.time() - cached[0] < CACHE_TTL else None
        if decision is None:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    answer = await asyncio.wait_for(_call_gemini(client, key, payload, SYSTEM), timeout=15)
                decision = _decision(answer, climate, facts, conditional)
            except httpx.HTTPStatusError as exc:
                log.warning("Gemini ranking unavailable (HTTP %s)", exc.response.status_code)
            except (httpx.HTTPError, TimeoutError, KeyError, IndexError, TypeError, ValueError) as exc:
                log.warning("Gemini ranking unavailable: %s", type(exc).__name__)
            if decision is not None:
                _cache[cache_key] = (time.time(), decision)
        if decision is not None:
            by_id = {row["id"]: row for row in shortlist}
            candidates = [{**by_id[cid], "decision": detail} for cid, detail in decision.items()] + candidates[6:]
            if kind == "crop":
                candidates.sort(key=lambda row: row["conditional"])
            result["ranking_source"] = "gemini"
    result.setdefault("ranking_source", "catalog")
    if kind == "rotation":
        result["strategies"] = baseline + candidates[:3]
    else:
        result["options"] = candidates
    return result


def _decision(answer, climate, facts, conditional) -> dict | None:
    items = answer.get("choices") if isinstance(answer, dict) else None
    if not isinstance(items, list) or len(items) != len(facts):
        return None
    out = {}
    for item in items:
        if not isinstance(item, dict) or not isinstance(cid := item.get("id"), str) or cid not in facts or cid in out:
            return None
        why, uses = item.get("why"), item.get("uses")
        values = {**climate, **facts[cid]}
        if (not isinstance(why, str) or not why.strip() or len(why.split()) > 36 or
                any(word in why.lower() for word in BLOCKLIST) or
                not isinstance(uses, list) or not 1 <= len(uses) <= 3 or
                any(not isinstance(field, str) or field not in values for field in uses)):
            return None
        allowed = _allowed_numbers(values)
        if any(round(n, 3) not in allowed for n in _numbers(why)):
            return None
        out[cid] = {"why": why.strip(), "evidence": {field: values[field] for field in uses}}
    return dict(sorted(out.items(), key=lambda pair: conditional[pair[0]]))

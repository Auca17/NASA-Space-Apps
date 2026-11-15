"""Optional AI explanation for /api/field/explain.

Pluggable provider via env (task 19):
  AI_PROVIDER       gemini (default) | anthropic
  AI_MODEL          default gemini-2.5-flash (gemini) / claude-haiku-5-5
  GEMINI_API_KEY    Google AI Studio key — sent in the x-goog-api-key
                    header, never in the URL
  ANTHROPIC_API_KEY optional second provider

Only explains numbers the engine already computed; never decides.
The prompt carries only computed indicators, units, sources and
generic crop/rotation ids — never coordinates, polygons, province or
place names, plot ids, or Orin validation data (_sanitize). Falls
back to the template text on any failure; keys are never logged.
"""
import hashlib
import json
import logging
import os
import re
import time

import httpx

log = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_MODEL = "gemini-2.5-flash"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-haiku-5-5"
TIMEOUT = 6.0
MAX_TOKENS = 900
CACHE_TTL = 6 * 3600
BLOCKLIST = ("garantiza", "seguro que", "siempre", "sin riesgo")

# Keys that must never reach the provider prompt (privacy rule).
DENY_KEYS = {"lat", "lon", "latitude", "longitude", "coordinates",
             "coord", "coords", "centroid", "polygon", "geometry",
             "province", "country", "place", "place_name", "name",
             "plot_id", "diagnosis_id", "h3_r5", "h3_r6", "h3_r2",
             "orin", "lots", "elevation_m", "power_cell_elevation_m",
             "area_ha"}

SYSTEM = (
    "Explicás en lenguaje simple, para un productor argentino, lo que "
    "ya calculó el motor de rotaciones. No inventés números: solo podés "
    "usar los valores del JSON de entrada. No des consejos fuera de los "
    "datos ni cambies el ranking. Respondés estrictamente JSON: "
    '{"strategies":[{"id":"...","text":"...","cites":["indicator_id"]}]}'
    " con un párrafo de máximo 70 palabras por estrategia y una oración "
    "obligatoria sobre la mayor brecha de información.")

PARCELS_SYSTEM_ES = (
    "Resumís para un productor, en español rioplatense con voseo, el "
    "estado de sus parcelas según los números del JSON de entrada. "
    "Reglas: el titular empieza por el fuego (riesgo o foco cercano); "
    "no inventés números — solo valores del JSON; no contradigas las "
    "alertas; no menciones lugares ni coordenadas. Respondés "
    "estrictamente JSON: "
    '{"headline":"una oración","bullets":["máximo 3 oraciones"]}.')

PARCELS_SYSTEM_EN = (
    "Summarize for a farmer, in plain English, the state of their "
    "parcels from the numbers in the input JSON. Rules: the headline "
    "leads with fire (risk or a nearby detection); never invent "
    "numbers — only values present in the JSON; do not contradict the "
    "alerts; never mention places or coordinates. Answer strictly JSON: "
    '{"headline":"one sentence","bullets":["at most 3 sentences"]}.')

_cache: dict[str, tuple[float, dict]] = {}
_model_choice: str | None = None


def _provider() -> str:
    return (os.environ.get("AI_PROVIDER") or "gemini").strip().lower()


def _key(provider: str) -> str | None:
    return (os.environ.get("GEMINI_API_KEY") if provider == "gemini"
            else os.environ.get("ANTHROPIC_API_KEY")) or None


def _sanitize(x):
    """Deep-copy minus every key that could carry location or
    identifying data into the prompt."""
    if isinstance(x, dict):
        return {k: _sanitize(v) for k, v in x.items()
                if k not in DENY_KEYS and
                not (isinstance(k, str) and
                     k.lower() in DENY_KEYS)}
    if isinstance(x, list):
        return [_sanitize(v) for v in x]
    return x


def _input_json(rotations: dict) -> dict:
    items = []
    for s in rotations.get("strategies", []):
        items.append({
            "id": s.get("id"), "is_current": bool(s.get("is_current")),
            "confidence": s.get("confidence"),
            "indicators": s.get("indicators"),
            "benefits": s.get("benefits"),
            "evidence": s.get("evidence"), "gaps": s.get("gaps"),
            "risks": s.get("risks"), "measures": s.get("measures")})
    return _sanitize({"strategies": items,
                      "confidence": rotations.get("confidence")})


def _numbers(text: str) -> list[float]:
    return [float(m) for m in re.findall(r"-?\d+(?:[.,]\d+)?", text)]


def _allowed_numbers(rotations: dict) -> set[float]:
    """Every numeric value present in the input, plus tolerant variants
    (roundings and common unit conversions)."""
    vals: set[float] = set()

    def walk(x):
        if isinstance(x, (int, float)):
            vals.add(float(x))
        elif isinstance(x, dict):
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk(rotations)
    out = set(vals)
    for v in vals:
        out |= {round(v), round(v, 1), round(v * 100), round(v / 1000),
                round(v * 1000)}
    return {round(v, 3) for v in out}


def _cite_ids(rotations: dict) -> set[str]:
    ids: set[str] = set()

    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if isinstance(v, (int, float)):
                    ids.add(str(k))
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk(rotations)
    return ids


def _validate(answer: dict, rotations: dict) -> dict | None:
    """Validate the model output; return normalized dict or None."""
    if not isinstance(answer, dict):
        return None
    items = answer.get("strategies")
    if not isinstance(items, list):
        return None
    input_ids = {s.get("id") for s in rotations.get("strategies", [])}
    allowed = _allowed_numbers(_input_json(rotations))
    cites = _cite_ids(_input_json(rotations)) | input_ids
    out = []
    for it in items:
        if not isinstance(it, dict) or it.get("id") not in input_ids:
            return None
        text = it.get("text")
        if not isinstance(text, str) or not text.strip():
            return None
        low = text.lower()
        if any(w in low for w in BLOCKLIST):
            return None
        for n in _numbers(text):
            if round(n, 3) not in allowed and round(n * 10) / 10 not in {
                    round(v, 1) for v in allowed}:
                return None
        for c in it.get("cites") or []:
            if c not in cites:
                return None
        out.append({"id": it["id"], "text": text.strip(),
                    "cites": list(it.get("cites") or [])})
    if {i["id"] for i in out} != input_ids:
        return None
    return {"strategies": out}


async def _gemini_model(client: httpx.AsyncClient, key: str) -> str:
    """Default model, or the newest flash supporting generateContent
    if it is unavailable. Resolved once per process."""
    global _model_choice
    want = os.environ.get("AI_MODEL") or GEMINI_MODEL
    if _model_choice:
        return _model_choice
    r = await client.get(f"{GEMINI_URL}/models",
                         headers={"x-goog-api-key": key})
    r.raise_for_status()
    names = [m.get("name", "").split("/")[-1]
             for m in r.json().get("models", [])
             if "generateContent" in
             (m.get("supportedGenerationMethods") or [])]
    if want in names:
        _model_choice = want
    else:
        flashes = sorted((n for n in names if "flash" in n.lower()),
                         reverse=True)
        _model_choice = flashes[0] if flashes else want
    if _model_choice != want:
        log.warning("ai_explain: model %s unavailable, using %s",
                    want, _model_choice)
    return _model_choice


async def _call_gemini(client: httpx.AsyncClient, key: str,
                       payload: dict, system: str = SYSTEM) -> dict:
    model = await _gemini_model(client, key)
    r = await client.post(
        f"{GEMINI_URL}/models/{model}:generateContent",
        headers={"x-goog-api-key": key},
        json={"contents": [{"role": "user", "parts": [
            {"text": json.dumps(payload, ensure_ascii=False)}]}],
            "systemInstruction": {"parts": [{"text": system}]},
            "generationConfig": {"temperature": 0,
                                 "maxOutputTokens": MAX_TOKENS,
                                 "responseMimeType": "application/json"}})
    r.raise_for_status()
    cand = r.json()["candidates"][0]
    text = "".join(p.get("text", "")
                   for p in cand["content"]["parts"])
    return json.loads(text)


async def _call_anthropic(client: httpx.AsyncClient, key: str,
                          payload: dict, system: str = SYSTEM) -> dict:
    model = os.environ.get("AI_MODEL") or ANTHROPIC_MODEL
    r = await client.post(
        ANTHROPIC_URL,
        headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
        json={"model": model, "max_tokens": MAX_TOKENS,
              "temperature": 0, "system": system,
              "messages": [{"role": "user", "content":
                            json.dumps(payload, ensure_ascii=False)}]})
    r.raise_for_status()
    return json.loads(r.json()["content"][0]["text"])


async def ai_explain(rotations: dict) -> dict | None:
    """Return AI explanations or None (caller falls back to templates)."""
    provider = _provider()
    key = _key(provider)
    if not key:
        return None
    payload = _input_json(rotations)
    chash = hashlib.sha256(
        json.dumps([provider, payload], sort_keys=True).encode()
    ).hexdigest()
    hit = _cache.get(chash)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            if provider == "anthropic":
                answer = await _call_anthropic(client, key, payload)
            else:
                answer = await _call_gemini(client, key, payload)
    except Exception as exc:  # network, http, json — all fall back
        log.warning("ai_explain failed: %s", type(exc).__name__)
        return None
    ok = _validate(answer, rotations)
    if ok is None:
        log.warning("ai_explain: response failed validation")
        return None
    _cache[chash] = (time.time(), ok)
    return ok


# -------------------------------------------------------- parcels summary --

def _validate_summary(answer: dict, allowed: set) -> dict | None:
    """-> {"headline","bullets"} or None. Same rules as the strategies
    validator: strict shape, blocklist, numbers must come from input."""
    if not isinstance(answer, dict):
        return None
    head = answer.get("headline")
    bullets = answer.get("bullets")
    if not isinstance(head, str) or not head.strip():
        return None
    if not isinstance(bullets, list) or len(bullets) > 3:
        return None
    texts = [head]
    out_b = []
    for b in bullets:
        if not isinstance(b, str) or not b.strip():
            return None
        texts.append(b)
        out_b.append(b.strip())
    for t in texts:
        low = t.lower()
        if any(w in low for w in BLOCKLIST):
            return None
        for n in _numbers(t):
            if round(n, 3) not in allowed and \
                    round(n * 10) / 10 not in {
                    round(v, 1) for v in allowed}:
                return None
    return {"headline": head.strip(), "bullets": out_b[:3]}


async def parcels_summary(payload: dict, lang: str = "es") -> dict | None:
    """-> {"headline", "bullets"} from the AI provider, or None.

    `payload` carries only computed numbers, crop ids, declared needs
    and alert texts; `_sanitize` strips anything identifying before it
    reaches the provider (notes pass through by design, per task 32).
    """
    provider = _provider()
    key = _key(provider)
    if not key:
        return None
    clean = _sanitize(payload)
    chash = hashlib.sha256(
        json.dumps([provider, "parcels", lang, clean],
                   sort_keys=True).encode()).hexdigest()
    hit = _cache.get(chash)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]
    system = PARCELS_SYSTEM_EN if lang == "en" else PARCELS_SYSTEM_ES
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            if provider == "anthropic":
                answer = await _call_anthropic(
                    client, key, clean, system)
            else:
                answer = await _call_gemini(client, key, clean, system)
    except Exception as exc:
        log.warning("parcels_summary failed: %s", type(exc).__name__)
        return None
    ok = _validate_summary(answer, _allowed_numbers(clean))
    if ok is None:
        log.warning("parcels_summary: response failed validation")
        return None
    _cache[chash] = (time.time(), ok)
    return ok

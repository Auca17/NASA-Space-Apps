"""POST /api/alerts/test — send one test alert e-mail for a field.

The farmer types an e-mail after the analysis and asks for a test
alert. The front sends the natural hazards it already shows for the
field (fire, drought, frost, heat, snow, hail, El Niño / La Niña,
flood) with their level and plain text; this endpoint composes the
message and hands it to a sender:

  1. n8n webhook (ALERT_WEBHOOK_URL, optional ALERT_WEBHOOK_SECRET sent
     as X-Ashfield-Secret) — the team's Gmail workflow
     ops/n8n/14-aviso-campo-email.json;
  2. SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, ALERT_FROM);
  3. neither configured -> 200 with sent=false and a preview, so the
     demo still shows what the farmer would receive.

No database: nothing is stored server-side and the address is never
logged. Scheduled alerts (n8n reading subscriptions) are a later step,
see docs/ideas/alerts-and-identity.md.
"""

import asyncio
import html
import logging
import re
import smtplib
import ssl
import time
from email.message import EmailMessage

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..config import get_env

log = logging.getLogger(__name__)
router = APIRouter()

EMAIL_RE = re.compile(r"^[^\s@<>\"',;]{1,64}@[^\s@<>\"',;]{1,190}\.[A-Za-z]{2,24}$")
HAZARDS = {
    "fire": "Fuego",
    "drought": "Sequía",
    "frost": "Heladas",
    "heat": "Calor extremo",
    "snow": "Nieve",
    "hail": "Granizo",
    "enso": "El Niño / La Niña",
    "flood": "Anegamiento",
}
LEVELS = {"alto": 0, "medio": 1, "bajo": 2, "sin_dato": 3}
LEVEL_TXT = {"alto": "ALTO", "medio": "medio", "bajo": "bajo",
             "sin_dato": "sin dato satelital"}
MAX_TEXT = 400
MIN_INTERVAL_S = 30
_last_sent: dict[str, float] = {}

DISCLAIMER = (
    "Este aviso usa datos satelitales y climáticos de la NASA y de NOAA. "
    "No es un servicio de emergencias ni un pronóstico: una detección o "
    "una tendencia no confirman un evento. Ante fuego o humo visible "
    "llamá a bomberos (100 en Argentina) o al 911.")


def _err(code: str, detail: str, status: int = 400):
    return JSONResponse({"error": code, "detail": detail}, status_code=status)


def _clean(text, limit: int) -> str:
    """One line, no control characters, capped length."""
    s = re.sub(r"[\x00-\x1f\x7f]+", " ", str(text or "")).strip()
    return s[:limit]


_LV = ("bajo", "medio", "alto")
# alert kinds from /api/field/parcels that escalate a hazard to "alto"
_ALERT_HAZARD = {"fire": "fire", "fire_risk": "fire", "hotspot": "fire",
                 "dry": "drought", "frost": "frost", "heat": "heat"}
_PHASE = {"el_nino": "El Niño", "la_nina": "La Niña"}
_WATER = {"seco": "más seco que lo normal", "normal": "normal",
          "humedo": "más húmedo que lo normal"}


def _ddmm(md) -> str:
    return f"{md[3:5]}/{md[0:2]}" if isinstance(md, str) and len(md) == 5 \
        else "?"


def _num(v, dec=0) -> str:
    return f"{v:,.{dec}f}".replace(",", "X").replace(".", ",") \
        .replace("X", ".")


def _parcel_hazards(ind: dict, alerts_: list) -> dict:
    """{hazard id: (level index 0-2 or None for no data, text)} for one
    parcel. Uses the same severity rule as the parcels ordering."""
    from .parcels import _severity  # local: keeps import cost lazy
    out = {}
    get = lambda k: ind.get(k) if isinstance(ind.get(k), dict) else {}
    safe = {k: get(k) for k in ("fire", "water", "frost", "heat", "snow",
                                "enso", "flood", "hail")}
    sev = lambda h: _severity(h, safe, alerts_)
    f = safe["fire"]
    if f.get("pct") is not None:
        lv = 2 if sev("fire") >= 3 else (1 if sev("fire") == 2 else 0)
        out["fire"] = (lv, f"Probabilidad de fuego en 7 días: {f['pct']} %.")
    w = safe["water"]
    if w.get("pct") is not None:
        out["drought"] = (2 if w.get("level") == "seco" else 0,
                          f"Humedad del suelo en la raíz: {w['pct']} % "
                          f"({_WATER.get(w.get('level'), 'sin nivel')}).")
    fr = safe["frost"]
    if fr.get("frost_free_days") is not None:
        win = fr.get("window") or {}
        out["frost"] = (min(sev("frost"), 2),
                        f"Período sin heladas: {fr['frost_free_days']} días "
                        f"(del {_ddmm(win.get('start'))} al "
                        f"{_ddmm(win.get('end'))}).")
    h = safe["heat"]
    if h.get("days_over_35") is not None:
        out["heat"] = (min(sev("heat"), 2),
                       f"{_num(h['days_over_35'])} días por año sobre 35 °C.")
    sn = safe["snow"]
    if sn.get("days_per_year") is not None:
        d = sn["days_per_year"]
        out["snow"] = (1 if d >= 10 else 0,
                       f"{_num(d)} días por año con nevada.")
    e = safe["enso"]
    if e.get("phase_now"):
        phase = e["phase_now"]
        eff = (e.get("rain_effect_pct") or {}).get(phase)
        if phase in _PHASE:
            lv = 2 if isinstance(eff, (int, float)) and abs(eff) >= 10 \
                else 1
            txt = (f"Ahora {_PHASE[phase]}"
                   + (f" (ONI {'+' if e['oni'] > 0 else ''}{_num(e['oni'], 1)})"
                      if isinstance(
                       e.get("oni"), (int, float)) else "")
                   + (f". En esta zona esos años llovieron {eff:+.0f} % en "
                      "octubre–marzo" if isinstance(eff, (int, float))
                      else "")
                   + ". Tendencia histórica, no pronóstico.")
        else:
            lv, txt = 0, "Fase neutral del ENSO (ni El Niño ni La Niña)."
        out["enso"] = (lv, txt)
    fl = safe["flood"]
    if fl.get("heavy_rain_days_yr") is not None or "low_slope" in fl:
        heavy = fl.get("heavy_rain_days_yr") or 0
        flat = bool(fl.get("low_slope"))
        lv = 2 if flat and heavy >= 2 else (1 if flat or heavy >= 2 else 0)
        out["flood"] = (lv, f"{_num(heavy, 1)} días por año con lluvia "
                        f"fuerte; terreno {'plano' if flat else 'con pendiente'}.")
    out["hail"] = (None, "No hay dato satelital de granizo; consultá el "
                         "servicio meteorológico y tu aseguradora.")
    for a in alerts_ or []:
        hz = _ALERT_HAZARD.get(a.get("kind"))
        if hz and a.get("severity") == "high" and hz in out:
            out[hz] = (2, out[hz][1])
    return out


def hazards_from_parcels(parcels: list) -> list[dict]:
    """Worst level per hazard across parcels; the text names the parcel
    when the field has more than one."""
    best: dict[str, tuple] = {}
    for p in parcels:
        if not isinstance(p, dict):
            continue
        name = _clean(p.get("name"), 60)
        for hid, (lv, txt) in _parcel_hazards(
                p.get("indicators") or {}, p.get("alerts") or []).items():
            rank = -1 if lv is None else lv
            if hid not in best or rank > best[hid][0]:
                label = f"{name}: {txt}" if name and len(parcels) > 1 else txt
                best[hid] = (rank, label)
    return [{"id": hid,
             "level": "sin_dato" if rank < 0 else _LV[rank],
             "text": _clean(txt, MAX_TEXT)}
            for hid, (rank, txt) in best.items()]


def parse(body: dict):
    """-> (email, field, hazards, app_url) or an error response."""
    if not isinstance(body, dict):
        return _err("invalid_input", "body must be a JSON object")
    email = str(body.get("email") or "").strip()
    if not EMAIL_RE.match(email):
        return _err("invalid_email", "a valid e-mail address is required")
    raw = body.get("hazards")
    parcels = body.get("parcels")
    if raw is None and isinstance(parcels, list) and 0 < len(parcels) <= 20:
        raw = hazards_from_parcels(parcels)
    if not isinstance(raw, list) or not raw or len(raw) > 20:
        return _err("invalid_input", "hazards: list of 1-20 items")
    hazards, seen = [], set()
    for h in raw:
        if not isinstance(h, dict) or h.get("id") not in HAZARDS:
            return _err("invalid_input",
                        f"hazards[].id: one of {sorted(HAZARDS)}")
        if h.get("level") not in LEVELS:
            return _err("invalid_input",
                        f"hazards[].level: one of {list(LEVELS)}")
        if h["id"] in seen:
            continue
        seen.add(h["id"])
        hazards.append({"id": h["id"], "level": h["level"],
                        "text": _clean(h.get("text"), MAX_TEXT)})
    hazards.sort(key=lambda h: LEVELS[h["level"]])
    field = _clean(body.get("field_name"), 80) or "tu campo"
    app_url = str(body.get("app_url") or "").strip()
    if not re.match(r"^https?://[^\s<>\"]{1,300}$", app_url):
        app_url = ""
    return email, field, hazards, app_url


def compose(field: str, hazards: list[dict], app_url: str) -> dict:
    """Subject, plain text and HTML of the alert (Spanish, voseo)."""
    watch = [h for h in hazards if h["level"] == "alto"]
    if watch:
        names = ", ".join(HAZARDS[h["id"]] if h["id"] == "enso"
                          else HAZARDS[h["id"]].lower() for h in watch)
        subject = f"Ashfield · Prueba de aviso: vigilá {names} en {field}"
        lead = (f"En {field} hay {len(watch)} fenómeno"
                f"{'s' if len(watch) > 1 else ''} en nivel alto: {names}.")
    else:
        subject = f"Ashfield · Prueba de aviso: sin alertas altas en {field}"
        lead = (f"En {field} no hay fenómenos en nivel alto por ahora. "
                "Así se vería un aviso cuando algo cambie.")
    lines = [f"- {HAZARDS[h['id']]}: {LEVEL_TXT[h['level']]}"
             + (f". {h['text']}" if h["text"] else "") for h in hazards]
    text = "\n".join(
        ["Este es un mail de prueba de los avisos de Ashfield.", "", lead,
         "", *lines, ""]
        + ([f"Ver el campo: {app_url}", ""] if app_url else [])
        + [DISCLAIMER])
    e = html.escape
    rows = "".join(
        f"<tr><td style='padding:4px 12px 4px 0'><strong>{e(HAZARDS[h['id']])}"
        f"</strong></td><td style='padding:4px 12px 4px 0'>"
        f"{e(LEVEL_TXT[h['level']])}</td><td style='padding:4px 0'>"
        f"{e(h['text'])}</td></tr>" for h in hazards)
    link = (f"<p><a href='{e(app_url, quote=True)}'>Ver el campo en Ashfield</a></p>"
            if app_url else "")
    body_html = (
        "<div style='font-family:sans-serif;font-size:15px;line-height:1.4'>"
        "<p>Este es un mail de prueba de los avisos de Ashfield.</p>"
        f"<p><strong>{e(lead)}</strong></p>"
        f"<table style='border-collapse:collapse'>{rows}</table>{link}"
        f"<p style='color:#666;font-size:13px'>{e(DISCLAIMER)}</p></div>")
    return {"subject": subject, "text": text, "html": body_html}


async def _send_webhook(url: str, to: str, msg: dict) -> None:
    headers = {}
    secret = get_env("ALERT_WEBHOOK_SECRET")
    if secret:
        headers["X-Ashfield-Secret"] = secret
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as c:
        r = await c.post(url, json={"to": to, **msg}, headers=headers)
        r.raise_for_status()


def _send_smtp(to: str, msg: dict) -> None:
    host = get_env("SMTP_HOST")
    port = int(get_env("SMTP_PORT") or 587)
    user, password = get_env("SMTP_USER"), get_env("SMTP_PASSWORD")
    sender = get_env("ALERT_FROM") or user
    if not sender:
        raise RuntimeError("ALERT_FROM or SMTP_USER is required")
    m = EmailMessage()
    m["Subject"], m["From"], m["To"] = msg["subject"], sender, to
    m.set_content(msg["text"])
    m.add_alternative(msg["html"], subtype="html")
    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=15) as s:
            if user and password:
                s.login(user, password)
            s.send_message(m)
    else:
        with smtplib.SMTP(host, port, timeout=15) as s:
            s.starttls(context=ctx)
            if user and password:
                s.login(user, password)
            s.send_message(m)


def _mask(email: str) -> str:
    name, _, domain = email.partition("@")
    return f"{name[:2]}…@{domain}"


@router.post("/api/alerts/test")
async def alerts_test(request: Request):
    try:
        body = await request.json()
    except Exception:
        return _err("invalid_input", "body must be valid JSON")
    parsed = parse(body)
    if isinstance(parsed, JSONResponse):
        return parsed
    email, field, hazards, app_url = parsed
    msg = compose(field, hazards, app_url)

    webhook, smtp_host = get_env("ALERT_WEBHOOK_URL"), get_env("SMTP_HOST")
    if not webhook and not smtp_host:
        return JSONResponse({"sent": False, "reason": "not_configured",
                             "preview": {"subject": msg["subject"],
                                         "text": msg["text"]}})

    key = email.lower()
    now = time.monotonic()
    if now - _last_sent.get(key, -MIN_INTERVAL_S) < MIN_INTERVAL_S:
        return _err("too_many_requests",
                    f"wait {MIN_INTERVAL_S} s between test e-mails", 429)
    try:
        if webhook:
            await _send_webhook(webhook, email, msg)
            channel = "n8n"
        else:
            await asyncio.to_thread(_send_smtp, email, msg)
            channel = "smtp"
    except Exception as exc:  # never echo credentials or the address
        log.warning("alert test send failed: %s", type(exc).__name__)
        return _err("send_failed", "the mail service did not accept the "
                    "message; try again later", 502)
    _last_sent[key] = now
    return JSONResponse({"sent": True, "channel": channel,
                         "to": _mask(email), "subject": msg["subject"]})

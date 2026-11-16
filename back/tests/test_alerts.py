"""POST /api/alerts/test and the rotation fixes that ship with it."""

import json
from pathlib import Path

import respx
from httpx import ASGITransport, AsyncClient, Response

from app.main import app
from app.routers import alerts

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
HAZARDS = [
    {"id": "fire", "level": "bajo", "text": "Probabilidad 3 % en 7 días."},
    {"id": "enso", "level": "alto", "text": "Ahora El Niño (+2,5 °C)."},
    {"id": "hail", "level": "sin_dato", "text": "No hay dato satelital."},
    {"id": "frost", "level": "medio", "text": "Heladas hasta el 31/08."},
]


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


def _clear_env(monkeypatch):
    for k in ("ALERT_WEBHOOK_URL", "ALERT_WEBHOOK_SECRET", "SMTP_HOST"):
        monkeypatch.delenv(k, raising=False)
    alerts._last_sent.clear()


async def test_preview_when_no_sender_configured(monkeypatch):
    _clear_env(monkeypatch)
    async with _client() as c:
        r = await c.post("/api/alerts/test", json={
            "email": "productor@example.com", "field_name": "Lote norte",
            "hazards": HAZARDS})
    assert r.status_code == 200
    j = r.json()
    assert j["sent"] is False and j["reason"] == "not_configured"
    text = j["preview"]["text"]
    # every natural hazard is in the mail, highest level first
    assert text.index("El Niño") < text.index("Heladas") < text.index("Fuego")
    assert "Granizo: sin dato satelital" in text
    assert "El Niño / La Niña" in j["preview"]["subject"]
    assert "Lote norte" in j["preview"]["subject"]


async def test_rejects_bad_email_and_unknown_hazard(monkeypatch):
    _clear_env(monkeypatch)
    async with _client() as c:
        r1 = await c.post("/api/alerts/test",
                          json={"email": "no-es-mail", "hazards": HAZARDS})
        r2 = await c.post("/api/alerts/test", json={
            "email": "a@b.co", "hazards": [{"id": "meteor", "level": "alto"}]})
        r3 = await c.post("/api/alerts/test", content=b"{",
                          headers={"content-type": "application/json"})
    assert r1.status_code == 400 and r1.json()["error"] == "invalid_email"
    assert r2.status_code == 400 and r3.status_code == 400


async def test_subject_has_no_header_injection(monkeypatch):
    _clear_env(monkeypatch)
    async with _client() as c:
        r = await c.post("/api/alerts/test", json={
            "email": "a@b.co", "field_name": "Lote\r\nBcc: x@y.z",
            "hazards": HAZARDS})
    assert "\n" not in r.json()["preview"]["subject"]


@respx.mock
async def test_sends_through_n8n_webhook_with_secret(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("ALERT_WEBHOOK_URL", "https://n8n.test/webhook/aviso")
    monkeypatch.setenv("ALERT_WEBHOOK_SECRET", "s3cr3t-value")
    route = respx.post("https://n8n.test/webhook/aviso").mock(
        return_value=Response(200, json={"ok": True}))
    async with _client() as c:
        r = await c.post("/api/alerts/test",
                         json={"email": "productor@example.com",
                               "hazards": HAZARDS})
        again = await c.post("/api/alerts/test",
                             json={"email": "productor@example.com",
                                   "hazards": HAZARDS})
    assert r.status_code == 200 and r.json()["sent"] is True
    assert r.json()["channel"] == "n8n"
    assert "productor@" not in r.json()["to"]
    sent = route.calls[0].request
    assert sent.headers["X-Ashfield-Secret"] == "s3cr3t-value"
    payload = json.loads(sent.content)
    assert payload["to"] == "productor@example.com"
    assert {"subject", "text", "html"} <= payload.keys()
    assert again.status_code == 429


@respx.mock
async def test_webhook_failure_is_502_without_details(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("ALERT_WEBHOOK_URL", "https://n8n.test/webhook/aviso")
    respx.post("https://n8n.test/webhook/aviso").mock(
        return_value=Response(500))
    async with _client() as c:
        r = await c.post("/api/alerts/test",
                         json={"email": "a@b.co", "hazards": HAZARDS})
    assert r.status_code == 502 and r.json()["error"] == "send_failed"


# ----------------------------------------------- rotation engine fixes ---

DIAG = json.loads((FIXTURES / "api" / "diagnose.response.json").read_text())


def test_cover_crops_survive_no_livestock():
    from app.services import rotations as eng
    from app.services.knowledge import KNOWLEDGE
    for cid in ("centeno", "vicia"):
        reasons = eng.crop_viable(KNOWLEDGE.crops[cid], DIAG,
                                  {"livestock": False}, "pampa_humeda", None)
        assert "cultivo exclusivamente forrajero" not in reasons
    alfalfa = eng.crop_viable(KNOWLEDGE.crops["alfalfa"], DIAG,
                              {"livestock": False}, "pampa_humeda", None)
    assert "cultivo exclusivamente forrajero" in alfalfa


def test_why_never_claims_a_goal_it_worsens():
    from app.services import rotations as eng
    out = eng.run(DIAG, {"rotation_id": "soja-soja"}, {"water": 5}, {},
                  "pampa_humeda")
    cur = out["strategies"][0]["indicators"]["water_balance_mm"]
    for s in out["strategies"][1:]:
        uses_more = s["indicators"]["water_balance_mm"] > cur
        if uses_more:
            assert "mejora en uso del agua" not in s["why"]
        assert "Atiende tus prioridades" not in s["why"]


def test_evidence_starts_with_the_strategy_itself():
    from app.services import rotations as eng
    out = eng.run(DIAG, {"rotation_id": "soja-soja"}, {"soil": 3}, {},
                  "pampa_humeda")
    alts = out["strategies"][1:]
    firsts = {s["evidence"][0]["text"] for s in alts}
    assert len(firsts) == len(alts)  # one own line per strategy
    assert all(t.startswith("Esta secuencia") for t in firsts)


async def test_levels_from_parcels_cover_all_phenomena(monkeypatch):
    _clear_env(monkeypatch)
    cached = json.loads((Path(__file__).resolve().parents[2] / "web" / "src"
                         / "features" / "demo" / "mendozaCached.json")
                        .read_text())["response"]
    parcels = [{"name": f"P{i}", "indicators": p["indicators"],
                "alerts": p["alerts"]} for i, p in enumerate(cached["parcels"])]
    hz = {h["id"]: h for h in alerts.hazards_from_parcels(parcels)}
    assert set(hz) == {"fire", "drought", "frost", "heat", "snow", "hail",
                       "enso", "flood"}
    assert hz["hail"]["level"] == "sin_dato"
    assert hz["fire"]["level"] == "alto"      # high fire alert in the demo
    assert "El Niño" in hz["enso"]["text"]
    async with _client() as c:
        r = await c.post("/api/alerts/test", json={
            "email": "a@b.co", "parcels": parcels})
    assert r.status_code == 200
    assert "Granizo: sin dato satelital" in r.json()["preview"]["text"]


def test_rotation_economics_scale_with_hectares_and_list_cost_items():
    from app.services import rotations as eng
    diag = {**DIAG, "area_ha": 100.0}
    out = eng.run(diag, {"rotation_id": "soja-soja"}, {"soil": 3}, {},
                  "pampa_humeda")
    e = out["strategies"][0]["economics"]
    assert e["per_ha"]["margin"] == e["per_ha"]["revenue"] - e["per_ha"]["cost"]
    assert e["total"]["cost"] == e["per_ha"]["cost"] * 100
    assert e["harvest_t_total"][0]["name"] == "Soja"
    assert "arrendamiento" in e["cost_excludes"]
    assert any("semilla" in x for x in e["cost_includes"])
    # a cover crop costs money and yields no grain
    cov = eng.economics(next(r for r in eng.KNOWLEDGE.rotations
                             if r.id == "soja-centeno"), 50.0)
    centeno = next(c for c in cov["crops"] if c["crop"] == "centeno")
    assert centeno["harvest"] is False and centeno["cost_ha"] > 0


def test_crop_names_are_capitalised_in_sequence_and_risks():
    from app.services import rotations as eng
    out = eng.run(DIAG, {"rotation_id": "soja-soja"}, {"soil": 3}, {},
                  "pampa_humeda")
    for s in out["strategies"]:
        assert all(step["name"][0].isupper() for step in s["sequence"])
        assert not any(r.startswith(("soja ", "maiz ", "trigo "))
                       for r in s["risks"])

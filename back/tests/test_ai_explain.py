"""Tests for the optional AI explanation path (task 19).

Default provider: Google Gemini (x-goog-api-key header). Anthropic is
the optional second provider. No real API calls.
"""
import pytest

from back.app.services import ai_explain as ai

ROTS = {"strategies": [
    {"id": "soja-soja", "is_current": True,
     "indicators": {"water_balance_mm": -97, "bare_soil_days": 199},
     "benefits": {}, "evidence": [], "gaps": ["sin ensayo local"],
     "risks": [], "measures": []},
    {"id": "maiz-soja", "is_current": False,
     "indicators": {"water_balance_mm": -50, "bare_soil_days": 100},
     "benefits": {"water_balance_mm": 47},
     "evidence": [{"source": "MAGyP"}], "gaps": [],
     "risks": ["riesgo"], "measures": []}],
    "confidence": "high",
    # location/identity fields that must never reach the prompt
    "diagnosis": {"centroid": [-33.89, -60.57],
                  "province": "Buenos Aires",
                  "diagnosis_id": "d-1",
                  "orin": {"rmse": 2.4}}}

VALID = ('{"strategies":['
         '{"id":"soja-soja","text":"Siembra directa de 199 días sin '
         'cultivo y balance de -97 mm. La mayor brecha es la falta de '
         'ensayo local.","cites":["water_balance_mm"]},'
         '{"id":"maiz-soja","text":"Con 100 días sin cultivo mejora '
         'el balance a -50 mm. Falta validación en la zona.",'
         '"cites":["bare_soil_days"]}]}')

MODELS = {"models": [
    {"name": "models/gemini-2.5-flash",
     "supportedGenerationMethods": ["generateContent"]},
    {"name": "models/gemini-3.0-flash",
     "supportedGenerationMethods": ["generateContent"]}]}


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    ai._cache.clear()
    ai._model_choice = None
    for v in ("GEMINI_API_KEY", "ANTHROPIC_API_KEY",
              "AI_PROVIDER", "AI_MODEL"):
        monkeypatch.delenv(v, raising=False)


def _resp(body):
    class R:
        def raise_for_status(self):
            pass

        def json(self):
            return body
    return R()


class FakeClient:
    """Stubs httpx.AsyncClient used inside ai_explain."""
    calls = 0
    gets = 0
    payload = None          # model answer text
    exc = None
    models = MODELS         # /models listing
    last_url = None
    last_headers = None
    last_body = None

    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, **kw):
        type(self).gets += 1
        if type(self).exc:
            raise type(self).exc
        type(self).last_url = url
        return _resp(type(self).models)

    async def post(self, url, **kw):
        type(self).calls += 1
        if type(self).exc:
            raise type(self).exc
        type(self).last_url = url
        type(self).last_headers = kw.get("headers") or {}
        type(self).last_body = kw.get("json") or {}
        if "anthropic" in url:
            return _resp({"content": [{"text": type(self).payload}]})
        return _resp({"candidates": [{"content": {"parts": [
            {"text": type(self).payload}]}}]})


def _stub(monkeypatch, payload, provider="gemini", models=MODELS):
    FakeClient.calls = 0
    FakeClient.gets = 0
    FakeClient.payload = payload
    FakeClient.exc = None
    FakeClient.models = models
    FakeClient.last_url = None
    FakeClient.last_headers = None
    FakeClient.last_body = None
    monkeypatch.setenv("AI_PROVIDER", provider)
    monkeypatch.setenv(
        "GEMINI_API_KEY" if provider == "gemini"
        else "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(ai.httpx, "AsyncClient", FakeClient)


@pytest.mark.asyncio
async def test_no_key_falls_back():
    assert await ai.ai_explain(ROTS) is None


@pytest.mark.asyncio
async def test_valid_answer_accepted_gemini(monkeypatch):
    _stub(monkeypatch, VALID)
    out = await ai.ai_explain(ROTS)
    assert out is not None
    assert [s["id"] for s in out["strategies"]] == \
        ["soja-soja", "maiz-soja"]
    assert FakeClient.calls == 1 and FakeClient.gets == 1
    # gemini contract: key in header, never in URL
    assert ":generateContent" in FakeClient.last_url
    assert "test-key" not in FakeClient.last_url
    assert FakeClient.last_headers.get("x-goog-api-key") == "test-key"
    gc = FakeClient.last_body["generationConfig"]
    assert gc["temperature"] == 0 and gc["maxOutputTokens"] == 900
    assert gc["responseMimeType"] == "application/json"
    assert "systemInstruction" in FakeClient.last_body
    # cache: second call must not hit the network
    out2 = await ai.ai_explain(ROTS)
    assert out2 == out and FakeClient.calls == 1


@pytest.mark.asyncio
async def test_gemini_model_fallback(monkeypatch):
    _stub(monkeypatch, VALID, models={"models": [
        {"name": "models/gemini-9.9-flash",
         "supportedGenerationMethods": ["generateContent"]},
        {"name": "models/gemini-pro",
         "supportedGenerationMethods": ["embedContent"]}]})
    out = await ai.ai_explain(ROTS)
    assert out is not None
    assert "gemini-9.9-flash:generateContent" in FakeClient.last_url


@pytest.mark.asyncio
async def test_anthropic_provider(monkeypatch):
    _stub(monkeypatch, VALID, provider="anthropic")
    out = await ai.ai_explain(ROTS)
    assert out is not None
    assert "anthropic.com" in FakeClient.last_url
    assert FakeClient.last_headers.get("x-api-key") == "test-key"


@pytest.mark.asyncio
async def test_invented_number_rejected(monkeypatch):
    _stub(monkeypatch, '{"strategies":['
          '{"id":"soja-soja","text":"Rinde 999 qq extra.",'
          '"cites":["water_balance_mm"]},'
          '{"id":"maiz-soja","text":"Con 100 días sin cultivo.",'
          '"cites":[]}]}')
    assert await ai.ai_explain(ROTS) is None


@pytest.mark.asyncio
async def test_unknown_id_rejected(monkeypatch):
    _stub(monkeypatch, '{"strategies":['
          '{"id":"trigo-x","text":"Texto.", "cites":[]},'
          '{"id":"maiz-soja","text":"Con 100 días.", "cites":[]}]}')
    assert await ai.ai_explain(ROTS) is None


@pytest.mark.asyncio
async def test_timeout_falls_back(monkeypatch):
    import httpx
    _stub(monkeypatch, None)
    FakeClient.exc = httpx.TimeoutException("t")
    assert await ai.ai_explain(ROTS) is None


@pytest.mark.asyncio
async def test_blocklist_rejected(monkeypatch):
    _stub(monkeypatch, '{"strategies":['
          '{"id":"soja-soja","text":"Esto garantiza -97 mm.",'
          '"cites":[]},'
          '{"id":"maiz-soja","text":"Con 100 días.", "cites":[]}]}')
    assert await ai.ai_explain(ROTS) is None


@pytest.mark.asyncio
async def test_prompt_privacy(monkeypatch):
    """No coordinates, place names, plot ids or Orin data may reach
    the provider even when the diagnosis carries them."""
    _stub(monkeypatch, VALID)
    await ai.ai_explain(ROTS)
    text = str(FakeClient.last_body["contents"][0]["parts"][0]["text"])
    for banned in ("-33.89", "-60.57", "Buenos Aires",
                   "d-1", "centroid", "province", "orin",
                   "diagnosis_id"):
        assert banned not in text
    # generic ids and computed indicators DO reach the prompt
    assert "soja-soja" in text and "water_balance_mm" in text


@pytest.mark.asyncio
async def test_endpoint_mode_template_and_ai(monkeypatch):
    # a developer .env may carry a real key: the template branch needs none
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    ai._cache.clear()
    from back.app.main import app
    from httpx import ASGITransport, AsyncClient
    async with AsyncClient(transport=ASGITransport(app),
                           base_url="http://t") as c:
        r = await c.post("/api/field/explain", json=ROTS)
        assert r.status_code == 200 and r.json()["mode"] == "template"
        _stub(monkeypatch, VALID)
        ai._cache.clear()
        r = await c.post("/api/field/explain", json=ROTS)
        body = r.json()
        assert body["mode"] == "ai"
        assert len(body["strategies"]) == 2


def test_validate_accepts_text_indicators_and_measure_ids():
    """Real Gemini answer (2026-11-15) was rejected for citing income /
    infiltration (string-valued indicators) and a measure factor."""
    from app.services.ai_explain import _validate
    rots = {"strategies": [{
        "id": "soja-centeno", "is_current": False,
        "indicators": {"income": "medium", "infiltration": "alta",
                       "bare_soil_days": 35},
        "benefits": {"bare_soil_days": -164},
        "measures": [{"id": "no_residue_burning",
                      "factor": "residue_burning"}]}]}
    answer = {"strategies": [{
        "id": "soja-centeno",
        "text": "Deja el suelo desnudo solo 35 días y mejora la infiltración.",
        "cites": ["infiltration", "income", "residue_burning",
                  "no_residue_burning", "bare_soil_days"]}]}
    assert _validate(answer, rots) is not None
    bad = {"strategies": [{**answer["strategies"][0],
                           "cites": ["made_up_indicator"]}]}
    assert _validate(bad, rots) is None


def test_spanish_numbers_do_not_crash_validation():
    """Gemini writes "3,3" and "1.122,8": parse them, never raise."""
    from app.services.ai_explain import _numbers_ok
    allowed = {3.3, 1122.8, 35.0}
    assert _numbers_ok("Aporta 3,3 t/ha y llueven 1.122,8 mm; 35 días.", allowed)
    assert not _numbers_ok("Aporta 4,7 t/ha.", allowed)
    assert _numbers_ok("Unos 1.123 mm por año.", {1123.0})


def test_magnitude_of_a_negative_delta_is_allowed():
    from app.services.ai_explain import _allowed_numbers, _numbers_ok
    allowed = _allowed_numbers({"benefits": {"bare_soil_days": -102}})
    assert _numbers_ok("Reduce 102 días sin cultivo.", allowed)

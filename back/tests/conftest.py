"""Make the ``app`` package importable from every test module, whatever
the working directory pytest is started from."""
import sys
from pathlib import Path

BACK_DIR = Path(__file__).resolve().parents[1]
if str(BACK_DIR) not in sys.path:
    sys.path.insert(0, str(BACK_DIR))


import pytest  # noqa: E402

# A developer .env can hold real keys and webhooks; tests never reach
# real services unless a test sets the variable itself.
_REAL_SERVICES = ("GEMINI_API_KEY", "ANTHROPIC_API_KEY", "AI_PROVIDER",
                  "AI_MODEL", "ALERT_WEBHOOK_URL", "ALERT_WEBHOOK_SECRET",
                  "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD")


@pytest.fixture(autouse=True)
def _no_real_services(monkeypatch):
    for name in _REAL_SERVICES:
        monkeypatch.delenv(name, raising=False)
    try:
        from app.services import ai_explain
        ai_explain._cache.clear()
    except Exception:
        pass

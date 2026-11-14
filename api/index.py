"""Vercel Python entry point: exports the FastAPI `app` as ASGI.

Vercel only detects serverless functions under the project-root `api/`
directory, so this thin wrapper adds `back/` to sys.path and re-exports
the app defined there (`back/api/index.py` stays as the local/uvicorn
convenience entry point).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "back"))

from app.main import app  # noqa: E402,F401

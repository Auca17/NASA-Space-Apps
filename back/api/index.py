"""Vercel entry point: exports the FastAPI `app` as an ASGI application.

`back/` is added to sys.path so `app` resolves both on Vercel (where the
function file is the entry) and locally via uvicorn.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402,F401

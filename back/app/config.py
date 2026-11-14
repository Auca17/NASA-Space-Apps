"""Environment variable access. Missing vars surface as HTTP 503, never traces."""

import os
from pathlib import Path

from dotenv import load_dotenv

# Repo-root .env for local/dev runs; real env vars (Vercel) always win.
_dot = Path(__file__).resolve()
for _p in _dot.parents:
    if (_p / ".env").exists():
        load_dotenv(_p / ".env", override=False)
        break

class MissingEnv(Exception):
    def __init__(self, variable: str) -> None:
        super().__init__(variable)
        self.variable = variable


def get_env(name: str) -> str | None:
    value = os.environ.get(name)
    if value:
        value = value.strip()
    return value if value else None


def require_env(name: str) -> str:
    value = get_env(name)
    if value is None:
        raise MissingEnv(name)
    return value


def front_origin() -> str:
    return get_env("FRONT_ORIGIN") or "*"

"""Fetch published JSON artifacts from DATA_BASE_URL (R2 public base, /v1/).

Supports file:// bases for local development against fixtures/.
JSON responses are cached in-process via the shared TTL cache.
"""

import json
import os
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx

from ..cache import CACHE
from ..config import require_env

TIMEOUT = httpx.Timeout(3.0)


def data_url(path: str) -> str:
    base = require_env("DATA_BASE_URL")
    return urljoin(base.rstrip("/") + "/", path.lstrip("/"))


async def fetch_json(url: str, client: httpx.AsyncClient | None = None) -> dict:
    if url.startswith("file://"):
        if os.environ.get("VERCEL"):  # file:// is dev-only, never in prod
            raise RuntimeError("file:// DATA_BASE_URL not allowed on Vercel")
        p = urlparse(url).path
        if re.match(r"^/[A-Za-z]:", p):  # Windows drive in file:///C:/...
            p = p[1:]
        return json.loads(Path(p).read_text(encoding="utf-8"))
    if client is None:
        async with httpx.AsyncClient(timeout=TIMEOUT) as c:
            return (await c.get(url)).raise_for_status().json()
    return (await client.get(url)).raise_for_status().json()


async def risk_shard(h3_r2: str) -> dict | None:
    """risk/{h3_r2}.json, cached 6 h in-process under the shared cache."""
    cached = CACHE.get(h3_r2, "risk_shard")
    if cached is not None:
        return cached
    try:
        shard = await fetch_json(data_url(f"risk/{h3_r2}.json"))
    except (httpx.HTTPError, OSError, json.JSONDecodeError):
        return None
    CACHE.set(h3_r2, "risk_shard", shard, ttl_seconds=6 * 3600)
    return shard

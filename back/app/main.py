"""FastAPI app for the NASA Space Apps backend (Vercel serverless)."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import importlib
import logging
import traceback

from .config import MissingEnv, front_origin

log = logging.getLogger("app")
# Each router loads on its own: one that fails to import (a native
# library missing in the serverless runtime) no longer takes down the
# whole API; /api/health reports which one and why.
ROUTER_ERRORS: dict[str, str] = {}
ROUTERS = []
for _name in ("live", "risk", "field", "parcels", "geocode", "alerts"):
    try:
        ROUTERS.append(importlib.import_module(f".routers.{_name}", __package__))
    except Exception:  # noqa: BLE001 - reported by /api/health
        ROUTER_ERRORS[_name] = traceback.format_exc(limit=6)
        log.exception("router %s failed to import", _name)

app = FastAPI(title="NASA Space Apps backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[front_origin()],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.exception_handler(MissingEnv)
async def missing_env_handler(_: Request, exc: MissingEnv):
    return JSONResponse(
        status_code=503,
        content={"error": "missing_env", "variable": exc.variable,
                 "detail": f"environment variable {exc.variable} is not set"})


for _module in ROUTERS:
    app.include_router(_module.router)


@app.get("/api/health")
async def health():
    out = {"ok": not ROUTER_ERRORS}
    if ROUTER_ERRORS:
        out["router_errors"] = ROUTER_ERRORS
    try:
        from .routers.field import SATELLITE_ERROR
        if SATELLITE_ERROR:
            out["satellite_errors"] = SATELLITE_ERROR
    except Exception:  # noqa: BLE001
        pass
    return out

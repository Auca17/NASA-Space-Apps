"""FastAPI app for the NASA Space Apps backend (Vercel serverless)."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import MissingEnv, front_origin
from .routers import alerts, field, geocode, live, parcels, risk

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


app.include_router(live.router)
app.include_router(risk.router)
app.include_router(field.router)
app.include_router(parcels.router)
app.include_router(geocode.router)
app.include_router(alerts.router)


@app.get("/api/health")
async def health():
    return {"ok": True}

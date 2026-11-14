# back — FastAPI backend (Vercel serverless, Hobby plan)

Endpoints (contract §4):
- `GET /api/live?window=24h|48h|7d&bbox=minLon,minLat,maxLon,maxLat` — FIRMS NRT
  proxy. Fetches the 4 sources concurrently (10 s timeout each, D22); failed
  sources are listed in `sources_failed`, never fail the request. The bbox is
  expanded outward to 5° multiples (returned as `bbox`); effective areas
  > 400 deg² — or responses that would exceed 4 MB — return
  `mode: "cells"` with `[[h3_r3, count, max_frp], ...]` instead of `points`.
  `7d` is built from two FIRMS requests per source (`day_range=5` latest +
  `day_range=2` starting today−6, FIRMS caps a request at 5 days) and merged
  with dedup on `(lat, lon, acq_instant, satellite)`.
  - All sources fail → `502 {"error":"upstream_unavailable"}` + `no-store`.
  - Some fail → `200` + `s-maxage=600` (degraded answers don't stick 3 h).
  - All ok → `200` + `s-maxage=10800, stale-while-revalidate=3600`.
  - Upstream error bodies are logged at warning level (first 120 chars +
    source name); URLs are never logged because they contain the key.
- `GET /api/risk?lat&lon` — looks up `risk/{h3_r2}.json` under `DATA_BASE_URL`
  (cached 6 h in-process), returns the res-5 cell + `h3_r5` + `generated_at`.
- `GET /api/health` — liveness probe.

## Environment variables

| Var | Required | Meaning |
|---|---|---|
| `FIRMS_MAP_KEY` | `/api/live` | FIRMS API key. Missing → `503 {"error":"missing_env"}` |
| `DATA_BASE_URL` | `/api/risk` | Public R2 base ending in `/v1/` (or `file://` path in dev) |
| `FRONT_ORIGIN` | no | CORS origin; defaults to `*` (dev) |

Secrets are read only from env; nothing is logged.

## Layout

```
back/api/index.py     Vercel entry — exports `app` (ASGI)
back/app/main.py      FastAPI app, routers, CORS, MissingEnv -> 503 handler
back/app/routers/     live.py, risk.py
back/app/services/    firms.py (FIRMS client), data.py (DATA_BASE_URL fetch + cache)
back/app/cache.py     TTL cache, key = (h3_cell, utc_date, name)  [res-6 for field]
back/app/h3util.py    lat/lon -> h3 r2/r5/r6
back/tests/           pytest + respx
back/requirements.txt pinned deps
```

## Local run

```bash
.venv/Scripts/pip install -r back/requirements.txt
set DATA_BASE_URL=file:///C:/Users/Rufda/Desktop/NASA-Space-Apps/fixtures/
set FIRMS_MAP_KEY=<key>
.venv/Scripts/python -m uvicorn back.api.index:app --port 8765
```

`file://` support exists so `/api/risk` runs against `fixtures/` with no server.
A static server (`python -m http.server -d fixtures`) + `DATA_BASE_URL=http://…`
works too.

## Tests

```bash
.venv/Scripts/python -m pytest back/tests
```

## Vercel wiring

`vercel.json` (repo root) uses the **current zero-config layout** — `functions`
+ `rewrites`, not the legacy `builds`/`routes` keys, because `builds` and
`functions` cannot coexist and `maxDuration` can only be set via `functions`:

```json
{ "functions": { "back/api/index.py": { "maxDuration": 30 } },
  "rewrites": [{ "source": "/api/:path*",
                 "destination": "/back/api/index.py" }] }
```

For Python framework apps Vercel builds one function from the resolved
entrypoint, so `functions` is keyed on `back/api/index.py` (not on `/api`
routes). `maxDuration: 30` covers D22 (FIRMS needs up to ~10 s × 4 sources +
aggregation); Hobby allows up to 300 s, so 30 is a conservative cap.

The future `web/` front coexists cleanly: zero-config picks up its framework
normally, and `rewrites` keep `/api/*` pointing at the Python function — no
catch-all ordering conflict.

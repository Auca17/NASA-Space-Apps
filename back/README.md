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
{ "functions": { "back/api/index.py": { "maxDuration": 60 } },
  "rewrites": [{ "source": "/api/:path*",
                 "destination": "/back/api/index.py" }] }
```

For Python framework apps Vercel builds one function from the resolved
entrypoint, so `functions` is keyed on `back/api/index.py` (not on `/api`
routes). `maxDuration: 60` covers D22 and the diagnose budget
(FIRMS ~10 s × 4 sources; diagnose's own budget is 10 s wall-clock);
Hobby allows up to 300 s, so 60 is a conservative cap.

The future `web/` front coexists cleanly: zero-config picks up its framework
normally, and `rewrites` keep `/api/*` pointing at the Python function — no
catch-all ordering conflict.

## POST /api/field/diagnose

Body: `{"polygon": <GeoJSON Polygon>}` xor `{"point": [lat, lon], "ha": 50}`.
Validated: closed ring, 3–500 vertices, 0.5–5000 ha (geodesic), lat/lon ranges.
Returns `diagnosis_id` (sha256 of sorted res-6 cells + UTC date), `area_ha`,
`centroid`, `h3_r5`, `h3_r6`, 12 `cards`, `calendar`. Header `Cache-Control:
no-store`. One failed source never fails the request — its card goes
`value: null`, `confidence: "low"`.

Upstream calls run concurrently, each cached under
`(h3_r6 centroid, utc_date, source)` including negative results. Timeouts:
3 s everywhere, except POWER daily point API (5 s, D25) — one request,
`PRECTOTCORR,T2M_MAX,T2M_MIN,RH2M,WS2M,GWETTOP,GWETROOT,GWETPROF,EVPTRNS`,
2001-01-01 → yesterday; `-999` → null.

Card sources: weather cards (rain, heavy_rain, frost, heat, crop_water,
recent_weather, soil_moisture fallback) ← POWER daily; soil_moisture prefers
`field/grid` SMAP `sm_anom_pct` (9 km); water_trend ← `field/grid.grace_trend`;
fire ← `fire/cal/{r2}` + `risk/{r2}` shards; slope ← AWS Terrain Tiles
(Terrarium, SRTM ~30 m); soil ← ISRIC SoilGrids v2 (0–30 cm weighted);
vigor_bare_soil ← ORNL MODIS MOD13Q1 NDVI (250 m, last 3 y — usually null:
the service exceeds the 3 s budget).

Note (03b): SoilGrids and ORNL time out even at 15 s from our test machine —
not usable on demand right now, so the 3 s budget stays.

Note (06): `soil` and `vigor_bare_soil` now fall back to the precomputed
`field/grid` shard when the live APIs time out — `field/grid.soil`
(SoilGrids WCS 0–30 cm, `{texture, soc_g_kg}`) and
`field/grid.bare_soil_days_yr` (MOD13C2 monthly NDVI, 0.05°, months with
NDVI<0.2 × 30, confidence `low`).

Environment: `back/app/config.py` loads the repo-root `.env` at import via
`python-dotenv` (`override=False` — real env vars always win) and strips
surrounding whitespace in `get_env`. `model/` entry scripts load it the
same way.

Calendar rows (levels 0–3; `null` row when no data):

| row | level thresholds |
|-----|------------------|
| bare_soil | monthly fraction of MOD13Q1 composites with NDVI<0.25: ≥0.1→1, ≥0.3→2, ≥0.6→3 |
| frost | fraction of month days T2M_MIN≤0 °C: ≥2%→1, ≥10%→2, ≥30%→3 |
| water_stress | monthly precip/potential-ET ratio: <0.5→3, <0.8→2, <1.0→1, else 0 |
| heat | fraction of month days T2M_MAX>35 °C: ≥2%→1, ≥10%→2, ≥25%→3 |
| burn_season | month mean of the 52-week fire climatology, fraction of the peak: ≥0.15→1, ≥0.4→2, ≥0.7→3 |

## POST /api/field/rotations + /explain

Body: `{diagnosis: <full diagnose response>, current: {rotation_id|sequence|null}, priorities: {water|soil|erosion|income|forage|nitrogen|pests|avoid_burning: 0-5}, constraints: {irrigation, machinery, livestock, markets}, zone?}`.
`current: null` = "no sé" -> the first zone-valid rotation in file order
(placeholder typicality). Always returns the current strategy
(`is_current: true`) + exactly 3 alternatives; when fewer than 3 are
viable, the least-bad non-viable ones fill in with their reasons in `risks`.
`Cache-Control: no-store`. `POST /api/field/explain` takes that response and
returns one template paragraph per strategy (`{strategies:[{id,text}]}`).

Priority -> indicator weights, viability thresholds and engine constants are
documented in `app/services/rotations.py` (module docstring). Knowledge
(`back/knowledge/`) is validated at import; bad crop refs fail loudly.

## Fire prevention measures (D26, contract 4.6)

`fire_weather` card (diagnose): last 7 valid POWER days — mean RH2M, max
WS2M, max T2M_MAX, days since >1 mm rain. Score: +1 each for RH<30 %,
wind>11 m/s (~40 km/h), T>35 °C, >10 dry days (INTA harvest stop-work
thresholds). 3+ = alto, 2 = moderado, else bajo.

`measures` + `measures_gaps` on `/api/field/diagnose`, `/api/risk` and every
rotation strategy, from `app/services/measures.py` (pure `evaluate(ctx)`).
Triggers:

| rule | fires when |
|---|---|
| harvest_in_dry_season | a sequence `end` month has burn_season>=2 or water_stress>=2 |
| fire_weather_high | `fire_weather` card = alto |
| risk_high | risk `cat` in {alto, muy_alto} |
| bare_soil_in_burn_season | sequence leaves a burn_season>=2 month uncovered |
| burn_season_now | today's month has burn_season>=2 |

Missing input -> trigger skipped, listed in `measures_gaps`. Order: most
triggers fired first, then lowest cost. `burns_avoided` in the rotation
engine uses the same `uncovered_burn_months` rule.

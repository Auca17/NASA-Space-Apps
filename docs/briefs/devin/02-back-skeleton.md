# Devin task 02 — Back skeleton: FastAPI on Vercel with `/api/live` and `/api/risk`

Read first: `docs/data-contract.md` (sections 1, 2.6, 4, 4.1, 4.4) and `docs/decisions.md` (D6, D18). Do not modify `docs/` or `fixtures/`. Do not commit.

## Goal

A deployable Python back end under `back/` that runs as Vercel serverless functions on the free Hobby plan, exposing `GET /api/live` (FIRMS NRT proxy, cached) and `GET /api/risk` (lookup in `risk/{h3_r2}.json`), with the shared cache layer that later tasks (`/api/field/*`) will reuse.

## Constraints (D18)

- Vercel Hobby: keep each request well under 10 seconds; every outbound HTTP call has a 3-second timeout and runs concurrently with `httpx.AsyncClient`.
- Secrets only from environment variables: `FIRMS_MAP_KEY`, `DATA_BASE_URL` (R2 public base, ending with `/v1/`). Never log them. A missing variable returns HTTP 503 with a clear JSON error, not a stack trace.
- No database. Caching is HTTP-level (`Cache-Control: public, s-maxage=..., stale-while-revalidate=...`) plus an in-process dictionary keyed by H3 res-6 cell + UTC day for the field endpoints to come. Build the cache helper now with that key shape, even if only `/api/risk` uses it today.

## Layout

```
back/
  api/index.py          Vercel entry: exports the FastAPI `app`
  app/main.py           FastAPI app, routers, error handlers, CORS (allow the front origin from env `FRONT_ORIGIN`, default `*` in dev)
  app/routers/live.py   GET /api/live
  app/routers/risk.py   GET /api/risk
  app/services/firms.py FIRMS NRT client
  app/services/data.py  fetch JSON from DATA_BASE_URL with the cache helper
  app/cache.py          key = (h3_r6, utc_date, name); TTL in seconds
  app/h3util.py         lat/lon -> h3 at res 2, 5, 6
  tests/                pytest, with `respx` or `httpx.MockTransport` for outbound calls
  requirements.txt      fastapi, uvicorn, httpx, h3, pydantic, pytest, respx
  README.md             how to run locally (`uvicorn`), env vars, how Vercel picks it up
vercel.json             routes `/api/*` to `back/api/index.py`, Python runtime
```

If `vercel.json` must live at the repo root, create it there and document that the front will be added later under `web/` without conflicting.

## `GET /api/live?window=24h|48h|7d&bbox=minLon,minLat,maxLon,maxLat`

- Sources: `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, `VIIRS_SNPP_NRT`, `MODIS_NRT` via the FIRMS area API: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{source}/{bbox}/{days}` where `days` is 1, 2 or 7. Fetch the four sources concurrently; a failed source is skipped and listed in `sources_failed`.
- Default `window=24h`; default bbox = world. Validate the bbox; return 400 on nonsense.
- Response exactly as `fixtures/api/live.response.json`: `updated_at` (now, UTC), `window_h`, `sources` (the ones that answered), `points` as `[lat, lon, frp, satellite, acq_instant]` with `satellite` mapped to `N20`, `N21`, `N`, `T`, `A`. Keep only rows with VIIRS `confidence` in `nominal`/`high` or MODIS `confidence >= 30`.
- Headers: `Cache-Control: public, s-maxage=10800, stale-while-revalidate=3600`.

## `GET /api/risk?lat&lon`

- Compute `h3_r5` and `h3_r2` from the point; fetch `${DATA_BASE_URL}risk/{h3_r2}.json` (cache it 6 hours); return the cell object plus `h3_r5` and `generated_at`. If the shard or cell is missing, return 404 with `{ "error": "no_risk_for_cell", "h3_r5": ... }`.
- Headers: `Cache-Control: public, s-maxage=3600`.

## Tests

1. `/api/live` with mocked FIRMS responses: merges sources, maps satellites, filters low confidence, sets the cache header, and reports a failing source in `sources_failed` without failing the request.
2. `/api/live` with an invalid bbox returns 400.
3. `/api/risk` with a mocked shard equal to `fixtures/risk/82a967fffffffff.json` returns the Corrientes cell for (-28.5, -57.8) and 404 for a point whose shard has no cell.
4. Missing `FIRMS_MAP_KEY` returns 503 JSON.
5. Cache helper: same key within TTL hits; different `utc_date` misses.

## Run and report

Run the tests and start the app locally once, calling `/api/risk` against `fixtures/` served by a tiny static server (or `DATA_BASE_URL=file://...` if you implement a file scheme for dev). Report: layout created, how Vercel routes to the app, test results, any decision you had to take that the brief did not cover, and the exact environment variables the integrator must set in Vercel.

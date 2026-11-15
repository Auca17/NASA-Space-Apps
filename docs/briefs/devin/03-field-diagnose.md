# Devin task 03 — `POST /api/field/diagnose`

Read first: `docs/data-contract.md` sections 1, 2.3, 2.6, 2.7, 4 and 4.2 (and the D23 note in 4.3), `docs/decisions.md` D16, D18, D23. Example output: `fixtures/api/diagnose.response.json`. Build on the existing `back/` app and reuse its cache helper (`back/app/cache.py`, key `(h3_r6, utc_date, name)`), its data service (`back/app/services/data.py`) and its error handling. Do not modify `docs/` or `fixtures/`. Do not commit.

## Goal

Given a plot anywhere in the world, return the diagnosis cards and the 12-month agricultural calendar of contract 4.2 in under 10 seconds, using point APIs on demand and the precomputed `field/grid` shard when it exists. Any card that cannot be computed returns `value: null` and `confidence: "low"`; the request never fails because one source failed.

## Input

`{ "polygon": <GeoJSON Polygon> }` or `{ "point": [lat, lon], "ha": 50 }`. Validate: polygon closed, 3 to 500 vertices, area between 0.5 and 5,000 ha; point inside lat/lon ranges; otherwise 400 with a clear error. Compute `area_ha` geodesically, `centroid`, and the covering `h3_r5` and `h3_r6` cells.

## Cards (ids from contract 4.2)

For each card: decide the source, measure it, and keep each outbound call under the 3-second timeout (D18), all calls concurrent. Prefer, in this order: the `field/grid/{h3_r2}.json` shard value if present; a fast point API; otherwise `null` + `low`.

| id | Primary on demand | Notes |
|---|---|---|
| `rain` | NASA POWER point, **monthly** endpoint, `PRECTOTCORR`, 2001 to last full year | mean annual mm, coefficient of variation, 25th percentile year |
| `heavy_rain` | `field/grid` (`heavy_days_yr`) | no fast daily source on demand; null if absent |
| `frost` | NASA POWER point, check the parameter catalog for a climatology or monthly frost parameter; else derive from monthly `T2M_MIN` | text like "Período libre de heladas: 15/10 – 20/04" |
| `heat` | NASA POWER point, monthly `T2M_MAX` or a hot-days parameter from the catalog | days per year above 35 °C if available |
| `soil_moisture` | `field/grid` (`sm_anom_pct`) | SMAP is precomputed only |
| `crop_water` | ORNL MODIS web service (`MOD16A2` ET) for the centroid | measure latency; if it exceeds 3 s typically, return null and say so in the report |
| `vigor_bare_soil` | ORNL MODIS web service (`MOD13Q1` NDVI) for the centroid, last 3 years | days per year with NDVI below a bare-soil threshold; same latency rule |
| `slope` | AWS Terrain Tiles (public, no key, SRTM-based Terrarium PNG) for the polygon | mean slope % |
| `soil` | ISRIC SoilGrids v2 point query (texture class, SOC 0–30 cm) | known to be slow; strict 3 s timeout |
| `water_trend` | `field/grid` (`grace_trend`) | precomputed only |
| `fire` | our `fire/cal/{h3_r2}.json` (burn season months from the climatology) and `risk/{h3_r2}.json` (7-day category) via `DATA_BASE_URL` | |

Every card carries `source`, `resolution` and `confidence`, and Spanish user text in neutral Spanish as in the fixture.

## Calendar

Rows `bare_soil`, `frost`, `water_stress`, `heat`, `burn_season`, each 12 integers 0–3, derived from the same data as the cards (document the thresholds in `back/README.md`). If a row has no data, return it with all values `null`. The `current_rotation` row is not produced here: the front overlays it from `/api/field/rotations`.

## Caching and limits

- Cache each upstream answer per `(h3_r6 of the centroid, utc_date, source_name)`.
- `diagnosis_id`: deterministic hash of the sorted `h3_r6` list plus the UTC date.
- Response header `Cache-Control: no-store` (POST).
- Total wall time under 10 seconds; log per-source latency at info level.

## Also in this batch (small, from the 02c review)

- `vercel.json`: `maxDuration` 60 for the function.
- `/api/live`: for complete responses use `Cache-Control: public, s-maxage=10800, stale-while-revalidate=86400` (D24). Keep the 600-second rule for partial failures and `no-store` for total failure.

## Tests

- Mocked upstreams: all sources OK returns 11 cards with the contract keys and 5 calendar rows of 12 values.
- One upstream timing out returns that card with `value: null`, `confidence: "low"`, and the request still returns 200.
- Invalid polygon (open ring, 2 vertices, 10,000 ha) returns 400.
- Cache: a second call for the same plot on the same day does not hit the upstreams again.

## Report

Changed files; for each card the source finally used and the latency you measured with one real call for the public demo plot near pampa (lat -33.89, lon -60.57, 50 ha; `point` input) and one for a plot outside Argentina of your choice; which cards came back null and why; total wall time of both calls; test results. If a source needs a key or account, do not create one: report it.

# Devin task 02b — Corrections to the back skeleton (review of task 02)

Task 02 structure is accepted. These are blockers found by testing against the real FIRMS API. Fix all of them in one batch. Read the updated `docs/data-contract.md` section 4.1 and `docs/decisions.md` D22 first. Do not modify `docs/` or `fixtures/`. Do not commit.

## Evidence (real FIRMS NRT responses, 2026-11-14)

```
VIIRS_NOAA20_NRT header and rows:
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
-31.93914,-59.77549,302.72,0.55,0.51,2026-11-13,433,N20,VIIRS,n,2.0NRT,288.79,0.91,N

MODIS_NRT header and rows:
latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-34.88919,-57.9215,306.53,2.14,1.42,2026-11-13,17,Terra,MODIS,68,6.1NRT,288.99,22.53,N

World bbox, VIIRS_NOAA20_NRT, 1 day: 2,614,119 bytes in 3.36 s.
```

## Blockers

1. **VIIRS confidence.** Real values are `l` / `n` / `h`. The current filter only accepts `nominal` / `high`, so every VIIRS point is dropped. Accept `n` and `h` (keep accepting the full words too). Drop `l`.
2. **MODIS satellite.** Real values are `Terra` / `Aqua`. Map them to `T` / `A` as the contract requires.
3. **Timeout and payload size (D22).**
   - FIRMS timeout: 10 seconds for `/api/live` only. Keep 3 seconds as the default for every other outbound call.
   - Function max duration at least 30 seconds on Vercel Hobby. Check the current Vercel docs for how to set it for a Python function; if the legacy `builds` key in `vercel.json` prevents it, migrate to the current zero-config layout (functions config + rewrites) and keep `/api/*` working. Document the choice in `back/README.md`, including how the future `web/` front will coexist.
   - Expand the requested bbox outward to multiples of 5 degrees before calling FIRMS; return the effective `bbox` in the response.
   - If the effective bbox area is greater than 400 square degrees, respond with `mode: "cells"` and `cells: [[h3_r3, count, max_frp], ...]` aggregated server-side, instead of `points`. Otherwise `mode: "points"` with `points` as today.
   - Never return more than 4 MB of uncompressed JSON. If a points response would exceed it, fall back to `cells`.

## Tests to add

- Parse the two real CSV samples above verbatim: VIIRS `n` row kept, MODIS `Terra` row mapped to `T`, an `l` row dropped.
- bbox `-61.2,-29.8,-57.1,-27.3` expands to `-65,-30,-55,-25` and returns `mode: points`.
- World bbox returns `mode: cells` with `h3_r3` strings of resolution 3.
- A synthetic points payload over 4 MB falls back to `cells`.

## Report

Changed files, how max duration is configured now, test results, and one manual call against the real FIRMS API using `FIRMS_MAP_KEY` from the root `.env` (the user created it; do not print the key): a small bbox around Corrientes for 24h (expect `points`) and the world for 24h (expect `cells`), with status, response size and elapsed time.

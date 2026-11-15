# Devin task 32 — Parcels API: per-parcel fire and water indicators, risk zones, nearby services, plain summary (back end only)

Main worktree (it has `data/`, `.env`, `.venv`). Branch first: `git fetch; git checkout -B feat/parcels-api origin/main`. Commit on the branch (conventional commits, no AI trailers), push the branch, never main. **Edit only `back/**` and `docs/data-contract.md`** (four other terminals edit `web/`). Never print secrets.

## Why

The team lead tested the app. The main job of the app is: the producer marks the field, splits it into parcels with what is planted in each, states needs and worries (water access, distance to emergency services), and sees, plainly, the fire probability and dryness of each parcel and where on the map the danger is. The current diagnosis is too complex for a farmer. A new UI (task 34, another terminal) will consume this endpoint; it builds against the example below, so **keep the contract exactly** and add fields only if needed (document them).

## Endpoint

`POST /api/field/parcels`

Request:

```json
{
  "boundary": {"type": "Polygon", "coordinates": [[[lon, lat], ...]]},
  "parcels": [
    {"id": "p1", "name": "Lote norte", "crop": "soja", "polygon": {"type": "Polygon", "coordinates": [[[lon, lat], ...]]}}
  ],
  "needs": {
    "water_access": "none | well | channel | irrigation | unknown",
    "emergency_distance_km": 12.5,
    "concerns": ["fire", "water", "frost", "heat", "flood", "access"],
    "notes": "free text up to 300 characters"
  },
  "lang": "es"
}
```

Validation: boundary as today's diagnose polygon rules (closed ring, no self-intersection, no antimeridian, 0.5 to 5000 ha); 1 to 20 parcels; each parcel inside the boundary (clip it to the boundary, reject if the clipped area is below 0.1 ha); parcels may not overlap by more than 1 percent of the smaller one; `crop` is one id of `back/knowledge/crops.json` or `otro` or `sin_cultivo`; `needs` optional, unknown concerns ignored, notes trimmed to 300 and never sent anywhere except the AI provider after the existing privacy sanitizer. Clean 400 errors with stable `error` codes.

Response:

```json
{
  "parcels": [
    {
      "id": "p1", "crop": "soja", "area_ha": 120.4,
      "indicators": {
        "fire":  {"pct": 4, "level": "bajo | moderado | alto | muy_alto", "basis": "one plain sentence on what the number is"},
        "water": {"pct": 13, "level": "seco | normal | humedo", "basis": "..."},
        "heat":  {"days_over_35": 12, "basis": "..."},
        "frost": {"frost_free_days": 288, "basis": "..."}
      },
      "alerts": [{"kind": "fire | dry | heat | frost", "severity": "high | medium", "text": "plain Spanish sentence with what to do"}]
    }
  ],
  "zones": [
    {"kind": "hotspot | fire_risk | dry | bare_soil", "geometry": {"type": "Polygon", "coordinates": []},
     "center": [lon, lat], "radius_m": 1000, "pct": 62, "label": "short label", "source": "VIIRS NOAA-20 NRT", "date": "2026-11-15"}
  ],
  "nearby": {
    "fire_stations": [{"name": "Bomberos Voluntarios X", "distance_km": 8.2, "lon": 0, "lat": 0}],
    "hospitals": [], "water": [{"name": "Canal Y", "kind": "canal | river | lake | reservoir", "distance_km": 1.1}],
    "source": "OpenStreetMap contributors", "degraded": false
  },
  "summary": {"headline": "one sentence", "bullets": ["at most 3"], "source": "gemini | template"},
  "sources": [{"id": "...", "text": "..."}],
  "degraded": false, "degraded_reason": null
}
```

## How to compute (be honest; every number must have a `basis`)

- Reuse the existing diagnose machinery (`back/app/routers/field.py`, `field_sources.py`, the risk shards, the field grid, POWER with its resilience and degraded fallback, elevation correction). Do not duplicate logic: factor small helpers if needed. Compute the shared cell data once for the boundary and then per parcel (parcels in the same data cell share climate values; say so in `basis` when the parcel is smaller than the data resolution).
- **fire.pct**: the 7-day fire probability of the risk model for the cell, as a percent (real model value; it is usually low). `level` from the model category. Raise to `alto` and add a high-severity alert when an active detection of the last 72 h lies within 5 km of the parcel. Add a fire alert (severity high) when `pct >= 50` **or** level `alto`/`muy_alto` **or** that nearby detection rule fires. The alert text tells what to do (call the emergency number, keep firebreaks, do not burn stubble).
- **water.pct**: root-zone soil wetness from POWER `GWETROOT` (0 to 1, use the mean of the last 30 available days, times 100). `level`: `seco` below the 20th percentile of the same calendar month in the cell's own history (2001 to last year), `humedo` above the 80th, else `normal`. Adjust nothing by crop in the number itself; add a dry alert when `seco` and the crop is not `sin_cultivo`, mentioning the crop and the water access the producer declared (for example "sin acceso a agua: priorizá..."). If GWETROOT is unavailable, fall back to the 30-day rain anomaly and say so in `basis`.
- **heat/frost**: from the existing derivations.
- **zones**: (1) `hotspot`: FIRMS detections of the last 72 h within 25 km of the boundary, one circle per detection with `radius_m` 375 for VIIRS (1000 for MODIS), geometry as a 32-vertex polygon; (2) `fire_risk`: risk cells (H3 res 5 or 6, whatever the shards hold) intersecting a 10 km buffer of the boundary with level `alto` or `muy_alto`, geometry the hexagon; (3) `dry`: each parcel whose water level is `seco`, geometry the parcel itself; (4) `bare_soil`: the grid cell when its bare-soil days are above the regional 80th percentile. Cap at 200 zones, nearest first.
- **nearby**: OpenStreetMap Overpass API (`https://overpass-api.de/api/interpreter`, POST, 6 s timeout, a descriptive generic User-Agent without personal data): fire stations (`amenity=fire_station`) and hospitals within 50 km, water (`waterway=river|canal`, `natural=water`, `landuse=reservoir`) within 10 km of the boundary centroid; coordinates rounded to 0.01 degree before sending; cache by rounded centroid for 24 h; on failure return empty lists with `degraded: true`. Distances by haversine, sorted, at most 5 each.
- **summary**: use the existing `back/app/services/ai_explain.py` (Gemini by default, template fallback, sanitizer, strict output validation). Input only the computed numbers, crops, needs and alerts; output one headline and up to 3 bullets in plain Spanish (voseo) or English per `lang`, no numbers that are not in the input, no advice that contradicts the alerts. Without `GEMINI_API_KEY` the template produces the same shape. The headline leads with fire.
- Time budget: everything in parallel where possible, total under 20 s worst case (Vercel limit 60 s); report measured times for 1 and for 20 parcels.

## Tests and docs

Unit tests for validation (all error codes), clipping and overlap, indicator math with fixtures (no network), alert rules (pct 50 boundary, nearby detection, dry plus crop), zones capping, Overpass failure, AI fallback. One integration test through FastAPI with stubbed upstreams. Document the endpoint in `docs/data-contract.md` (new section) with the example above. Also add `back/tests/fixtures/parcels_example.json` with a realistic full response for the Pergamino demo plot split into three parcels (soja, maiz, sin_cultivo), at least one hotspot zone, one fire_risk zone, one dry parcel and a fire alert, so the UI terminal can use it; push it early (first commit, within the first 30 minutes) because the UI terminal waits for it.

## Report

Endpoint behavior with a real call on the Pergamino demo plot (three parcels) and on a plot in Valle de Uco, timings, test counts, what is approximate and why, and anything you could not do.

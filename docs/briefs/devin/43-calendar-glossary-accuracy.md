# Devin task 43 — Vulnerable seasons on the calendar, a real glossary, and "how well the satellite sees your plot"

Branch: `git fetch; git checkout -B feat/calendar-glossary origin/main`. You own `web/src/components/Glossary.tsx` and its test, new files `web/src/features/field/Calendar.tsx`, `SatelliteAccuracy.tsx`, `DiagTile.tsx` (extract the tile from FieldLens if needed), the **calendar section and the glossary line of `web/src/features/field/FieldLens.tsx` only** (another terminal edits the rest of that file: keep your hunks inside those two blocks and the imports), `gloss.`/`field.calendar*`/`field.accuracy*` i18n keys, and `web/src/styles/app.css` calendar/glossary classes. Back-end fields come from task 44 (another terminal): build against the contract below and a fixture until it lands. Commit on the branch, push, never main. Do not stop servers on 8000, 5173, 5174.

## Findings from the review

- Field Shift asks to show bare-soil periods and seasons when soil or plants are vulnerable. We have a calendar table but it does not overlay the current rotation's cycle, and bare soil is null outside Argentina.
- The glossary is five terms in one line at the bottom; the brief also asks for frost, soil-moisture anomaly and satellite versus ground difference. Degree days are defined but `gdd_base10` is null for every crop (task 44 fills it).
- Validation exists (Orin temperature, SIGA rain) but the uncertainty never reaches an ordinary diagnosis.

## Build

1. **Calendar with the rotation overlaid.** `Calendar.tsx`: 12 months as columns; rows: the crops of the current rotation (or the parcels' crops when no rotation yet) as bars from planting to harvest using the catalog windows per zone; bare-soil months (from `bare_soil` months when present, else inferred as months with no crop bar); the frost window; months with water stress (balance below zero or `dry` level) and heat (days over 35 above the monthly median); the fire season. Mark in red the months where a crop bar coincides with frost or water stress and name them in a sentence under the calendar: "Riesgo: el trigo coincide con heladas en julio y agosto; la soja con déficit de agua en enero." Pattern plus color, legend, keyboard-readable table fallback (`<table>` with scope headers). Works when some rows are missing (say which data are missing). Prop-driven and tested with fixtures; then wire it into the calendar section of FieldLens replacing the plain table.
2. **Glossary of at least 10 terms, next to the data.** Terms: NDVI, evapotranspiration, reference ET0, anomaly, soil-moisture anomaly, water balance, degree days (base 10), frost (threshold used), frost-free window, satellite versus ground (why they differ: pixel size, elevation), bare soil, El Niño/ONI, hydrologic group (infiltration). Each definition in plain Spanish and English, one or two sentences, with the unit. Place the "?" next to each card title and each indicator that uses the term (map card id → terms), keep a collapsible "Glosario" listing all terms in "Más información". Contrast and 44 px targets.
3. **"Qué tan bien ve el satélite tu lote" card** (`SatelliteAccuracy.tsx`): rendered in every diagnosis from the new `accuracy` field of the diagnose response (task 44): per variable the typical error from our validations (temperature ± °C from Orin, rain ± mm/month and bias from SIGA), the elevation correction applied, and one sentence of what it means ("la lluvia satelital suele sobrestimar en zonas de montaña"). When `accuracy` is missing, show the card with the generic limits text. Contract:
   ```json
   "accuracy": {"temp_rmse_c": 2.9, "temp_rmse_adjusted_c": 1.8, "rain_bias_mm_month": 22.1, "rain_rmse_mm_month": 51.2, "rain_r": 0.59, "stations": {"temperature": 53, "rain": 25}, "note": "...", "sources": ["orin_validation", "siga_rain_validation"]}
   ```

## Verification

Component tests (overlay math, red months sentence, missing rows, glossary placement per card, accuracy card with and without data), `npm test`, tsc, lint, build, parity, `impeccable detect`, screenshots at 390 and 1280 px of the calendar and the accuracy card (`43-*`).

## Report

What changed, screenshots, tests, exact FieldLens hunks you touched.

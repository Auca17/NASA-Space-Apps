# Devin task 10 — Front skeleton (`web/`), one long unit

Read first, in this order: `docs/PRD.md` sections 5 to 7 and 12 (experience and accessibility), `docs/data-contract.md` (all of it, especially 2.1 to 2.8 and 4), `docs/decisions.md` (D4, D9, D10, D11, D13, D18, D19, D20, D22, D25, D26, D29). Ready-made data: `fixtures/` (static files with real H3 cells) and the running back (`back/`). Do not modify `docs/`, `fixtures/` or `back/` (if the back needs a change, list it in the report). Do not commit. Never print secrets. Project name is undecided (D20): use a single constant `APP_NAME = "Nombre a definir"` and never hardcode a name elsewhere. UI copy is neutral Spanish with English as a second locale (see i18n below). Work through every stage; a blocked piece is skipped and reported, and the rest is finished.

## Stack

Vite, React 18, TypeScript (strict), MapLibre GL JS v5 with `projection: globe`, `h3-js`, Observable Plot for the small bar charts, Vitest + Testing Library, ESLint. No UI kit; plain CSS with CSS variables (light and dark through `prefers-color-scheme`). Pin versions. Code in `web/`.

## Dev setup (so it runs against fixtures today and real data later)

- `VITE_DATA_BASE_URL` (default `/data/v1/`): in dev, serve the repo `fixtures/` folder at that path through a small Vite middleware (read-only). In production it will be the R2 URL.
- `VITE_API_BASE` (default empty = same origin): in dev, proxy `/api/*` to `http://localhost:8000` (the back run with `uvicorn app.main:app` from `back/` with `DATA_BASE_URL=file://.../fixtures/`).
- A missing shard (HTTP 404) is normal: the UI shows a friendly "sin datos en esta región" state, never an error screen.
- `web/README.md`: how to run in three commands, env vars, how to point at real data.

## Source layout

`src/api` (typed clients for data files and the endpoints, one module per contract file, runtime-narrowed types written by hand from the contract), `src/domain` (pure logic, fully unit-tested), `src/features/{globe,fire,field,live,welcome}`, `src/components` (shared: BottomSheet, Calendar, Card, Legend, Tooltip, Glossary), `src/i18n` (es.json, en.json, `t()` helper), `src/styles`.

## Pure logic first (`src/domain`, with tests)

1. **Area to cells**: circle of 50 km around a point, polygon, or the cell under the reticle, to the set of H3 res-5 cells (`h3-js`), grouped by their res-2 shard.
2. **Fire series from shards**: load `fire/cal/{r2}.json` for the shards of an area, sum cell series into one monthly series (`n`), build the year x month matrix, and the fire-season view (July to June) as a toggle.
3. **Baseline stats**: median and percentiles by calendar month over 2003-2022 (D10).
4. **Semaphore (D9)**: from `fire/daily/{r2}.json` sum cells per day, build 30-day rolling windows over the 2003-2022 baseline, compute the percentile of the current 30-day window and the category (<50 normal, 50-80 sobre lo normal, 80-95 alto, >95 extremo); show "x veces la mediana" only when the median is at least 5, otherwise the text "históricamente casi sin fuego en este mes"; a zero value with a zero median is "normal". Read the thresholds from `meta.json` (`semaphore`), never hardcode them. Use a fixed approach that keeps the main thread responsive (compute in a Web Worker).
5. **Risk presentation (D29)**: for `level: "historial"` with ratio 1 show "normal para la época" plus the historical probability; categories bajo, moderado, alto, muy alto with text and an icon, never color alone; reasons list; the fixed text "Estimación experimental basada en datos satelitales. No reemplaza alertas oficiales."; emergency numbers by country (Argentina: Bomberos 100, Emergencias 911; other countries: a generic "contactá a los servicios de emergencia locales").
6. **Color scales**: viridis or inferno for counts, RdBu for anomalies, all with a numeric or textual companion.
7. Tests for every function above with the fixture data (for example, the Corrientes fixture shard must reproduce the year x month matrix from `fire/cal`).

## Screens and behavior

1. **Welcome**: short explanation, button "Ver mi zona" (geolocation is asked only on tap, requires HTTPS, text "Tu ubicación se usa solo en tu navegador y no se guarda."), and link "Explorar el planeta". No permission or no GPS: city or region search (use the free Nominatim endpoint with a polite 1 request per second limit and a text field, keyboard friendly) and a start view over Argentina. The app is never blocked.
2. **Globe**: MapLibre globe with NASA GIBS Blue Marble as base (WMTS, no key), OpenFreeMap labels when zoomed in, H3 hexagons colored by `globe/{YYYY-MM}.json` (res 3), res-5 hexagons when zoomed in from the area shard, a center reticle, and the panel following the reticle with a 300 ms debounce. Optional slow auto-rotation, off under `prefers-reduced-motion`. If WebGL fails or the device is slow, fall back to `projection: mercator` and, as the last resort, the panel with tables only.
3. **Historic mode**: month slider from 2000-11 to now, play/pause, speed, hexagons change per month with prefetch of the next months, the calendar cell of the displayed month is highlighted, and the globe stays rotatable while playing. Toggles: calendar year or fire season (July to June); counts or anomalies.
4. **Area panel** (bottom sheet on mobile, side panel on desktop): risk 7 days (calls `/api/risk` for the center cell), month semaphore, calendar (a real `<table>` with headers, rows = years, columns = months, 44 px touch targets, tap shows the number), yearly bars, prevention measures cards (from the risk and diagnose responses, each with why, benefit, requires, cost, source), CSV download of the aggregated series built in the browser, and for Argentina a link to the raw points files.
5. **Live mode**: `/api/live` with window 24h, 48h or 7d and the visible bbox; handle both `mode: "points"` and `mode: "cells"`; hours since detection; show the fixed notice "Detección térmica satelital: no es un incendio confirmado y llega con horas de demora", plus the emergency numbers; optional GIBS VIIRS true color background; "última actualización hace X horas".
6. **Field lens** (button "Analizar mi campo"): draw a polygon on the map (MapLibre Draw or a small custom tool), or tap a point for a standard 50 ha plot, or choose the demo plot (pampa, D19: lat -33.89, lon -60.57, 50 ha); plots saved in `localStorage` only. Call `/api/field/diagnose`, then show the diagnosis cards (value, sentence, source, resolution and a confidence badge; null cards say "Sin datos disponibles" and why), and the agricultural calendar as an accessible table with levels 0 to 3 shown by shade plus a text or symbol. Then a form: current rotation (selector from the knowledge list, or "no sé"), priorities as sliders 0 to 5 (agua, suelo, erosión, ingreso, forraje, nitrógeno, plagas, evitar quemas), constraints (riego, maquinaria, ganadería, mercado). Call `/api/field/rotations` and render the current rotation plus 3 alternatives as cards side by side (carousel on mobile) with the five sections (por qué, evidencia, beneficios comparados con la actual, vacíos de información, riesgos), the prevention measures of each strategy, the sequence timeline with cover or bare periods, the `/api/field/explain` paragraph, and the fixed notice "Herramienta de apoyo: no reemplaza tu experiencia ni la de un agrónomo local.". A "?" glossary icon next to each technical term (evapotranspiración, NDVI, anomalía, balance hídrico, grados-día) with a one-sentence explanation.
7. **Language switch** es/en, persisted in `localStorage`; all strings in the JSON files.

## Accessibility and performance

WCAG 2.2 AA: everything usable by keyboard (arrow keys rotate the globe, plus and minus zoom, space toggles play), visible focus, logical order, ARIA live region for the playing month used sparingly, touch targets of at least 44 x 44 px, zoom to 200 percent without breaking, `prefers-reduced-motion` respected, contrast AA, never color alone. Mobile first at 360 to 400 px. Initial JS under 300 KB gzip excluding MapLibre (report the real number with `vite build`); route-level code splitting for the field lens and live mode. Run Lighthouse accessibility locally if possible and report the score, with the goal of 90 or more.

## Tests and quality

Vitest for all `src/domain` code and for the API clients against fixtures; Testing Library tests for the Calendar table (headers, 44 px targets), the semaphore text rules and the welcome flow when geolocation is denied. `npm run lint`, `npm run typecheck` and `npm test` must pass. Add a `npm run build` check.

## Report

What runs today against fixtures (list the screens), screenshots taken with the Orca browser or any headless browser at 390 px and 1280 px for the welcome, globe with panel, historic mode, field diagnosis and rotation cards (save under `web/screenshots/`, git-ignored), the JS bundle size, test counts, Lighthouse score if measured, deviations from this brief, and any change you need in the back or the contract.

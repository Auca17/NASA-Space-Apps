# Devin task 49 — Remove the Fire and Live modes from the app (front end)

Branch: `git fetch; git checkout -B feat/remove-fire-modes origin/main` (main 1711906 or later). You own all of `web/src` **except `web/src/landing/**`** (another terminal rewrites the landing), `web/scripts/**`, `web/app/index.html`. Commit on the branch in reviewable slices (conventional commits, no AI trailers), push, never main. Do not stop servers on ports 8000, 5173, 5174. The back end is not touched by this task: `/api/live` stays because the n8n workflows use it.

## Decision (team lead, 2026-11-15)

Hot Spots is retired from the product: remove the **Fire mode** (25-year historic globe, semaphore, CSV export, playback) and the **Live mode** (detections of the last 24 h, 48 h, 7 d) from the app. Keep everything that sits inside the plot: fire probability per parcel, fire alerts (including the internal "detection within 5 km" rule, computed by the back end), zones on the parcel map, "quemas evitadas" in the rotations, INTA prevention measures, the emergency block, the calendar burn season. The n8n alert work stays untouched.

## Build

1. **One app, one flow.** Remove the mode switch (top bar tabs and the mobile bottom tab bar): the app is the field flow. Keep the compact top bar (logo as home, menu with Emergencias, Datos y métodos, language) and the field chooser; drop the bottom tab bar entirely and give the map and sheets the space back (re-check safe-area insets and every layout rule from tasks 38 and 40: one sheet at a time, frame control never overlapping, 360 to 1280 px).
2. **Delete the code and what it drags along:** `web/src/features/fire/**` (AreaPanel, HistoricControls, semaphore, CSV, playback), `web/src/features/live/**`, `web/src/domain/live.ts` and every fire-history domain helper that nothing else uses, the cells, outline and historic layers and setters in `GlobeView.tsx` (keep shapes, draft, markers, the WebGL fill overlay, the field basemaps and everything the field flow uses), the API client functions only they used (`apiLive`, risk-by-area, globe month files, fire points, fire daily, fire calibration used by the area panel), their types, their i18n keys (es and en, keep parity), CSS, tests and fixtures. Use `tsc` and `eslint` to find dead exports. If a helper is also used by the field flow, keep it.
3. **Welcome:** remove the "Otras vistas" fire entries. Keep the question, "Analizar mi campo", "Ver un ejemplo" (Mendoza demo), and the location and search entry if it serves the field flow.
4. **Deep links:** `#demo` and `#demo-mendoza` keep working; the old `#lat,lon` fire link must now open the field flow centered there (or be ignored), never a blank screen.
5. **Emergency block:** keep the call block, the copy-the-message button, the country table and the "never automatic" rule. Remove the part that lists live detections near the user (it needs the Live mode); keep the plot-level link from a fire alert to the emergency sheet.
6. **Methods and data drawer ("Datos y métodos"):** remove the fire harmonization and historic-series sections; keep the sources and methods of the field engine and the plot fire risk (FIRMS stays as a source of the internal alert and the risk model).
7. **Scripts:** retarget or delete `web/scripts/smoke-fire39.mjs` and any assertion about the fire or live views in `smoke-tablet40.mjs`, `smoke-shell.mjs`, `smoke-mobile38.mjs`, `demo-e2e.mjs`, `parcels-e2e.mjs`; run the ones that remain.
8. Bundle size: report the before and after JS transfer of `/app` (the globe layers and the fire code should shrink it).

## Verification

`npm test`, `npx tsc --noEmit`, lint, build (synthetic guard), es/en parity, `impeccable detect`, then Playwright at 360, 390, 768, 1024 and 1280 px against the real back end on port 8000 and the R2 data: welcome → "Analizar mi campo" → draw → parcels → result with the fire percentage per parcel, an alert and the emergency sheet; `#demo` end to end. Screenshots `49-*`.

## Report

What was deleted (files and lines), what was kept on purpose, bundle size before and after, screenshots, anything that referenced the removed modes and how you resolved it.

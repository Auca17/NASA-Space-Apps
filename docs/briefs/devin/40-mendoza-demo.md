# Devin task 40 — Guided demo: a fictional producer in Mendoza

Branch: `git fetch; git checkout -B feat/mendoza-demo origin/main`. You own `web/src/features/field/**`, `web/src/features/parcels/**`, `web/src/domain/parcels*.ts`, a new `web/src/features/demo/**`, the "Ver un ejemplo" entry in Welcome, and `parcels.`/`field.`/`demo.` i18n keys. Another terminal adds crops to the back end (`feat/f1-f6`, task 39): until it merges, use crop `otro` with a display name override and switch to the real ids when they land (vid, olivo, ajo, alfalfa, frutales de carozo, monte nativo). Do not stop servers on ports 8000, 5173, 5174. Commit on the branch (conventional commits, no AI trailers), push, never main.

## What the team lead asked

"La demo guiada la vamos a hacer con un productor inventado en alguna parte de campo de acá de Mendoza." The jury and producers must see the whole value in one tap, without drawing anything.

## Build

1. **The farm.** Pick a real rural location in Mendoza with visible cultivated plots on the satellite base map (look at the imagery; Valle de Uco around La Consulta or San Carlos, near -33.73, -69.12, or the east around Junín / San Martín). About 120 to 250 ha. Draw the boundary following real plot edges as closely as reasonable, and split it into 4 or 5 parcels with plausible crops: vid, olivo, ajo or alfalfa, frutales de carozo, and a strip of monte nativo or sin cultivo. Store it as a static fixture `web/src/features/demo/mendozaFarm.ts` (boundary, parcels, crops, names).
2. **The producer (fictional, and clearly said so).** A name and a short profile (for example "Finca Los Álamos", family producer, drip irrigation from a well, worried about frost, water and fire from the neighboring monte). Priorities set to his worries (heladas, sequía, fuego first), needs (water access well, emergency distance), and illustrative economics per parcel. Show a visible note: "Productor y finca de ejemplo. La ubicación y los datos satelitales son reales; el productor, los nombres y los números económicos son inventados para la demo."
3. **One tap.** "Ver un ejemplo" on Welcome and on the landing link `/app/#demo` (support the hash) loads the farm, flies to it, draws the parcels with their crop colors, runs `/api/field/parcels` with the profile, and opens the result (alerts, summary, parcel rows, zones on the map). Keep the result live (real API), with a cached fallback of a real response stored in the fixture for when the back end or a provider is down (say "resultado guardado del [date]" when the fallback is used).
4. **Guided tour (short, skippable).** 4 or 5 steps with small anchored hints: the parcels and their crops, the fire and water badges, the alert, the priorities tab, "Más información". Next, Back and Close; Escape closes; keyboard and screen reader friendly; never blocks the map; does not reappear once closed (localStorage in try/catch). Reduced motion respected.
5. Also fix the small accessibility issue from the mobile layout: the field chooser peek toggle reports an inverted `aria-expanded` on compact widths; make the attribute match the visible state.

## Verification

Tests for the hash route, the fixture validity (simple polygons, parcels inside the boundary, no overlap), the tour steps and dismissal, the fallback path; `npm test`, tsc, lint, build, parity, `impeccable detect`; a Playwright run of `/app/#demo` at 390 and 1280 px with screenshots in `web/screenshots/41-*`.

## Report

The farm location and why, the parcel layout, screenshots, tests, and what still uses `otro` until task 39 merges.

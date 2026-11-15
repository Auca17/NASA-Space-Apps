# Devin task 34 — Field: draw the field, split it into parcels with their crops, state needs, see fire and dryness per parcel on the map

New worktree, branch `feat/parcels-ui` from `origin/main`; `cd web; npm install`. Commit on the branch (conventional commits, no AI trailers), push the branch, never main.

## Ownership (other terminals work in parallel; do not touch their files)

You own: `web/src/features/field/**` (including the freehand and polygon drawing layer, the field picker and the field panel), a new `web/src/features/parcels/**`, a new `web/src/styles/parcels.css` imported from your own components, `web/src/domain/parcels*.ts`, and new keys prefixed `parcels.` or `field.` in `web/src/i18n/es.json` and `en.json`. Do **not** edit `web/src/App.tsx`, `glass.css`, `app.css`, the globe, live, welcome or landing files (tasks 33 and 35 own them). If you need a hook in `App.tsx`, keep everything inside the field feature; if impossible, list the exact change needed in your report. Reuse the glass classes that exist (`.glass` and its tokens); do not redefine them.

Read first: `docs/ui-style.md`, `PRODUCT.md`, `docs/data-contract.md`, the Impeccable skill `C:/Users/Rufda/.claude/skills/impeccable/SKILL.md` (run `impeccable context` once; use `shape` for the flow and `clarify` and `polish` for the result), and the back-end contract in `docs/briefs/devin/32-parcels-api.md` (another terminal is building `POST /api/field/parcels` now). Build against the example response: until `back/tests/fixtures/parcels_example.json` appears on `origin/feat/parcels-api`, write your own fixture with exactly that contract under `web/src/features/parcels/__fixtures__/`, and switch to the real endpoint when available (fetch the branch to read the fixture; do not merge it).

## What the team lead asked (the brief behind this task)

The main job of the app is the field analysis against fire probability. Field information today is too complex for a farmer: digest it and serve it plainly, with less information and a "Ver más" button for the rest. Seriousness throughout: no playful tone.

## Build

1. **Drawing that adapts (bug)**: today a new point joins the first and last points and produces crossed, ugly shapes. New behavior: while drawing, the open path follows the clicks; once closed, clicking near an edge inserts a vertex **on that edge** (the shape adapts, never reconnecting first and last), vertices can be dragged, a vertex can be removed (button in the panel and right click or long press), undo works, and self-intersections are prevented (refuse the move with a short message). Keyboard path kept (coordinates entry). Tests for insert-on-nearest-edge, drag, remove, undo, and the self-intersection guard.
2. **Parcels**: after the field boundary is set, "Dividir en parcelas": the user draws sub-polygons inside the boundary (clipped to it) or splits with a line; up to 20 parcels; each parcel gets a name and a crop chosen from the crops in `knowledge/crops.json` (load it from the data base URL like the app does) plus "Otro" and "Sin cultivo". Each crop has a fixed, distinguishable color (colorblind-safe palette; check with a simulator) and a crop icon; parcels are filled with their crop color on the map. A legend shows **only the crops present** in this field.
3. **Needs and worries**: a short step: water access (none, well, channel, irrigation, unknown), distance to the nearest emergency service if they know it (otherwise the app shows the nearest from the API), concerns as chips (fire, water, frost, heat, flood, access), optional note (300 characters). Skippable.
4. **Results on the map**: call `POST /api/field/parcels`. Draw each zone from `zones` clearly: hotspots as outlined circles, fire-risk hexagons with a hatched or outlined style, dry parcels with a distinct outline, bare soil with its own pattern; each zone kind in the legend; never color alone (pattern or outline plus label). On each parcel show a compact badge: icon plus percent for fire (flame icon, `fire.pct` %) and water (drop icon, `water.pct` %), for example "drop 13 %". Use SVG icons consistent with the app; emoji only as a fallback.
5. **Fire alerts**: when any parcel has a fire alert (`alerts` kind fire, severity high; the back end raises it at `fire.pct >= 50`, at level alto or muy alto, or with an active detection within 5 km), show a prominent alert at the top of the panel with `role="alert"`, the alert text, and a link to the emergency block. Same for dry alerts at lower prominence.
6. **Panel content, reduced**: lead with the summary headline (fire first) and up to 3 bullets, then one compact row per parcel (color, name, crop, fire %, water %, alerts), then the nearby emergency services and water. Everything else (the existing diagnosis cards, calendar, scenarios, rotations, Orin validation) moves behind a single "Ver más" disclosure, unchanged in function. Every number keeps its `basis` one tap away (a small info button per indicator).
7. **States**: loading with progress text, degraded response notice with retry (reuse the existing pattern), empty or zero-parcel state (analyze the whole field as one parcel), errors from the API mapped to plain Spanish.
8. Keep the old single-plot path working: analyzing without splitting treats the whole field as one parcel.

## Verification

Unit and component tests for each item (drawing, parcels and legend, needs step, zones rendering, badges, alert thresholds, "Ver más"), `npm test`, `npx tsc --noEmit`, lint, build with the synthetic-data guard, es/en parity, `impeccable detect --json src` on your files, and a manual run against the real back end on port 8000 (already running in the main worktree; it gains the endpoint when task 32 merges, so use the fixture until then) with screenshots at 390 and 1280 px in `web/screenshots/`.

## Report

Per item: what changed, files, tests, screenshots; what is still on the fixture; exact changes needed outside your ownership, if any.

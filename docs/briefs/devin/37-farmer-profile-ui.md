# Devin task 37 — Farmer customization: my priorities, my costs, what I want to see; everything else in a separate tab

Continue in your worktree after task 34: commit and push task 34 first, then `git fetch; git merge origin/main` (main now has the parcels API, the app shell work of another terminal and a fixed AI summary) and keep working on `feat/parcels-ui`. Same file ownership as task 34 (field and parcels features, `parcels.css`, `parcels.`/`field.` i18n keys); do not edit `App.tsx`, `glass.css`, `app.css`, globe, live, welcome or landing. Commit on the branch (conventional commits, no AI trailers), push, never main.

Contract: `docs/briefs/devin/36-farmer-profile-api.md` (another terminal builds it now; it pushes an updated `back/tests/fixtures/parcels_example.json` to `origin/feat/farmer-profile` early; use it, or your own fixture with exactly that contract until it appears).

## What the team lead asked

"Que el agricultor pueda poner su propio input: sus costos, beneficios, opciones que quiere ver, con su rango de prioridad, por ejemplo fenómeno del Niño, nevada, granizo. Darle más customización de lo que quiera ver, y dejar en alguna pestaña la información extra, por si la quiere ver." Keep it serious and simple: a farmer on a phone.

## Build

1. **"Mis prioridades"** step (in the needs step of task 34, or right after it, skippable): the hazards fire, sequía, Niño/Niña, heladas, nevadas, granizo, calor, inundación as a reorderable list (drag handle plus up and down buttons for keyboard and touch, 48 px rows), each with a "mostrar / ocultar" toggle. Sensible default order: fuego, sequía, heladas, Niño, calor, nevadas, granizo, inundación. Remember the choice in `localStorage` (wrapped in try/catch), never on a server.
2. **"Mis números"** (optional, per parcel, collapsed by default): costo por hectárea, precio esperado por tonelada, rinde esperado (if empty, the app uses the department average from MAGyP and says so), currency USD or ARS. Plain labels with units and examples as placeholders; numeric validation with clear messages.
3. **Results follow the profile**: the parcel rows and the badges show the hazards in the API `order`, the first two or three visible ones only; hidden hazards are not shown in the main view. Icons for each hazard (flame, drop, snowflake, hail, sun, thermometer down for frost, wave for flood, a simple ENSO glyph), always with a word and a value. Granizo shows "sin dato satelital" with the basis, honestly. El Niño shows the current phase and "en años Niño llueve X % más/menos en tu zona (tendencia histórica, no pronóstico)".
4. **Economics** when given: per parcel margin per hectare and total, break-even yield, and the risk-adjusted margin with its basis one tap away; clear "estimación aproximada" label; no colors alone for losses.
5. **Tabs in the field panel**: "Resumen" (headline, alerts, parcel rows following the profile, economics), "Mis prioridades" (edit profile and numbers, re-run), "Más información" (everything else: hidden hazards, the full diagnosis cards, calendar, scenarios, rotations, Orin validation, sources). Tabs are accessible (roving tabindex, arrow keys, `aria-selected`), and on phones they stay visible at the top of the sheet.
6. Fire alerts from task 34 stay above the tabs, always visible, whatever the priorities.

## Verification

Tests for reorder (pointer and keyboard), hide and show, persistence fallback, economics validation and rendering, ordering from the API, the hail and ENSO wordings, tabs keyboard behavior; `npm test`, `npx tsc --noEmit`, lint, build with the synthetic guard, es/en parity, `impeccable detect --json src` on your files, screenshots at 390 and 1280 px against the real back end on port 8000 (main worktree) or the fixture.

## Report

Per item: what changed, files, tests, screenshots, what is still on the fixture.

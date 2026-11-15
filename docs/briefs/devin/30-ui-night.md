# Devin task 30 — UI: smoke findings, pending front wiring, emergency call (you are the only terminal that edits `web/`)

The UI freeze is lifted for you. Work in your own worktree on a new branch: `git fetch; git checkout -B feat/ui-night origin/main; cd web; npm install`. Commit on your branch is allowed (conventional commits, no AI trailers); push the branch, never main. The orchestrator merges. Other terminals do not touch `web/`. Rules of the app design (read first): `docs/ui-style.md`, `PRODUCT.md`, and the earlier design rules (plain Spanish with units, word-first labels, no color alone, 44 px targets, contrast 4.5, keyboard operable, es and en with the i18n completeness test, reduced motion respected). The people who use the data are Argentine producers and agronomists first (low-end phones, 4G, little time), and the jury second: every screen must lead with the plain-language takeaway and keep numbers, sources and exact values one tap away.

The R2 bucket now serves everything your smoke test found missing: `orin/validation.json`, `orin/lots.geojson`, `knowledge/cases.json`, `ecostress_demo.json`. Build and test against it (`VITE_DATA_BASE_URL=https://pub-f3e35e60ad774d339f43297a54691092.r2.dev/v1/`).

## 1. Fix your smoke findings

1. **Blank cream map at 390 px** in several views (field chooser, historic, place finder, rotations): investigate tile loading (MapLibre `error` and `sourcedata` events, the base style and tile sources, request failures of GIBS, EOX and OpenStreetMap, the first-frame behavior while the bottom sheet opens) and make it robust: a visible neutral base map fallback style that always renders (for example a plain land and water style from the data we control, or the OpenFreeMap style), retry with backoff on tile errors, never a blank canvas; add a test or a harness check that the fallback engages when the primary tiles fail.
2. **Raw ids in "Vacíos de información"** ("rain tiene resolución…", "heavy_rain…"): the strings are built in the back end (`back/app/services/rotations.py`, function that builds `gaps`); you may edit that one function and its tests to use the human card titles, and also guard the front so that any remaining raw id is mapped through the `card.<id>` labels before display.
3. **Over-limit freehand selection**: "Analizar este terreno" must be disabled (with the reason in text) when the area exceeds 5,000 ha; add the test.
4. Re-run the smoke checks that were blocked: the Orin validation card, the "Un caso real" card and the ECOSTRESS demo card now have their data.

## 2. Wire the pending back-end fields

1. **Degraded diagnosis** (`degraded: true`, `degraded_reason`): a notice with `role="alert"`, the reason in plain Spanish, a visible "Reintentar" button that calls diagnose again, and everything else keeps working; never a blank screen. The cards of a degraded response show their source text as returned.
2. **Orin validation card** with the new fields: rows with `reference_kind: "field"` keep the current wording and show the elevation finding ("Sin corregir se equivoca X °C. Con la corrección por altura que aplica la app, Y °C", fields `rmse_adjusted`, `bias_adjusted`); a row with `reference_kind: "finer_satellite"` (the NDVI row, which is **not** on R2 yet: build it against the example fixture and make it appear only when present) says plainly "Comparado con Sentinel-2 de 10 m sobre un viñedo de 263 ha, MODIS de 250 m …" and adds one line for the producer ("un píxel de 250 m mezcla hileras, suelo y sombra"). With `n` under 5 add the badge text "pocas mediciones". Tests for the wordings and the hidden rows.
3. **IMERG**: the `rain` card now says "GPM IMERG, 0,1°" when the back end returns it; make sure the "Fuente y precisión" line shows `source` and `resolution` as returned for every card, including the elevation correction note.

## 3. Emergency call (`docs/briefs/devin/26-emergency-call.md`)

Do it as written (call block with tel links, copy-the-message button, country table with sourced numbers, conditions for showing it, never automatic, location never sent).

## 4. Then stop and report

One report: what changed per section, screenshots at 390 and 1280 px (git-ignored `web/screenshots/`) of the fixed map, the degraded notice (use a stubbed response in a harness only), the Orin card with the real R2 data, the case card, the ECOSTRESS card and the emergency block, test counts (front and back), `impeccable detect` output (`C:/Users/Rufda/.claude/skills/impeccable/scripts/impeccable detect --json web/src web/index.html`), and any defect you saw but did not fix. After the report wait: the orchestrator will send a design polish brief next.

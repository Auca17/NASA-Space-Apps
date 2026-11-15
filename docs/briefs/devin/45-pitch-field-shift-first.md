# Devin task 45 — Invert the pitch: Field Shift first, Hot Spots as a method section

Branch: `git fetch; git checkout -B docs/field-shift-first origin/main`. You own `README.md`, `README.es.md`, `docs/submission/**`, `docs/landing/**`, `web/src/landing/**`, `web/index.html`, `web/es/index.html`, and a new `LICENSE`. Do not edit the app. Commit on the branch, push, never main. Do not stop servers on 8000, 5173, 5174.

## The review finding

Half of the repo, the pitch and the video are Hot Spots (fire pipeline, LightGBM risk, 25-year globe, live mode, n8n alerts). For a Field Shift jury that is noise and it dilutes the story. What belongs in Field Shift and stays: the 7-day fire risk with reasons as a plot-level extreme event, the burning season on the calendar, "quemas evitadas" per rotation, INTA prevention measures, and the MODIS/VIIRS harmonization as the example of bringing different resolutions to one grid (F8). Nothing is deleted from the code; the narrative is inverted.

## Build

1. **README (both languages):** title and first paragraph say Field Shift and the producer: the field, the four rotation cards with their five sections, parcels with fire and water, validation against stations. Then data and method (including the harmonization as the F8 example), then honesty and limits, then "Also built: Hot Spots" as a final section (fire lens, live, alerts idea). Keep every number true to the code. Replace the `[PENDIENTE]`/`[PENDING]` placeholders you can: team section (Ariel, Augusto, Ezequiel, Alex with their roles as in `docs/decisions.md` or the briefs), challenge and categories; leave the demo, video and dataset URLs as clearly marked placeholders with the exact spot to paste them.
2. **Landing:** the hero and the three blocks lead with the producer and the rotations ("¿Qué conviene sembrar en tu lote?"), the example link goes to `/app/#demo` (pampa, ends in rotation cards, another terminal makes that true), the fire block becomes "el fuego como riesgo del lote" plus the harmonization as method; live and alerts leave the first screen. Keep the honest requirement table and its statuses.
3. **Video script and slides outline** in `docs/submission/`: rewrite the script around pampa ending in the four rotation cards (about 150 s): producer and question, draw or one-click example, the four cards and the five sections of one, parcels with fire and water, the calendar with vulnerable months, validation with its honest limit, method slide (one grid, many resolutions: MODIS/VIIRS example), close. Slide outline with exact text per slide: slides about live mode, CSV export and n8n are removed from the main deck and kept in an appendix list.
4. **LICENSE:** add an MIT license file (copyright 2026 Ashfield team) and mention it in the READMEs. Note in the report that the team must confirm the license choice.
5. Check every claim in the new text against the code (the app at http://localhost:5174/app/, back end on 8000) and list the file that supports each number.

## Verification

Landing tests, build, `impeccable detect`, screenshots at 390 and 1280 px (`45-*`).

## Report

What changed, claims and their sources, remaining placeholders.

# Devin task 42 — The one-click demo must end in the rotation cards (Field Shift core)

Branch: `git fetch; git checkout -B feat/demo-rotations origin/main` (main 7549439 or later). You own `web/src/features/demo/**`, `web/src/features/parcels/**`, `web/src/features/field/FieldLens.tsx` except its calendar section and its glossary line (another terminal edits those two blocks; keep your hunks away from them), `web/src/domain/parcels*.ts`, `web/src/domain/rotations.ts`, the "Ver un ejemplo" entry, `demo.`/`parcels.`/`field.rot*` i18n keys. Commit on the branch (conventional commits, no AI trailers), push, never main. Do not stop servers on ports 8000, 5173, 5174.

## The review finding

The guided demo ("Ver un ejemplo") lands on a Mendoza farm with vineyards, olives and garlic: the rotation engine does not cover perennials and Cuyo has one rotation in the catalog, so the comparison is empty or absurd there. The tour has 5 steps and none opens the rotations, which are the core of the Field Shift brief (current rotation plus three alternatives, each with why, evidence, benefits, gaps, risks). Rotations also sit behind "Más información" and only run after the user picks a current rotation, three priorities and presses compare. The video script uses Pergamino while the app button goes to Mendoza.

## Build

1. **Primary demo = Pergamino.** Add a second demo farm `pergaminoFarm.ts` (real plot edges near -33.89, -60.57, 150 to 250 ha, 3 or 4 parcels: soja, maíz, trigo/soja de segunda, and a pasture or sin_cultivo strip), fictional producer and profile (worries: sequía, fuego, erosión; needs; illustrative economics). "Ver un ejemplo" and `/app/#demo` open Pergamino. Keep Mendoza as `/app/#demo-mendoza` and as a secondary link "Otro ejemplo: finca en Mendoza (perennes)" where the app explains that rotations do not apply to vineyards and olives.
2. **Rotations run automatically in the demo and whenever the data suffice.** When the parcels result arrives and the zone has rotations, call `/api/field/rotations` without extra clicks using: current rotation inferred from the parcels' crops (soja then maíz means the catalog rotation that matches; if none, the closest; show "rotación actual estimada: X (cambiala si no es)"), and priorities derived from the hazard profile (see 3). Show the four rotation cards (current + 3) in a new "Rotaciones" tab placed right after "Resumen", not inside "Más información". The manual form stays available under the cards to adjust current rotation, priorities and constraints and re-run.
3. **One priorities model.** Map the hazard ranking of the parcels profile to the rotation engine priorities (`PRIORITY_MAP` ids: water, soil, erosion, income, forage, nitrogen, pests, avoid_burning): drought → water, fire → avoid_burning, flood → erosion and soil, frost and heat → the viability constraints (crops whose frost window or heat tolerance fail are penalized through the existing engine inputs if available; otherwise shown as a warning on the card), El Niño → water; keep income as the default third priority when the user gave economics; snow and hail do not map (say so in a tooltip). Implement the mapping in `domain/rotations.ts` with tests; the "Mis prioridades" tab shows the derived rotation priorities ("Para las rotaciones usamos: agua, quemas evitadas, ingreso") with a link to change them.
4. **Tour rewrite (Pergamino):** 6 steps: parcels and crops, fire and water badges, the alert and the emergency link, the Rotaciones tab with the current card, the five sections of one alternative card (why, evidence, benefits, gaps, risks: anchor each or at least the card), and "Más información". Keep dismissal, keyboard and reduced motion.
5. **Cached fallback** for Pergamino captured with the real script (`scripts/capture-demo.mjs` extended to take a farm id), including the rotations response; never hand-written.
6. Landing "Ver un ejemplo" keeps pointing to `/app/#demo`.

## Verification

Tests for the farm fixture geometry, current-rotation inference, hazard-to-priority mapping, auto-run, the tab order, tour steps; `npm test`, tsc, lint, build, parity, `impeccable detect`; `demo-e2e` extended: at 390 and 1280 px the demo reaches four rotation cards with the five sections, screenshots `42-*`.

## Report

What the demo shows step by step, which rotation is inferred, the derived priorities, tests, screenshots.

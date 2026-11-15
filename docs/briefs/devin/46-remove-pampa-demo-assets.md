# Devin task 46 — Finish removing the pampa demo plot: landing images and text, READMEs, submission docs

Branch: `git fetch; git checkout -B docs/remove-pampa-demo origin/main`. You own `web/src/landing/**`, `web/public/landing/**`, `README.md`, `README.es.md`, `docs/submission/**`, `docs/landing/**`. Do not edit the app. Commit on the branch (conventional commits, no AI trailers), push, never main. Do not stop servers on ports 8000, 5173, 5174.

## Context

The team lead ordered the pampa demo plot (a 50 ha public plot near a town in Buenos Aires) removed from the whole project, decision D33 in `docs/decisions.md`. The code, tests, fixtures, scripts and briefs are already done on main. The example button in the app now opens the **Mendoza demo farm** (`/app/#demo`, a fictional producer; the location and the satellite data are real). What remains is everything the public sees.

## Do

1. **Landing images.** `web/public/landing/app_diagnosis*.webp` (EN and ES) show the removed plot and probably its label. Recapture all four landing images from the running app with `web/scripts/landing-shots.mjs` (already retargeted to the Mendoza demo; fix it if needed): the diagnosis from `/app/#demo` in each language at 1280 px, and the fire view at a place that is not the removed one (for example Corrientes in the 2022 season, or the live world view). Real backend on http://localhost:8000 and the real R2 data (`VITE_DATA_BASE_URL=https://pub-f3e35e60ad774d339f43297a54691092.r2.dev/v1/`). Wait for the analysis to finish: no "incompleto" banner, no loading state, no skeleton. If the nearby services lookup is down, wait for or retry until the screenshot is clean, or crop above that section. Optimize each to under 100 KB.
2. **Landing text.** In `web/src/landing/content.ts` (EN and ES) and `landing.css` remove every mention of the removed town; rewrite `alt` and `caption` to describe the new images truthfully ("the Ashfield app analyzing a fictional farm in Mendoza with parcels, crops and per-parcel fire and water", and equivalent). Say plainly in the caption that the producer is fictional and the satellite data are real.
3. **READMEs.** The two-minute demo path (both languages) must follow what the app really does now: welcome, "Ver un ejemplo" (Mendoza farm), parcels with fire and water, priorities tab, calendar, validation. Remove the removed plot from every other place in both READMEs.
4. **Submission docs.** `docs/submission/*` (video scripts EN and ES, slides outline, facts-sources): the demo is the Mendoza farm. Rewrite the scenes that said the removed plot: the Mendoza demo does not end in rotation cards (rotations do not apply to vineyards and olives; say so honestly) so the script's rotation scene must use a real way to reach rotations that works today (draw or choose a pampa field with the coordinate entry, or the field chooser), or drop the claim; verify in the running app which path works and write only that. Update `facts-sources.md`.
5. Check with `git grep -n -i pergamino` (the only allowed leftovers are two factual INTA infrastructure lines in `docs/research/inta-data.md`).

## Verification

Landing tests, build, `impeccable detect`, screenshots of the landing at 390 and 1280 px (`46-*`), image sizes.

## Report

What changed, the new images, and what you could not do.

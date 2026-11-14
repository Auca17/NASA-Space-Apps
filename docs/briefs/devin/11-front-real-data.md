# Devin task 11 — Run the front on real data and fix what shows up (one unit)

Task 10 accepted as a base (26 tests, build ok, 199.6 KB gzip, accessibility 100). Review found that the field flow was never captured with the back running (the rotations screenshot shows "Sin datos en esta región"), the globe screenshot has no hexagons (fixtures only cover 2022-02), and the mobile header is crowded. Real data now exists locally. Do not modify `docs/`, `fixtures/` or `back/` (list needed back changes in the report). Do not commit. Never print secrets.

## Real data root

`data/dev_v1/` contains the full pipeline export (meta, `globe/` for 313 months, `fire/cal`, `fire/daily`, `fire/points` for Argentina) with Devin's model shards (`risk/`, level `clima`) and the field layers (`field/grid`, `field/analogs`) overlaid. It has the same layout as R2 `v1/`.

1. Make the Vite dev middleware serve a configurable folder: `DATA_DIR` env (default `fixtures`), so `DATA_DIR=../data/dev_v1 npm run dev` works. Document it in `web/README.md`.
2. Start the back from `back/` with `DATA_BASE_URL=file:///<absolute path>/data/dev_v1/` (the `file://` scheme is supported; the key for live mode is read from the root `.env`), and the front with the proxy to it.
3. If a request is slow because of file size (the largest `fire/daily` shards are 1.8 MB gzip), measure the time to first panel on a Corrientes point and on a Pergamino point and report it; target under 5 seconds with a cold cache on a throttled "Fast 4G" profile.

## Verify and fix, with screenshots at 390 and 1280 px (save under `web/screenshots/`, git-ignored)

1. **Globe**: with a month that has fire (use 2022-02 and the current month) the res-3 hexagons are visible and colored with a legend; check the globe looks like a globe when zoomed out (projection `globe`), and flattens when zoomed in. Pan the reticle over Argentina and confirm the panel updates after the 300 ms debounce.
2. **Area panel** for the demo point near Corrientes (control cell `85a9441bfffffff`, D27): semaphore, calendar table (rows years, columns months), annual bars, risk with reasons, prevention measures, CSV download. Check that the CSV equals what the calendar shows (open it and compare three random cells).
3. **Historic mode**: play through 2021-12 to 2022-04 and confirm the hexagons change, the calendar highlights the displayed month, and Space toggles play.
4. **Live mode**: real `/api/live` for Argentina 24 h in `points` mode and for the world in `cells` mode; confirm the fixed notice and emergency numbers appear.
5. **Field lens end to end** for the Pergamino demo plot (lat -33.89, lon -60.57, 50 ha): diagnosis cards with values, sources and confidence badges, the agricultural calendar, the form, and the four rotation cards with the five sections, measures, timeline and the explain paragraph. Capture all of them. Any card showing "Sin datos disponibles" must say why.
6. **Mobile header** (390 px): "Nombre a definir" wraps onto three lines and the "Fuego" tab is clipped. Redesign the top bar so the name sits on one line (truncate with ellipsis if needed), the tabs scroll or collapse into a compact segmented control, and the language switch stays reachable. All touch targets at least 44 px.
7. **Performance**: measure Lighthouse performance against `vite preview` (production build, not dev). Add `manualChunks` (maplibre, plot, h3) and a `Cache-Control` note in the README for R2. Report LCP and what dominates it. Prefetch the GIBS base tiles for the initial view if that helps. Goal: performance at least 70 on mobile emulation, accessibility 90 or more.
8. **Lint**: `npm run lint` showed 4 errors on my run (Devin reported 0). Make sure lint ignores `dist/` and `screenshots/` and that it is clean on `src/`.

## Report

What worked and what you fixed, the measured times, before and after screenshots of the header, Lighthouse numbers, and the list of every visual or functional defect you saw but did not fix.

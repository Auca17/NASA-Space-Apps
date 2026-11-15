# Devin task 50 — Landing, README, video script and slides without the Fire and Live modes

Branch: `git fetch; git checkout -B docs/remove-fire-modes origin/main`. You own `web/src/landing/**`, `web/public/landing/**`, `web/index.html`, `web/es/index.html`, `README.md`, `README.es.md`, `docs/submission/**`, `docs/landing/**`, `docs/decisions.md` (append D34 only). Do not edit the app (`web/src` outside `landing`): another terminal removes the modes there. Commit on the branch, push, never main. Do not stop servers on ports 8000, 5173, 5174.

## Decision (team lead, 2026-11-15)

The Fire mode (25-year historic globe, semaphore, CSV, playback) and the Live mode (detections of 24 h, 48 h, 7 d) are removed from the product because they belong to another challenge. Remove from the landing, the READMEs, the video script and the slides: the fire modes, the globe scenes, and the MODIS/VIIRS harmonization **as a product**. **Keep** what lives inside the plot: fire probability per parcel with its reason, fire alerts and the emergency block, "quemas evitadas" in rotations, the burn season in the calendar, INTA prevention measures. **Keep and do not touch** the n8n alert work of Ezequiel (`ops/n8n/**`, `docs/ideas/alerts-and-identity.md`, `docs/ops/n8n-whatsapp-setup.md`): the alerts that warn about live detections near a saved field stay as a planned feature, described honestly (workflows exist, delivery was tested on a sandbox, the notification system is not part of the app yet).

## Do

1. **Landing (EN and ES).** Remove the fire block, the fire figure and its image (`app_fire_risk*.webp`: delete the files), the harmonization-as-product text, and every mention of the historic globe, live detections, semaphore and CSV. Remove the whole "MODIS & VIIRS Hot Spots" requirement group from the table and the scoreline (it keeps only Field Shift). Keep fire inside the plot where it is true. Keep the honest status labels and every claim that still holds.
2. **F8 (harmonize datasets with different resolutions into a common grid)** loses the MODIS/VIIRS fire series as its example. Rewrite its row and the method text with what the field flow does: POWER (0.5°), IMERG (0.1°), MODIS NDVI (0.05°), SoilGrids (250 m), Sentinel-2 (20 m) brought to the same H3 grid and per-parcel indicators. Check the status honestly against the code (precomputed layers cover Argentina only) and keep the limit.
3. **README (EN and ES):** retitle and restructure around Field Shift only; delete the "Also built: Hot Spots" section and the demo-path steps about the globe, "Ver mi zona" and Corrientes 2022; the data table keeps FIRMS only as the source of the plot fire risk and the internal alert; remove the fire harmonization validation tables (R² 0.979 etc.) and limitations that only applied to the fire series, keeping a one-line pointer that the fire pipeline stays in the repository (`pipeline/`, `model/fire_risk/`) but is not part of this submission. Update the repository map and the run instructions if they mention the modes.
4. **Video script (ES and EN) and slides outline:** remove the scenes about the globe, live mode and harmonization; re-time the script to about 120 to 150 s; scenes only about the field flow (producer and question, one-tap example, parcels with fire and water and the alert with the emergency call, priorities, calendar, rotations via the path that really works, validation with its honest limit, close). Slides: drop the fire and harmonization slides, move them to an appendix list named "Fuera de la entrega".
5. **`docs/submission/facts-sources.md`:** update every row; remove claims that no longer apply.
6. **`docs/decisions.md`:** append D34 (2026-11-15): Fire and Live modes retired; plot-level fire risk, alerts, emergency block, burns avoided and the n8n workflows stay; bucket cleaned of the unused fire and globe objects.
7. Check with `git grep -n -i "historic\|histórico\|en vivo\|live mode\|semáforo\|semaphore\|harmoniz"` in your files and justify each leftover.

## Verification

Landing tests (update the expectations that referenced the removed block and group), build, `impeccable detect`, screenshots at 390 and 1280 px (`50-*`), image sizes.

## Report

What changed, what was deleted, leftovers and why, the new video length.

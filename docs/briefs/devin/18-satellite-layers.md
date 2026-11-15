# Devin task 18 — Satellite layers: SMAP anomaly done right, IMERG, ECOSTRESS for the demo plots, field layers on the globe

Part of the chain started in task 17 (do not wait for review). Rules as in task 17. Credentials come from the root `.env` through the loaders already in place (`EARTHDATA_TOKEN`); never print them. Probes I ran from here (2026-11-14): `SPL3SMP_E` version 006 is searchable; `ECO_L2T_LSTE` returns 200+ granules for both the Pergamino area (-60.60,-33.92,-60.54,-33.86) and the Mendoza vineyard area (-68.95,-33.07,-68.88,-33.01) over 2024-11 to 2026-11; `GPM_3IMERGDF` v07 is searchable but a download fails with `EulaNotAccepted` (the user must approve the GES DISC application in the Earthdata profile; he has been told how). Treat each sub-task as independent: finish what works, skip what is blocked, report.

## 1. SMAP 30-day soil moisture anomaly, properly

Task 06 nulled `sm_anom_pct` everywhere because it was noisy (Pergamino +44 while POWER showed a rain deficit). Redo it:

1. Use SMAP L3 enhanced 9 km (`SPL3SMP_E`, version 006), the AM overpass, the surface soil moisture layer with the retrieval quality flag (keep only recommended-quality retrievals) for Argentina's bounding box.
2. Baseline: for each res-5 cell, the same calendar window (the 30 days ending on the date of the latest data, matched by day of year) over all available years 2015 to the last full year. Compute the anomaly as a z-score and as percent departure from the baseline mean, requiring at least 10 valid days in the recent window and at least 5 baseline years; otherwise null for that cell.
3. Fill the cell value from the median of valid SMAP pixels in the cell. Write `sm_anom_pct`, `sm_anom_z`, `sm_valid_days`, `sm_updated`, plus the `src` block, into `data/processed/field/grid` (compatible additions; update the validator schema).
4. Sanity gates (report all): median across cells within ±15 percent, p10 and p90 within ±50, a scatter or rank correlation between the SMAP anomaly and the POWER 30-day rain departure for 200 random cells (expect a positive relation), and the values for Pergamino, Corrientes and Mendoza next to the POWER recent-rain card. If the gates fail after two honest attempts, keep it null and say exactly why.
5. Wire into `/api/field/diagnose` (`soil_moisture` card source "SMAP L3 mejorado, 9 km, últimos 30 días vs lo normal", confidence from `sm_valid_days`) with the existing POWER root-zone fallback when null.

## 2. GPM IMERG (only if the data agreement is accepted)

First run a one-granule download test of `GPM_3IMERGDF` (July 2025 is fine). If it fails with `EulaNotAccepted`, stop this section, record it in the report, and continue with the rest. If it works: use IMERG **monthly** final (`GPM_3IMGM`, version 07, 0.1 degrees) 2001 to the last full year for Argentina (about 300 small files). For each res-5 cell compute mean annual rain, coefficient of variation of annual totals and the 25th percentile year. Compare with the POWER-derived values for 200 random cells and report the agreement (bias, correlation). Then set `rain_mm_yr`, `rain_cv`, `rain_p25_mm` in `field/grid` from IMERG, keep `heavy_days_yr` from the POWER daily series (IMERG monthly cannot give it), update the `src` blocks and the `rain` card text ("GPM IMERG, 0,1°; días de lluvia fuerte: NASA POWER"). On demand outside Argentina the card keeps POWER.

## 3. ECOSTRESS for the demo plots

For the Pergamino demo plot and the Mendoza demo lots (use the bounding boxes above), search `ECO_L2T_LSTE` (70 m land surface temperature, cloud mask applied via the quality layers), download at most 40 recent clear scenes per site, compute the mean LST inside the plot per scene, and compare with the POWER `T2M_MAX` of the same dates and with MODIS LST if you already have it: report n, bias and RMSE. Save the result as a small JSON `data/processed/ecostress_demo.json` and add an "ECOSTRESS: temperatura de la superficie del lote" tile to the diagnosis of those two demo plots only (a clearly labeled extra card: "Dato adicional de demo: 70 m"), with source and resolution. If the scenes are unusable (clouds, access, format), stop after a short investigation and report.

## 4. Field layers on the globe (Argentina)

The globe shows only fire. Add a layer selector in the Fire/globe screen (a compact control, keyboard operable, with a legend): "Fuego" (default), "Lluvia anual", "Días de calor", "Días sin cultivo vivo", "Humedad del suelo (30 días)" (only when step 1 gave values), "Tendencia del agua subterránea". Each non-fire layer colors the res-5 hexagons of the visible area from the `field/grid` shards (load only the shards in view, at zoom 5 and above; at lower zoom show a short hint "acercate para ver las capas de campo"). Scales: viridis or inferno for amounts, a diverging scale for anomalies and trends, each legend with unit, and a text summary for the area under the reticle. Outside Argentina show "Capas de campo disponibles solo en Argentina". Respect `prefers-reduced-motion`, performance (no jank when panning; report a frame time sample), and the data base setting (R2 in production).

## 5. Update the methods panel

Update `web/src/content/datasets.ts` so the "Datos y métodos" page reflects the final truth after steps 1 to 3 (what is used, what is not, and why). Upload is out of scope: leave updated files in `data/processed/field/` and write the exact `python tools/upload_r2.py ...` commands in the report; the user will approve the upload.

## Report

Per section: result, sanity-gate numbers, what was blocked and the exact error, screenshots at 390 and 1280 px, tests, and the files to upload.

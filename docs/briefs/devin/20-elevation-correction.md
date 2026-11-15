# Devin task 20 — Correct NASA POWER temperature for the real elevation of the plot (priority, before task 19)

Source of the finding: Ezequiel validated POWER daily temperature against 53 Orin weather stations in Mendoza (4 to 20 October 2026, 742 station-day pairs). See `docs/validation/orin/README.md`, `metricas.json` and `pares_estacion_dia.csv`. Result: RMSE 5.05 °C (max) and 3.89 °C (min), almost entirely elevation: the POWER cell over the Uco Valley averages 2,485 m while the stations sit at 1,000 to 1,500 m, so POWER is about 6.7 °C too cold there. Applying a lapse rate of 6.5 °C per km brings RMSE to 2.82 °C (max) and 2.28 °C (min). Frost-free windows and heat days in the Andean zones (Cuyo, NOA, Patagonia) are therefore wrong today. Rules as in task 17 (do not modify `docs/` except the contract edit named below, `fixtures/` or secrets; no commit; never print secrets).

## 1. On-demand diagnosis

1. Elevation of the plot: the mean elevation of the polygon from the AWS Terrain Tiles you already read for the slope card (add `elevation_m` to the diagnosis; use the mean over the plot).
2. Elevation of the POWER grid cell: the POWER point API returns it as the third coordinate of the feature geometry. Capture it from the same daily response you already fetch (`power_cell_elevation_m`); if the response is cached, cache it with it.
3. Adjustment: `delta_c = -0.0065 * (plot_elevation_m - power_cell_elevation_m)` degrees Celsius, added to every `T2M_MAX` and `T2M_MIN` value before any derivation (frost-free window, hot days, calendar rows, fire weather card, scenarios from task 17). Apply it only when the absolute elevation difference is at least 100 m and both elevations are known; otherwise `temp_adjust_c` is 0. Do not adjust rain.
4. Transparency: the diagnosis returns `temp_adjust_c`, `elevation_m` and `power_cell_elevation_m` (compatible additions; add them to `docs/data-contract.md` section 4.2, the contract edit allowed here). The frost and heat cards show in "Fuente y precisión" the sentence "Temperatura corregida por altura: lote a 1.150 m, celda de NASA POWER a 2.485 m, ajuste +8,7 °C", and add a `gaps` entry in the rotations response when the absolute adjustment is 2 °C or more: "La corrección por altura usa un gradiente fijo de 6,5 °C por km; confirmá las heladas con una estación cercana". Cards with an absolute adjustment of 3 °C or more get `confidence: "medium"` at most.
5. Tests: flat plot (no adjustment), mountain plot (the adjustment sign and size for a synthetic case: plot 1,150 m, cell 2,485 m gives about +8.7 °C), missing elevation (no adjustment, no error), scenario plus adjustment compose correctly.

## 2. Precomputed Argentina grid (`field/grid`)

`frost_free` and `hot_days_gt35` in `data/processed/field/grid` come from the POWER cell temperatures without elevation correction, so every Andean cell is wrong.

1. Get a mean elevation per res-5 cell (mean of the Terrain Tiles at a zoom that gives roughly 1 km resolution, cached to disk) and the mean elevation of the POWER (MERRA-2) cell each of them belongs to: look first for a static elevation or orography variable in the `nasa-power` bucket; if none exists, use the third coordinate that the POWER API returns for one point per grid cell (2,414 points; batch them with caching and pauses) or average the terrain tiles over the 0.5 x 0.625 degree cell.
2. Recompute `frost_free` and `hot_days_gt35` per res-5 cell with the same lapse rate rule (same 100 m threshold), keep the uncorrected values as `frost_free_raw` and `hot_days_gt35_raw`, add `temp_adjust_c` and `elevation_m` to each cell (compatible additions, update the validator schema), regenerate the shards in `data/processed/field/grid/`, rerun `back/tools/validate_contract.py data/processed`, and report how many cells have an absolute adjustment above 1 °C and 3 °C and the maps of the most affected zones (the five biggest adjustments with province names).
3. The risk model (`model/fire_risk`) uses POWER weather features without elevation; do **not** retrain now. Report in `model/fire_risk/report.md` under "Known limitation" that mountain cells use uncorrected temperature and humidity.

## 3. Validate the correction with the real stations

1. Use `docs/validation/orin/pares_estacion_dia.csv` (it has station elevation and POWER cell elevation). Reproduce Ezequiel's figures with your implementation of the rule, not his, to prove the app does what the validation says: RMSE and bias for max and min, uncorrected and corrected, and also split by the 10 stations inside the high cell and the other 43. Save the table in `back/tests/` as a regression test with a tolerance.
2. Extend `docs/data-contract.md` section 2.9 (compatible): each `variables[]` entry may carry `rmse_adjusted`, `bias_adjusted`, `r_adjusted` and `adjustment` (a short text, "Corrección por altura de 6,5 °C/km"). Produce `data/processed/orin/validation.json` (`synthetic: false`, only `temp_max` and `temp_min`, 53 stations, 742 pairs, plus the adjusted fields) from the real pairs; the real vineyard polygon will be committed by Ezequiel under `docs/validation/orin/lots.geojson` (copy it to `data/processed/orin/lots.geojson` if it exists, otherwise leave it out and say so).
3. Front: the validation card shows both numbers in plain words ("Sin corregir se equivoca 5,1 °C. Con la corrección por altura que aplica la app, 2,8 °C") with quality badges for each, and a sentence on what it means for the producer (use the wording of `docs/validation/orin/README.md`: in plains POWER is good for patterns, in mountain valleys confirm frost with a nearby station). Rows with no real data (NDVI, soil moisture) must stay hidden when `synthetic` is false and the entry is absent (already the behavior; add a test with the real file).

## Report

Per section: what changed, the Pergamino (no adjustment) and a Valle de Uco point (about -33.37, -69.15) before and after in frost-free days and hot days, the counts of adjusted grid cells, the stations table before and after, tests, and files to upload to R2 (`orin/validation.json`, `orin/lots.geojson` if present, the regenerated `field/grid/` shards) with the exact commands.

## Then

After task 20 (and task 19), read `docs/briefs/devin/21b-imerg.md` and execute it (IMERG for the grid). Task 21 (agronomic corrections) is being done by **another Devin terminal in a separate worktree**: do **not** do task 21 and do not edit `back/knowledge/*`. One combined report at the end of your chain (17, 18, 19, 20, 21b).

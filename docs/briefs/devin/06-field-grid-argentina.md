# Devin task 06 — Precomputed `field/grid` for Argentina (one long unit)

Read first: `docs/data-contract.md` section 2.7 (`field/grid`), 4.2, `docs/decisions.md` D16, D25 and the pending note on SoilGrids/ORNL. Credentials are in the root `.env` (`EARTHDATA_TOKEN`; username and password may also exist). Read them from the environment only; never print or log them. Do not modify `docs/` or `fixtures/`. Do not commit. Work through every step; if a dataset is blocked, skip it, finish the rest, and report.

## Goal

Produce `data/processed/field_grid/{h3_r2}.json` for every H3 res-2 shard that intersects Argentina, in the exact shape of `fixtures/field/grid/82c2effffffffff.json`: one entry per res-5 cell with `rain_mm_yr`, `rain_cv`, `rain_p25_mm`, `heavy_days_yr`, `sm_anom_pct`, `sm_updated`, `grace_trend`, `gaez` (if obtainable), `lc`, and a `src` block (`dataset`, `resolution`, `period`) per group. Add two optional keys, compatible additions: `bare_soil_days_yr` (from MODIS NDVI) and `soil` (`texture`, `soc_g_kg`, only if a source works). Missing groups are `null`, never invented. A res-5 cell list for Argentina comes from H3 polyfill of an Argentina boundary (Natural Earth admin-0, download it).

## Steps

1. **Auth check**: log in with `earthaccess` using the token from the environment; confirm access to GES DISC and LP DAAC with one tiny test download each. If auth fails, stop and report the exact error (without secrets).
2. **IMERG** (GPM IMERG Final, monthly or daily, 0.1 degrees, 2001 to last full year): per res-5 cell, mean annual rain, coefficient of variation of annual totals, 25th percentile year, and days per year above 50 mm (this needs daily; if only monthly is practical, leave `heavy_days_yr` null and say so). Prefer cloud-optimized access or subsetting to the Argentina bbox; do not download the whole planet.
3. **SMAP** (L3 daily soil moisture, 9 km): `sm_anom_pct` = latest 30-day mean versus the same calendar window across all SMAP years; `sm_updated` = last date used.
4. **GRACE / GRACE-FO** (mascon or land water storage, regional): `grace_trend` `up`/`flat`/`down` from the linear trend 2015 to latest, with a documented flat threshold.
5. **MODIS NDVI** (MOD13Q1 250 m or MOD13A3 monthly 1 km via AppEEARS or earthaccess): `bare_soil_days_yr` = estimated days per year with NDVI below a documented threshold, averaged over the last 5 full years, aggregated to res-5 cells over cropland pixels only. If AppEEARS is the only route, submit one bounded task for Argentina and poll it; document the wait.
6. **MCD12C1 land cover** (GeoTIFF or HDF via earthaccess): dominant class per cell mapped to `crop|forest|grass|shrub|other` for `lc`.
7. **GAEZ suitability**: look for a directly downloadable suitability layer for soybean, maize, wheat, sorghum (FAO GAEZ v4 data portal). If not obtainable without a manual step, leave `gaez` null and report the exact blocker.
8. **SoilGrids**: the REST API timed out; try the SoilGrids WCS or the files on `files.isric.org` for a clay/sand/SOC window of Argentina. If it works in reasonable time, fill `soil`; otherwise skip.
9. **Assemble and validate**: write the shard files, run `python back/tools/validate_contract.py data/processed/field_grid` and fix any schema error. Report the file count, total size, and the share of cells with each group non-null.
10. **Wire it**: make `/api/field/diagnose` use the new optional keys when present (`bare_soil_days_yr` fills the `vigor_bare_soil` card and the `bare_soil` calendar row with the rate spread over months only if monthly NDVI is available, otherwise the card only; `soil` fills the `soil` card). Add tests with a synthetic shard and update `back/README.md`.
11. **Upload** is out of scope: R2 does not exist yet. Leave files in `data/processed/field_grid/`.

## Report

Per dataset: access route used, runtime, cells covered, blockers. The Pergamino cell (`85c2e8bbfffffff`) values next to the fixture for sanity (rain near 1,000 mm, SMAP anomaly sign). The validator output. Which diagnose cards now have real values for Pergamino.

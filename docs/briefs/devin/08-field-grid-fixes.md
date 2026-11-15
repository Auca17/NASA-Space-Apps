# Devin task 08 — Field grid quality fixes (review of 06, 06b, 07)

Tasks 06, 06b and 07 are accepted as a base: 40/40 tests, token works, the fire risk model beats climatology and persistence on 2023 to 2025 (ROC-AUC 0.920, PR-AUC 0.427, Brier 0.0302). Three data defects found by sanity-checking `data/processed/field/grid` against known facts. Fix them in one batch. Do not modify `docs/` or `fixtures/`. Do not commit. Never print secrets.

## Evidence (13,471 cells)

- **Bare soil**: `bare_soil_days_yr` is 0 for 8,710 cells (65 percent), median 0, and 0 for the pampa cell `85c2e8bbfffffff`, which is core Pampas cropland with a bare or stubble winter. Cause visible in `update_earthdata.py`: MOD13C2 at 0.05 degrees averaged over mixed pixels, threshold NDVI < 0.2, counted as months x 30. A 5 km mean NDVI almost never drops below 0.2.
- **Land cover**: `lc` is `other` for the pampa cell. Only 1,928 of 13,471 cells are `crop` (14 percent); the Pampas should be mostly `crop`. Check the class mapping: IGBP 12 (croplands) and 14 (cropland/natural vegetation mosaics) must map to `crop`; ESA WorldCover class 40 also maps to `crop`. The dominant class must be chosen by area share among the pixels in the cell, and a cell with at least 40 percent cropland pixels should be `crop`.
- **SMAP anomaly**: `sm_anom_pct` is +44.4 for pampa (`sm_updated` 2026-11-09), while POWER shows only 51 mm of rain in the last 30 days against a 104 mm normal (a deficit). Median across cells is -9.6, p10 -50, p90 +59: the spread is too wide for a 30-day mean anomaly. Recheck the sign, the units, the baseline window (same calendar window across SMAP years, same overpass), and the aggregation to cells.

## Fixes

1. **Bare soil**: replace the absolute threshold by a relative one on a finer product. Use MOD13Q1 (250 m, 16 days) over the last 5 full years if the download is practical for Argentina in under about 20 minutes (spatial subset, cropland pixels only using the land cover); otherwise keep MOD13C2 but use a relative threshold: a month counts as "bare or low cover" when NDVI is below 0.35 of that cell's own 5-year maximum, and only over cells with at least 20 percent cropland. Document the rule in `update_earthdata.py` and in `model/field_grid/README.md`. Target sanity: pampa between 60 and 160 days; the median over `crop` cells at least 60.
2. **Land cover**: fix the mapping and aggregation as above; report the new class counts and confirm pampa is `crop`.
3. **SMAP**: recompute and print, for the pampa cell, the latest 30-day mean, the same-window multi-year mean and the resulting percent anomaly, plus the same for two other known cells. Keep the sign convention: negative means drier than normal. If the SMAP product cannot give a reliable anomaly for most cells, set `sm_anom_pct` and `sm_updated` to null for those cells rather than shipping noisy numbers, and say how many.
4. After the fixes: rerun `python back/tools/validate_contract.py data/processed` (the parent folder, because the validator recognizes files by their relative path; running it on `data/processed/field/grid` skipped every file) and confirm every file is `ok` or a documented `skip`. Rerun all tests.
5. **Model serving gap (from your own report)**: `fires_365d` cannot see January to October 2026 at prediction time, which biases predictions low (Corrientes ratio 0.41, pampa climatology 0.0). Make `predict.py` read `data/processed/model_input/fires_ar_r5_daily.parquet` plus any `data/processed/model_input/fires_ar_r5_daily_2026*.parquet` if it exists (Ezequiel is producing 2026 data), and add a field `fires_365d_complete: false` to the run log when the data does not reach 30 days before today. Do not change the model; just make the gap visible in `report.md` under a "Known limitation" heading, and rerun `predict.py` only when the 2026 file exists.

## Report

Before and after for the three fields (pampa cell and distribution summary), the validator result, test count, and anything you could not fix.

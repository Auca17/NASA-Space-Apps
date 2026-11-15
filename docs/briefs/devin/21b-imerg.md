# Devin task 21b — GPM IMERG for the Argentina field grid (the data agreement is accepted now)

Run after task 20, in the main worktree (it needs the local `data/` folder). Rules as in task 17.

The user accepted the GES DISC application. A one-granule download of `GPM_3IMERGDF` v07 (March 2025) works with the token in the root `.env`. If task 18 skipped IMERG as blocked, do it now; if it was already done, skip this task and say so.

Use monthly final `GPM_3IMGM` version 07 (0.1 degrees) for 2001 to the last full year over Argentina (about 300 small files). Per res-5 cell compute the mean annual rain, the coefficient of variation of annual totals and the 25th percentile year. Compare with the POWER-derived values for 200 random cells and report bias and correlation. Then set `rain_mm_yr`, `rain_cv` and `rain_p25_mm` in `field/grid` from IMERG, keep `heavy_days_yr` from the POWER daily series (IMERG monthly cannot give it), update the `src` blocks, the `rain` card text ("GPM IMERG 0,1°; días de lluvia fuerte: NASA POWER") and `web/src/content/datasets.ts` ("GPM IMERG: usado para la lluvia anual"). Validate with `back/tools/validate_contract.py data/processed`. Do not touch `back/knowledge/*` (another Devin terminal edits it).

Report: agreement numbers, files changed, tests.

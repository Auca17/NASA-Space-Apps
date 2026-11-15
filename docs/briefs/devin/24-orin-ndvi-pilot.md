# Devin task 24 — Orin export: Sentinel-2 versus MODIS over the real vineyard, and the frost pilot summary

Main worktree. Run after task 23. Rules as in task 23 (commit on main allowed after tests pass, do not push, never print secrets, do not edit `back/knowledge/*`, `rotations.py`, `measures.py`).

## What arrived and what is private

The user supplied an export from Orin (`data/orin_import/`, git-ignored). I inspected it and prepared a minimal private folder, `data/orin_private/` (git-ignored), with only what we may use:

- `vineyard_sentinel2.json`: 6 Sentinel-2 L2A observations (NDVI mean, p10, p50, p90, NDRE, NDMI, valid pixels) of the real 263 ha vineyard (zona Este, polygon already in `docs/validation/orin/lots.geojson`), 2026-09-11 to 2026-10-21, NDVI 0.175 to 0.275.
- `pilot_results.json`: 34 nights of Orin's frost forecast pilot (one station, Perdriel), 24 complete nights.

**Do not read or use** `data/orin_import/extracted/orin_export/lotes.json`: the other 15 lots are tests, some carry people's names, and none may appear in any file, test, screenshot or log. `muestreos.json` is empty: there are still no field samples, so there is no field NDVI or soil moisture validation and those rows stay hidden. Do not publish any identifier from the export other than the vineyard polygon that is already in the repo.

## 1. NDVI: Sentinel-2 (10 m) versus MODIS (250 m) over the vineyard

1. Get MODIS NDVI for the vineyard polygon for September to November 2026: MOD13Q1 and MYD13Q1 (250 m, 16-day composites) through `earthaccess` with the token in the root `.env` (one MODIS tile covers it). Use the NDVI layer with the quality layer (keep good-quality pixels), and compute the area-weighted mean over the pixels that intersect the polygon (report how many 250 m pixels intersect it).
2. Pair each MODIS composite with the Sentinel-2 observations inside its compositing window (or the nearest within 3 days); report the n pairs honestly (it will be small), the mean difference (bias), RMSE and correlation if n allows, and the per-date table.
3. This is **satellite versus a finer satellite**, not field truth. Add it to `data/processed/orin/validation.json` as the variable `ndvi` with `satellite` = MODIS MOD13Q1/MYD13Q1 250 m, `field.source` = "Sentinel-2 L2A de 10 m (referencia de mayor resolución, no es una medición de campo)", `field.n_sites` 1, `n` = the pairs, and the usual metrics and `quality`. Update `docs/data-contract.md` section 2.9 with one compatible optional field `reference_kind` (`field` or `finer_satellite`), set it to `finer_satellite` here and `field` for the temperature rows.
4. Front card: for a row with `reference_kind: "finer_satellite"` change the sentence to say plainly what it is ("Comparado con Sentinel-2 de 10 m sobre un viñedo de 263 ha, MODIS de 250 m ..."), add the lesson in one line for the producer (a 250 m pixel mixes rows, soil and shade; for a single lot Sentinel-2 sees more), and keep the badge. Tests for the wording and for the row staying hidden when there is no `ndvi` entry.

## 2. Frost pilot summary (documentation, honest)

Write `docs/validation/orin/piloto-heladas.md` (Spanish): what the pilot is (as far as the data says: a night minimum temperature forecast with and without a station-based bias correction, one station), the period (2026-09-29 to 2026-11-14), 34 nights of which 24 complete, and the numbers computed by you from `pilot_results.json`: raw forecast RMSE and bias, corrected forecast RMSE and bias (the correction made it worse in this sample: RMSE 3.64 and bias -2.25 against 3.07 and +0.4, verify these), and the outcome counts (all 24 complete nights are "correcto sin alerta"). State the limits plainly: **no frost occurred in the sample, so the value of the alert cannot be judged**; one station; spring season; the correction should be re-tested over a real frost season. Do not present it as proof that calibration helps. Add one sentence to the limitations block of `web/src/content/datasets.ts` and `README.md`/`README.es.md` only if they already have a limitations list that this fits (otherwise skip and say so).

## Report

The NDVI pairs table, the numbers, what the validation card now says for the vineyard, confirmation that no other lot or person name appears in any file in the repo (run a search for the lot names listed in the private export, without printing them to the report: report only the count of matches), the frost pilot numbers you computed, and test counts.

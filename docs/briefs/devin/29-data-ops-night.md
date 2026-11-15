# Devin task 29 — Commit and merge your work, data sanity audit, risk refresh and R2 verification

Main worktree (it has the local `data/`, `.env` and `.venv`). Rules: never print secrets, do not edit anything under `web/`, you may commit on main after tests pass but do not push (the orchestrator pushes). The team authorized uploading new data to the R2 bucket for this task (the orchestrator already uploaded the corrected grid, analogs, knowledge files, ECOSTRESS demo and the real Orin validation without the NDVI row; see below).

## 1. Commit and merge

1. Commit everything of tasks 23 and 24 on main in reviewable slices (back resilience and tests; field grid scripts and the IMERG data pipeline; Orin NDVI script and validation; docs; `.gitignore`), conventional commits, no AI trailers.
2. `git fetch` and `git merge origin/main` (main moved a lot: agronomy corrections, Chucky's field selection, the Ashfield landing and glass UI, docs). Resolve conflicts in the back and data scripts keeping both sides; you do not own `web/`, so for any conflict under `web/` take the incoming version (`--theirs` from origin/main) without edits. Run the full back tests, the validator (`python back/tools/validate_contract.py data/processed`), and `cd web && npm test` only to confirm that you did not break it. Do not push.

## 2. Small fix in your own code

The degraded response says "probá de nuevo en un minuto" while failures are cached for 10 minutes, so a retry within one minute returns the same degraded answer. Make the cache honest: keep the 10-minute negative cache only for permanent-looking failures (404, bad data), use a 20-second negative TTL for 429 and 5xx, and make sure a retry after that window really calls POWER again. Add a test.

## 3. Data sanity audit of what is published

1. For `data/processed/field/grid`: summary statistics per field (min, p1, median, p99, max, null share) and flag impossible or suspicious values: negative rain or days, frost-free length above 365, hot days above 366, `temp_adjust_c` beyond plus or minus 15 C, elevation outside -50 to 7000 m, `rain_mm_yr` above 5000 or below 20 in Argentina, bare-soil days above 366, cells with `lc` crop but zero bare days, soil texture classes unknown. Report counts and the five worst cells per check with their H3 id and province.
2. Cross-check 25 random cells (stratified: pampa, Andes, Patagonia, NEA, NOA, Cuyo) against the on-demand diagnosis for the cell center: rain, frost-free window, hot days must agree within reason; list disagreements above 20 percent and explain (IMERG versus POWER, elevation correction, period differences).
3. For `data/processed/risk`: distribution of `p`, `ratio` and categories by season and province; flag cells with `p` above 0.8, any `ratio` below 0 or NaN, `clim` above 1, and reasons arrays that are empty or contain template placeholders.
4. For `data/processed/field/analogs`: cluster sizes, empty labels, crops with share above 1 or negative yields.
5. Write the findings and any fixes (regenerate only what is clearly wrong and cheap) in `docs/audit/data-audit.md`.

## 4. Risk refresh and upload

1. Run `model/fire_risk/predict.py` now with the freshest data (the FIRMS key is in the `.env`; it pulls the last 30 days), validate the output (`validate_contract.py`), compare category counts with the previous run, and stage only the new `risk` shards plus nothing else into `r2-stage-risk/` (git-ignored). Upload with `python tools/upload_r2.py r2-stage-risk --prefix v1/risk/ --upload` after a dry run, **uploading the Argentine `clima` shards and leaving the worldwide `historial` shards of the pipeline untouched** (check the object count so that you do not overwrite world shards with an Argentina-only set: shards that exist only in the pipeline export must stay). Verify three shards through the public URL (`https://pub-f3e35e60ad774d339f43297a54691092.r2.dev/v1/risk/<shard>.json`).
2. Write `tools/refresh_risk.py` (documented in `tools/README.md` and `docs/ops/risk-refresh.md`): one command that runs the prediction, validates, stages, dry-runs, uploads and verifies, with a `--no-upload` flag, so the team can rerun it right before the delivery; also a ready-but-disabled GitHub Actions workflow file `.github/workflows/risk-refresh.yml` (manual `workflow_dispatch` trigger only, secrets read from repository secrets named exactly as in `.env.example`, no schedule).

## 5. R2 verification tool

`tools/verify_r2.py`: lists the bucket under `v1/` and compares it with local sources (the export folder if present, `data/processed/field/*`, `data/processed/risk`, `back/knowledge/*.json`, `data/processed/orin/*` and `ecostress_demo.json`): object counts by prefix, objects present locally and missing remotely, size mismatches, and a spot check of 20 random objects (download, gunzip if `Content-Encoding` is gzip, parse JSON). Run it and report the result. Note what the orchestrator uploaded today so you can recognize it: `orin/validation.json` (temp rows only, the NDVI row is withheld until the UI can show a finer-satellite reference), `orin/lots.geojson`, `field/grid/*`, `field/analogs/*`, `knowledge/{crops,rotations,measures,cases}.json`, `ecostress_demo.json`.

## Report

What was committed and how the merge went (conflicts and how you resolved them), test counts, the TTL fix, the data audit findings (top items and what was fixed), the risk refresh numbers and the upload verification, the R2 verification output, and anything else you noticed.

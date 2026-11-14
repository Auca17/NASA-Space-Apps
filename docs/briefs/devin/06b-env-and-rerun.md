# Devin task 06b — Load `.env` and rerun the Earthdata layers

Context: the root `.env` now has content (about 774 bytes, saved by the user) with `FIRMS_MAP_KEY`, `EARTHDATA_TOKEN` and `DATA_BASE_URL`. No code in this repo loads that file: `back/app/config.py` reads `os.environ` only, and `model/` scripts do not read it, so every variable looked unset. Never print values; never read the file into your output.

1. **Loader**: add `python-dotenv` (pinned) to `back/requirements.txt` and `model/requirements.txt`. In `back/app/config.py`, call `load_dotenv()` once at import, searching upward from the file to the repo root, with `override=False` so real environment variables (Vercel) always win. Strip surrounding whitespace from values. In each `model/` entry script (`fetch_power.py`, `build_field_grid.py`, and later `predict.py`), load the root `.env` the same way before reading variables. Add a test that a temporary `.env` is picked up and that an existing environment variable is not overridden.
2. **Auth check** with `earthaccess` using `EARTHDATA_TOKEN` only (no printing). Confirm one tiny download from GES DISC and one from LP DAAC. If it fails, report the exact HTTP status or error class, not the token.
3. **Rerun only the blocked layers** of task 06: IMERG, SMAP, GRACE, MODIS NDVI (bare-soil days), and MCD12C1 if it was skipped. Keep what task 06 already produced. Update the shard files, rerun `python back/tools/validate_contract.py data/processed/field_grid`, and report which fields are now non-null and the share of cells with each group.
4. If a layer is still blocked after auth works, report why (dataset not found, collection needs an app authorization on the user's Earthdata profile, rate limits) and continue with the others.

Then start `docs/briefs/devin/07-fire-risk-model.md` without waiting for review. One final report for 06, 06b and 07.

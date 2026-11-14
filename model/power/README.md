# model/power — NASA POWER daily meteorology for Argentina

Produces `data/processed/model_input/power_ar_daily.parquet` (data contract 5.2):
one row per grid point per UTC day, 2012-01-01 → last day available.

## Stores used (AWS Open Data, anonymous, `us-west-2`)

Bucket `s3://nasa-power`. Daily UTC **temporal** Zarr stores:

| Product | URL | Coverage used |
|---|---|---|
| MERRA-2 | `s3://nasa-power/merra2/temporal/power_merra2_daily_temporal_utc.zarr` | 2012-01-01 → 2026-10-01 |
| GEOS-IT | `s3://nasa-power/geosit/temporal/power_geosit_daily_temporal_utc.zarr` | 2026-10-02 → 2026-11-12 |

MERRA-2 daily ends 2026-10-01 (`nasa-power/last_available.json`); GEOS-IT daily
extends to 2026-11-12 and is used only for the tail. Days are taken from the
earliest store that covers them.

## Variable mapping

Store names already match the contract 1:1 — no renaming needed:
`T2M_MAX`, `T2M_MIN`, `RH2M`, `WS2M`, `PRECTOTCORR`.
Fill values `<= -999` become null (the store uses NaN natively).

## Grid / bbox

lat −56 → −21 (step 0.5°), lon −74 → −53 (step 0.625°). −53 is off-grid, so the
slice ends at −53.375: 71 × 34 = 2414 grid points.

## Run

```bash
python -m venv .venv && .venv/Scripts/pip install -r model/requirements.txt
.venv/Scripts/python model/power/fetch_power.py \
    --start 2012-01-01 --end <yesterday> \
    --out data/processed/model_input/power_ar_daily.parquet \
    --cache-dir data/power/cache --source zarr
```

`--source api` switches to the POWER regional daily API fallback
(≤10°×10° boxes, one year per request, retries + pause). Not needed while the
Zarr stores are reachable.

Cache: `data/power/cache/power_{YYYY}.parquet`, one file per year, written once
the year's rows are complete (current year = up to the last available day).
Re-runs skip existing years **at the write stage only**: the Zarr bbox slice is
still downloaded in full before the yearly cache is consulted, so a re-run does
not save bandwidth — it only skips re-writing unchanged Parquet files.

## Tests

```bash
.venv/Scripts/python -m pytest model/power/tests -m "not slow"   # fast
.venv/Scripts/python -m pytest model/power/tests                  # incl. S3 smoke
```

## Runtime observed

2026-11-14 run (Windows, .venv py3.12): merra2 slice load 131 s, geosit 30 s,
year writes ~1-2 s each → ~3.2 min total. Output 13,108,020 rows,
2,414 grid points, 119.5 MB Parquet, zero nulls, date range
2012-01-01 → 2026-11-12.

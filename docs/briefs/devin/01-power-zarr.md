# Devin task 01 — NASA POWER daily weather for Argentina from the AWS Zarr store

Read first: `docs/data-contract.md` (sections 1 and 5.2) and `docs/decisions.md` (D8, D12). Do not modify anything under `docs/` or `fixtures/`. Do not commit; leave changes in the working tree for review.

## Goal

Produce `data/processed/model_input/power_ar_daily.parquet` with daily NASA POWER meteorology for all of Argentina, 2012-01-01 through yesterday, read directly from the POWER Analysis Ready Datastore (Zarr on AWS Open Data), with on-disk caching and resume. This file feeds the 7-day fire-risk model.

## Source

- NASA POWER publishes its Analysis Ready Datastore as Zarr in the AWS Open Data Registry (`arn:aws:s3:::nasa-power`, region `us-west-2`, anonymous access). POWER's own tutorials reference stores named like `s3://power-analysis-ready-datastore/power_901_daily_meteorology_utc.zarr`. Discover the exact daily meteorology store by listing the bucket anonymously (`s3fs` with `anon=True`) and record the URL you used in the run report.
- Variables: `T2M_MAX`, `T2M_MIN`, `RH2M`, `WS2M`, `PRECTOTCORR`. If a name differs in the store, map it and document the mapping.
- Bounding box: latitude -56 to -21, longitude -74 to -53 (MERRA-2 grid, 0.5 x 0.625 degrees).
- Fallback only if the Zarr store is unreachable: POWER regional daily API (`https://power.larc.nasa.gov/api/temporal/daily/regional`), requesting boxes no larger than 10 x 10 degrees, one year per request, with retries and a pause between requests. Implement the fallback behind the same interface, but do not run it if Zarr works.

## Output schema (contract 5.2)

| column | type | meaning |
|---|---|---|
| `lat` | float32 | grid point center latitude |
| `lon` | float32 | grid point center longitude |
| `h3_r5` | string | H3 resolution-5 cell containing the grid point (`h3.latlng_to_cell(lat, lon, 5)`) |
| `date` | date | UTC day |
| `T2M_MAX`, `T2M_MIN`, `RH2M`, `WS2M`, `PRECTOTCORR` | float32 | POWER daily values; missing as null, never fill values like -999 |

One row per grid point and day. Sort by `h3_r5`, `date`.

## Layout

```
model/power/
  fetch_power.py        CLI: --start, --end, --bbox, --out, --cache-dir, --source zarr|api
  README.md             how to run, store URL, variable mapping, runtime observed
model/requirements.txt  xarray, zarr, s3fs, pyarrow, pandas, h3, numpy (pin versions)
data/power/cache/       one Parquet per year, written only when the year is complete
data/processed/model_input/power_ar_daily.parquet
```

Use a virtual environment at `.venv/` (ignored by git). Create a root `.gitignore` if none exists with: `.venv/`, `data/`, `*.duckdb`, `.env`, `__pycache__/`, `node_modules/`, `dist/`.

## Behaviour

- Process year by year. Skip a year whose cache file already exists (resume). Write the final Parquet by concatenating the yearly caches.
- Read only the bbox slice and the five variables; never download the whole store.
- Print progress per year with row counts and elapsed seconds.
- Exit non-zero with a clear message if a year ends with zero rows.

## Tests (pytest, under `model/power/tests/`)

1. `h3_r5` mapping: a known point (-28.5, -57.8) maps to `85a963c3fffffff`.
2. Fill-value handling: an array containing -999 becomes null in the output.
3. Smoke test, marked `slow`: read one day of `T2M_MAX` for the bbox from the discovered store and assert the row count is greater than 0.

## Run and report

Run the full 2012 to yesterday extraction once. Then report in your final message: store URL used, variable mapping, total rows, grid points count, Parquet size, wall-clock time, test results, and anything that did not match this brief or the data contract. Do not change the contract; list mismatches instead.

# field/grid builder

`build_field_grid.py` writes the Argentina res-5 field grid to
`data/processed/field/grid/{h3_r2}.json` (contract section 2.4) from
NASA POWER, ISRIC SoilGrids WCS and ESA WorldCover.
`update_earthdata.py` refreshes the Earthdata layers in place: `lc`
(MCD12Q1 IGBP), `sm_anom_pct`/`sm_updated` (SMAP L3), `grace_trend`
(GRACE-FO mascon) and `bare_soil_days_yr` (MOD13C2).

## bare_soil_days_yr rule

MOD13Q1 (250 m) was not practical for country-wide monthly coverage,
so the MOD13C2 (0.05 deg monthly) fallback is used with a *relative*
threshold instead of an absolute one:

- For each month on disk, the cell's NDVI is the mean of the in-cell
  CMG pixels (polygon-sampled, not just the centroid).
- A month counts as bare/low cover when that mean falls at least 40%
  below the cell's own multi-year maximum NDVI (`NDVI < 0.60 x max`).
  The literal `0.35 x max` threshold was verified unreachable at
  0.05 deg (Pergamino's five-year monthly minimum is 0.350 against a
  0.267 threshold), so a relative drawdown from each field's peak is
  used instead of an absolute bare-signal NDVI that mixed pixels
  almost never reach.
- Cells whose MCD12Q1 cropland share (IGBP classes 12 and 14) is under
  20% report `0`: there the NDVI minimum reflects natural vegetation
  cycles, not fallow ground.
- Counts are normalized to days/year over the number of valid months.

## lc rule

`lc` is the dominant IGBP class by sampled area share inside the cell
polygon; if cropland classes (12/14) cover at least 40% of the samples
the cell is `crop`. Cells with no classified pixel keep their prior
value (e.g. ESA WorldCover).

## sm_anom_pct reliability

The single-day SMAP anomaly (latest granule vs. same-DOY multi-year
mean) proved too noisy — single-swath retrieval error dominates the
signal — so `sm_anom_pct`/`sm_updated` are nulled until a proper
30-day x multi-year baseline can be computed.

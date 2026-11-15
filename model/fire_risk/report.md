# Fire risk model — ar-lgbm-0.1

Rows: train 7,031,862 / val 700,492 / test 2,101,476
Positive rate: 0.0476

## Test 2023-2025 (ROC-AUC | PR-AUC | Brier)

| predictor | ROC-AUC | PR-AUC | Brier |
|---|---|---|---|
| LightGBM | 0.920 | 0.427 | 0.0302 |
| climatology | 0.843 | 0.295 | 0.0350 |
| persistence | 0.852 | 0.310 | 0.0452 |

## By season (model vs climatology)

| season | model ROC | model PR | model Brier | clim ROC | clim PR | clim Brier |
|---|---|---|---|---|---|---|
| summer | 0.908 | 0.360 | 0.0232 | 0.784 | 0.151 | 0.0272 |
| winter | 0.921 | 0.441 | 0.0326 | 0.854 | 0.322 | 0.0376 |

Verdict: the model **beats persistence on PR-AUC and Brier**.

Top-5 SHAP features: fires_365d, neigh_fires_30d, lon, lat, fires_30d

Probabilities are Platt-calibrated on the 2022 validation split
(`platt.json`); `predict.py` applies the same transform.

Artifacts: `model.txt`, `platt.json`, `calibration.png`, `shap.png`.
Trained in 72s.

## Known limitation

`predict.py` builds `fires_365d` (and `clim`) from
`data/processed/model_input/fires_ar_r5_daily.parquet` plus any
`fires_ar_r5_daily_2026*.parquet` files present, and appends the last
30 days of live FIRMS detections. The base Parquet ends 2025-12-31 and
FIRMS covers only the last ~30 days, so until a 2026 Parquet is added
the 365-day lookback misses Jan-Oct 2026 fires. Every generated shard
carries `fires_365d_complete`; it is `false` when the fire history
does not reach 30 days before the run date.

## Known limitation (elevation correction)

`T2M_MAX`/`T2M_MIN` from NASA POWER are used as-is by the model. In
Andean cells the POWER cell elevation can differ from the terrain by
kilometres; the field diagnosis applies a −6.5 °C/km correction (task
20), but the fire-risk features (`T2M`, `RH2M`, derived indices) remain
uncorrected. Mountain cells may therefore underestimate heat and
overestimate humidity; the model was not retrained.

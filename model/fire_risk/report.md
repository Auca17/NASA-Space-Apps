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

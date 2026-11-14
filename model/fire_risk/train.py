"""Train the Argentina fire-risk model (task 07).

Split (temporal): train 2012-2021, validation 2022, test 2023-2025.
Baselines on test: climatology; persistence rule clim*(1+2A+B) capped .95.
Metrics: ROC-AUC, PR-AUC, Brier, 10-bin calibration, by season.
Writes model/fire_risk/model.txt, report.md, calibration.png, shap.png.
"""

import json
import sys
import time
from pathlib import Path

import lightgbm as lgb
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.metrics import (average_precision_score, brier_score_loss,
                             roc_auc_score)

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)

ROOT = Path(__file__).resolve().parents[2]
TRAIN_PQ = ROOT / "data/processed/model_input/risk_train.parquet"
MDIR = ROOT / "model/fire_risk"

FEATURES = ["fires_7d", "fires_30d", "fires_365d", "neigh_fires_30d",
            "woy_sin", "woy_cos", "lat", "lon", "clim",
            "t2m_max_mean_7d", "rh2m_mean_7d", "ws2m_max_7d",
            "rain_7d", "rain_30d", "rain_90d", "days_since_rain"]

MODEL_VERSION = "ar-lgbm-0.1"


def persistence(clim, a7, a30):
    return np.minimum(clim * (1 + 2 * (a7 > 0) + (a30 > 0)), 0.95)


def metrics(y, p):
    return {"roc_auc": roc_auc_score(y, p),
            "pr_auc": average_precision_score(y, p),
            "brier": brier_score_loss(y, p)}


def calib_curve(y, p, bins=10):
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges) - 1, 0, bins - 1)
    mp = np.full(bins, np.nan)
    my = np.full(bins, np.nan)
    for b in range(bins):
        m = idx == b
        if m.sum() > 0:
            mp[b], my[b] = p[m].mean(), y[m].mean()
    return mp, my


def main() -> int:
    t0 = time.monotonic()
    df = pd.read_parquet(TRAIN_PQ)
    df["week"] = pd.to_datetime(df["week"])
    year = df["week"].dt.year
    tr = df[year <= 2021]
    va = df[year == 2022]
    te = df[year >= 2023]
    print(f"train={len(tr):,} val={len(va):,} test={len(te):,}", flush=True)

    pos = tr["label"].sum()
    params = dict(objective="binary", metric="average_precision",
                  learning_rate=0.05, num_leaves=63,
                  min_data_in_leaf=200, feature_fraction=0.8,
                  scale_pos_weight=(len(tr) - pos) / max(pos, 1) * 0.25,
                  verbosity=-1, seed=7)
    dtrain = lgb.Dataset(tr[FEATURES], tr["label"])
    dval = lgb.Dataset(va[FEATURES], va["label"], reference=dtrain)
    model = lgb.train(params, dtrain, num_boost_round=3000,
                      valid_sets=[dval],
                      callbacks=[lgb.early_stopping(100, verbose=False)])
    model.save_model(str(MDIR / "model.txt"))
    print(f"best_iter={model.best_iteration}", flush=True)

    # Platt calibration on the 2022 validation split: logit(p) -> logistic
    from sklearn.linear_model import LogisticRegression

    def logit(x):
        x = np.clip(x, 1e-6, 1 - 1e-6)
        return np.log(x / (1 - x))

    p_va_raw = model.predict(va[FEATURES])
    platt = LogisticRegression(max_iter=1000).fit(
        logit(p_va_raw).reshape(-1, 1), va["label"])
    (MDIR / "platt.json").write_text(json.dumps(
        {"a": float(platt.coef_[0][0]),
         "b": float(platt.intercept_[0])}))

    def calibrate(p):
        return 1 / (1 + np.exp(
            -(platt.coef_[0][0] * logit(p) + platt.intercept_[0])))

    p_te = calibrate(model.predict(te[FEATURES]))
    y_te = te["label"].to_numpy()
    p_clim = te["clim"].to_numpy()
    p_pers = persistence(p_clim, te["fires_7d"].to_numpy(),
                         te["fires_30d"].to_numpy())

    res = {"model": metrics(y_te, p_te),
           "climatology": metrics(y_te, p_clim),
           "persistence": metrics(y_te, p_pers)}

    summer = te["week"].dt.month.isin([12, 1, 2])
    res_season = {
        "summer": {"model": metrics(y_te[summer], p_te[summer]),
                   "climatology": metrics(y_te[summer],
                                          p_clim[summer])},
        "winter": {"model": metrics(y_te[~summer], p_te[~summer]),
                   "climatology": metrics(y_te[~summer],
                                          p_clim[~summer])}}

    # calibration plot
    fig, ax = plt.subplots(figsize=(5, 5))
    for name, p, c in (("model", p_te, "C0"),
                       ("climatology", p_clim, "C1"),
                       ("persistence", p_pers, "C2")):
        mp, my = calib_curve(y_te, p)
        ax.plot(mp, my, "o-", label=name, color=c, ms=4)
    ax.plot([0, 1], [0, 1], "k--", lw=0.8)
    ax.set_xlabel("predicted"); ax.set_ylabel("observed")
    ax.legend(); fig.tight_layout()
    fig.savefig(MDIR / "calibration.png", dpi=120)
    plt.close(fig)

    # SHAP (sampled)
    import shap
    rng = np.random.default_rng(0)
    samp = te.iloc[rng.choice(len(te), min(20000, len(te)),
                              replace=False)]
    expl = shap.TreeExplainer(model)
    sv = expl.shap_values(samp[FEATURES])
    plt.figure()
    shap.summary_plot(sv, samp[FEATURES], show=False,
                      max_display=10)
    plt.tight_layout()
    plt.savefig(MDIR / "shap.png", dpi=120, bbox_inches="tight")
    plt.close("all")
    top = [FEATURES[i] for i in
           np.argsort(np.abs(sv).mean(0))[::-1][:5]]

    verdict = ("beats persistence on PR-AUC and Brier"
               if (res["model"]["pr_auc"] > res["persistence"]["pr_auc"]
                   and res["model"]["brier"] < res["persistence"]["brier"])
               else "does NOT beat the persistence baseline "
                    "on both PR-AUC and Brier — reported honestly")

    def fmt(m):
        return (f"{m['roc_auc']:.3f} | {m['pr_auc']:.3f} | "
                f"{m['brier']:.4f}")

    report = f"""# Fire risk model — {MODEL_VERSION}

Rows: train {len(tr):,} / val {len(va):,} / test {len(te):,}
Positive rate: {df['label'].mean():.4f}

## Test 2023-2025 (ROC-AUC | PR-AUC | Brier)

| predictor | ROC-AUC | PR-AUC | Brier |
|---|---|---|---|
| LightGBM | {fmt(res['model'])} |
| climatology | {fmt(res['climatology'])} |
| persistence | {fmt(res['persistence'])} |

## By season (model vs climatology)

| season | model ROC | model PR | model Brier | clim ROC | clim PR | clim Brier |
|---|---|---|---|---|---|---|
| summer | {res_season['summer']['model']['roc_auc']:.3f} | {res_season['summer']['model']['pr_auc']:.3f} | {res_season['summer']['model']['brier']:.4f} | {res_season['summer']['climatology']['roc_auc']:.3f} | {res_season['summer']['climatology']['pr_auc']:.3f} | {res_season['summer']['climatology']['brier']:.4f} |
| winter | {res_season['winter']['model']['roc_auc']:.3f} | {res_season['winter']['model']['pr_auc']:.3f} | {res_season['winter']['model']['brier']:.4f} | {res_season['winter']['climatology']['roc_auc']:.3f} | {res_season['winter']['climatology']['pr_auc']:.3f} | {res_season['winter']['climatology']['brier']:.4f} |

Verdict: the model **{verdict}**.

Top-5 SHAP features: {', '.join(top)}

Probabilities are Platt-calibrated on the 2022 validation split
(`platt.json`); `predict.py` applies the same transform.

Artifacts: `model.txt`, `platt.json`, `calibration.png`, `shap.png`.
Trained in {time.monotonic() - t0:.0f}s.
"""
    (MDIR / "report.md").write_text(report, encoding="utf-8")
    print(report, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

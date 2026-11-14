"""Task 07 tests: leakage, categories, reasons, contract shape."""

import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "back/tools"))

from build_dataset import window_sums  # noqa: E402
from predict import categorize, make_reasons, FEATURES  # noqa: E402
from validate_contract import _check  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]


def test_no_leakage_fire_after_row_date():
    """A fire strictly after the row date must not leak into features."""
    cum = np.zeros((1, 40), np.float32)
    cum[0, 30:] = 1.0  # fire on day 30
    widx = np.array([10, 20, 29])  # row dates before the fire
    for n in (7, 30, 365):
        assert (window_sums(cum, widx, n) == 0).all()
    # a row on/after the fire day sees it in the lookback
    assert window_sums(cum, np.array([31]), 7)[0, 0] == 1


def test_category_boundaries():
    assert categorize(0.007, 0.01) == (0.7, "bajo")        # ratio < .75
    assert categorize(0.008, 0.01) == (0.8, "moderado")    # .75-1.5
    assert categorize(0.02, 0.01) == (2.0, "alto")         # 1.5-3
    assert categorize(0.05, 0.01) == (5.0, "muy_alto")     # > 3
    # clim < 0.01 -> p alone
    assert categorize(0.31, 0.005) == (None, "muy_alto")
    assert categorize(0.16, 0.005) == (None, "alto")
    assert categorize(0.06, 0.005) == (None, "moderado")
    assert categorize(0.01, 0.005) == (None, "bajo")


def test_reasons_never_empty():
    row = {f: 0.0 for f in FEATURES}
    assert make_reasons([], row)
    assert make_reasons(["lat", "lon"], row)
    r = make_reasons(["days_since_rain"], {"days_since_rain": 23})
    assert r == ["23 días sin lluvia"]


def test_produced_shards_validate():
    files = sorted((ROOT / "data/processed/risk").glob("*.json"))
    if not files:
        pytest.skip("predict.py has not run yet")
    for f in files:
        rel = f"risk/{f.name}"
        assert _check(rel, f.read_bytes()) is None, rel

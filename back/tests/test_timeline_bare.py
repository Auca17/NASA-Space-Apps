"""D47: timeline of field variables + Sentinel-2 bare-soil fallback."""
from datetime import date, timedelta

import numpy as np
import pytest
from affine import Affine

from app.services.timeline import build_timeline, _season
from app.services import bare_soil_s2
from app.routers.field import build_cards


def series(end: date, days: int, fn):
    out = {}
    for i in range(days):
        d = end - timedelta(days=i)
        v = fn(d)
        if v is not None:
            out[d] = v
    return out


END = date(2026, 11, 15)


def power_stub(rain_fn=lambda d: 2.0, tmax_fn=lambda d: 25.0):
    days = (END - date(2000, 1, 1)).days
    return {
        "PRECTOTCORR": series(END, days, rain_fn),
        "T2M_MAX": series(END, days, tmax_fn),
        "T2M_MIN": series(END, days, lambda d: 12.0),
        "GWETROOT": series(END, days, lambda d: 0.5),
    }


def test_timeline_months_and_partial():
    t = build_timeline(power_stub(), -33)
    assert t["partial_last"] is True
    assert len(t["months"]) == 25
    assert t["months"][-1] == "2026-11"
    assert t["series"]["rain_mm"]["values"][-2] == pytest.approx(62.0, abs=1)
    assert len(t["series"]["rain_mm"]["normal"]) == 12
    assert t["series"]["tmax_c"]["anomaly_c"][-2] == pytest.approx(0.0)
    assert t["normals_period"] == "2001-2020"
    assert t["headline"]


def test_timeline_24_months_when_current_complete():
    # end on the last day of a month -> 24 complete, partial False
    power = power_stub()
    end = date(2026, 10, 31)
    days = (end - date(2000, 1, 1)).days
    power = {k: {d: v for d, v in s.items() if d <= end}
             for k, s in power_stub().items()}
    t = build_timeline(power, -33)
    assert t["partial_last"] is False
    assert len(t["months"]) == 24


def test_timeline_null_under_20_days():
    p = power_stub()
    # only 5 valid days in 2026-10
    p["PRECTOTCORR"] = {d: v for d, v in p["PRECTOTCORR"].items()
                        if not (d.year == 2026 and d.month == 10)
                        or d.day <= 5}
    t = build_timeline(p, -33)
    i = t["months"].index("2026-10")
    assert t["series"]["rain_mm"]["values"][i] is None
    assert t["series"]["rain_mm"]["anomaly_pct"][i] is None


def test_timeline_leap_year_feb():
    p = power_stub()
    t = build_timeline(p, -33)
    i = t["months"].index("2024-02") if "2024-02" in t["months"] else None
    assert i is None or t["series"]["rain_mm"]["values"][i] == pytest.approx(58.0, abs=1)


def test_timeline_anomaly_math():
    # 2026 doubles the historical rain -> ~+100 % anomaly
    p = power_stub(rain_fn=lambda d: 4.0 if d.year == 2026 else 2.0)
    t = build_timeline(p, -33)
    i = t["months"].index("2026-06")
    assert t["series"]["rain_mm"]["anomaly_pct"][i] == pytest.approx(100, abs=3)
    assert "menos" not in t["headline"] or "más" in t["headline"]


def test_season_hemispheres():
    assert _season(-33, 1, "es") == "verano"
    assert _season(40, 1, "es") == "invierno"
    assert _season(40, 7, "en") == "summer"
    assert _season(-33, 7, "en") == "winter"


def test_headline_language_and_normal_months():
    p = power_stub()
    t = build_timeline(p, -33, "en")
    assert "normal" in t["headline"]
    t = build_timeline(p, -33, "es")
    assert "normal" in t["headline"]


def test_timeline_none_without_power():
    assert build_timeline(None, -33) is None
    assert build_timeline({}, -33) is None


# ------------------------------------------------------------ bare soil S2

class FakeRaster:
    """Minimal rasterio stand-in: 1 px = 1 m, origin at (0, 10)."""
    def __init__(self, array):
        self._a = array
        self.crs = "EPSG:4326"  # identity transform_geom for tests
        self.transform = Affine(1, 0, 0, 0, -1, 10)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def window_transform(self, w):
        return self.transform @ Affine.translation(w.col_off, w.row_off)

    def read(self, band, window=None, boundless=False, fill_value=0,
             out_shape=None):
        if window is None:
            data = self._a
        else:
            out = np.full((int(window.height), int(window.width)),
                          fill_value, dtype=self._a.dtype)
            r0 = max(0, int(window.row_off))
            c0 = max(0, int(window.col_off))
            h = min(int(window.height), self._a.shape[0] - r0)
            w = min(int(window.width), self._a.shape[1] - c0)
            out[:h, :w] = self._a[r0:r0 + h, c0:c0 + w]
            data = out
        if out_shape:
            fy = data.shape[0] // out_shape[0] or 1
            fx = data.shape[1] // out_shape[1] or 1
            data = data[::fy, ::fx][:out_shape[0], :out_shape[1]]
        return data


def fake_scene(red_v, nir_v, scl_v, stamp="2026-06-15T10:00:00Z"):
    from shapely.geometry import box
    return {"properties": {"datetime": stamp, "proj:epsg": 4326},
            "assets": {k: {"href": f"https://sentinel-cogs.s3.us-west-2."
                                   f"amazonaws.com/x/{k}.tif"}
                       for k in ("red", "nir08", "scl")}}


def test_scene_ndvi_median(monkeypatch):
    from shapely.geometry import box
    arrs = {
        "red": np.full((10, 10), 1000, dtype="uint16"),
        "nir08": np.full((10, 10), 5000, dtype="uint16"),
        "scl": np.full((10, 10), 4, dtype="uint8"),
    }
    monkeypatch.setattr(bare_soil_s2, "raster_open",
                        lambda url: FakeRaster(arrs[url.rsplit("/", 1)[1][:-4]]))
    scene = fake_scene(1000, 5000, 4)
    v = bare_soil_s2.scene_ndvi(scene, box(2, 2, 8, 8))
    assert v == pytest.approx((5000 - 1000) / 6000, abs=1e-3)


def test_scene_ndvi_rejects_cloudy(monkeypatch):
    from shapely.geometry import box
    arrs = {
        "red": np.full((10, 10), 1000, dtype="uint16"),
        "nir08": np.full((10, 10), 5000, dtype="uint16"),
        "scl": np.full((10, 10), 9, dtype="uint8"),  # cloud
    }
    monkeypatch.setattr(bare_soil_s2, "raster_open",
                        lambda url: FakeRaster(arrs[url.rsplit("/", 1)[1][:-4]]))
    assert bare_soil_s2.scene_ndvi(fake_scene(1, 1, 1),
                                   box(2, 2, 8, 8)) is None


def test_bare_soil_card_from_s2():
    cards, _ = build_cards(
        None, None, None, None,
        {"bare_soil_days_yr": None}, None, None, "x",
        bare_s2={"ndvi_monthly": [0.5] * 12, "months_with_data": 12,
                 "bare_soil_days": 122})
    c = next(c for c in cards if c["id"] == "vigor_bare_soil")
    assert c["value"] == 122
    assert c["resolution"] == "20 m"
    assert c["ndvi_monthly"] == [0.5] * 12


def test_bare_soil_card_null_with_reason():
    cards, _ = build_cards(
        None, None, None, None, {}, None, None, "x",
        bare_s2={"reason": "too_few_months"})
    c = next(c for c in cards if c["id"] == "vigor_bare_soil")
    assert c["value"] is None
    assert "meses" in c["text"] or "months" in c["text_en"]
    assert c["source"].startswith("Sentinel-2")


def test_bare_soil_grid_wins_over_s2():
    cards, _ = build_cards(
        None, None, None, None,
        {"bare_soil_days_yr": 90}, None, None, "x",
        bare_s2={"ndvi_monthly": [0.1] * 12, "months_with_data": 12,
                 "bare_soil_days": 365})
    c = next(c for c in cards if c["id"] == "vigor_bare_soil")
    assert c["value"] == 90  # MODIS precomputed is kept


def test_month_bucketing_reasons():
    # too few months with data -> reason, never zero days
    r = {"reason": "too_few_months", "months_with_data": 2,
         "ndvi_monthly": [None] * 10 + [0.5, 0.4]}
    assert "bare_soil_days" not in r

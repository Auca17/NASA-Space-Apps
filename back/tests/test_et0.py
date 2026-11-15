"""ET0 fallback: Hargreaves/Penman-Monteith from POWER daily inputs."""
import datetime as dt

from app.services.et0 import (METHOD_LABEL, et0_series, hargreaves,
                              penman_monteith, ra_mj)


def _series(params, years=2):
    """{param: {date: float}} covering Jan+Jul of `years` years."""
    out = {p: {} for p in params}
    for y in range(2020, 2020 + years):
        for m in (1, 7):
            for day in (1, 15):
                d = dt.date(y, m, day)
                for p, v in params.items():
                    out[p][d] = v(m, d) if callable(v) else v
    return out


def test_ra_matches_fao56_table():
    # FAO-56 Annex 2 table 2.6: Ra at 20 deg S in September ~ 32.1
    ra = ra_mj(-20, 246)
    assert 31.5 < ra < 32.5
    # and at the equator around the March equinox ~ 36.5-38
    assert 36.0 < ra_mj(0, 75) < 38.5


def test_hargreaves_positive_and_sane():
    # Warm dry austral-summer day at lat -33.7: Hargreaves yields a
    # few mm/day and a winter day gives markedly less.
    summer = hargreaves(32.0, 14.0, -33.73, 15)
    winter = hargreaves(18.0, 4.0, -33.73, 200)
    assert 2 < summer < 20
    assert 0 < winter < summer
    assert hargreaves(None, 14.0, -33.73, 15) is None


def test_pm_matches_fao_example_roughly():
    # FAO-56 example 18 (lat -22.9 elev ~0, Jul): ET0 ~ 2-3 mm/day
    v = penman_monteith(tmax=21.5, tmin=15.3, rh=68, u2=1.8, rs=14.5,
                        lat=-22.9, doy=196, elev_m=8)
    assert v is not None and 1.5 < v < 4.0


def test_et0_series_prefers_pm():
    power = _series({"T2M_MAX": 30.0, "T2M_MIN": 12.0, "RH2M": 50.0,
                     "WS2M": 2.0, "ALLSKY_SFC_SW_DWN": 20.0})
    et0, method = et0_series(power, -33.5)
    assert method == "penman_monteith"
    assert all(2 < v < 12 for v in et0.values())


def test_et0_series_hargreaves_without_radiation():
    power = _series({"T2M_MAX": 30.0, "T2M_MIN": 12.0})
    et0, method = et0_series(power, -33.5)
    assert method == "hargreaves" and et0


def test_et0_series_mixed_when_radiation_gaps():
    power = _series({"T2M_MAX": 30.0, "T2M_MIN": 12.0, "RH2M": 50.0,
                     "WS2M": 2.0, "ALLSKY_SFC_SW_DWN": 20.0})
    # mask radiation on all January days -> those days go Hargreaves
    power["ALLSKY_SFC_SW_DWN"] = {
        d: (None if d.month == 1 else v)
        for d, v in power["ALLSKY_SFC_SW_DWN"].items()}
    et0, method = et0_series(power, -33.5)
    assert method == "mixto" and len(et0) == 8


def test_et0_series_empty_without_temps():
    et0, method = et0_series({"RH2M": {}}, -33.5)
    assert et0 == {} and method == "none"
    assert "none" not in METHOD_LABEL  # never surfaced in basis


def test_masked_temperatures_skipped():
    power = _series({"T2M_MAX": 30.0, "T2M_MIN": None})
    et0, _ = et0_series(power, -33.5)
    assert et0 == {}

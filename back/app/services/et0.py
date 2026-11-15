"""FAO-56 reference evapotranspiration (ET0) from NASA POWER daily.

Used when POWER EVPTRNS/EVLAND come back missing or masked (e.g. the
Valle de Uco cell, where the evapotranspiration parameter returns no
usable values).

Per day: Penman-Monteith FAO-56 (Allen et al. 1998, eq. 6) when the
cell provides radiation (ALLSKY_SFC_SW_DWN), humidity (RH2M) and wind
(WS2M); Hargreaves (eq. 52) otherwise — it only needs T2M_MAX/T2M_MIN
plus extraterrestrial radiation, which is pure geometry (latitude and
day of year, no extra data).
"""

import math
from datetime import date

G_SC = 0.0820        # solar constant, MJ m-2 min-1
SIGMA = 4.903e-9     # Stefan-Boltzmann, MJ K-4 m-2 day-1
ALBEDO = 0.23        # reference grass albedo


def ra_mj(lat_deg: float, doy: int) -> float:
    """Extraterrestrial radiation Ra, MJ/m2/day (FAO-56 eq. 21-24)."""
    lat = math.radians(lat_deg)
    dr = 1 + 0.033 * math.cos(2 * math.pi * doy / 365)
    delta = 0.409 * math.sin(2 * math.pi * doy / 365 - 1.39)
    ws = math.acos(max(-1.0, min(1.0, -math.tan(lat) * math.tan(delta))))
    return (24 * 60 / math.pi) * G_SC * dr * (
        ws * math.sin(lat) * math.sin(delta)
        + math.cos(lat) * math.cos(delta) * math.sin(ws))


def _es(t: float) -> float:
    """Saturation vapour pressure at t C, kPa (FAO-56 eq. 11)."""
    return 0.6108 * math.exp(17.27 * t / (t + 237.3))


def hargreaves(tmax: float, tmin: float, lat: float,
               doy: int) -> float | None:
    """ET0 mm/day, FAO-56 Hargreaves (eq. 52)."""
    if tmax is None or tmin is None:
        return None
    tmean = (tmax + tmin) / 2
    td = max(0.0, tmax - tmin)
    return max(0.0, 0.0023 * ra_mj(lat, doy) * (tmean + 17.8)
               * math.sqrt(td))


def penman_monteith(tmax: float, tmin: float, rh: float, u2: float,
                    rs: float, lat: float, doy: int,
                    elev_m: float = 0.0) -> float | None:
    """ET0 mm/day, FAO-56 Penman-Monteith (eq. 6) on daily POWER inputs.

    rs: shortwave radiation MJ/m2/day; u2: wind at 2 m (WS2M is already
    the 2 m product); rh: mean relative humidity %.
    """
    if None in (tmax, tmin, rh, u2, rs) or rs <= 0:
        return None
    tmean = (tmax + tmin) / 2
    es = (_es(tmax) + _es(tmin)) / 2
    ea = es * rh / 100
    delta = (4098 * _es(tmean)) / (tmean + 237.3) ** 2
    p = 101.3 * ((293 - 0.0065 * elev_m) / 293) ** 5.26  # kPa
    gamma = 0.000665 * p
    ra = ra_mj(lat, doy)
    rso = (0.75 + 2e-5 * elev_m) * ra
    rns = (1 - ALBEDO) * rs
    tk4 = ((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2
    rnl = SIGMA * tk4 * (0.34 - 0.14 * math.sqrt(max(ea, 0))) * \
        (1.35 * min(rs / rso, 1.0) - 0.35) if rso > 0 else 0.0
    rn = rns - rnl
    num = (0.408 * delta * rn
           + gamma * (900 / (tmean + 273)) * u2 * (es - ea))
    den = delta + gamma * (1 + 0.34 * u2)
    return max(0.0, num / den)


def et0_series(power: dict, lat: float,
               elev_m: float = 0.0) -> tuple[dict, str]:
    """({date: et0 mm/day}, method) for a POWER series dict.

    Penman-Monteith where radiation+humidity+wind are present for the
    day, Hargreaves otherwise. `method` is "penman_monteith" if PM
    covers every day, "hargreaves" if none, "mixto" in between."""
    tmax = power.get("T2M_MAX") or {}
    tmin = power.get("T2M_MIN") or {}
    rh = power.get("RH2M") or {}
    ws = power.get("WS2M") or {}
    rs = power.get("ALLSKY_SFC_SW_DWN") or {}
    out: dict[date, float] = {}
    n_pm = 0
    for d, tx in tmax.items():
        tn = tmin.get(d)
        if tx is None or tn is None:
            continue
        v = penman_monteith(tx, tn, rh.get(d), ws.get(d), rs.get(d),
                            lat, d.timetuple().tm_yday, elev_m)
        if v is not None:
            n_pm += 1
        else:
            v = hargreaves(tx, tn, lat, d.timetuple().tm_yday)
        if v is not None:
            out[d] = v
    if not out:
        return {}, "none"
    method = ("penman_monteith" if n_pm == len(out)
              else "hargreaves" if n_pm == 0 else "mixto")
    return out, method


def series_is_masked(series: dict, min_mean: float) -> bool:
    """True when a POWER daily series is absent or implausibly low.

    POWER sometimes returns a parameter populated but degraded -- e.g.
    EVPTRNS in the Valle de Uco cell averages 0.05 MJ/m2/day. `series`
    is {date: float|None}; a mean under `min_mean` (or an empty series)
    counts as masked."""
    vals = [v for v in (series or {}).values() if v is not None]
    if not vals:
        return True
    return sum(vals) / len(vals) < min_mean


METHOD_LABEL = {
    "penman_monteith": "ET0 FAO-56 Penman-Monteith (radiación, "
                       "humedad y viento POWER)",
    "hargreaves": "ET0 FAO-56 Hargreaves (temperatura POWER y "
                  "radiación astronómica)",
    "mixto": "ET0 FAO-56 (Penman-Monteith donde hay datos, "
             "Hargreaves en el resto)",
}

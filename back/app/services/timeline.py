"""Monthly timeline of field variables built from the POWER daily
series the field endpoints already fetch (no extra upstream call).

Last 24 complete months plus the current partial one; normals are the
monthly mean of the same calendar month over 2001-2020 for the cell.
A month is reported null when it has fewer than 20 valid days.
"""
from __future__ import annotations

import calendar as _cal
import statistics
from datetime import date

MIN_DAYS = 20
NORMAL_YEARS = range(2001, 2021)
COMPLETE_MONTHS = 24
MONTH_LABELS = {
    "es": {"seasons": ["verano", "otoño", "invierno", "primavera"]},
    "en": {"seasons": ["summer", "autumn", "winter", "spring"]},
}


def _monthly(series: dict, kind: str, cond=None) -> dict:
    """(year, month) -> aggregate, only months with >=20 valid days.
    kind: 'sum' | 'mean' | 'count' (count of days where cond(v))."""
    slots: dict[tuple[int, int], list] = {}
    for d, v in (series or {}).items():
        if v is None:
            continue
        slot = slots.setdefault((d.year, d.month), [0, 0])
        slot[0] += 1 if kind == "count" and cond(v) else (v if kind != "count" else 0)
        slot[1] += 1
    out = {}
    for key, (tot, n) in slots.items():
        if n < MIN_DAYS:
            continue
        out[key] = tot if kind in ("sum", "count") else tot / n
    return out


def _normal(monthly: dict) -> list[float | None]:
    """12 normals: mean of the same calendar month over 2001-2020."""
    out = []
    for m in range(1, 13):
        vals = [v for (y, mm), v in monthly.items()
                if mm == m and y in NORMAL_YEARS]
        out.append(round(statistics.fmean(vals), 3) if vals else None)
    return out


def _months(end: date) -> tuple[list[tuple[int, int]], bool]:
    """24 complete months + current partial month."""
    cur = (end.year, end.month)
    seq = []
    y, m = end.year, end.month
    for _ in range(COMPLETE_MONTHS + 1):
        seq.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    seq.reverse()
    partial = end.day < _cal.monthrange(*cur)[1]
    if not partial:
        seq = seq[1:]  # 24 complete months only
    return seq, partial


def _season(lat: float, month: int, lang: str) -> str:
    names = MONTH_LABELS[lang]["seasons"]
    idx = {12: 0, 1: 0, 2: 0, 3: 1, 4: 1, 5: 1,
           6: 2, 7: 2, 8: 2, 9: 3, 10: 3, 11: 3}[month]
    # order above is for the southern hemisphere; flip for northern
    return names[idx] if lat < 0 else names[(idx + 2) % 4]


def _headline(lang: str, lat: float, months: list,
              rain: dict, moist: dict, tmax: dict,
              rain_n: list, moist_n: list, tmax_n: list) -> str:
    """Deterministic plain sentence from recent anomalies."""
    en = lang == "en"
    last3 = [i for i in range(len(months) - 1, -1, -1)
             if months[i] in rain and rain_n[months[i][1] - 1] is not None][:3]
    rain_pct = None
    if last3:
        got = sum(rain[months[i]] for i in last3)
        norm = sum(rain_n[months[i][1] - 1] for i in last3)
        if norm > 0:
            rain_pct = round((got - norm) / norm * 100)
    sm_pct = next(
        (round((moist[key] - moist_n[key[1] - 1]) / moist_n[key[1] - 1] * 100)
         for key in reversed(months)
         if key in moist and moist_n[key[1] - 1]),
        None)
    t_dev = [tmax[key] - tmax_n[key[1] - 1]
             for key in reversed(months)
             if key in tmax and tmax_n[key[1] - 1] is not None][:3]
    t_c = round(statistics.fmean(t_dev), 1) if t_dev else None

    clauses = []
    if rain_pct is not None and abs(rain_pct) >= 5:
        clauses.append(
            (f"llovió {abs(rain_pct)} % {'menos' if rain_pct < 0 else 'más'} "
             "de lo normal") if not en else
            (f"it rained {abs(rain_pct)} % {'less' if rain_pct < 0 else 'more'} "
             "than normal"))
    if sm_pct is not None and abs(sm_pct) >= 10:
        clauses.append(
            (f"el suelo está más {'seco' if sm_pct < 0 else 'húmedo'} "
             "que lo normal") if not en else
            (f"the soil is {'drier' if sm_pct < 0 else 'wetter'} "
             "than normal"))
    if clauses:
        joiner = " y " if not en else " and "
        body = joiner.join(clauses)
        head = ("En los últimos 3 meses " + body if not en else
                "In the last 3 months " + body)
    else:
        head = None
    if t_c is not None and abs(t_c) >= 1:
        season = _season(lat, months[-1][1], lang)
        fem = season == "primavera"
        adj = (("cálida" if fem else "cálido") if t_c > 0
               else ("fría" if fem else "frío"))
        t_clause = (
            (f"{'la' if fem else 'el'} {season} viene {abs(t_c):g} °C "
             f"más {adj} que lo normal") if not en else
            (f"the {season} is running {abs(t_c):g} °C "
             f"{'warmer' if t_c > 0 else 'cooler'} than normal"))
        if head:
            return head + ", " + ("y " if not en else "and ") + t_clause + "."
        return ("Este año " + t_clause + "." if not en else
                "This year " + t_clause + ".")
    if head:
        return head + "."
    return ("Los últimos meses estuvieron dentro de lo normal."
            if not en else "Recent months were close to normal.")


def build_timeline(power: dict | None, lat: float,
                   lang: str = "es") -> dict | None:
    """Monthly timeline for /diagnose and each parcel. `power` is the
    endpoint's POWER dict (date -> value series per parameter)."""
    if not power:
        return None
    end = max(
        (d for key in ("PRECTOTCORR", "T2M_MAX", "GWETROOT")
         for d, v in (power.get(key) or {}).items() if v is not None),
        default=None)
    if end is None:
        return None
    months, partial = _months(end)

    rain_m = _monthly(power.get("PRECTOTCORR"), "sum")
    tmax_m = _monthly(power.get("T2M_MAX"), "mean")
    gwet_m = _monthly(power.get("GWETROOT"), "mean")
    heat_m = _monthly(power.get("T2M_MAX"), "count", lambda v: v >= 35)
    frost_m = _monthly(power.get("T2M_MIN"), "count", lambda v: v <= 0)

    rain_n = _normal(rain_m)
    tmax_n = _normal(tmax_m)
    gwet_n = _normal(gwet_m)

    def values(monthly):
        return [round(monthly[k], 2) if k in monthly else None
                for k in months]

    def anomaly_pct(monthly, normal):
        out = []
        for (y, m) in months:
            v, n = monthly.get((y, m)), normal[m - 1]
            out.append(round((v - n) / n * 100)
                       if v is not None and n else None)
        return out

    def anomaly_c(monthly, normal):
        return [round(monthly[(y, m)] - normal[m - 1], 1)
                if (y, m) in monthly and normal[m - 1] is not None
                else None
                for (y, m) in months]

    headline = _headline(lang, lat, months, rain_m, gwet_m, tmax_m,
                         rain_n, gwet_n, tmax_n)
    return {
        "months": [f"{y}-{m:02d}" for (y, m) in months],
        "partial_last": partial,
        "series": {
            "rain_mm": {"values": values(rain_m), "normal": rain_n,
                        "anomaly_pct": anomaly_pct(rain_m, rain_n)},
            "tmax_c": {"values": values(tmax_m), "normal": tmax_n,
                       "anomaly_c": anomaly_c(tmax_m, tmax_n)},
            "root_moisture": {"values": values(gwet_m), "normal": gwet_n,
                              "anomaly_pct": anomaly_pct(gwet_m, gwet_n)},
            "heat_days_35": {"values": [int(heat_m[k]) if k in heat_m
                                        else None for k in months]},
            "frost_days": {"values": [int(frost_m[k]) if k in frost_m
                                      else None for k in months]},
        },
        "normals_period": "2001-2020",
        "basis": ("Los 'normales' son la media del mismo mes del año "
                  "entre 2001 y 2020 en esta celda." if lang != "en" else
                  "Normals are the mean of the same calendar month over "
                  "2001-2020 for this cell."),
        "source": "NASA POWER daily",
        "headline": headline,
    }

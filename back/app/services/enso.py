"""ENSO (El Niño / La Niña) from the NOAA CPC Oceanic Niño Index.

Fetches https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt
(cached 24 h, 6 s timeout). The file has one row per overlapping
3-month season: `SEAS YR TOTAL ANOM` where YR is the year of the
center month (e.g. "DJF 2026" = Dec 2025–Feb 2026).

Phase thresholds are the standard ±0.5 °C on ANOM. The per-cell rain
effect compares the mean Oct–Mar (growing season) precipitation of
El Niño and La Niña seasons against all seasons in that cell's own
POWER history — a historical tendency, never a forecast.
"""

import logging
import time
from datetime import date

import httpx

log = logging.getLogger("parcels")

ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
TIMEOUT = httpx.Timeout(6.0)
CACHE_TTL = 24 * 3600

# center month of each season label: SON -> Oct, OND -> Nov, NDJ -> Dec,
# DJF -> Jan (next year), JFM -> Feb, FMA -> Mar, ... The growing
# season Oct Y .. Mar Y+1 covers center months Nov Y .. Mar Y+1:
# OND(Y), NDJ(Y), DJF(Y+1), JFM(Y+1), FMA(Y+1).
_GS_SEASONS = ("OND", "NDJ", "DJF", "JFM", "FMA")

_cache: tuple[float, dict] | None = None


def parse_oni(text: str) -> dict[tuple[str, int], float]:
    """{(SEAS, YR): anom} from the ascii table."""
    out = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 4:
            continue
        seas, yr = parts[0], parts[1]
        if len(seas) != 3 or not seas.isalpha() or not yr.isdigit():
            continue
        try:
            out[(seas.upper(), int(yr))] = float(parts[-1])
        except ValueError:
            continue
    return out


def phase(anom: float | None) -> str | None:
    if anom is None:
        return None
    if anom >= 0.5:
        return "el_nino"
    if anom <= -0.5:
        return "la_nina"
    return "neutral"


def latest(oni: dict) -> tuple[str, int] | None:
    """Most recent (SEAS, YR) key — season order within a year."""
    order = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ",
             "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]
    if not oni:
        return None
    return max(oni, key=lambda k: (k[1], order.index(k[0])
                                   if k[0] in order else -1))


def season_oni(oni: dict, start_year: int) -> float | None:
    """Mean ONI of the 3-month seasons covering Oct Y .. Mar Y+1."""
    keys = [("OND", start_year), ("NDJ", start_year),
            ("DJF", start_year + 1), ("JFM", start_year + 1),
            ("FMA", start_year + 1)]
    vals = [oni[k] for k in keys if k in oni]
    return sum(vals) / len(vals) if len(vals) >= 4 else None


async def fetch_oni(client: httpx.AsyncClient | None = None) -> dict:
    """-> {(SEAS,YR): anom} or {} on any failure (never raises)."""
    global _cache
    if _cache and time.time() - _cache[0] < CACHE_TTL:
        return _cache[1]

    async def go(c: httpx.AsyncClient):
        r = await c.get(ONI_URL, headers={
            "User-Agent": "fieldshift-parcels/1.0 (rural fire risk demo)"})
        r.raise_for_status()
        return r.text

    try:
        if client is not None:
            text = await go(client)
        else:
            async with httpx.AsyncClient(timeout=TIMEOUT) as c:
                text = await go(c)
    except Exception as exc:
        log.warning("oni fetch failed: %s", type(exc).__name__)
        return {}
    oni = parse_oni(text)
    if oni:
        _cache = (time.time(), oni)
    return oni


def rain_effect(rain: dict, oni: dict) -> dict | None:
    """% difference of Oct–Mar precipitation in El Niño / La Niña
    seasons vs all seasons. `rain` is {date: mm} daily POWER."""
    by_season: dict[int, float] = {}
    for d, v in rain.items():
        if v is None:
            continue
        y = d.year if d.month >= 10 else d.year - 1
        if d.month >= 10 or d.month <= 3:
            by_season[y] = by_season.get(y, 0.0) + v
    # keep only complete seasons (~181 days, allow missing data slack)
    complete = {y: t for y, t in by_season.items() if t is not None}
    nino, nina, allv = [], [], []
    for y, total in complete.items():
        s = season_oni(oni, y)
        if s is None:
            continue
        allv.append(total)
        if s >= 0.5:
            nino.append(total)
        elif s <= -0.5:
            nina.append(total)
    if not allv or not nino or not nina:
        return None
    mean_all = sum(allv) / len(allv)
    if not mean_all:
        return None
    return {
        "el_nino": round(100 * (sum(nino) / len(nino) - mean_all)
                         / mean_all),
        "la_nina": round(100 * (sum(nina) / len(nina) - mean_all)
                         / mean_all)}


def indicator(oni: dict, rain: dict | None) -> dict:
    """The enso indicator block for one parcel."""
    key = latest(oni)
    if key is None:
        return {"phase_now": None, "oni": None, "oni_period": None,
                "rain_effect_pct": None,
                "basis": "El índice ENSO de NOAA no respondió; sin "
                         "información de El Niño/La Niña."}
    seas, yr = key
    anom = oni[key]
    ph = phase(anom)
    effects = rain_effect(rain, oni) if rain else None
    names = {"el_nino": "El Niño", "la_nina": "La Niña",
             "neutral": "neutral"}
    basis = (f"ENSO según el índice ONI de NOAA: ahora "
             f"{names[ph]} ({anom:+.1f} °C).")
    if effects:
        basis += (f" En esta zona, los años El Niño llovieron "
                  f"{effects['el_nino']:+d} % y los La Niña "
                  f"{effects['la_nina']:+d} % respecto al promedio "
                  "en octubre–marzo. Es una tendencia histórica, "
                  "no un pronóstico.")
    return {"phase_now": ph, "oni": round(anom, 1),
            "oni_period": f"{seas} {yr}",
            "rain_effect_pct": effects, "basis": basis}

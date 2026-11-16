"""Season outlook for crop recommendations.

The current ENSO phase (NOAA ONI) and how Oct–Mar rain changed in this
cell's own POWER history under that phase give an expected rain for
each crop cycle. It is a historical tendency, never a forecast.
"""
import asyncio
import logging
import re
from datetime import date, timedelta

from ..h3util import h3_r6
from . import enso
from . import field_sources as src
from .infiltration import infiltration_class
from .rotations import _card, _daily_rain_mm, _soil_infiltration

log = logging.getLogger(__name__)
OUTLOOK_TIMEOUT = 20


def season_outlook(oni: dict, rain_daily: dict | None) -> dict | None:
    """{phase, oni, oni_period, rain_effect_pct, effects} or None."""
    key = enso.latest(oni or {})
    if key is None:
        return None
    anom = oni[key]
    phase = enso.phase(anom)
    effects = enso.rain_effect(rain_daily, oni) if rain_daily else None
    if phase == "neutral":
        effect = 0
    else:
        effect = effects.get(phase) if effects else None
    return {"phase": phase, "oni": round(anom, 1), "oni_period": f"{key[0]} {key[1]}",
            "rain_effect_pct": effect, "effects": effects}


def target_season(today: date) -> tuple[date, date]:
    """The Oct–Mar season the current ENSO phase speaks for: the one
    under way, or the next one from April on."""
    year = today.year - 1 if today.month <= 3 else today.year
    return date(year, 10, 1), date(year + 1, 3, 31)


def _doy(day: date) -> int:
    return min((day - date(day.year, 1, 1)).days, 364)


def _season_rain(row: dict, daily: list[float], season: tuple[date, date]) -> float:
    """Climatological rain of the crop cycle days that fall in `season`."""
    start = date.fromisoformat(row["sow_from"])
    days = 365 if row.get("rain_period") == "year" else (row.get("cover_days") or 0)
    if row.get("rain_period") == "year":
        start = max(start, season[0])
    return sum(daily[_doy(day)] for day in (start + timedelta(days=i) for i in range(days))
               if season[0] <= day <= season[1])


def apply_outlook(result: dict, diag: dict, outlook: dict | None, *, today: date | None = None) -> dict:
    """Adds the water balance of each crop cycle and, when the ENSO
    signal is known, the rain and balance expected this season. Only
    the cycle days inside the coming Oct–Mar season carry the signal."""
    season = target_season(today or date.today())
    if outlook is not None:
        outlook = {**outlook, "season": f"{season[0].year}-{season[1].year % 100:02d}"}
    result["outlook"] = outlook
    daily = _daily_rain_mm(diag)
    effect = (outlook or {}).get("rain_effect_pct")
    for row in result.get("options", []):
        rain = row.get("rain_mm")
        if rain is None:
            continue
        row["balance_mm"] = rain - row["water_demand_mm"]
        if daily is None:
            continue
        wet = round(_season_rain(row, daily, season))
        row["rain_wet_mm"] = wet
        if effect is not None:
            row["rain_expected_mm"] = round(rain + wet * effect / 100)
            row["balance_expected_mm"] = row["rain_expected_mm"] - row["water_demand_mm"]
    return result


def add_soil_ph(cards: list, ph) -> None:
    """Completes the soil card with the point pH when the sampled
    SoilGrids rows did not bring one."""
    if not isinstance(ph, (int, float)) or isinstance(ph, bool):
        return
    soil = next((c for c in cards if c.get("id") == "soil"), None)
    if soil is None or soil.get("ph") is not None:
        return
    soil["ph"] = round(float(ph), 1)
    for key in ("text", "text_en"):
        text = soil.get(key) or ""
        known = text and soil.get("value") is not None
        soil[key] = f"{text}; pH {ph:.1f}" if known else f"pH {ph:.1f}"


SOIL_PH_WAIT = 12


async def ensure_soil_ph(diag: dict) -> bool:
    """Adds the SoilGrids point pH to the diagnosis soil card when it has
    none. Asked here, after the diagnosis burst, because SoilGrids
    throttles bursts of requests. True when a pH was added."""
    soil = next((c for c in diag.get("cards", []) if isinstance(c, dict) and c.get("id") == "soil"), None)
    centroid = diag.get("centroid")
    if soil is None or soil.get("ph") is not None or not (
            isinstance(centroid, list) and len(centroid) == 2):
        return False
    try:
        import httpx
        lat, lon = float(centroid[0]), float(centroid[1])
        async with httpx.AsyncClient() as client:
            ph = await asyncio.wait_for(src.soil_ph(client, lat, lon, h3_r6(lat, lon)), timeout=SOIL_PH_WAIT)
    except Exception as exc:  # noqa: BLE001 - pH is optional
        log.warning("soil pH unavailable: %s", type(exc).__name__)
        return False
    add_soil_ph(diag["cards"], ph)
    return soil.get("ph") is not None


def _num(diag: dict, cid: str):
    value = (_card(diag, cid) or {}).get("value")
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def land_state(diag: dict) -> dict:
    """The soil and water condition of the field today, only from what
    the diagnosis measured (missing data is left out, never guessed)."""
    land: dict = {}
    soil = _card(diag, "soil") or {}
    texture = soil.get("texture") or (soil.get("text") or "").split(";")[0].strip()
    if _num(diag, "soil") is not None:
        if texture:
            land["texture"] = texture
        land["carbon_g_kg"] = _num(diag, "soil")
        score = _soil_infiltration(diag)
        if score is not None:
            land["infiltration"] = score
            land["infiltration_class"] = infiltration_class(score)
    if isinstance(soil.get("ph"), (int, float)) and not isinstance(soil.get("ph"), bool):
        land["ph"] = soil["ph"]
    for key, cid in (("slope_pct", "slope"), ("heavy_rain_days", "heavy_rain"),
                     ("root_moisture_pct", "soil_moisture"), ("heat_days", "heat")):
        if (value := _num(diag, cid)) is not None:
            land[key] = value
    recent = re.search(r"([\d.]+) mm \(media histórica ([\d.]+) mm\)",
                       (_card(diag, "recent_weather") or {}).get("text") or "")
    if recent:
        rain, normal = float(recent.group(1)), float(recent.group(2))
        land["rain_30d_mm"], land["rain_30d_normal_mm"] = rain, normal
        if normal > 0:
            land["rain_30d_pct"] = round(100 * rain / normal)
    if (value := _num(diag, "vigor_bare_soil")) is not None:
        land["bare_soil_days"] = value
    trend = (_card(diag, "water_trend") or {}).get("value")
    if isinstance(trend, str):
        land["groundwater"] = trend
    return land


async def _rain_history(lat: float, lon: float, h3_r6: str) -> dict | None:
    import httpx
    async with httpx.AsyncClient() as client:
        power = await src.power_daily(client, lat, lon, h3_r6)
    return (power or {}).get("PRECTOTCORR")


async def fetch_outlook(diag: dict) -> dict | None:
    """Never raises: any failure means no outlook."""
    try:
        oni = await asyncio.wait_for(enso.fetch_oni(), timeout=OUTLOOK_TIMEOUT)
        rain = None
        centroid = diag.get("centroid")
        if isinstance(centroid, list) and len(centroid) == 2:
            lat, lon = float(centroid[0]), float(centroid[1])
            try:
                # same cache key as the diagnosis' own POWER call
                rain = await asyncio.wait_for(_rain_history(lat, lon, h3_r6(lat, lon)),
                                              timeout=OUTLOOK_TIMEOUT)
            except Exception as exc:  # noqa: BLE001 - outlook is optional
                log.warning("outlook rain history unavailable: %s", type(exc).__name__)
        return season_outlook(oni, rain)
    except Exception as exc:  # noqa: BLE001 - outlook is optional
        log.warning("season outlook unavailable: %s", type(exc).__name__)
        return None

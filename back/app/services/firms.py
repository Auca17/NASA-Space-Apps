"""FIRMS NRT client: area CSV API, four sources fetched concurrently.

https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{source}/{bbox}/{day_range}[/{YYYY-MM-DD}]
bbox = west,south,east,north ; day_range = 1..5 ; optional DATE starts the range
at DATE .. DATE+day_range-1 (without DATE: today .. today-(day_range-1)).
"""

import asyncio
import csv
import io
import logging
from datetime import date, timedelta

import httpx

log = logging.getLogger("firms")

FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/{bbox}/{days}"
SOURCES = ["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "VIIRS_SNPP_NRT", "MODIS_NRT"]
# D22: FIRMS gets 10 s (a single world-bbox source is ~2.6 MB / ~3.4 s);
# every other outbound call keeps the D18 default of 3 s.
TIMEOUT = httpx.Timeout(10.0)

SAT_MAP = {"N": "N", "N20": "N20", "N21": "N21",
           "1": "N20", "2": "N21",
           "T": "T", "A": "A", "Terra": "T", "Aqua": "A"}
# Real NRT values are l/n/h; full words accepted too. l/low dropped.
VIIRS_CONF_OK = {"n", "h", "nominal", "high"}
MODIS_MIN_CONF = 30


def _acq_instant(acq_date: str, acq_time: str) -> str:
    t = acq_time.strip().zfill(4)
    return f"{acq_date.strip()}T{t[:2]}:{t[2:]}Z"


def _keep(row: dict, source: str) -> bool:
    conf = (row.get("confidence") or "").strip()
    if source.startswith("VIIRS"):
        return conf in VIIRS_CONF_OK
    try:
        return int(conf) >= MODIS_MIN_CONF
    except ValueError:
        return False


def parse_csv(text: str, source: str) -> list:
    points = []
    for row in csv.DictReader(io.StringIO(text)):
        if not _keep(row, source):
            continue
        sat = SAT_MAP.get(row["satellite"].strip(), row["satellite"].strip())
        points.append([
            float(row["latitude"]), float(row["longitude"]), float(row["frp"]),
            sat, _acq_instant(row["acq_date"], row["acq_time"]),
        ])
    return points


async def fetch_source(client: httpx.AsyncClient, map_key: str, source: str,
                       bbox: str, days: int, day: date | None = None) -> list:
    url = FIRMS_URL.format(key=map_key, source=source, bbox=bbox, days=days)
    if day is not None:
        url += f"/{day.isoformat()}"
    resp = await client.get(url)
    # FIRMS signals errors as plain text, sometimes with a non-200 status.
    if resp.status_code != 200 or "latitude" not in resp.text[:200]:
        log.warning("firms %s failed: %s",
                    source, resp.text[:120].replace("\n", " "))
        resp.raise_for_status()
        raise httpx.TransportError("invalid response body", request=resp.request)
    return parse_csv(resp.text, source)


def window_legs(window: str, today: date) -> list[tuple[int, date | None]]:
    """Requests needed to cover the window, within FIRMS' 1..5 day limit."""
    if window == "7d":
        return [(5, None), (2, today - timedelta(days=6))]
    return [(int(window[:-1]) // 24, None)]


async def fetch_source_window(client: httpx.AsyncClient, map_key: str,
                              source: str, bbox: str,
                              legs: list[tuple[int, date | None]]) -> list:
    """All legs of one source; the source fails if any leg fails."""
    parts = await asyncio.gather(
        *(fetch_source(client, map_key, source, bbox, d, day)
          for d, day in legs),
        return_exceptions=True)
    for res in parts:
        if isinstance(res, Exception):
            raise res
    return [p for part in parts for p in part]


async def fetch_all(map_key: str, bbox: str, window: str):
    """Returns (sources_ok, sources_failed, points). A failed source never
    fails the whole request."""
    legs = window_legs(window, date.today())
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        results = await asyncio.gather(
            *(fetch_source_window(client, map_key, s, bbox, legs)
              for s in SOURCES),
            return_exceptions=True,
        )
    ok, failed, points, seen = [], [], [], set()
    for source, res in zip(SOURCES, results):
        if isinstance(res, Exception):
            failed.append(source)
        else:
            ok.append(source)
            for p in res:
                key = (p[0], p[1], p[4], p[3])  # lat, lon, acq_instant, sat
                if key not in seen:
                    seen.add(key)
                    points.append(p)
    return ok, failed, points

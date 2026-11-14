"""Fetch NASA POWER daily meteorology for Argentina from the AWS Open Data Zarr store.

Primary source : POWER Analysis Ready Datastore (Zarr, anonymous S3, us-west-2).
Fallback       : POWER regional daily API (--source api), only if the Zarr store
                 is unreachable. Same output schema.

Output: one row per MERRA-2/GEOS-IT grid point per UTC day, columns per data
contract 5.2: lat, lon (float32), h3_r5 (string), date (date32), T2M_MAX,
T2M_MIN, RH2M, WS2M, PRECTOTCORR (float32, nulls for missing).
"""

import argparse
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import h3
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import xarray as xr
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)

# ---------------------------------------------------------------- stores ----

S3_OPTS = {"anon": True, "client_kwargs": {"region_name": "us-west-2"}}
BUCKET = "nasa-power"

STORES = [
    # (store key in last_available.json, zarr URL, coverage start)
    (
        "merra2",
        f"s3://{BUCKET}/merra2/temporal/power_merra2_daily_temporal_utc.zarr",
        date(1980, 12, 31),
    ),
    (
        "geosit",
        f"s3://{BUCKET}/geosit/temporal/power_geosit_daily_temporal_utc.zarr",
        date(2019, 12, 31),
    ),
]

LAST_AVAILABLE_URL = f"s3://{BUCKET}/last_available.json"
# Used only if last_available.json cannot be fetched.
FALLBACK_LAST_AVAILABLE = {"merra2": date(2026, 10, 1), "geosit": date(2026, 11, 12)}

VARIABLES = ["T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "PRECTOTCORR"]
# Store names already match the contract names 1:1; keep the mapping explicit.
VARIABLE_MAP = {v: v for v in VARIABLES}

API_BASE = "https://power.larc.nasa.gov/api/temporal/daily/regional"
API_MAX_BOX_DEG = 10.0
API_PAUSE_S = 1.0
API_RETRIES = 4

OUTPUT_SCHEMA = pa.schema(
    [
        ("lat", pa.float32()),
        ("lon", pa.float32()),
        ("h3_r5", pa.string()),
        ("date", pa.date32()),
        ("T2M_MAX", pa.float32()),
        ("T2M_MIN", pa.float32()),
        ("RH2M", pa.float32()),
        ("WS2M", pa.float32()),
        ("PRECTOTCORR", pa.float32()),
    ]
)


# ------------------------------------------------------------ helpers ------

def gridpoint_h3(lat: float, lon: float) -> str:
    """H3 resolution-5 cell containing a grid point."""
    return h3.latlng_to_cell(float(lat), float(lon), 5)


def clean_fill(arr: np.ndarray) -> np.ndarray:
    """POWER fill values (-999 and any more extreme negatives) become NaN."""
    out = arr.astype(np.float32, copy=True)
    out[out <= -999.0] = np.nan
    return out


def daterange_days(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def last_available_dates() -> dict:
    """Real last day with data per product, from the bucket manifest."""
    try:
        import s3fs

        fs = s3fs.S3FileSystem(**S3_OPTS)
        manifest = json.loads(fs.cat(f"{BUCKET}/last_available.json"))
        return {
            key: date.fromisoformat(manifest[key]["temporal"]["daily"]["utc"])
            for key, *_ in STORES
        }
    except Exception as e:  # pragma: no cover - network fallback
        print(f"warn: could not read {LAST_AVAILABLE_URL}: {e}; "
              f"using fallback dates {FALLBACK_LAST_AVAILABLE}", file=sys.stderr)
        return dict(FALLBACK_LAST_AVAILABLE)


def open_store(url: str) -> xr.Dataset:
    return xr.open_zarr(url, storage_options=S3_OPTS, consolidated=True)


def slice_to_frame(ds: xr.Dataset, bbox, start: date, end: date) -> pd.DataFrame:
    """Materialize one store slice (bbox x [start, end]) to the output schema."""
    lat_min, lat_max, lon_min, lon_max = bbox
    sub = ds[VARIABLES].sel(
        lat=slice(lat_min, lat_max),
        lon=slice(lon_min, lon_max),
        time=slice(np.datetime64(start), np.datetime64(end)),
    ).load()
    if sub.sizes.get("time", 0) == 0:
        return pd.DataFrame(columns=[f.name for f in OUTPUT_SCHEMA])

    lats = sub["lat"].values.astype(np.float32)
    lons = sub["lon"].values.astype(np.float32)
    times = pd.to_datetime(sub["time"].values).date
    n_t, n_lat, n_lon = len(times), len(lats), len(lons)
    n = n_t * n_lat * n_lon

    df = pd.DataFrame(
        {
            "lat": np.tile(np.repeat(lats, n_lon), n_t),
            "lon": np.tile(lons, n_t * n_lat),
            "date": np.repeat(times, n_lat * n_lon),
        }
    )
    for v in VARIABLES:
        df[v] = clean_fill(sub[VARIABLE_MAP[v]].values.reshape(n))
    return df


def attach_h3(df: pd.DataFrame) -> pd.DataFrame:
    pts = df[["lat", "lon"]].drop_duplicates()
    cells = {(r.lat, r.lon): gridpoint_h3(r.lat, r.lon)
             for r in pts.itertuples(index=False)}
    df.insert(2, "h3_r5",
              [cells[t] for t in zip(df["lat"], df["lon"])])
    return df


def write_parquet(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pandas(df, schema=OUTPUT_SCHEMA, preserve_index=False), path)


# ------------------------------------------------------------- zarr --------

def fetch_zarr(start: date, end: date, bbox, cache_dir: Path, out_path: Path) -> None:
    avail = last_available_dates()
    # Per-store effective coverage inside [start, end].
    spans = []
    for key, url, cov_start in STORES:
        s, e = max(start, cov_start), min(end, avail[key])
        if s <= e:
            spans.append((key, url, s, e))
    spans.sort(key=lambda t: t[2])
    # Resolve overlaps: earlier store wins for days it covers.
    for i in range(1, len(spans)):
        prev_end = spans[i - 1][3]
        k, u, s, e = spans[i]
        if s <= prev_end:
            spans[i] = (k, u, prev_end + timedelta(days=1), e)
    spans = [t for t in spans if t[2] <= t[3]]

    loaded = {}
    for key, url, s, e in spans:
        print(f"[{key}] loading bbox slice {s} -> {e} from {url}", flush=True)
        t0 = time.time()
        ds = open_store(url)
        loaded[key] = slice_to_frame(ds, bbox, s, e)
        print(f"[{key}] loaded {len(loaded[key]):,} rows in {time.time() - t0:.0f}s",
              flush=True)

    full = pd.concat([loaded[k] for k, *_ in spans], ignore_index=True) if spans \
        else pd.DataFrame(columns=[f.name for f in OUTPUT_SCHEMA])
    # Drop days with no data at all (store padding / gaps), keep partial nulls.
    all_null = full[VARIABLES].isna().all(axis=1)
    if all_null.any():
        print(f"dropping {int(all_null.sum()):,} all-null rows "
              f"({full.loc[all_null, 'date'].nunique()} days)", flush=True)
        full = full.loc[~all_null].copy()
    if len(full) == 0:
        sys.exit("error: extraction produced zero rows")
    attach_h3(full)

    years = sorted({d.year for d in full["date"]})
    parts = []
    for y in years:
        cache = cache_dir / f"power_{y}.parquet"
        if cache.exists():
            print(f"{y}: cache hit -> {cache}", flush=True)
            parts.append(pd.read_parquet(cache))
            continue
        t0 = time.time()
        yf = full[pd.DatetimeIndex(full["date"]).year == y]
        if len(yf) == 0:
            sys.exit(f"error: year {y} produced zero rows")
        write_parquet(yf, cache)
        print(f"{y}: {len(yf):,} rows written to {cache} in {time.time() - t0:.0f}s",
              flush=True)
        parts.append(yf)

    final = pd.concat(parts, ignore_index=True).sort_values(
        ["h3_r5", "date"], ignore_index=True
    )
    write_parquet(final, out_path)
    print(f"done: {len(final):,} rows -> {out_path}", flush=True)


# ------------------------------------------------------------- api ---------

def _api_box(bbox):
    """Split bbox into <= API_MAX_BOX_DEG squares."""
    lat_min, lat_max, lon_min, lon_max = bbox
    boxes = []
    lat = lat_min
    while lat < lat_max:
        lon = lon_min
        while lon < lon_max:
            boxes.append(
                (lat, min(lat + API_MAX_BOX_DEG, lat_max),
                 lon, min(lon + API_MAX_BOX_DEG, lon_max))
            )
            lon += API_MAX_BOX_DEG
        lat += API_MAX_BOX_DEG
    return boxes


def fetch_api(start: date, end: date, bbox, cache_dir: Path, out_path: Path) -> None:
    """Plan-B extractor: POWER regional daily API. Same output schema."""
    import requests

    parts = []
    for year in range(start.year, end.year + 1):
        cache = cache_dir / f"power_{year}.parquet"
        if cache.exists():
            print(f"{year}: cache hit -> {cache}", flush=True)
            parts.append(pd.read_parquet(cache))
            continue
        y0, y1 = max(start, date(year, 1, 1)), min(end, date(year, 12, 31))
        t0 = time.time()
        frames = []
        for la0, la1, lo0, lo1 in _api_box(bbox):
            params = {
                "parameters": ",".join(VARIABLES),
                "community": "AG",
                "latitude-min": la0, "latitude-max": la1,
                "longitude-min": lo0, "longitude-max": lo1,
                "start": y0.strftime("%Y%m%d"), "end": y1.strftime("%Y%m%d"),
                "format": "JSON",
            }
            body = None
            for attempt in range(API_RETRIES):
                try:
                    r = requests.get(API_BASE, params=params, timeout=120)
                    r.raise_for_status()
                    body = r.json()
                    break
                except Exception as e:
                    wait = 2 ** attempt * 5
                    print(f"  api retry {attempt + 1}/{API_RETRIES} "
                          f"box=({la0},{la1},{lo0},{lo1}): {e}; sleep {wait}s",
                          flush=True)
                    time.sleep(wait)
            if body is None:
                sys.exit(f"error: API failed for year {year} box "
                         f"({la0},{la1},{lo0},{lo1})")
            # GeoJSON FeatureCollection: one Point feature per grid cell,
            # coordinates [lon, lat, elev]; parameter -> {YYYYMMDD: value}.
            rows = []
            for feat in body["features"]:
                lon, lat = feat["geometry"]["coordinates"][:2]
                param = feat["properties"]["parameter"]
                for day in param[VARIABLES[0]]:
                    rows.append(
                        (np.float32(lat), np.float32(lon),
                         pd.to_datetime(day, format="%Y%m%d").date(),
                         *[param[v].get(day) for v in VARIABLES])
                    )
            frames.append(pd.DataFrame(
                rows, columns=["lat", "lon", "date", *VARIABLES]))
            time.sleep(API_PAUSE_S)
        if not frames:
            sys.exit(f"error: year {year} produced zero rows")
        yf = pd.concat(frames, ignore_index=True)
        for v in VARIABLES:
            yf[v] = clean_fill(yf[v].to_numpy(np.float32))
        if len(yf) == 0:
            sys.exit(f"error: year {year} produced zero rows")
        attach_h3(yf)
        write_parquet(yf, cache)
        print(f"{year}: {len(yf):,} rows written to {cache} in "
              f"{time.time() - t0:.0f}s", flush=True)
        parts.append(yf)

    final = pd.concat(parts, ignore_index=True).sort_values(
        ["h3_r5", "date"], ignore_index=True
    )
    write_parquet(final, out_path)
    print(f"done: {len(final):,} rows -> {out_path}", flush=True)


# ------------------------------------------------------------- cli ----------

def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--start", default="2012-01-01")
    p.add_argument("--end", default=(date.today() - timedelta(days=1)).isoformat())
    p.add_argument("--bbox", default="-56,-21,-74,-53",
                   help="lat_min,lat_max,lon_min,lon_max (degrees)")
    p.add_argument("--out", default="data/processed/model_input/power_ar_daily.parquet")
    p.add_argument("--cache-dir", default="data/power/cache")
    p.add_argument("--source", choices=["zarr", "api"], default="zarr")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)
    bbox = tuple(float(x) for x in args.bbox.split(","))
    cache_dir = Path(args.cache_dir)
    out_path = Path(args.out)
    print(f"fetch_power: {start} -> {end} bbox={bbox} source={args.source}", flush=True)
    if args.source == "zarr":
        fetch_zarr(start, end, bbox, cache_dir, out_path)
    else:
        fetch_api(start, end, bbox, cache_dir, out_path)


if __name__ == "__main__":
    main()

"""Paso 1 — Ingesta de los zips anuales de FIRMS ("Country Yearly Summary").

Para cada zip (producto × año):
  1. Descomprime los CSV por país (una sola vez).
  2. Normaliza al esquema común.
  3. Deduplica puntos repetidos entre países (frontera): misma lat, lon,
     acq_datetime y satellite → se queda uno (el del país alfabéticamente menor).
  4. Escribe Parquet en data/processed/hotspots/sensor=<S>/year=<Y>/<producto>.parquet

Uso:
  python pipeline/01_ingest.py              # todos los zips
  python pipeline/01_ingest.py --only modis_2014   # uno (prueba)
"""

from __future__ import annotations

import argparse
import csv
import re
import zipfile

from common import CSV, HOTSPOTS, PRODUCTS, STATS, ZIPS, Timer, connect, scalar

ZIP_RE = re.compile(r"^(modis|viirs-snpp|viirs-jpss1)_(\d{4})_all_countries\.zip$")

# Columnas en el ORDEN del CSV (read_csv con `columns` es posicional).
# El nombre de las columnas de brillo cambia entre sensores; no las usamos.
def column_types(sensor: str) -> dict[str, str]:
    b1, b2 = ("brightness", "bright_t31") if sensor == "MODIS" else ("bright_ti4", "bright_ti5")
    return {
        "latitude": "DOUBLE",
        "longitude": "DOUBLE",
        b1: "VARCHAR",
        "scan": "DOUBLE",
        "track": "DOUBLE",
        "acq_date": "DATE",
        "acq_time": "VARCHAR",
        "satellite": "VARCHAR",
        "instrument": "VARCHAR",
        "confidence": "VARCHAR",
        "version": "VARCHAR",
        b2: "VARCHAR",
        "frp": "DOUBLE",
        "daynight": "VARCHAR",
        "type": "INTEGER",
    }


def extract(zpath, product: str, year: str):
    dest = CSV / product / year
    marker = dest / ".extracted"
    if marker.exists():
        return dest
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zpath) as z:
        for info in z.infolist():
            if info.filename.endswith(".csv"):
                info.filename = info.filename.rsplit("/", 1)[-1]  # aplanar carpetas
                z.extract(info, dest)
    marker.touch()
    return dest


def ingest_one(con, zpath, product: str, year: str) -> dict:
    sensor = PRODUCTS[product]
    src = extract(zpath, product, year)
    out_dir = HOTSPOTS / f"sensor={sensor}" / f"year={year}"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{product}.parquet"

    types = column_types(sensor)
    if sensor == "MODIS":
        conf_norm = "confidence"  # 0–100 como texto
    else:
        conf_norm = "CASE lower(confidence) WHEN 'l' THEN 'low' WHEN 'n' THEN 'nominal' WHEN 'h' THEN 'high' ELSE lower(confidence) END"

    cols = ", ".join(f"'{k}': '{v}'" for k, v in types.items())
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE norm AS
        SELECT
            '{sensor}' AS sensor,
            CASE satellite
                WHEN 'Terra' THEN 'T' WHEN 'T' THEN 'T'
                WHEN 'Aqua'  THEN 'A' WHEN 'A' THEN 'A'
                WHEN 'N'     THEN 'N'
                WHEN 'N20'   THEN 'N20' WHEN '1' THEN 'N20'
                ELSE satellite
            END AS satellite,
            CAST(acq_date AS TIMESTAMP)
              + to_minutes(CAST(substr(lpad(acq_time, 4, '0'), 1, 2) AS INTEGER) * 60
                         + CAST(substr(lpad(acq_time, 4, '0'), 3, 2) AS INTEGER)) AS acq_datetime,
            latitude  AS lat,
            longitude AS lon,
            frp,
            confidence AS confidence_raw,
            {conf_norm} AS confidence_norm,
            daynight,
            type,
            replace(regexp_extract(filename, '_\\d{{4}}_(.+)\\.csv$', 1), '_', ' ') AS country,
            {int(year)} AS year
        FROM read_csv('{src}/*.csv', header = true, filename = true,
                      columns = {{{cols}}}, auto_detect = false)
    """)
    n_in = scalar(con, "SELECT count(*) FROM norm")

    con.sql(f"""
        COPY (
            SELECT * EXCLUDE (year)
            FROM norm
            QUALIFY row_number() OVER (
                PARTITION BY lat, lon, acq_datetime, satellite ORDER BY country
            ) = 1
        ) TO '{out}' (FORMAT parquet, COMPRESSION zstd)
    """)
    n_out = scalar(con, f"SELECT count(*) FROM '{out}'")
    sats = scalar(con, f"SELECT string_agg(DISTINCT satellite, ',') FROM '{out}'")
    return {"product": product, "sensor": sensor, "year": year,
            "rows_in": n_in, "rows_out": n_out, "dupes_removed": n_in - n_out,
            "satellites": sats}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="prefijo del zip, ej. modis_2014")
    args = ap.parse_args()

    zips = sorted(p for p in ZIPS.glob("*.zip") if ZIP_RE.match(p.name))
    if args.only:
        zips = [p for p in zips if p.name.startswith(args.only)]
    STATS.mkdir(parents=True, exist_ok=True)
    stats_path = STATS / "01_ingest.csv"
    done = set()
    if stats_path.exists() and not args.only:
        with open(stats_path) as f:
            done = {(r["product"], r["year"]) for r in csv.DictReader(f)}

    con = connect()
    rows = []
    for z in zips:
        product, year = ZIP_RE.match(z.name).groups()
        if (product, year) in done:
            continue
        print(f"{product} {year}", flush=True)
        with Timer("ok"):
            r = ingest_one(con, z, product, year)
        print(f"  {r['rows_in']:,} filas, {r['dupes_removed']:,} duplicados, satélites {r['satellites']}", flush=True)
        rows.append(r)
        # guardar progreso después de cada zip (reanudable)
        write_header = not stats_path.exists() or args.only
        mode = "w" if args.only else "a"
        with open(stats_path, mode, newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(r))
            if write_header:
                w.writeheader()
            w.writerow(r)


if __name__ == "__main__":
    main()

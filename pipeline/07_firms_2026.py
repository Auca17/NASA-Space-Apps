"""Paso 7 (E4) — 2026 por la API de FIRMS, mundo entero.

Fuentes y tramos (donde hay SP no se usa NRT):
  MODIS_SP          2026-01-01 → 2026-08-31     MODIS_NRT         2026-09-01 → hoy
  VIIRS_NOAA20_SP   2026-01-01 → 2026-07-31     VIIRS_NOAA20_NRT  2026-08-01 → hoy
S-NPP no se baja para 2026: la serie usa NOAA-20 desde 2018-04 (paso 4).

  * Pedidos de 5 días (máximo de la API), formato
    /api/area/csv/{key}/{source}/world/5/{inicio}. La fecha es el INICIO del tramo.
  * Cada respuesta se guarda en disco antes de procesarla (reanudable).
  * Cada pedido mundial cuesta ~180 transacciones; antes de cada uno se consulta
    mapkey_status y se espera si se pasaría de 4.700 de 5.000 en 10 minutos.
  * FIRMS_MAP_KEY se lee de .env y nunca se imprime.

Normalización (mismo esquema que el paso 1):
  * Confianza VIIRS l/n/h → low/nominal/high; satélite Terra/Aqua → T/A.
  * `type`: viene en SP; los NRT no lo traen. Se infiere con una máscara de
    fuentes fijas: celdas res 6 donde, con NOAA-20 2018–2025, al menos la mitad
    de las detecciones (y como mínimo 10) fueron type 1, 2 o 3 (volcán, fuente
    estática terrestre, costa afuera). Los NRT en esas celdas quedan type = 2;
    el resto type = 0.
  * `country`: la API no lo trae. Se marca Argentina si la celda res 6 tiene
    focos históricos de Argentina, o si el punto cae dentro de un departamento
    del IGN. Para el resto del mundo queda null (solo se usa para Argentina).

Salida: data/processed/hotspots/sensor=*/year=2026/api_<fuente>.parquet
        data/processed/sp_until.json

Después: 02_clean → 03_grid (borrar counts_*.parquet y daily_r5.parquet) →
04_harmonize → 05_aggregate → 06_export → model_input.

Uso:  python pipeline/07_firms_2026.py [--download-only | --normalize-only]
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

from common import HOTSPOTS, PROCESSED, RAW, REPO, Timer, connect

API_DIR = RAW / "firms_api"
BASE = "https://firms.modaps.eosdis.nasa.gov"
TODAY = datetime.now(timezone.utc).date()

PLAN = {
    "MODIS_SP": ("MODIS", date(2026, 1, 1), date(2026, 8, 31)),
    "MODIS_NRT": ("MODIS", date(2026, 9, 1), TODAY),
    "VIIRS_NOAA20_SP": ("VIIRS", date(2026, 1, 1), date(2026, 7, 31)),
    "VIIRS_NOAA20_NRT": ("VIIRS", date(2026, 8, 1), TODAY),
}
TX_PER_REQUEST = 200
TX_CEILING = 4700
IGN_DEPTS = RAW / "ign" / "departamentos.json"


def key() -> str:
    load_dotenv(REPO / ".env")
    k = os.environ.get("FIRMS_MAP_KEY")
    if not k:
        raise SystemExit("Falta FIRMS_MAP_KEY en .env")
    return k


def tx_used(k: str) -> int:
    with urllib.request.urlopen(f"{BASE}/mapserver/mapkey_status/?MAP_KEY={k}", timeout=60) as r:
        return int(json.load(r).get("current_transactions", 0))


def download():
    k = key()
    jobs = []
    for src, (_, start, end) in PLAN.items():
        d = start
        while d <= end:
            jobs.append((src, d, min(5, (end - d).days + 1)))
            d += timedelta(days=5)
    todo = [j for j in jobs if not (API_DIR / j[0] / f"{j[1]}.csv").exists()]
    print(f"{len(jobs)} pedidos, faltan {len(todo)}", flush=True)
    for i, (src, d, days) in enumerate(todo, 1):
        while tx_used(k) + TX_PER_REQUEST > TX_CEILING:
            time.sleep(30)
        out = API_DIR / src / f"{d}.csv"
        out.parent.mkdir(parents=True, exist_ok=True)
        url = f"{BASE}/api/area/csv/{k}/{src}/world/{days}/{d}"
        for attempt in range(5):
            try:
                with urllib.request.urlopen(url, timeout=900) as r:
                    body = r.read()
                if not body.startswith(b"latitude"):
                    raise RuntimeError(body[:200].decode(errors="replace"))
                tmp = out.with_suffix(".tmp")
                tmp.write_bytes(body)
                tmp.rename(out)
                break
            except Exception as exc:  # no imprimir la URL: lleva la key
                print(f"  reintento {attempt + 1} {src} {d}: {type(exc).__name__}", flush=True)
                time.sleep(30 * (attempt + 1))
        else:
            raise SystemExit(f"Falló {src} {d}")
        print(f"  [{i}/{len(todo)}] {src} {d} ({days} d): {len(body) / 1e6:.1f} MB", flush=True)


def normalize():
    con = connect()
    mask = PROCESSED / "static_sources_r6.parquet"
    if not mask.exists():
        with Timer("máscara de fuentes fijas (res 6)"):
            con.sql(f"""
                COPY (
                    SELECT h3_latlng_to_cell(lat, lon, 6) AS h3_r6,
                           count(*) AS total, count(*) FILTER (WHERE type <> 0) AS nonveg
                    FROM read_parquet('{HOTSPOTS}/sensor=VIIRS/*/viirs-jpss1.parquet', hive_partitioning = true)
                    GROUP BY 1
                    HAVING count(*) >= 10 AND count(*) FILTER (WHERE type <> 0) >= 0.5 * count(*)
                ) TO '{mask}' (FORMAT parquet)
            """)
    ar_cells = PROCESSED / "argentina_cells_r6.parquet"
    if not ar_cells.exists():
        with Timer("celdas res 6 con focos de Argentina"):
            con.sql(f"""
                COPY (SELECT DISTINCT h3_r6 FROM read_parquet('{PROCESSED}/hotspots_h3/*/*/data.parquet',
                                                             hive_partitioning = true)
                      WHERE country = 'Argentina') TO '{ar_cells}' (FORMAT parquet)
            """)
    # ST_Read (GDAL) no puede con el GeoJSON del IGN de 140 MB en DuckDB 2.0:
    # se lee como JSON y se simplifica (~500 m) para que el ST_Contains sea rápido.
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE ar_poly AS
        SELECT ST_SimplifyPreserveTopology(ST_GeomFromGeoJSON(to_json(f.geometry)), 0.005) AS geom
        FROM (SELECT unnest(features) AS f
              FROM read_json('{IGN_DEPTS}', maximum_object_size = 500000000))
    """)

    sp_until = {}
    for src, (sensor, start, end) in PLAN.items():
        files = sorted((API_DIR / src).glob("*.csv"))
        if not files:
            continue
        has_type = src.endswith("_SP")
        conf = ("CASE lower(confidence) WHEN 'l' THEN 'low' WHEN 'n' THEN 'nominal' "
                "WHEN 'h' THEN 'high' ELSE lower(confidence) END") if sensor == "VIIRS" else "confidence"
        type_expr = "CAST(type AS INTEGER)" if has_type else \
            "CASE WHEN m.h3_r6 IS NOT NULL THEN 2 ELSE 0 END"
        out = HOTSPOTS / f"sensor={sensor}" / "year=2026" / f"api_{src.lower()}.parquet"
        out.parent.mkdir(parents=True, exist_ok=True)
        with Timer(f"normalizar {src} ({len(files)} archivos)"):
            con.sql(f"""
                CREATE OR REPLACE TEMP TABLE api AS
                SELECT *, h3_latlng_to_cell(CAST(latitude AS DOUBLE), CAST(longitude AS DOUBLE), 6) AS h3_r6
                FROM read_csv({[str(f) for f in files]}, header = true, all_varchar = true,
                              union_by_name = true)
            """)
            con.sql(f"""
                COPY (
                    SELECT
                        '{sensor}' AS sensor,
                        CASE satellite WHEN 'Terra' THEN 'T' WHEN 'Aqua' THEN 'A'
                                       WHEN 'N20' THEN 'N20' WHEN '1' THEN 'N20'
                                       WHEN 'N' THEN 'N' ELSE satellite END AS satellite,
                        CAST(acq_date AS DATE)::TIMESTAMP
                          + to_minutes(CAST(substr(lpad(acq_time, 4, '0'), 1, 2) AS INTEGER) * 60
                                     + CAST(substr(lpad(acq_time, 4, '0'), 3, 2) AS INTEGER)) AS acq_datetime,
                        CAST(latitude AS DOUBLE) AS lat, CAST(longitude AS DOUBLE) AS lon,
                        CAST(frp AS DOUBLE) AS frp,
                        confidence AS confidence_raw,
                        {conf} AS confidence_norm,
                        daynight,
                        {type_expr} AS type,
                        CASE WHEN ac.h3_r6 IS NOT NULL THEN 'Argentina'
                             WHEN CAST(latitude AS DOUBLE) BETWEEN -56 AND -21
                              AND CAST(longitude AS DOUBLE) BETWEEN -74 AND -53
                              AND EXISTS (SELECT 1 FROM ar_poly p
                                          WHERE ST_Contains(p.geom, ST_Point(CAST(longitude AS DOUBLE),
                                                                              CAST(latitude AS DOUBLE))))
                             THEN 'Argentina' END AS country
                    FROM api
                    LEFT JOIN '{mask}' m ON m.h3_r6 = api.h3_r6
                    LEFT JOIN '{ar_cells}' ac ON ac.h3_r6 = api.h3_r6
                    QUALIFY row_number() OVER (PARTITION BY lat, lon, acq_datetime, satellite) = 1
                ) TO '{out}' (FORMAT parquet, COMPRESSION zstd)
            """)
            r = con.sql(f"""SELECT count(*), max(acq_datetime)::DATE,
                                   count(*) FILTER (WHERE country = 'Argentina'),
                                   count(*) FILTER (WHERE type <> 0)
                            FROM '{out}'""").fetchall()[0]
            print(f"   {r[0]:,} filas, último día {r[1]}, Argentina {r[2]:,}, type≠0 {r[3]:,}")
            if has_type:
                name = "MODIS" if sensor == "MODIS" else "VIIRS_NOAA20"
                sp_until[name] = str(r[1])
    sp_until.setdefault("VIIRS_SNPP", "2025-12-31")
    (PROCESSED / "sp_until.json").write_text(json.dumps(sp_until, indent=2))
    print("sp_until:", sp_until)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--download-only", action="store_true")
    ap.add_argument("--normalize-only", action="store_true")
    a = ap.parse_args()
    if not a.normalize_only:
        download()
    if not a.download_only:
        normalize()


if __name__ == "__main__":
    main()

"""Paso 3 — Grilla H3 y conteos.

  * Agrega h3_r2, h3_r3, h3_r5, h3_r6 (UBIGINT; se pasan a texto en el export).
  * Conteos por celda × mes × sensor × satélite, a res 3 y res 5:
      det        detecciones
      cells_day  pares (h3_r6, día UTC) distintos con fuego dentro de la celda padre.
                 Es el control contra la fragmentación de píxeles de VIIRS (D2).

Entrada:  data/processed/hotspots_clean/
Salida:   data/processed/hotspots_h3/sensor=*/year=*/*.parquet   (puntos con H3)
          data/processed/counts_r3.parquet, counts_r5.parquet     (mensuales)
          data/processed/daily_r5.parquet                          (diario, para Devin y fire/daily)
"""

from __future__ import annotations

from common import HOTSPOTS_CLEAN, PROCESSED, Timer, connect

H3_POINTS = PROCESSED / "hotspots_h3"


def copy_atomic(con, select_sql: str, out):
    """Escribe a un .tmp y renombra: una salida existente siempre está completa."""
    tmp = out.with_suffix(out.suffix + ".tmp")
    tmp.unlink(missing_ok=True)
    con.sql(f"COPY ({select_sql}) TO '{tmp}' (FORMAT parquet, COMPRESSION zstd)")
    tmp.rename(out)


def main():
    """Reanudable: cada partición y cada tabla se saltea si ya existe completa."""
    con = connect()

    # 1. H3 por partición sensor × año (≈40 particiones).
    parts = sorted(p for p in HOTSPOTS_CLEAN.glob("sensor=*/year=*") if p.is_dir())
    for part in parts:
        out = H3_POINTS / part.relative_to(HOTSPOTS_CLEAN) / "data.parquet"
        if out.exists():
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        sensor = part.parent.name.split("=")[1]
        year = part.name.split("=")[1]
        with Timer(f"H3 {sensor} {year}"):
            copy_atomic(con, f"""
                SELECT * EXCLUDE (sensor, year),
                    h3_latlng_to_cell(lat, lon, 2) AS h3_r2,
                    h3_latlng_to_cell(lat, lon, 3) AS h3_r3,
                    h3_latlng_to_cell(lat, lon, 5) AS h3_r5,
                    h3_latlng_to_cell(lat, lon, 6) AS h3_r6
                FROM read_parquet('{part}/*.parquet', hive_partitioning = true)
            """, out)

    pts = f"read_parquet('{H3_POINTS}/*/*/data.parquet', hive_partitioning = true)"

    # 2. Conteos mensuales res 3 y res 5.
    for res in (3, 5):
        out = PROCESSED / f"counts_r{res}.parquet"
        if out.exists():
            continue
        with Timer(f"conteos mensuales res {res}"):
            copy_atomic(con, f"""
                SELECT h3_r{res} AS h3,
                       date_trunc('month', date_utc)::DATE AS month,
                       sensor, satellite,
                       count(*) AS det,
                       count(DISTINCT (h3_r6, date_utc)) AS cells_day
                FROM {pts}
                GROUP BY ALL
            """, out)

    # 3. Conteos diarios res 5.
    out = PROCESSED / "daily_r5.parquet"
    if not out.exists():
        with Timer("conteos diarios res 5"):
            copy_atomic(con, f"""
                SELECT h3_r5 AS h3, h3_r2, date_utc AS date, sensor, satellite,
                       any_value(country) AS country,
                       count(*) AS det,
                       count(DISTINCT h3_r6) AS cells_day
                FROM {pts}
                GROUP BY h3_r5, h3_r2, date_utc, sensor, satellite
            """, out)

    for res in (3, 5):
        f = PROCESSED / f"counts_r{res}.parquet"
        print(con.sql(f"""
            SELECT 'res {res}' AS tabla, count(*) AS filas, count(DISTINCT h3) AS celdas,
                   min(month) AS desde, max(month) AS hasta
            FROM '{f}'
        """))


if __name__ == "__main__":
    main()

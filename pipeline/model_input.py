"""Entrega E1 para Devin — contrato de datos 5.1.

data/processed/model_input/fires_ar_r5_daily.parquet
  h3_r5 (string) · date (date, UTC) · n_raw (int32) · n (float32)
  n_cells_day (int16) · sensor_mix (MODIS | VIIRS | MIXED)

Cobertura: Argentina (país asignado por FIRMS), 2012-01-01 → último día.
Una fila por celda res 5 × día con fuego; las ausentes son 0.

Fuente por período (igual que la serie final del paso 4):
  S-NPP hasta que NOAA-20 tiene su primer mes completo; NOAA-20 desde ahí.
En E1, `n` = `n_raw` (VIIRS nativo). En E2 se reemplaza `n` por el valor
armonizado (factor S-NPP → NOAA-20) sin cambiar el esquema.

Uso:  python pipeline/model_input.py
"""

from __future__ import annotations

from common import PROCESSED, Timer, connect, scalar

H3_POINTS = PROCESSED / "hotspots_h3"
OUT_DIR = PROCESSED / "model_input"
OUT = OUT_DIR / "fires_ar_r5_daily.parquet"


def main():
    con = connect()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pts = f"read_parquet('{H3_POINTS}/sensor=VIIRS/*/*.parquet', hive_partitioning = true)"

    # Primer mes completo de NOAA-20: desde ahí se usa NOAA-20 en lugar de S-NPP.
    n20_first = scalar(con, f"SELECT min(date_utc) FROM {pts} WHERE satellite = 'N20'")
    switch = scalar(con, f"""
        SELECT CASE WHEN day(DATE '{n20_first}') = 1 THEN DATE '{n20_first}'
                    ELSE date_trunc('month', DATE '{n20_first}' + INTERVAL 1 MONTH)::DATE END
    """)
    print(f"NOAA-20 desde {n20_first}; se usa NOAA-20 a partir de {switch}")

    # E2: S-NPP se lleva a equivalente NOAA-20 con el factor del estrato
    # (banda de 10° del centro de la celda res 3 padre × mes del año), igual que
    # en la serie mensual. Sin el archivo de factores (antes de E2), n = n_raw.
    factors = PROCESSED / "harmonization_factors.parquet"
    if factors.exists():
        f_join = f"LEFT JOIN '{factors}' f ON f.band = d.band AND f.moy = d.moy"
        n_expr = "CASE WHEN d.satellite = 'N' THEN d.n_raw * coalesce(f.f_snpp, 1) ELSE d.n_raw END"
    else:
        f_join, n_expr = "", "d.n_raw"
    print(f"factor S-NPP → NOAA-20: {'sí' if factors.exists() else 'no (n = n_raw)'}")

    with Timer("fires_ar_r5_daily"):
        con.sql(f"""
            COPY (
                WITH d AS (
                    SELECT h3_r5, date_utc, any_value(satellite) AS satellite,
                           count(*) AS n_raw,
                           count(DISTINCT h3_r6) AS n_cells_day,
                           LEAST(17, CAST(floor((h3_cell_to_lat(h3_cell_to_parent(h3_r5, 3)) + 90) / 10) AS INTEGER)) AS band,
                           month(date_utc) AS moy
                    FROM {pts}
                    WHERE country = 'Argentina'
                      AND date_utc >= DATE '2012-01-01'
                      AND ((satellite = 'N'   AND date_utc <  DATE '{switch}')
                        OR (satellite = 'N20' AND date_utc >= DATE '{switch}'))
                    GROUP BY h3_r5, date_utc
                )
                SELECT h3_h3_to_string(d.h3_r5)          AS h3_r5,
                       d.date_utc                        AS date,
                       CAST(d.n_raw AS INTEGER)          AS n_raw,
                       CAST(round({n_expr}, 1) AS FLOAT) AS n,
                       CAST(d.n_cells_day AS SMALLINT)   AS n_cells_day,
                       'VIIRS'                           AS sensor_mix
                FROM d {f_join}
                ORDER BY 2, 1
            ) TO '{OUT}' (FORMAT parquet, COMPRESSION zstd)
        """)

    print(con.sql(f"""
        SELECT count(*) AS filas, count(DISTINCT h3_r5) AS celdas,
               min(date) AS desde, max(date) AS hasta, sum(n_raw) AS focos
        FROM '{OUT}'
    """))
    print(con.sql(f"DESCRIBE SELECT * FROM '{OUT}'"))


if __name__ == "__main__":
    main()

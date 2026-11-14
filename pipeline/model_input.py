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

    with Timer("fires_ar_r5_daily"):
        con.sql(f"""
            COPY (
                SELECT h3_h3_to_string(h3_r5)            AS h3_r5,
                       date_utc                          AS date,
                       CAST(count(*) AS INTEGER)         AS n_raw,
                       CAST(count(*) AS FLOAT)           AS n,
                       CAST(count(DISTINCT h3_r6) AS SMALLINT) AS n_cells_day,
                       'VIIRS'                           AS sensor_mix
                FROM {pts}
                WHERE country = 'Argentina'
                  AND date_utc >= DATE '2012-01-01'
                  AND ((satellite = 'N'   AND date_utc <  DATE '{switch}')
                    OR (satellite = 'N20' AND date_utc >= DATE '{switch}'))
                GROUP BY 1, 2
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

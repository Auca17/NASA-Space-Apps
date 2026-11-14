"""Paso 2 — Limpieza.

  * Solo type = 0 (fuego de vegetación presunto).
  * MODIS: confianza >= 30.  VIIRS: nominal o high.
  * El día es siempre UTC (no se convierte a hora local; documentado en el README).

Entrada:  data/processed/hotspots/sensor=*/year=*/*.parquet
Salida:   data/processed/hotspots_clean/sensor=*/year=*/<producto>.parquet
Stats:    data/processed/stats/02_clean.csv (filas por filtro y sensor)
"""

from __future__ import annotations

from common import HOTSPOTS, HOTSPOTS_CLEAN, STATS, Timer, connect


def main():
    con = connect()
    STATS.mkdir(parents=True, exist_ok=True)
    src = f"{HOTSPOTS}/*/*/*.parquet"

    with Timer("estadísticas de filtros"):
        con.sql(f"""
            COPY (
                SELECT
                    sensor, satellite, year,
                    count(*) AS rows_in,
                    count(*) FILTER (WHERE type <> 0) AS removed_type,
                    count(*) FILTER (WHERE type = 0 AND NOT (
                        (sensor = 'MODIS' AND TRY_CAST(confidence_norm AS INTEGER) >= 30)
                        OR (sensor = 'VIIRS' AND confidence_norm IN ('nominal', 'high'))
                    )) AS removed_confidence
                FROM read_parquet('{src}', hive_partitioning = true)
                GROUP BY ALL ORDER BY ALL
            ) TO '{STATS / "02_clean.csv"}' (HEADER)
        """)

    with Timer("filtrar y escribir"):
        con.sql(f"""
            COPY (
                SELECT * EXCLUDE (year), year,
                       CAST(acq_datetime AS DATE) AS date_utc
                FROM read_parquet('{src}', hive_partitioning = true)
                WHERE type = 0
                  AND ((sensor = 'MODIS' AND TRY_CAST(confidence_norm AS INTEGER) >= 30)
                    OR (sensor = 'VIIRS' AND confidence_norm IN ('nominal', 'high')))
            ) TO '{HOTSPOTS_CLEAN}' (FORMAT parquet, COMPRESSION zstd,
                                     PARTITION_BY (sensor, year), OVERWRITE_OR_IGNORE)
        """)

    print(con.sql(f"""
        SELECT sensor, sum(rows_in) AS entrada, sum(removed_type) AS fuera_type,
               sum(removed_confidence) AS fuera_confianza,
               sum(rows_in - removed_type - removed_confidence) AS quedan
        FROM read_csv('{STATS / "02_clean.csv"}') GROUP BY 1 ORDER BY 1
    """))


if __name__ == "__main__":
    main()

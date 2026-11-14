"""Paso 5 — Agregados para el export (D7, D9, D10).

Entradas: harmonized_r3.parquet, harmonized_r5.parquet, daily_r5.parquet
Salidas en data/processed/agg/:
  globe_r3.parquet    mes × celda res 3 con n > 0 (globo)
  monthly_r5.parquet  shard × celda res 5 × índice de mes, n > 0 (fire/cal)
  daily_r5/           shard × celda res 5 × día con fuego desde 2003-01-01 (fire/daily),
                      particionado en 16 grupos de shards para exportar por partes
  clim_r5.parquet     climatología semanal: fracción de años 2003–2022 con ≥ 1 foco
                      en la semana ISO (la 53 se suma a la 52)
  risk_r5.parquet     riesgo nivel historial, regla clim-persist-0.1
  info.json           rango de meses, último día con datos, fecha de referencia

Serie diaria armonizada: los conteos crudos del sensor de cada período
(MODIS T+A hasta 2012-01, S-NPP hasta 2018-03, NOAA-20 desde 2018-04) por el
factor mensual de la celda (n / n_raw de harmonized_r5). Así la suma diaria
de un mes coincide con el valor mensual del calendario.

Riesgo nivel historial (clim-persist-0.1), con fecha de referencia = hoy (UTC):
  clim  = climatología de la semana ISO de la fecha de referencia
  A = 1 si hubo fuego en la celda en los últimos 7 días; B = idem 30 días
  p     = min(0.95, clim × (1 + 2·A + 1·B))
  ratio = p / clim  (null si clim < 0.01)
  cat por ratio: < 0,75 bajo · 0,75–1,5 moderado · 1,5–3 alto · > 3 muy_alto.
  Si ratio es null, cat sale de p: < 0,05 bajo · < 0,15 moderado · < 0,30 alto · resto muy_alto.
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone

from common import PROCESSED, Timer, connect

AGG = PROCESSED / "agg"
VIIRS_START = "2012-02-01"
N20_START = "2018-04-01"
MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
             "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def main(ref_date: str | None = None):
    con = connect()
    AGG.mkdir(parents=True, exist_ok=True)
    ref = ref_date or datetime.now(timezone.utc).date().isoformat()
    h3r = PROCESSED / "harmonized_r3.parquet"
    h5r = PROCESSED / "harmonized_r5.parquet"

    first_month, last_month = con.sql(f"SELECT min(month), max(month) FROM '{h5r}'").fetchall()[0]

    with Timer("globo res 3"):
        con.sql(f"""
            COPY (SELECT strftime(month, '%Y-%m') AS month, h3, n
                  FROM '{h3r}' WHERE n >= 0.05 ORDER BY month, n DESC)
            TO '{AGG / "globe_r3.parquet"}' (FORMAT parquet)
        """)

    with Timer("mensual res 5"):
        con.sql(f"""
            COPY (
                SELECT h3_cell_to_parent(h3_string_to_h3(h3), 2) AS shard,
                       h3_string_to_h3(h3) AS cell,
                       CAST(datediff('month', DATE '{first_month}', month) AS SMALLINT) AS mi,
                       CAST(n AS FLOAT) AS n
                FROM '{h5r}' WHERE n > 0
                ORDER BY shard, cell, mi
            ) TO '{AGG / "monthly_r5.parquet"}' (FORMAT parquet)
        """)

    with Timer("diario res 5 armonizado"):
        con.sql(f"""
            CREATE OR REPLACE TEMP TABLE daily AS
            WITH f AS (
                SELECT h3_string_to_h3(h3) AS cell, month, n / n_raw AS factor
                FROM '{h5r}' WHERE n_raw > 0
            ),
            d AS (
                SELECT h3 AS cell, h3_r2 AS shard, date,
                       sum(det) FILTER (WHERE
                            (date <  DATE '{VIIRS_START}' AND satellite IN ('T', 'A'))
                         OR (date >= DATE '{VIIRS_START}' AND date < DATE '{N20_START}' AND satellite = 'N')
                         OR (date >= DATE '{N20_START}' AND satellite = 'N20')) AS raw
                FROM '{PROCESSED / "daily_r5.parquet"}'
                WHERE date >= DATE '2003-01-01'
                GROUP BY ALL
            )
            SELECT d.shard, d.cell, d.date, d.raw, d.raw * f.factor AS n
            FROM d JOIN f ON f.cell = d.cell AND f.month = date_trunc('month', d.date)
            WHERE d.raw > 0
        """)
        out = AGG / "daily_r5"
        shutil.rmtree(out, ignore_errors=True)
        con.sql(f"""
            COPY (
                SELECT shard, cell,
                       CAST(datediff('day', DATE '2000-01-01', date) AS SMALLINT) AS day,
                       CAST(n AS FLOAT) AS n,
                       CAST(shard % 16 AS INTEGER) AS bucket
                FROM daily ORDER BY shard, cell, day
            ) TO '{out}' (FORMAT parquet, PARTITION_BY (bucket))
        """)
        last_day = con.sql("SELECT max(date) FROM daily").fetchall()[0][0]

    with Timer("climatología semanal"):
        con.sql(f"""
            CREATE OR REPLACE TEMP TABLE clim AS
            SELECT shard, cell, LEAST(52, week(date)) AS week,
                   count(DISTINCT isoyear(date)) / 20.0 AS frac
            FROM daily
            WHERE isoyear(date) BETWEEN 2003 AND 2022
            GROUP BY ALL
        """)
        con.sql(f"COPY (SELECT * FROM clim ORDER BY shard, cell, week) TO '{AGG / 'clim_r5.parquet'}' (FORMAT parquet)")

    with Timer("riesgo nivel historial"):
        month_es = MONTHS_ES[int(ref[5:7]) - 1]
        con.sql(f"""
            COPY (
                WITH cells AS (SELECT DISTINCT shard, cell FROM '{AGG / "monthly_r5.parquet"}'),
                wk AS (SELECT LEAST(52, week(DATE '{ref}')) AS w),
                c AS (SELECT shard, cell, frac FROM clim, wk WHERE week = wk.w),
                pers AS (
                    SELECT cell,
                        max(CASE WHEN date > DATE '{ref}' - INTERVAL 7 DAY  AND date <= DATE '{ref}' THEN 1 ELSE 0 END) AS a,
                        max(CASE WHEN date > DATE '{ref}' - INTERVAL 30 DAY AND date <= DATE '{ref}' THEN 1 ELSE 0 END) AS b
                    FROM daily WHERE date > DATE '{ref}' - INTERVAL 30 DAY GROUP BY cell
                ),
                r AS (
                    SELECT cells.shard, cells.cell,
                           coalesce(c.frac, 0) AS clim,
                           coalesce(pers.a, 0) AS a, coalesce(pers.b, 0) AS b
                    FROM cells LEFT JOIN c USING (shard, cell) LEFT JOIN pers USING (cell)
                ),
                s AS (
                    SELECT *, LEAST(0.95, clim * (1 + 2 * a + b)) AS p FROM r
                )
                SELECT shard, cell,
                       round(p, 3) AS p, round(clim, 3) AS clim,
                       CASE WHEN clim >= 0.01 THEN round(p / clim, 2) END AS ratio,
                       CASE WHEN clim >= 0.01 THEN
                                CASE WHEN p / clim < 0.75 THEN 'bajo' WHEN p / clim < 1.5 THEN 'moderado'
                                     WHEN p / clim <= 3 THEN 'alto' ELSE 'muy_alto' END
                            ELSE CASE WHEN p < 0.05 THEN 'bajo' WHEN p < 0.15 THEN 'moderado'
                                      WHEN p < 0.30 THEN 'alto' ELSE 'muy_alto' END
                       END AS cat,
                       [
                         'históricamente ' || CAST(round(clim * 100) AS INTEGER)
                           || ' % de los años con fuego en esta semana de {month_es} (2003–2022)',
                         CASE WHEN a = 1 THEN 'focos en los últimos 7 días'
                              WHEN b = 1 THEN 'focos en los últimos 30 días'
                              ELSE 'sin focos en los últimos 30 días' END
                       ] AS reasons
                FROM s ORDER BY shard, cell
            ) TO '{AGG / "risk_r5.parquet"}' (FORMAT parquet)
        """)

    info = {
        "first_month": first_month.strftime("%Y-%m"),
        "last_month": last_month.strftime("%Y-%m"),
        "last_day": last_day.isoformat(),
        "ref_date": ref,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }
    (AGG / "info.json").write_text(json.dumps(info, indent=2))
    print(json.dumps(info, indent=2))
    print(con.sql(f"SELECT cat, count(*) FROM '{AGG / 'risk_r5.parquet'}' GROUP BY 1 ORDER BY 2 DESC"))


if __name__ == "__main__":
    main()

"""Paso 4 — Armonización MODIS → VIIRS NOAA-20 (D2, D3, D4, D10).

Unidad final: detecciones equivalentes a VIIRS NOAA-20.
Estratos: banda de latitud de 10° (centro de la celda res 3) × mes del año.

  1. Terra sola → Terra + Aqua (2000-11 a 2002-06): factor (T+A)/T por estrato,
     calculado con 2003–2011.
  2. S-NPP → NOAA-20: factor N20/N por estrato con el solapamiento 2018-04 → 2025.
     Se aplica a S-NPP 2012-02 → 2018-03.
  3. MODIS → VIIRS: por estrato, sobre pares celda res 3 × mes con MODIS > 0,
     entrenamiento 2012–2022:
         log(V + 1) = a + b · log(M + 1)
     y un factor de totales k por estrato para que la suma predicha iguale la
     suma observada de VIIRS en el entrenamiento. k corrige el sesgo de la
     retransformación del logaritmo y el fuego que VIIRS ve en celdas donde
     MODIS no ve nada. Estratos con < 200 pares → coeficientes globales del mes
     y confidence = low.
  4. Conversión a res 5 (D4): la predicción se hace en res 3 y se reparte entre
     las celdas res 5 hijas en proporción a sus detecciones MODIS. Así la suma de
     las res 5 coincide siempre con la res 3 (globo y calendario consistentes).
  5. Serie final por celda y mes:
        2000-11 → 2012-01  MODIS convertido (S-NPP empieza el 2012-01-20)
        2012-02 → 2018-03  S-NPP × factor
        2018-04 → ...      NOAA-20 nativo
  6. Validación con hold-out 2023–2024 (MODIS convertido vs NOAA-20 real), para
     detecciones y para celdas-día → docs/validation/metrics.json.
  7. Gráficos en docs/validation/.

Entradas: data/processed/counts_r3.parquet, counts_r5.parquet
Salidas:  data/processed/harmonized_r3.parquet, harmonized_r5.parquet,
          data/processed/harmonization_coeffs.parquet,
          docs/validation/{metrics.json, coefficients.csv, *.png}
"""

from __future__ import annotations

import json

from common import PROCESSED, REPO, Timer, connect

VALID = REPO / "docs" / "validation"
# S-NPP empieza el 2012-01-20: enero de 2012 está incompleto y se toma de MODIS.
VIIRS_START = "2012-02-01"
# Terra sin datos del 2001-06-15 al 2001-07-03 (modo seguro): esos meses quedan bajos.
TERRA_GAP_MONTHS = "(DATE '2001-06-01', DATE '2001-07-01')"
N20_START = "2018-04-01"
MIN_PAIRS = 200


def build_base(con):
    """Tabla ancha por celda res 3 × mes: T, A, N, N20 (det y cells_day) + estrato."""
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE r3 AS
        WITH w AS (
            SELECT h3, month,
                sum(det)       FILTER (WHERE satellite = 'T')   AS t,
                sum(det)       FILTER (WHERE satellite = 'A')   AS a,
                sum(det)       FILTER (WHERE satellite = 'N')   AS n,
                sum(det)       FILTER (WHERE satellite = 'N20') AS n20,
                sum(cells_day) FILTER (WHERE satellite IN ('T','A')) AS m_cd,
                sum(cells_day) FILTER (WHERE satellite = 'N')   AS n_cd,
                sum(cells_day) FILTER (WHERE satellite = 'N20') AS n20_cd
            FROM '{PROCESSED / "counts_r3.parquet"}'
            GROUP BY h3, month
        )
        SELECT h3, month,
               coalesce(t, 0) AS t, coalesce(a, 0) AS a,
               coalesce(n, 0) AS n, coalesce(n20, 0) AS n20,
               coalesce(m_cd, 0) AS m_cd, coalesce(n_cd, 0) AS n_cd, coalesce(n20_cd, 0) AS n20_cd,
               LEAST(17, CAST(floor((h3_cell_to_lat(h3) + 90) / 10) AS INTEGER)) AS band,
               month(month) AS moy
        FROM w
    """)


def factor_tables(con):
    # 1. Terra → Terra + Aqua (2003–2011)
    con.sql("""
        CREATE OR REPLACE TEMP TABLE f_terra AS
        WITH s AS (
            SELECT band, moy, sum(t + a) AS ta, sum(t) AS t FROM r3
            WHERE month BETWEEN DATE '2003-01-01' AND DATE '2011-12-01' GROUP BY ALL),
        g AS (SELECT moy, sum(ta) / sum(t) AS fg FROM s GROUP BY moy)
        SELECT s.band, s.moy,
               CASE WHEN s.t >= 50 THEN s.ta / s.t ELSE g.fg END AS f_terra
        FROM s JOIN g USING (moy)
    """)
    # 2. S-NPP → NOAA-20 (2018-04 → 2025)
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE f_snpp AS
        WITH s AS (
            SELECT band, moy, sum(n20) AS n20, sum(n) AS n,
                   sum(n20_cd) AS n20_cd, sum(n_cd) AS n_cd FROM r3
            -- solo meses con los dos sensores: S-NPP de 2026 no se bajó (paso 7)
            WHERE month >= DATE '{N20_START}'
              AND month <= (SELECT max(month) FROM r3 WHERE n > 0)
              AND month <= (SELECT max(month) FROM r3 WHERE n20 > 0)
            GROUP BY ALL),
        g AS (SELECT moy, sum(n20) / sum(n) AS fg, sum(n20_cd) / sum(n_cd) AS fg_cd FROM s GROUP BY moy)
        SELECT s.band, s.moy,
               CASE WHEN s.n >= 50 THEN s.n20 / s.n ELSE g.fg END AS f_snpp,
               CASE WHEN s.n_cd >= 50 THEN s.n20_cd / s.n_cd ELSE g.fg_cd END AS f_snpp_cd
        FROM s JOIN g USING (moy)
    """)
    # MODIS (T+A con Terra corregido) y VIIRS de referencia (equivalente NOAA-20)
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE r3x AS
        SELECT r3.*,
            CASE WHEN month < DATE '2002-07-01' THEN t * coalesce(f_terra, 1) ELSE t + a END AS m,
            CASE WHEN month < DATE '{VIIRS_START}' THEN NULL
                 WHEN month < DATE '{N20_START}' THEN n * coalesce(f_snpp, 1)
                 ELSE n20 END AS v,
            CASE WHEN month < DATE '{VIIRS_START}' THEN NULL
                 WHEN month < DATE '{N20_START}' THEN n_cd * coalesce(f_snpp_cd, 1)
                 ELSE n20_cd END AS v_cd
        FROM r3
        LEFT JOIN f_terra USING (band, moy)
        LEFT JOIN f_snpp  USING (band, moy)
    """)


def fit(con, mcol: str, vcol: str, tag: str):
    """Regresión log-log por estrato + factor de totales k. Devuelve tabla coef_<tag>."""
    train = f"month BETWEEN DATE '{VIIRS_START}' AND DATE '2022-12-01'"
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE coef_{tag} AS
        WITH tr AS (SELECT band, moy, ln({mcol} + 1) AS x, ln({vcol} + 1) AS y
                    FROM r3x WHERE {train} AND {mcol} > 0),
        st AS (SELECT band, moy, regr_intercept(y, x) AS a, regr_slope(y, x) AS b,
                      regr_count(y, x) AS pairs FROM tr GROUP BY ALL),
        gl AS (SELECT moy, regr_intercept(y, x) AS ga, regr_slope(y, x) AS gb FROM tr GROUP BY moy),
        allstrata AS (SELECT DISTINCT band, moy FROM r3x),
        c AS (
            SELECT s.band, s.moy, coalesce(st.pairs, 0) AS pairs,
                   CASE WHEN coalesce(st.pairs, 0) >= {MIN_PAIRS} THEN st.a ELSE gl.ga END AS a,
                   CASE WHEN coalesce(st.pairs, 0) >= {MIN_PAIRS} THEN st.b ELSE gl.gb END AS b,
                   CASE WHEN coalesce(st.pairs, 0) >= {MIN_PAIRS} THEN 'high' ELSE 'low' END AS confidence
            FROM allstrata s LEFT JOIN st USING (band, moy) JOIN gl USING (moy)
        ),
        k AS (
            SELECT r.band, r.moy,
                   sum(r.{vcol}) AS v_obs,
                   sum(CASE WHEN r.{mcol} > 0 THEN exp(c.a + c.b * ln(r.{mcol} + 1)) - 1 ELSE 0 END) AS v_pred
            FROM r3x r JOIN c USING (band, moy)
            WHERE {train} GROUP BY ALL
        ),
        kg AS (SELECT moy, sum(v_obs) / nullif(sum(v_pred), 0) AS kg FROM k GROUP BY moy)
        SELECT c.*, CASE WHEN c.confidence = 'high' AND k.v_pred > 0 THEN k.v_obs / k.v_pred
                         ELSE kg.kg END AS k
        FROM c LEFT JOIN k USING (band, moy) JOIN kg USING (moy)
    """)


def predict_sql(mcol: str, tag: str) -> str:
    return f"""CASE WHEN {mcol} > 0
                    THEN greatest(0, (exp(c.a + c.b * ln({mcol} + 1)) - 1) * c.k)
                    ELSE 0 END"""


def validate(con) -> dict:
    hold = "month BETWEEN DATE '2023-01-01' AND DATE '2024-12-01'"
    out = {}
    for tag, mcol, vcol in (("det", "m", "v"), ("cd", "m_cd", "v_cd")):
        con.sql(f"""
            CREATE OR REPLACE TEMP TABLE val_{tag} AS
            SELECT r.band, r.moy, r.h3, r.month, r.{vcol} AS obs,
                   {predict_sql("r." + mcol, tag)} AS pred
            FROM r3x r JOIN coef_{tag} c USING (band, moy)
            WHERE {hold} AND (r.{mcol} > 0 OR r.{vcol} > 0)
        """)
        r = con.sql(f"""
            SELECT
              1 - sum(power(obs - pred, 2)) / sum(power(obs - avg_obs, 2)) AS r2_lin,
              1 - sum(power(ln(obs+1) - ln(pred+1), 2))
                / sum(power(ln(obs+1) - avg_lobs, 2)) AS r2_log,
              100 * (sum(pred) - sum(obs)) / sum(obs) AS bias_pct,
              count(*) AS pairs
            FROM val_{tag},
                 (SELECT avg(obs) AS avg_obs, avg(ln(obs+1)) AS avg_lobs FROM val_{tag})
        """).fetchall()[0]
        out[tag] = dict(zip(["r2_linear", "r2_log1p", "bias_pct", "pairs"], r))
        # Totales mensuales mundiales (lo que muestra el gráfico)
        r = con.sql(f"""
            WITH m AS (SELECT month, sum(obs) o, sum(pred) p FROM val_{tag} GROUP BY month)
            SELECT 1 - sum(power(o - p, 2)) / sum(power(o - (SELECT avg(o) FROM m), 2)) FROM m
        """).fetchall()[0][0]
        out[tag]["r2_global_monthly"] = r
        out[tag]["by_band"] = [
            ({**dict(zip(["band_lat", "pairs", "obs", "pred", "bias_pct", "r2_log1p"], row)),
              "status": "ok"} if row[1] >= MIN_PAIRS else
             {"band_lat": row[0], "pairs": row[1], "obs": row[2], "pred": row[3],
              "bias_pct": None, "r2_log1p": None, "status": "sin datos suficientes"})
            for row in con.sql(f"""
                SELECT (band * 10 - 90) || '..' || (band * 10 - 80) AS band_lat, count(*),
                       round(sum(obs)), round(sum(pred)),
                       round(100 * (sum(pred) - sum(obs)) / nullif(sum(obs), 0), 1),
                       round(1 - sum(power(ln(obs+1) - ln(pred+1), 2))
                         / nullif(sum(power(ln(obs+1) - (SELECT avg(ln(obs+1)) FROM val_{tag} v2
                                                         WHERE v2.band = val_{tag}.band), 2)), 0), 3)
                FROM val_{tag} GROUP BY band ORDER BY band
            """).fetchall()
        ]
    return out


def build_series(con):
    """Serie final res 3 y res 5 por mes."""
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE h3s AS
        SELECT r.h3, r.month, r.band, r.moy,
            CASE WHEN r.month < DATE '{VIIRS_START}' THEN {predict_sql("r.m", "det")}
                 ELSE r.v END AS n,
            CASE WHEN r.month < DATE '{VIIRS_START}' THEN r.t + r.a
                 WHEN r.month < DATE '{N20_START}' THEN r.n ELSE r.n20 END AS n_raw,
            CASE WHEN r.month < DATE '{VIIRS_START}' THEN 'MODIS'
                 WHEN r.month < DATE '{N20_START}' THEN 'VIIRS_SNPP' ELSE 'VIIRS_NOAA20' END AS source,
            CASE WHEN r.month IN {TERRA_GAP_MONTHS} THEN 'low'
                 WHEN r.month < DATE '{VIIRS_START}' THEN c.confidence ELSE 'high' END AS confidence,
            {predict_sql("r.m", "det")} AS n_modis_conv,
            r.m AS modis_raw
        FROM r3x r JOIN coef_det c USING (band, moy)
    """)
    con.sql(f"""
        COPY (SELECT h3_h3_to_string(h3) AS h3, month, round(n, 1) AS n, n_raw, source, confidence,
                     round(n_modis_conv, 1) AS n_modis_conv, modis_raw
              FROM h3s WHERE n > 0 OR n_modis_conv > 0 OR n_raw > 0)
        TO '{PROCESSED / "harmonized_r3.parquet"}' (FORMAT parquet, COMPRESSION zstd)
    """)

    # res 5: MODIS repartido en proporción a las detecciones MODIS de cada hija;
    # S-NPP × factor; NOAA-20 nativo.
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE r5 AS
        SELECT h3 AS h5, month, h3_cell_to_parent(h3, 3) AS h3,
            sum(det) FILTER (WHERE satellite IN ('T','A')) AS m5,
            sum(det) FILTER (WHERE satellite = 'T')        AS t5,
            sum(det) FILTER (WHERE satellite = 'N')        AS n5,
            sum(det) FILTER (WHERE satellite = 'N20')      AS n205
        FROM '{PROCESSED / "counts_r5.parquet"}' GROUP BY ALL
    """)
    con.sql(f"""
        COPY (
            WITH p AS (
                SELECT r5.*, sum(CASE WHEN r5.month < DATE '2002-07-01' THEN coalesce(r5.t5,0)
                                      ELSE coalesce(r5.m5,0) END)
                         OVER (PARTITION BY r5.h3, r5.month) AS m_parent
                FROM r5
            )
            SELECT h3_h3_to_string(p.h5) AS h3, p.month,
                round(CASE
                    WHEN p.month < DATE '{VIIRS_START}' THEN
                        h.n * (CASE WHEN p.month < DATE '2002-07-01' THEN coalesce(p.t5,0)
                                    ELSE coalesce(p.m5,0) END) / nullif(p.m_parent, 0)
                    WHEN p.month < DATE '{N20_START}' THEN coalesce(p.n5,0) * coalesce(f.f_snpp,1)
                    ELSE coalesce(p.n205, 0) END, 1) AS n,
                CAST(CASE WHEN p.month < DATE '{VIIRS_START}' THEN coalesce(p.m5,0)
                          WHEN p.month < DATE '{N20_START}' THEN coalesce(p.n5,0)
                          ELSE coalesce(p.n205,0) END AS INTEGER) AS n_raw,
                h.source, h.confidence
            FROM p
            JOIN h3s h ON h.h3 = p.h3 AND h.month = p.month
            LEFT JOIN f_snpp f ON f.band = h.band AND f.moy = h.moy
        ) TO '{PROCESSED / "harmonized_r5.parquet"}' (FORMAT parquet, COMPRESSION zstd)
    """)


def plots(con):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    def series(where: str = ""):
        return con.sql(f"""
            SELECT month,
                   sum(modis_raw) AS modis,
                   sum(CASE WHEN month >= DATE '{VIIRS_START}' THEN n_raw END) AS viirs,
                   sum(n) AS harm
            FROM h3s {where} GROUP BY month ORDER BY month
        """).fetchnumpy()

    def draw(d, title, path):
        fig, ax = plt.subplots(figsize=(11, 4.2), dpi=150)
        ax.plot(d["month"], d["modis"], lw=0.9, color="#888888", label="MODIS crudo (Terra + Aqua)")
        ax.plot(d["month"], d["viirs"], lw=0.9, color="#1f77b4", label="VIIRS crudo (S-NPP / NOAA-20)")
        ax.plot(d["month"], d["harm"], lw=1.6, color="#d62728", label="Serie armonizada (equiv. NOAA-20)")
        for x, lab in ((VIIRS_START, "VIIRS S-NPP"), (N20_START, "NOAA-20")):
            ax.axvline(np_datetime(x), color="k", lw=0.6, ls=":")
            ax.text(np_datetime(x), ax.get_ylim()[1] * 0.95, " " + lab, fontsize=8, va="top")
        ax.set_title(title)
        ax.set_ylabel("Focos por mes")
        ax.legend(fontsize=8, loc="upper left")
        ax.grid(alpha=0.3)
        fig.tight_layout()
        fig.savefig(path)
        plt.close(fig)

    import numpy as np

    def np_datetime(s):
        return np.datetime64(s)

    draw(series(), "Focos de calor mensuales — mundo", VALID / "series_global.png")
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE ar AS
        SELECT DISTINCT h3_r3 FROM read_parquet('{PROCESSED}/hotspots_h3/*/*/data.parquet',
                                                hive_partitioning = true)
        WHERE country = 'Argentina'
    """)
    draw(series("WHERE h3 IN (SELECT h3_r3 FROM ar)"),
         "Focos de calor mensuales — Argentina (celdas res 3 con focos en Argentina)",
         VALID / "series_argentina.png")

    d = con.sql("SELECT obs, pred FROM val_det").fetchnumpy()
    fig, ax = plt.subplots(figsize=(5.5, 5.5), dpi=150)
    ax.scatter(d["obs"] + 1, d["pred"] + 1, s=2, alpha=0.15, color="#1f77b4")
    lim = [1, max(d["obs"].max(), d["pred"].max()) + 1]
    ax.plot(lim, lim, color="k", lw=0.8)
    ax.set_xscale("log"); ax.set_yscale("log")
    ax.set_xlabel("VIIRS NOAA-20 observado + 1")
    ax.set_ylabel("MODIS convertido + 1")
    ax.set_title("Hold-out 2023–2024, celda res 3 × mes")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(VALID / "holdout_scatter.png")
    plt.close(fig)


def main():
    con = connect()
    VALID.mkdir(parents=True, exist_ok=True)
    with Timer("tabla base res 3"):
        build_base(con)
    with Timer("factores Terra y S-NPP"):
        factor_tables(con)
    with Timer("regresión MODIS → VIIRS (det y celdas-día)"):
        fit(con, "m", "v", "det")
        fit(con, "m_cd", "v_cd", "cd")
    with Timer("validación hold-out 2023–2024"):
        metrics = validate(con)
    with Timer("series finales res 3 y res 5"):
        build_series(con)

    con.sql(f"""
        COPY (
            SELECT d.band, (d.band * 10 - 90) AS lat_min, d.moy AS month_of_year,
                   d.pairs, round(d.a, 4) AS a, round(d.b, 4) AS b, round(d.k, 4) AS k,
                   d.confidence, round(ft.f_terra, 4) AS f_terra, round(fs.f_snpp, 4) AS f_snpp
            FROM coef_det d
            LEFT JOIN f_terra ft USING (band, moy)
            LEFT JOIN f_snpp fs USING (band, moy)
            ORDER BY band, moy
        ) TO '{VALID / "coefficients.csv"}' (HEADER)
    """)
    con.sql(f"COPY (SELECT * FROM coef_det) TO '{PROCESSED / 'harmonization_coeffs.parquet'}' (FORMAT parquet)")
    con.sql(f"""
        COPY (SELECT band, moy, f_snpp, f_terra FROM f_snpp FULL JOIN f_terra USING (band, moy))
        TO '{PROCESSED / 'harmonization_factors.parquet'}' (FORMAT parquet)
    """)
    low = con.sql("SELECT count(*) FROM coef_det WHERE confidence = 'low'").fetchall()[0][0]
    total = con.sql("SELECT count(*) FROM coef_det").fetchall()[0][0]

    summary = {
        "unit": "VIIRS_NOAA20",
        "method": "log(VIIRS+1) = a + b*log(MODIS+1) per stratum (10deg latitude band x month), "
                  "total-preserving factor k per stratum; res 5 = res 3 prediction split by MODIS res 5 share",
        "train": [VIIRS_START[:7], "2022-12"],
        "holdout": ["2023-01", "2024-12"],
        "r2": round(metrics["det"]["r2_log1p"], 3),
        "r2_scale": "log1p, cell res 3 x month",
        "r2_linear": round(metrics["det"]["r2_linear"], 3),
        "r2_global_monthly": round(metrics["det"]["r2_global_monthly"], 3),
        "bias_pct": round(metrics["det"]["bias_pct"], 1),
        "r2_cells_day": round(metrics["cd"]["r2_log1p"], 3),
        "bias_pct_cells_day": round(metrics["cd"]["bias_pct"], 1),
        "strata_total": total,
        "strata_low": low,
        "detail": metrics,
    }
    (VALID / "metrics.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False, default=float))
    with Timer("gráficos"):
        plots(con)
    print(json.dumps({k: v for k, v in summary.items() if k != "detail"}, indent=2, default=float))


if __name__ == "__main__":
    main()

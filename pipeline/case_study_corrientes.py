"""Material del caso Corrientes 2022 para el video (D13, D27).

Salidas en docs/case-study/:
  serie_85a9441bfffffff.csv / .png   serie mensual armonizada 2018–2025 de la celda de control
  mapa_ene-feb_2022_vs_2021.png      hexágonos res 5 de Corrientes, ene–feb 2022 contra 2021
  validacion_video.png               serie mundial MODIS / VIIRS / armonizada, versión limpia
  numeros.json                       números clave (los usa el README)

Uso:  python pipeline/case_study_corrientes.py
"""

from __future__ import annotations

import json

import duckdb
import h3
import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.collections import PolyCollection  # noqa: E402
from matplotlib.colors import LogNorm  # noqa: E402
from matplotlib.path import Path as MPath  # noqa: E402

from common import PROCESSED, RAW, REPO  # noqa: E402

OUT = REPO / "docs" / "case-study"
CELL = "85a9441bfffffff"
H5 = PROCESSED / "harmonized_r5.parquet"
H3R = PROCESSED / "harmonized_r3.parquet"
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
RED, GREY, BLUE = "#c0392b", "#8a8a8a", "#2e6da4"


def corrientes_polygons():
    """Departamentos de Corrientes (código INDEC 18xxx) del GeoJSON del IGN."""
    d = json.loads((RAW / "ign" / "departamentos.json").read_text())
    rings = []
    for f in d["features"]:
        if not str(f["properties"].get("in1", "")).startswith("18"):
            continue
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            rings.append(np.array(poly[0])[:, :2])
    return rings


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()

    # --- 1. Serie mensual de la celda de control -------------------------------
    s = con.sql(f"""
        SELECT month, n FROM '{H5}' WHERE h3 = '{CELL}' ORDER BY month
    """).fetchnumpy()
    months = s["month"].astype("datetime64[M]")
    n = s["n"].astype(float)
    full = np.arange(np.datetime64("2000-11"), np.datetime64("2026-12"))
    series = np.zeros(len(full)); series[np.searchsorted(full, months)] = n
    moy = (full.astype(int) % 12)
    yr = full.astype("datetime64[Y]").astype(int) + 1970
    base = (yr >= 2003) & (yr <= 2022)
    median = np.array([np.median(series[base & (moy == m)]) for m in range(12)])

    w = (yr >= 2018) & (yr <= 2025)
    with open(OUT / f"serie_{CELL}.csv", "w") as f:
        f.write("mes,focos_armonizados,mediana_2003_2022_del_mes\n")
        for t, v, m in zip(full[w], series[w], moy[w]):
            f.write(f"{t},{v:.1f},{median[m]:.1f}\n")
    i_peak = int(np.argmax(series))
    peak_month, peak_val = str(full[i_peak]), float(series[i_peak])

    fig, ax = plt.subplots(figsize=(12, 5), dpi=160)
    xm = full[w]
    x = xm.astype("datetime64[D]") + np.timedelta64(14, "D")  # barra centrada en el mes
    ax.bar(x, series[w], width=24, color=[RED if str(t) in ("2022-01", "2022-02") else BLUE for t in xm])
    ax.set_xlim(np.datetime64("2018-01-01"), np.datetime64("2026-01-01"))
    ax.plot(x, median[moy[w]], color="k", lw=1.2, ls="--", label="Mediana 2003–2022 del mismo mes")
    ax.annotate(f"{MESES[int(peak_month[5:7]) - 1]} {peak_month[:4]}: {peak_val:,.0f} focos".replace(",", "."),
                xy=(full[i_peak].astype("datetime64[D]") + np.timedelta64(14, "D"), peak_val), xytext=(15, -10), textcoords="offset points",
                fontsize=12, color=RED, fontweight="bold")
    ax.set_title("Esteros del Iberá, Corrientes — focos de calor por mes (serie armonizada)", fontsize=14)
    ax.set_ylabel("Focos por mes (equiv. VIIRS NOAA-20)", fontsize=11)
    ax.legend(fontsize=11, loc="upper left", frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout(); fig.savefig(OUT / f"serie_{CELL}.png"); plt.close(fig)

    # --- 2. Mapa de hexágonos ene–feb 2022 vs 2021 ------------------------------
    rings = corrientes_polygons()
    allpts = np.vstack(rings)
    lon0, lat0 = allpts.min(axis=0) - 0.3
    lon1, lat1 = allpts.max(axis=0) + 0.3
    paths = [MPath(r) for r in rings]

    def hexes(year: int):
        r = con.sql(f"""
            SELECT h3, sum(n) AS n FROM '{H5}'
            WHERE month IN (DATE '{year}-01-01', DATE '{year}-02-01') GROUP BY h3
        """).fetchall()
        out = {}
        for h, v in r:
            la, lo = h3.cell_to_latlng(h)
            if lat0 <= la <= lat1 and lon0 <= lo <= lon1:
                out[h] = float(v)
        return out

    h22, h21 = hexes(2022), hexes(2021)

    def in_province(h):
        la, lo = h3.cell_to_latlng(h)
        return any(p.contains_point((lo, la)) for p in paths)

    tot22 = sum(v for h, v in h22.items() if in_province(h))
    tot21 = sum(v for h, v in h21.items() if in_province(h))
    # mediana ene–feb 2003–2022 de la provincia
    prov_cells = {h for h in set(h22) | set(h21) if in_province(h)}
    cells_hist = con.sql(f"""
        SELECT DISTINCT h3 FROM '{H5}'
        WHERE month BETWEEN DATE '2003-01-01' AND DATE '2022-12-01'
    """).fetchall()
    prov_all = [h for (h,) in cells_hist
                if lat0 <= h3.cell_to_latlng(h)[0] <= lat1 and lon0 <= h3.cell_to_latlng(h)[1] <= lon1
                and in_province(h)]
    con.sql("CREATE TEMP TABLE pc(h3 VARCHAR)")
    con.executemany("INSERT INTO pc VALUES (?)", [(h,) for h in prov_all])
    yearly = con.sql(f"""
        SELECT year(month) AS y, sum(n) FROM '{H5}' JOIN pc USING (h3)
        WHERE month(month) IN (1, 2) AND year(month) BETWEEN 2003 AND 2022 GROUP BY 1
    """).fetchall()
    ef = {y: v for y, v in yearly}
    med_ef = float(np.median([ef.get(y, 0.0) for y in range(2003, 2023)]))

    vmax = max(max(h22.values(), default=1), max(h21.values(), default=1))
    norm = LogNorm(vmin=1, vmax=vmax)
    fig, axes = plt.subplots(1, 2, figsize=(14, 7), dpi=160)
    for ax, data, title, tot in ((axes[0], h21, "Enero–febrero 2021", tot21),
                                 (axes[1], h22, "Enero–febrero 2022", tot22)):
        polys = [np.array(h3.cell_to_boundary(h))[:, ::-1] for h in data]
        vals = np.array([max(v, 1) for v in data.values()])
        pc = PolyCollection(polys, array=vals, cmap="inferno_r", norm=norm, edgecolor="none")
        ax.add_collection(pc)
        for r in rings:
            ax.plot(r[:, 0], r[:, 1], color="#333333", lw=0.4)
        ax.set_xlim(lon0, lon1); ax.set_ylim(lat0, lat1); ax.set_aspect("equal")
        ax.set_title(f"{title}\n{tot:,.0f} focos en la provincia".replace(",", "."), fontsize=14)
        ax.set_xticks([]); ax.set_yticks([])
        for sp in ax.spines.values():
            sp.set_visible(False)
    cb = fig.colorbar(pc, ax=axes, shrink=0.7, pad=0.02)
    cb.set_label("Focos por hexágono (~250 km²), escala logarítmica", fontsize=11)
    fig.suptitle("Corrientes: focos de calor armonizados (MODIS + VIIRS)", fontsize=16)
    fig.savefig(OUT / "mapa_ene-feb_2022_vs_2021.png", bbox_inches="tight"); plt.close(fig)

    # --- 3. Gráfico de validación limpio para video ------------------------------
    g = con.sql(f"""
        SELECT month, sum(modis_raw) AS modis,
               sum(CASE WHEN month >= DATE '2012-02-01' THEN n_raw END) AS viirs,
               sum(n) AS harm
        FROM '{H3R}' WHERE month <= DATE '2025-12-01' GROUP BY month ORDER BY month
    """).fetchnumpy()
    fig, ax = plt.subplots(figsize=(16, 9), dpi=120)
    ax.plot(g["month"], g["modis"] / 1e6, color=GREY, lw=1.5, label="MODIS (sensor viejo, 1 km)")
    ax.plot(g["month"], g["viirs"] / 1e6, color=BLUE, lw=2.5, label="VIIRS (sensor nuevo, 375 m)")
    ax.plot(g["month"], g["harm"] / 1e6, color=RED, lw=2.0, ls="-", alpha=0.9,
            label="Serie armonizada: una sola escala")
    ax.axvline(np.datetime64("2012-02-01"), color="k", lw=1, ls=":")
    ax.text(np.datetime64("2012-04-01"), ax.get_ylim()[1] * 0.92, "llega VIIRS", fontsize=16)
    ax.set_ylabel("Millones de focos por mes", fontsize=18)
    ax.tick_params(labelsize=15)
    ax.legend(fontsize=17, loc="upper left", frameon=False)
    ax.set_title("25 años de focos de calor, sin saltos al cambiar de satélite", fontsize=22, pad=15)
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", alpha=0.25)
    m = json.loads((REPO / "docs" / "validation" / "metrics.json").read_text())
    ax.text(0.99, 0.02, f"Validación 2023–2024: R² = {m['r2_global_monthly']:.2f} · sesgo {m['bias_pct']:+.1f} %",
            transform=ax.transAxes, ha="right", fontsize=15, color="#444444")
    fig.tight_layout(); fig.savefig(OUT / "validacion_video.png"); plt.close(fig)

    nums = {
        "cell": CELL,
        "peak_month": peak_month, "peak_n": round(peak_val, 1),
        "median_2003_2022_same_month": round(float(median[int(peak_month[5:7]) - 1]), 1),
        "province_jan_feb_2022": round(tot22, 1), "province_jan_feb_2021": round(tot21, 1),
        "province_jan_feb_median_2003_2022": round(med_ef, 1),
        "cells_cell_2022_01": float(series[np.searchsorted(full, np.datetime64("2022-01"))]),
        "cells_cell_2022_02": float(series[np.searchsorted(full, np.datetime64("2022-02"))]),
    }
    (OUT / "numeros.json").write_text(json.dumps(nums, indent=2))
    print(json.dumps(nums, indent=2))


if __name__ == "__main__":
    main()

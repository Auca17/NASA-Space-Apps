"""Paso 8 — Dataset armonizado publicable (release de GitHub o Zenodo).

Serie mensual de focos de calor armonizados por celda H3 res 5, mundo entero,
2000-11 → último mes, en Parquet y CSV comprimido, más metadatos y CITATION.

Salida (no va a git): data/processed/release/
  harmonized_fire_h3r5_monthly.parquet
  harmonized_fire_h3r5_monthly.csv.gz
  metadata.json
  README.md
  CITATION.cff
  SHA256SUMS

Columnas:
  h3_r5              celda H3 resolución 5 (texto hexadecimal de 15 caracteres)
  lat, lon           centro de la celda (grados, 4 decimales)
  month              primer día del mes (UTC)
  n                  focos armonizados, equivalente VIIRS NOAA-20 (1 decimal)
  n_raw              detecciones crudas filtradas del sensor del período
  source             MODIS (convertido) | VIIRS_SNPP (× factor) | VIIRS_NOAA20 (nativo)
  processing         SP (Standard Processing) | NRT (casi tiempo real, sin `type` real)
  confidence         high | low  (low = tramo 2000-11 → 2012-01, hueco de Terra 2001-06/07,
                     o estrato de calibración con < 200 pares)
  partial_month      true si el mes no está completo (el último)

Solo filas con n > 0 o n_raw > 0: una celda-mes ausente vale 0.

Uso:  python pipeline/08_release.py
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from common import PROCESSED, REPO, Timer, connect

OUT = PROCESSED / "release"
NAME = "harmonized_fire_h3r5_monthly"


def sha256(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    con = connect()
    OUT.mkdir(parents=True, exist_ok=True)
    info = json.loads((PROCESSED / "agg" / "info.json").read_text())
    sp = json.loads((PROCESSED / "sp_until.json").read_text())
    metrics = json.loads((REPO / "docs" / "validation" / "metrics.json").read_text())
    last_month = info["last_month"] + "-01"
    last_day = info["last_day"]
    partial = not last_day.endswith(("-28", "-29", "-30", "-31")) or last_day[:7] == info["last_month"]

    src = PROCESSED / "harmonized_r5.parquet"
    pq = OUT / f"{NAME}.parquet"
    with Timer("Parquet"):
        con.sql(f"""
            COPY (
                SELECT h3 AS h3_r5,
                       round(h3_cell_to_lat(h3_string_to_h3(h3)), 4) AS lat,
                       round(h3_cell_to_lng(h3_string_to_h3(h3)), 4) AS lon,
                       month,
                       CAST(round(n, 1) AS FLOAT) AS n,
                       n_raw,
                       source,
                       CASE
                         WHEN source = 'MODIS' AND month > DATE '{sp['MODIS']}' THEN 'NRT'
                         WHEN source = 'VIIRS_NOAA20' AND month > DATE '{sp['VIIRS_NOAA20']}' THEN 'NRT'
                         ELSE 'SP' END AS processing,
                       CASE WHEN month <= DATE '2012-01-01' OR confidence = 'low' THEN 'low'
                            ELSE 'high' END AS confidence,
                       {'month = DATE ' + repr(last_month) if partial else 'false'} AS partial_month
                FROM '{src}'
                WHERE n > 0 OR n_raw > 0
                ORDER BY month, h3_r5
            ) TO '{pq}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 1000000)
        """)
    csv = OUT / f"{NAME}.csv.gz"
    with Timer("CSV"):
        con.sql(f"COPY (SELECT * FROM '{pq}') TO '{csv}' (FORMAT csv, HEADER, COMPRESSION gzip)")

    stats = con.sql(f"""
        SELECT count(*), count(DISTINCT h3_r5), min(month), max(month), round(sum(n)),
               count(*) FILTER (WHERE confidence = 'low'), count(*) FILTER (WHERE processing = 'NRT')
        FROM '{pq}'
    """).fetchall()[0]

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    meta = {
        "title": "Harmonized MODIS/VIIRS active fire detections on an H3 res 5 grid, monthly, 2000-11 to present",
        "version": "1.0.0",
        "created": now,
        "unit": "harmonized fire detections per cell and month, VIIRS NOAA-20 equivalent",
        "grid": {"system": "H3", "resolution": 5, "mean_cell_area_km2": 252.9},
        "time": {"start": stats[2].strftime("%Y-%m"), "end": stats[3].strftime("%Y-%m"),
                 "step": "month", "day_boundary": "UTC", "last_day_with_data": last_day},
        "baseline_for_anomalies": {"start": "2003-01", "end": "2022-12"},
        "rows": stats[0], "cells": stats[1], "total_detections_harmonized": stats[4],
        "rows_low_confidence": stats[5], "rows_nrt": stats[6],
        "low_confidence_periods": [["2000-11", "2012-01"]],
        "terra_gap": "Terra MODIS has no detections from 2001-06-15 to 2001-07-03 (safe mode); 2001-06 and 2001-07 are low confidence.",
        "sources": {
            "MODIS": "NASA FIRMS MODIS Collection 6.1 (Terra + Aqua), Standard Processing to " + sp["MODIS"] + ", NRT after",
            "VIIRS_SNPP": "NASA FIRMS VIIRS S-NPP 375 m, Standard Processing 2012-01-20 to 2025-12-31 (used 2012-02 to 2018-03)",
            "VIIRS_NOAA20": "NASA FIRMS VIIRS NOAA-20 375 m, Standard Processing to " + sp["VIIRS_NOAA20"] + ", NRT after (used from 2018-04)",
        },
        "filters": {"type": 0, "modis_confidence_min": 30, "viirs_confidence": ["nominal", "high"],
                    "nrt_type": "inferred with a static-source mask (H3 res 6 cells with >= 50 % non-vegetation detections in NOAA-20 2018-2025)"},
        "harmonization": {
            "steps": [
                "Terra-only months (2000-11 to 2002-06) scaled to Terra+Aqua with a per-stratum factor from 2003-2011",
                "S-NPP scaled to NOAA-20 with a per-stratum factor from months with both sensors (2018-04 to 2025-12)",
                "MODIS converted to VIIRS NOAA-20 equivalent: log(V+1) = a + b*log(M+1) per stratum (10 deg latitude band x month), trained 2012-02 to 2022-12, plus a total-preserving factor; strata with < 200 cell-month pairs use the global coefficients of the month",
                "Res 5 values split from the res 3 prediction in proportion to each child's MODIS detections",
            ],
            "series": {"2000-11..2012-01": "MODIS converted", "2012-02..2018-03": "VIIRS S-NPP x factor",
                       "2018-04..": "VIIRS NOAA-20 native"},
            "validation_holdout_2023_2024": {
                "r2_global_monthly": metrics["r2_global_monthly"], "r2_linear_cell_month": metrics["r2_linear"],
                "r2_log1p_cell_month": metrics["r2"], "bias_pct": metrics["bias_pct"],
                "r2_log1p_cells_day": metrics["r2_cells_day"]},
        },
        "columns": {
            "h3_r5": "H3 cell index, resolution 5", "lat": "cell center latitude", "lon": "cell center longitude",
            "month": "first day of month (UTC)", "n": "harmonized detections, VIIRS NOAA-20 equivalent",
            "n_raw": "raw filtered detections of the period's sensor", "source": "sensor used for the month",
            "processing": "SP (standard) or NRT (near real time)", "confidence": "high or low",
            "partial_month": "true for the last, incomplete month",
        },
        "missing_values": "a cell-month absent from the file has 0 detections",
        "license": "CC-BY-4.0",
        "code": "https://github.com/Auca17/NASA-Space-Apps (pipeline/)",
    }
    (OUT / "metadata.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False, default=str))

    (OUT / "CITATION.cff").write_text(f"""cff-version: 1.2.0
message: "Si usás este dataset, citalo así. / If you use this dataset, please cite it as below."
type: dataset
title: "Harmonized MODIS/VIIRS active fire detections on an H3 res 5 grid, monthly, 2000-11 to {meta['time']['end']}"
version: 1.0.0
date-released: {now[:10]}
license: CC-BY-4.0
authors:
  - name: "NASA Space Apps Challenge 2026 team (project name to be defined)"  # TODO: nombres del equipo
repository-code: "https://github.com/Auca17/NASA-Space-Apps"
keywords: [wildfire, active fire, MODIS, VIIRS, FIRMS, harmonization, H3, Argentina]
abstract: >-
  Monthly counts of satellite active fire detections per H3 resolution 5 cell, worldwide,
  harmonized so that MODIS (2000-2012) and VIIRS (2012-present) are comparable. Units are
  VIIRS NOAA-20 equivalent detections. Validated on a 2023-2024 hold-out
  (global monthly R2 {metrics['r2_global_monthly']:.3f}, bias {metrics['bias_pct']:+.1f} %).
references:
  - type: data
    title: "NASA FIRMS MODIS Collection 6.1 and VIIRS 375 m (S-NPP, NOAA-20) active fire detections"
    authors:
      - name: "NASA Fire Information for Resource Management System (FIRMS)"
    url: "https://firms.modaps.eosdis.nasa.gov/"
    notes: "Agregar el DOI de cada producto según la página de citas de FIRMS."
""")

    def fmt(x) -> str:
        return f"{x:,}".replace(",", ".")

    (OUT / "README.md").write_text(f"""# Focos de calor armonizados MODIS/VIIRS, H3 res 5, mensual

Serie mensual de focos de calor satelitales por celda H3 de resolución 5 (~253 km²), mundo entero, de {meta['time']['start']} a {meta['time']['end']} (último día con datos: {last_day}). MODIS y VIIRS están armonizados a una sola unidad: **detecciones equivalentes a VIIRS NOAA-20**.

- **Archivos:** `{NAME}.parquet` y `{NAME}.csv.gz` (mismo contenido), `metadata.json` (método, fuentes, validación y columnas), `CITATION.cff`, `SHA256SUMS`.
- **Filas:** {fmt(stats[0])} celda-mes con fuego en {fmt(stats[1])} celdas. Una celda-mes que no aparece vale 0.
- **Confianza:** `low` en 2000-11 → 2012-01 (MODIS convertido), en junio y julio de 2001 (hueco de Terra) y en estratos de calibración con pocos datos.
- **NRT:** los meses posteriores a {sp['VIIRS_NOAA20']} (NOAA-20) vienen de datos casi en tiempo real; `processing = NRT`.
- **Validación (hold-out 2023–2024):** R² mundial mensual {metrics['r2_global_monthly']:.3f}, R² lineal por celda-mes {metrics['r2_linear']:.3f}, R² log1p por celda-mes {metrics['r2']:.3f}, sesgo {metrics['bias_pct']:+.1f} %.
- **Método y limitaciones:** ver `docs/metodo-fuego.md` en el repositorio.
- **Licencia:** CC-BY-4.0. Datos de origen: NASA FIRMS.
""")

    sums = []
    for f in sorted(OUT.iterdir()):
        if f.name != "SHA256SUMS" and f.is_file():
            sums.append(f"{sha256(f)}  {f.name}")
    (OUT / "SHA256SUMS").write_text("\n".join(sums) + "\n")
    for f in sorted(OUT.iterdir()):
        print(f"{f.stat().st_size / 1e6:9.1f} MB  {f.name}")
    print(json.dumps({k: meta[k] for k in ("rows", "cells", "rows_low_confidence", "rows_nrt")}, default=str))


if __name__ == "__main__":
    main()

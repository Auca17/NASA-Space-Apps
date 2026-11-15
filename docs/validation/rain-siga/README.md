# Rain validation — INTA SIGA vs IMERG / POWER

Monthly rainfall from **INTA SIGA automatic stations** compared against
the two gridded products the app actually serves: **GPM IMERG monthly
V07** (the field-grid rain source) and **NASA POWER PRECTOTCORR**
(the fallback used by `/api/field/diagnose` and `/api/field/parcels`).

## Source and terms

- **SIGA** — Sistema de Información de Agroclima, Instituto Nacional de
  Tecnología Agropecuaria (INTA): https://siga.inta.gob.ar
  Public, unauthenticated portal. Terms of use require citing INTA SIGA
  as the data source; data are for reference and INTA disclaims fitness
  for a particular purpose. Cite as: *INTA — SIGA, Sistema de
  Información de Agroclima, estaciones automáticas*.
- Station list: `5WP5HPJSeLmID3Wy.php?param_type=estacionautomatica`.
  Daily series: `/document/series/{idInterno}.xls`, column
  `Precipitacion_Pluviometrica` (mm/day).
- **IMERG**: `GPM_3IMERGM` monthly V07, 0.1°, sliced to the Argentina
  bbox (`data/earthdata/imerg_ar_months.npz`, same cache the field
  grid is built from).
- **POWER**: `data/processed/model_input/power_ar_daily.parquet`,
  `PRECTOTCORR` daily summed per month per 0.5° cell.

## Method

1. Stations: all **automatic** SIGA stations in Mendoza (10) plus a
   ~20-station Pampas sample — every automatic station in La Pampa and
   Córdoba, stride-sampled Buenos Aires / Santa Fe for spatial spread.
   5 of the 20 Pampas picks returned no usable daily rain for the
   period, leaving **25 stations with data** (10 Mendoza, 15 Pampas).
2. Station daily rain → monthly sums for **2015-01 .. 2024-12** (last
   full year covered by the IMERG cache). A month counts only with
   ≥25 days of data and ≥80 % of month days present; incomplete months
   are dropped, not imputed.
3. Pairing: station → **nearest IMERG pixel centre** (0.1°) and
   **nearest POWER cell centre** (0.5°×0.625°). Pairings are recorded
   per row in `pairs.csv` (`imerg_lat/lon`, `power_lat/lon`).
4. Metrics per station-month: `bias = product − station` (mm/month,
   positive = product wetter), RMSE (mm/month), Pearson r. Both pooled
   and per-station in `validation.json` (`per_station` list);
   `reference_kind: "field"` as in the Orin validation.

Reproduce: `python model/field_grid/rain_siga.py` (downloads ~30 XLS
files, ~1 s/request pacing, caches under `data/siga/`).

## Results (pooled, 1346 station-months)

| product | bias (mm/month) | RMSE (mm/month) | r | quality |
|---|---|---|---|---|
| IMERG monthly | +22.1 | 51.2 | 0.586 | fair |
| POWER daily→monthly | +22.4 | 49.4 | 0.623 | fair |

Both products run **wet vs the stations on average**, driven mainly by
arid Mendoza — IMERG pixels average orographic precipitation over
0.1° while most SIGA stations sit on dry valley floors, and POWER's
0.5° cell smooths terrain even more. In the humid Pampas the bias is
smaller and correlation better (see `per_station` in
`validation.json`).

## Honest limits

- **Point vs pixel.** SIGA stations are point gauges; IMERG/POWER are
  spatial averages. A mismatch is not automatically a product error —
  especially in the Andes foothills where rain varies over hundreds of
  metres. Treat bias as *expected sign + magnitude*, not truth.
- **Station coverage is sparse and recent.** Automatic stations mostly
  start 2014-2016; several have gaps (Rivadavia starts 2021, Santa
  Rosa 2020-12). Series are too short for robust climatology — this
  validates *monthly agreement*, not long-term means.
- **Gauges undercatch snow** and may drift; IMERG misses convective
  cores under 0.1°; POWER is a reanalysis-blend product, not a
  satellite measurement.
- **Selection is a sample**, not a network design: Pampas provinces
  with dense automatic coverage (Entre Ríos, 116 stations) are not
  represented in this round.
- `pairs.csv` is the auditable record; `data/siga/*.xls` are cached
  source files and can be refetched at any time.

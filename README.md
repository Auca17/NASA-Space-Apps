# Ashfield — Fire and Field

![Ashfield](web/public/brand/ashfield-lockup-light.svg)

**NASA Space Apps Challenge 2026 · Registered challenge: Field Shift: Adapting Farms with NASA Data** — the project also covers **Harmonization of MODIS and VIIRS Hot Spots**.

One harmonization engine that brings NASA data from different sensors and resolutions onto a common grid, seen through two lenses: **Fire**, 25 years of thermal anomalies in a single comparable series, and **Field**, a NASA-data diagnosis of a farmer's plot with their current rotation compared against 3 alternatives. The two lenses meet in stubble burning.

**Demo:** [PENDIENTE: URL de la demo] · **Video:** [PENDIENTE: URL del video]

---

## The problem

**Fire.** The satellite record of thermal anomalies is split between sensors that cannot be compared directly: MODIS (1 km pixels, since 2000, ending its mission in 2026) and VIIRS (375 m pixels, since 2012), which sees smaller fires and fragments a single fire into many more detections. Without harmonization the series jumps when VIIRS comes online, and there is no way to tell whether a year was worse because of fire or because of the sensor.

**Field.** Producers face changing temperatures, less predictable rainfall, water scarcity and degraded soils. Choosing a crop rotation that protects soil and water is hard: a crop that improves soil in one place can use too much water or fall outside the season in another. In Argentina, stubble and pasture burning adds to the problem — it damages the soil and is a major source of thermal anomalies.

**What ties them together:** scattered NASA data, at different resolutions, that nobody translates into decisions for the person standing on the land.

## What the app does

- **Fire lens (Hot Spots):** a 3D globe with an animated month-by-month historic mode from November 2000 to today, a live mode with detections from the last 24 h / 48 h / 7 d over today's satellite image, a year × month fire calendar, a semaphore comparing the current month against its 2003–2022 baseline, a 7-day fire-risk level with 2–3 reasons, and CSV download.
- **Field lens (Field Shift):** the producer draws their plot and gets a diagnosis where every number carries its source and resolution (rain, extreme rain, soil moisture, frosts, heat, crop water, bare soil, slope, soil, water trend, fire), an agricultural calendar showing when the plot is exposed, and their **current rotation + 3 alternatives**, each card with the five sections the challenge asks for: why, evidence, benefits, information gaps, and risks to validate with an agronomist.

**Two-minute demo path:** welcome → **"Ver mi zona"** (location, globe flies to a 50 km view) → historic mode playing **Corrientes 2022** → risk and semaphore in the area panel → **"Analizar mi campo"** → choose the **Pergamino demo plot** → compare the current rotation against the 3 alternatives, including the climate scenario sliders (rain −20 %, +1 °C).

Location and plots stay in the browser: no accounts, no server-side storage.

## Data used

All NASA satellite sources are global. Resolution and period are the source's own; every indicator in the app keeps them attached.

| Dataset | Used for | Resolution | Period |
|---|---|---|---|
| FIRMS MODIS Collection 6.1 | Hot spots | 1 km | 2000-11 → 2026-08-31 (SP), then NRT |
| FIRMS VIIRS S-NPP | Hot spots | 375 m | 2012-01-20 → 2025-12-31 |
| FIRMS VIIRS NOAA-20 | Hot spots, unit of the series | 375 m | 2018-04-01 → 2026-07-31 (SP), then NRT |
| NASA POWER (daily) | Frosts, heat, rain, fire weather, model features | 0.5° × 0.625° (≈55 × 60 km) | 2001 → yesterday (MERRA-2; tail from GEOS-IT) |
| SMAP L3 (SPL3SMP_E) | Soil moisture anomaly | 9 km | Computed but rejected by quality gates; the card uses POWER `GWETROOT` (see limitations) |
| MODIS MOD13C2 NDVI | Bare-soil days per year | 0.05°, monthly | Multi-year record |
| MCD12Q1 / ESA WorldCover | Dominant land cover | 500 m / 10 m | Latest available |
| SRTM (AWS Terrain Tiles) | Slope, elevation correction | ~30 m | — |
| GRACE-FO (mascon) | Regional water trend | Regional | 2018 → today |
| ECOSTRESS (ECO_L2T_LSTE) | Land-surface temperature | 70 m | 2024–2025, Orin demo plots only |
| ISRIC SoilGrids | Soil texture and organic carbon (0–30 cm) | 250 m | v2 |
| NASA GIBS | Base imagery (Blue Marble; VIIRS True Color for live mode) | — | Daily |
| MAGyP Estimaciones Agrícolas | Typical rotation per zone, analog-zone crops and yields | By department (Argentina) | Latest published |
| Orin field data | Satellite-vs-field validation | 53 weather stations, Mendoza | 2026-10-04 → 2026-10-20 |
| IGN / Natural Earth | Provinces, departments, country lookup | Polygons | — |

**Not used, and why:** the field datasets suggested for the US (SSURGO, NASS/CDL, NLDAS/PRISM, NAIP, CoCoRaHS, OpenET) cover only the United States; they are replaced by SoilGrids, MAGyP, POWER and the Orin data so the tool works in Argentina and worldwide. **GPM IMERG** is pending a data-use agreement at GES DISC — rain cards come from NASA POWER instead. **FAO GAEZ** is pending a manual license step. Landsat/HLS and Sentinel-2 are kept for demo plots only (partial coverage). ERA5/GLDAS stay as a climate backup. On-demand SoilGrids and ORNL MODIS calls time out beyond the latency budget, so those cards fall back to the precomputed grid.

## Method

**Fire harmonization.** All counts are expressed in **VIIRS NOAA-20 equivalent detections**, because MODIS is retiring and every new observation arrives as VIIRS. Calibration is done per stratum — 10° latitude band × month (18 bands, 208 strata with data) — over the 2012–2025 overlap:

1. **Terra → Terra + Aqua** (2000-11 → 2002-06): per-stratum (T+A)/T factor measured over 2003–2011.
2. **S-NPP → NOAA-20** (2012-02 → 2018-03): per-stratum N20/N factor computed only over months where both satellites deliver data (2018-04 → 2025-12); in Argentina the factor lands between 0.98 and 1.0.
3. **MODIS → VIIRS:** `log(VIIRS + 1) = a + b · log(MODIS + 1)` per stratum over res-3 cell × month pairs (training 2012-02 → 2022-12), plus a per-stratum total-preserving factor `k` that corrects the log-space bias and the fire VIIRS sees where MODIS sees nothing. Strata with fewer than 200 pairs use global month coefficients and are flagged `low` confidence (71 of 208).
4. **Res 3 → res 5:** each res-3 prediction is split among its res-5 children in proportion to their MODIS detections, so small cells always add up to the parent.

Final series: MODIS converted for 2000-11 → 2012-01, S-NPP × factor for 2012-02 → 2018-03, NOAA-20 as-is from 2018-04. Raw detections are filtered to `type = 0` (presumed vegetation fire), MODIS confidence ≥ 30, VIIRS `nominal`/`high`; NRT files lack `type`, so a fixed-source mask inferred from the NOAA-20 history is applied. In total ~568 million worldwide detections were processed onto H3 cells (res 5 ≈ 253 km² for panels and risk, res 3 for the globe, res 2 as shard unit).

**Fire risk in 7 days.** Two levels. Worldwide, no ML: `p = min(0.95, clim × (1 + 2·A + B))` where `clim` is the weekly climatology (fraction of 2003–2022 years with ≥ 1 detection that week) and A/B flag detections in the cell in the last 7 and 30 days. In Argentina, a **LightGBM** model adds NASA POWER weather (rain accumulation, dry days, humidity, temperature, wind) plus fire history, seasonality, land cover and neighbouring-cell fires; probabilities are Platt-calibrated and each prediction ships 2–3 SHAP-based reasons. The climatology is computed everywhere and is the baseline the model must beat.

**Field engine.** Deterministic and explainable — never a black box. A knowledge base of **15 crops** and **12 agronomically valid rotation templates** (every datum carries a source) is filtered for viability against the plot's diagnosis (frost-free window, water availability, crop suitability, producer constraints) and scored by indicators weighted by the producer's priority sliders: water balance, carbon/residue, nitrogen, erosion risk (bare-soil days × extreme rain × slope), pest-cycle diversity, forage, income and **burns avoided**. The current rotation plus the top-3 alternatives are returned; every indicator records which datum produced it, and that is what fills the "Evidence" section. Scenario sliders (rain −20 %, +1 °C) recompute viability and indicators.

**Analog zones.** Cells are clustered by harmonized climate, soil and NDVI phenology; in Argentina each cluster is crossed with MAGyP records so the evidence can say what is actually planted, and with what yield, in fields similar to yours.

**AI explanation.** An optional, pluggable LLM provider (Gemini Flash by default) only translates the engine's numbers into plain language: the prompt carries computed indicators, units and sources — never coordinates, plot ids or Orin data — and every number and citation in the answer is validated against the engine's output before anything is shown. Any failure falls back to template text generated from the same indicators.

**Uncertainty.** Every number in the diagnosis shows its source and resolution; cards flag low confidence when data is thin, resolution is coarse or the calibration stratum is small.

## Validation

**Harmonization hold-out.** Trained on 2012-02 → 2022-12, evaluated on **2023–2024** — years the calibration never saw — by converting hold-out MODIS and comparing against real NOAA-20:

| Metric | Value |
|---|---|
| R² of the global monthly series | **0.979** |
| R² linear, per res-3 cell × month | **0.926** |
| R² log1p, per res-3 cell × month | **0.654** |
| Total bias | **−0.8 %** |
| Cells-day with fire: R² log1p / bias | 0.61 / +1.4 % |

The log1p R² is lower because it weighs every cell equally and most cells have few detections per month — there, the difference between 1 and 3 detections is sampling noise (overpass timing, clouds, VIIRS' smaller pixels), not calibration error. High-fire cells, which drive totals and peaks, are predicted well, as the linear and global R² show. The harmonized series shows no jump in 2012 or 2018 (`docs/validation/series_global.png`).

**Fire-risk model vs baselines** (test split 2023–2025, Argentina):

| Predictor | ROC-AUC | PR-AUC | Brier |
|---|---|---|---|
| LightGBM (climate + history) | **0.920** | **0.427** | **0.0302** |
| Climatology | 0.843 | 0.295 | 0.0350 |
| Persistence | 0.852 | 0.310 | 0.0452 |

**Satellite vs field (Orin stations).** Daily NASA POWER temperature against **53 Orin weather stations** in Mendoza, 2026-10-04 → 2026-10-20 (742 station-day pairs per variable):

| Variable | RMSE | Bias (POWER − station) | r |
|---|---|---|---|
| Max temperature | 5.05 °C | −2.82 °C | 0.63 |
| Min temperature | 3.89 °C | −0.67 °C | 0.46 |

The error is driven by elevation: a POWER cell (~55 × 60 km) has one mean altitude — 2,485 m in the cell that includes the Andes in the Uco Valley — while those stations sit at 1,000–1,500 m, producing a −6.7 °C bias in max temperature there. Correcting POWER with the real plot elevation (SRTM, 6.5 °C/km) cuts RMSE almost in half (max: 2.82 °C, min: 2.28 °C); excluding the 10 stations inside the mountain cell gives 3.32 / 2.31 °C. Lesson reported honestly in the app: POWER is good for patterns on the plains, but a 2–3 °C error in minimum temperature changes whether a night frosts — confirm frost decisions with a nearby station or your agronomist.

## Limitations

- **2000-11 → 2012-01 is the low-confidence stretch** (marked in the app): those years are MODIS converted to a more sensitive sensor, and a small fire MODIS missed cannot be reconstructed. June–July 2001 carry an extra low-confidence flag because Terra recorded nothing between 2001-06-15 and 2001-07-03 (safe mode), before Aqua existed.
- **Calibration is by latitude band × month, not land cover** — grassland and rainforest at the same latitude share coefficients; land-cover stratification is a planned improvement. 71 of 208 strata fall back to global coefficients.
- **Precomputed field layers cover Argentina only** (plus demo plots); elsewhere the diagnosis relies on on-demand APIs and some cards may read "no data available".
- **POWER temperature in mountain cells** can miss several degrees (see validation): the diagnosis applies a −6.5 °C/km elevation correction on demand, but frost cards in valleys still need ground confirmation — and the fire-risk model features remain uncorrected (the model was not retrained).
- **SMAP soil-moisture anomaly was computed (SPL3SMP_E) but rejected by the quality gates** — it showed no positive relation to recent POWER rain — so the card falls back to POWER `GWETROOT`.
- **Climate scenarios are simple scalings** of the historical POWER series (rain × (1 + pct), temperature ± delta), not forecasts.
- **ECOSTRESS** is not part of the general diagnosis (partial coverage; demo plots only).
- **NRT hot spots infer `type`** with a fixed-source mask (discards 5.7 % of NOAA-20 NRT vs 8.6 % with the real flag); a new industrial source could slip through in recent months.
- **The crop knowledge base is a draft under agronomic review** (`docs/revision-agronomica.md`): several water-use and residue figures await Argentine sources, and Patagonia has no validated rotation.
- **Rotations are decision support, not agronomic advice** — the app says so on every card and lists what to validate with a local agronomist.
- The Argentina risk model's 365-day fire-history feature misses Jan–Oct 2026 fires until the next annual Parquet is added (`fires_365d_complete` flag on every shard).

## Where the Orin data comes from

The Orin data (plots, samplings and 53 weather stations in Mendoza) was **collected before the hackathon** by the Orin project. Per team decision D17, its use is authorized without restrictions: **only the collected data is used, never Orin's code**. This is stated here for transparency, as the challenge rules require for pre-existing work.

## Run it locally

**Pipeline** (Python 3.12+, ~9 GB of FIRMS zips in `~/spaceapps-fuego/data/raw/zips/`, ~70 GB free disk, `FIRMS_MAP_KEY` in `.env` for 2026 data):

```bash
pip install duckdb pyarrow pandas numpy matplotlib python-dotenv
python pipeline/01_ingest.py     # zips → Parquet normalizado y deduplicado
python pipeline/02_clean.py      # filtros type = 0 y confianza
python pipeline/03_grid.py       # celdas H3 + conteos mensuales y diarios
python pipeline/04_harmonize.py  # calibración MODIS → VIIRS + validación (docs/validation/)
python pipeline/model_input.py   # fires_ar_r5_daily.parquet para el modelo
python pipeline/05_aggregate.py  # series, climatología semanal, riesgo nivel historial
python pipeline/06_export.py     # data/processed/export/v1/ según el contrato
python back/tools/validate_contract.py data/processed/export/v1
python pipeline/07_firms_2026.py # 2026 por la API de FIRMS; después repetir 02 → 06 y model_input
```

**Backend** (FastAPI):

```bash
.venv/Scripts/pip install -r back/requirements.txt
set DATA_BASE_URL=file:///C:/Users/Rufda/Desktop/NASA-Space-Apps/fixtures/
set FIRMS_MAP_KEY=<key>
.venv/Scripts/python -m uvicorn back.api.index:app --port 8765
```

(on Linux/macOS: `pip install -r back/requirements.txt`, `export DATA_BASE_URL=...`, `uvicorn back.api.index:app --port 8765`.)

**Frontend:**

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173/app/ — the dev server serves `fixtures/` at `/data/v1/` so the app works without a backend; `/api/*` is proxied to `localhost:8000`. The landing page is at `/` (English) and `/es/` (Spanish).

## Deploy

Single Vercel project serving the static `web/` build plus the Python serverless function (`api/index.py`), with data in a public Cloudflare R2 bucket. Step-by-step, including the required environment variables: **[`docs/DEPLOY.md`](docs/DEPLOY.md)**.

## Repository map

```
pipeline/    FIRMS ingest → clean → H3 grid → harmonize → aggregates → export (Python + DuckDB)
model/       fire_risk (LightGBM + report), analogs (clustering), power, field_grid builders
back/        FastAPI app (Vercel serverless): /api/live, /api/risk, /api/field/*, knowledge/ (crops, rotations, measures)
web/         React + TypeScript + MapLibre GL (globe) front end
api/         Vercel entry point re-exporting the back app
fixtures/    Contract-shaped example data the front can run on
docs/        PRD, data contract, decisions log, method, validation, case study, deploy
tools/       R2 upload, brand assets (logo and palette: ember #b3401e, crop green, stubble beige)
```

## Team

Ariel · Augustus · Ezequiel · Alex

## Licenses and acknowledgements

- **Code license:** [PENDIENTE: licencia del código]
- Harmonized fire dataset: released as Parquet + CSV with metadata and `CITATION.cff` — [PENDIENTE: URL de descarga del dataset armonizado]
- Data: NASA FIRMS (MODIS, VIIRS S-NPP, VIIRS NOAA-20), NASA POWER, GPM IMERG, SMAP, MODIS (NDVI, land cover), SRTM, GRACE-FO, NASA GIBS, FAO GAEZ, ISRIC SoilGrids, MAGyP Estimaciones Agrícolas (Argentina), IGN (Argentina), Natural Earth, INTA (prevention measures and crop parameters, under review), Orin field data (with authorization).
- Tools: MapLibre GL JS, OpenFreeMap, Uber H3, DuckDB, LightGBM, FastAPI, React/Vite, Cloudflare R2, Vercel.

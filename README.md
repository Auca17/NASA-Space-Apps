# Ashfield — Field Shift: Adapting Farms with NASA Data

![Ashfield](web/public/brand/ashfield-lockup-light.svg)

**NASA Space Apps Challenge 2026 · Registered challenge: Field Shift: Adapting Farms with NASA Data**

A producer draws their plot and asks the real question: **what should I plant next?** Ashfield answers with NASA data — a per-parcel diagnosis, the current rotation compared against up to three alternatives in cards that explain *why, evidence, benefits, gaps and risks*, and validation against real weather stations. Several NASA products at very different resolutions land on one common grid, so each parcel reads them all cell by cell.

**Demo:** [PENDIENTE: URL de la demo] · **Video:** [PENDIENTE: URL del video]

**Categories (pending team decision):** Best Use of Data · Local Impact · Galactic Impact — the three candidates in `docs/PRD.md` §15.

---

## The problem

Producers face changing temperatures, less predictable rainfall, water scarcity and degraded soils. Choosing a crop rotation that protects soil and water is hard: a crop that improves soil in one place can use too much water or fall outside the season in another. In Argentina, stubble and pasture burning adds to the problem — it damages the soil and threatens the plot itself.

**What makes it hard:** the NASA data that could inform that decision is scattered across products, resolutions and portals — nobody translates it into a decision for the person standing on the land.

## What the app does

- **Field lens (Field Shift):** the producer draws their plot, splits it into **parcels with a crop each**, ranks the eight hazards that worry them most (fire, drought, El Niño, frost, heat, snow, hail, flood), and optionally adds water access, distance to emergency services, and per-parcel costs, prices and margins. The diagnosis gives each parcel a fire and a water percentage **with the reason for every number**, evaporation/evapotranspiration (NASA POWER `EVLAND`, with a FAO-56 Penman-Monteith or Hargreaves ET0 fallback where POWER is masked), a soil-infiltration score (USDA hydrologic groups from SoilGrids texture, organic matter, slope and bare-soil days), alerts, and fire-risk/dry/bare-soil zones on the map — then their **current rotation + 3 alternatives**, each with its infiltration effect and the five sections the challenge asks for: why, evidence, benefits, information gaps, and risks to validate with an agronomist. An optional AI summary (Gemini) puts the numbers in plain words; emergency-service phones are a tap away, never dialed automatically.
- **Planned:** alerts that warn about live fire detections near a saved field — the n8n workflows exist and were delivery-tested on a sandbox, but the notification system is not part of the app yet (the alert banner and emergency contacts inside the diagnosis do ship).

**Two-minute demo path:** welcome → **"Ver un ejemplo"** (a fictional farm in Mendoza — real location and satellite data) → the per-parcel diagnosis with fire and water badges and their reasons → the fire alert and the emergency-services block → the priorities tab (rank the eight hazards) → the agricultural calendar with vulnerable months → the validation card. To see rotation cards, use **"Analizar mi campo"** and tap a point in a grain zone — rotations do not apply to the Mendoza demo's vineyards and olives.

Location and plots stay in the browser: no accounts, no server-side storage.

## Data used

All NASA satellite sources are global. Resolution and period are the source's own; every indicator in the app keeps them attached.

| Dataset | Used for | Resolution | Period |
|---|---|---|---|
| FIRMS MODIS + VIIRS | Active-fire detections near the plot (parcel fire %, alerts and the planned notification) | 1 km / 375 m | NRT + history |
| NASA POWER (daily) | Frosts, heat, rain, evaporation | 0.5° × 0.625° (≈55 × 60 km) | 2001 → yesterday (MERRA-2; tail from GEOS-IT) |
| NASA POWER `GWETROOT` | Root-zone soil moisture (the parcel water indicator) | 0.5° × 0.625° | Same as POWER |
| NOAA CPC ONI | El Niño / La Niña tendency per parcel | Seasonal index | Ongoing |
| GPM IMERG (monthly V07) | Monthly rain in the Argentina field grid | 0.1°, monthly | 2015 → 2024 (precomputed) |
| OpenStreetMap (Nominatim + Overpass) | Place search, nearby emergency services and water | Point data | Live |
| Google Gemini (Flash) | Optional plain-language summary of the diagnosis | — | Server key required |
| SMAP L3 (SPL3SMP_E) | Soil moisture anomaly | 9 km | Computed but rejected by quality gates; the card uses POWER `GWETROOT` (see limitations) |
| MODIS MOD13C2 NDVI | Bare-soil days per year | 0.05°, monthly | Multi-year record |
| MCD12Q1 / ESA WorldCover | Dominant land cover | 500 m / 10 m | Latest available |
| SRTM (AWS Terrain Tiles) | Slope, elevation correction | ~30 m | — |
| GRACE-FO (mascon) | Regional water trend | Regional | 2018 → today |
| ECOSTRESS (ECO_L2T_LSTE) | Land-surface temperature | 70 m | 2024–2025, Orin demo plots only |
| ISRIC SoilGrids | Soil texture and organic carbon (0–30 cm) | 250 m | v2 |
| NASA GIBS | Base imagery (Blue Marble) | — | Daily |
| MAGyP Estimaciones Agrícolas | Typical rotation per zone, analog-zone crops and yields | By department (Argentina) | Latest published |
| Sentinel-2 L2A (ESA Copernicus) | Current-crop and moisture check on demand | 20 m | On demand |
| Orin field data | Satellite-vs-field validation | 53 weather stations, Mendoza | 2026-10-04 → 2026-10-20 |
| IGN / Natural Earth | Provinces, departments, country lookup | Polygons | — |

**Not used, and why:** the field datasets suggested for the US (SSURGO, NASS/CDL, NLDAS/PRISM, NAIP, CoCoRaHS, OpenET) cover only the United States; they are replaced by SoilGrids, MAGyP, POWER and the Orin data so the tool works in Argentina and worldwide. **FAO GAEZ** is pending a manual license step. **Hail** has no usable satellite product, so the app says "no satellite data" instead of guessing. Landsat/HLS is kept for demo plots only (partial coverage). ERA5/GLDAS stay as a climate backup. On-demand SoilGrids and ORNL MODIS calls time out beyond the latency budget, so those cards fall back to the precomputed grid.

## Method

**Field engine.** Deterministic and explainable — never a black box. A knowledge base of **15 crops** and **12 agronomically valid rotation templates** (every datum carries a source) is filtered for viability against the plot's diagnosis (frost-free window, water availability, crop suitability, producer constraints) and scored by indicators weighted by the producer's priority sliders: water balance, carbon/residue, nitrogen, erosion risk (bare-soil days × extreme rain × slope), soil infiltration, pest-cycle diversity, forage, income and **burns avoided**. The current rotation plus the top-3 alternatives are returned; every indicator records which datum produced it, and that is what fills the "Evidence" section. Scenario sliders (rain −20 %, +1 °C) recompute viability and indicators.

**Analog zones.** Cells are clustered by harmonized climate, soil and NDVI phenology; in Argentina each cluster is crossed with MAGyP records so the evidence can say what is actually planted, and with what yield, in fields similar to yours.

**AI explanation.** An optional, pluggable LLM provider (Gemini Flash by default) only translates the engine's numbers into plain language: the prompt carries computed indicators, units and sources — never coordinates, plot ids or Orin data — and every number and citation in the answer is validated against the engine's output before anything is shown. Any failure falls back to template text generated from the same indicators.

**Uncertainty.** Every number in the diagnosis shows its source and resolution; cards flag low confidence when data is thin, resolution is coarse or the calibration stratum is small.

**One grid, many resolutions (requirement F8 in action).** The field layers are precomputed onto the same **H3 hexagonal grid** (res 5 ≈ 253 km², res 2 as shard unit): POWER daily weather (0.5°), IMERG monthly rain (0.1°), MODIS NDVI (0.05°), SoilGrids texture and carbon (250 m), slope (SRTM ~30 m), land cover and the FIRMS fire history. Each drawn parcel is rasterized to the same cells, so unlike sources are read cell by cell inside the plot — and on-demand sources (Sentinel-2 at 20 m, OpenStreetMap, daily POWER) join at the point when they are fresher than the grid. The precomputed layers cover Argentina; elsewhere the diagnosis runs on point data.

**Fire history per parcel.** The fire percentage each parcel gets — and the months marked as burn-prone on the calendar — come from the FIRMS record (MODIS since 2000, VIIRS since 2012) gridded to the same cells, plus detections near the plot in the last days. The MODIS/VIIRS harmonization pipeline that produced that record stays in the repository (`pipeline/`, `model/fire_risk/`) but is not part of this submission.

## Validation

**Satellite vs field (Orin stations).** Daily NASA POWER temperature against **53 Orin weather stations** in Mendoza, 2026-10-04 → 2026-10-20 (742 station-day pairs per variable):

| Variable | RMSE | Bias (POWER − station) | r |
|---|---|---|---|
| Max temperature | 5.05 °C | −2.82 °C | 0.63 |
| Min temperature | 3.89 °C | −0.67 °C | 0.46 |

The error is driven by elevation: a POWER cell (~55 × 60 km) has one mean altitude — 2,485 m in the cell that includes the Andes in the Uco Valley — while those stations sit at 1,000–1,500 m, producing a −6.7 °C bias in max temperature there. Correcting POWER with the real plot elevation (SRTM, 6.5 °C/km) cuts RMSE almost in half (max: 2.82 °C, min: 2.28 °C); excluding the 10 stations inside the mountain cell gives 3.32 / 2.31 °C. Lesson reported honestly in the app: POWER is good for patterns on the plains, but a 2–3 °C error in minimum temperature changes whether a night frosts — confirm frost decisions with a nearby station or your agronomist.

**Satellite vs rain gauges (INTA SIGA).** Monthly IMERG and POWER rain against **25 INTA SIGA automatic stations**, 2015–2024 (1,346 station-months) — `docs/validation/rain-siga/`:

| Product | Bias | RMSE | r |
|---|---|---|---|
| IMERG | +22.1 mm/month | 51.2 mm/month | 0.59 |
| POWER | +22.4 mm/month | 49.4 mm/month | 0.62 |

Both products read wet on average, concentrated in arid Mendoza: a station is a point gauge on the dry valley floor while the satellite pixel averages the surrounding grid cell, including orographic rain the gauge never sees — a point-vs-pixel limitation, not a broken product. Monthly agreement does not prove long-term climatology; the full pairing record is in `pairs.csv`.

The earlier MODIS/VIIRS fire-harmonization validation (R² 0.979 holdout, risk model vs baselines) remains in `docs/validation/` and `model/fire_risk/report.md`; that pipeline is not part of this submission.

## Limitations

- **Precomputed field layers cover Argentina only** (plus demo plots); elsewhere the diagnosis relies on on-demand APIs and some cards may read "no data available".
- **POWER temperature in mountain cells** can miss several degrees (see validation): the diagnosis applies a −6.5 °C/km elevation correction on demand, but frost cards in valleys still need ground confirmation.
- **The parcel fire history is single-sensor before 2012** — MODIS-only years carry less confidence, and a small fire MODIS missed cannot be reconstructed (June–July 2001 has a real gap, Terra safe mode).
- **SMAP soil-moisture anomaly was computed (SPL3SMP_E) but rejected by the quality gates** — it showed no positive relation to recent POWER rain — so the card falls back to POWER `GWETROOT`.
- **Climate scenarios are simple scalings** of the historical POWER series (rain × (1 + pct), temperature ± delta), not forecasts. The El Niño tendency shown per parcel is a historical statistic, not a forecast either.
- **Hail is reported as "no satellite data"** — there is no satellite hail product honest enough to show a number for.
- **Nearby-services lookups (OpenStreetMap) can fail or time out**; when they do the diagnosis says so and marks itself incomplete rather than hiding it.
- **Parcel margins are rough estimates** from the producer's own costs/prices (or the department average from MAGyP) — agronomic advice still needed.
- **ECOSTRESS** is not part of the general diagnosis (partial coverage; demo plots only).
- **The crop knowledge base is a draft under agronomic review** (`docs/revision-agronomica.md`): several water-use and residue figures await Argentine sources, and Patagonia has no validated rotation.
- **Rotations are decision support, not agronomic advice** — the app says so on every card and lists what to validate with a local agronomist.
- **Evaporation and crop-water estimates are references, not measurements** — `EVLAND` is POWER's land evaporation; where masked, the card falls back to FAO-56 Penman-Monteith (or Hargreaves when radiation inputs are missing) ET0, labeled as a reference estimate. Crop-water demand uses generic FAO `Kc` coefficients pending local agronomic review.
- **The infiltration score is relative and qualitative** — USDA hydrologic groups derived from SoilGrids texture, organic matter, slope and bare-soil days; it ranks parcels and rotation alternatives, it does not measure infiltration.
- The 365-day fire history behind each parcel's fire percentage misses Jan–Oct 2026 fires until the next annual Parquet is added (`fires_365d_complete` flag on every shard).
- The Orin frost-forecast pilot (one station, spring 2026, 24 complete nights) saw no frost, so the alert's value cannot be judged — and the station-based bias correction made RMSE worse in that sample (3.64 vs 3.07 °C), so it is not evidence that calibration helps.

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
pipeline/    FIRMS ingest → clean → H3 grid → aggregates → export (Python + DuckDB)
model/       field_grid builders, analogs (clustering), power; fire_risk kept in repo — not part of this submission
back/        FastAPI app (Vercel serverless): /api/field/*, knowledge/ (crops, rotations, measures)
web/         React + TypeScript + MapLibre GL front end
api/         Vercel entry point re-exporting the back app
fixtures/    Contract-shaped example data the front can run on
docs/        PRD, data contract, decisions log, method, validation, case study, deploy
tools/       R2 upload, brand assets (logo and palette: ember #b3401e, crop green, stubble beige)
```

## Team

- **Ariel** — documentation and README.
- **Augustus** — Orin field data and agronomic knowledge.
- **Ezequiel** — data pipeline, deploy, Orin data and agronomic knowledge.
- **Alex** — front end and presentation.

## Licenses and acknowledgements

- **Code license:** MIT — see [`LICENSE`](LICENSE).
- Data: NASA FIRMS (MODIS, VIIRS S-NPP, VIIRS NOAA-20), NASA POWER, GPM IMERG, SMAP, MODIS (NDVI, land cover), SRTM, GRACE-FO, NASA GIBS, FAO GAEZ, ISRIC SoilGrids, MAGyP Estimaciones Agrícolas (Argentina), ESA Copernicus Sentinel-2, IGN (Argentina), Natural Earth, INTA (prevention measures and crop parameters, under review; SIGA automatic weather stations used as ground truth for the rain validation), Orin field data (with authorization).
- Tools: MapLibre GL JS, OpenFreeMap, Uber H3, DuckDB, LightGBM, FastAPI, React/Vite, Cloudflare R2, Vercel.

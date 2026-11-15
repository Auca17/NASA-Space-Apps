# Landing page — claim-to-source map (internal)

Every claim, number and status on the landing (`web/index.html`, `web/es/index.html`,
rendered from `web/src/landing/content.ts`), mapped to the repository file that
backs it. Not for publication.

## Hero / problem

| Claim | Source | Section |
|---|---|---|
| MODIS 1 km since 2000; VIIRS 375 m since 2012; NOAA-20 VIIRS April 2018 | `docs/PRD.md` | §2 contexto; `docs/metodo-fuego.md` |
| Naive join produces jumps at 2012 and 2018 | `docs/metodo-fuego.md`; `docs/validation/series_global.png` | método de armonización |
| NASA data scattered across products/resolutions; plot-scale gap | `docs/idea-general.md`; `PRODUCT.md` | problema |
| Stubble burning links fire lens and field lens | `docs/PRD.md`; `PRODUCT.md` | §1, "two lenses meet" |
| Registered challenge: Field Shift; also covers Hot Spots | `docs/decisions.md` | D1 |

## Requirement table — Field Shift (PRD §4.2)

| ID | Status | Source | Notes |
|---|---|---|---|
| F1 NASA data coverage | done | `back/app/routers/field.py` (`evaporation` card: POWER `EVLAND` + FAO-56 ET0 fallback via `back/app/services/et0.py`); `web/src/content/datasets.ts` (DATASETS_USED) | Verified live: `POST /api/field/diagnose` returns `evaporation`, `crop_water` cards. POWER covers temp/rain/frost/heat/evaporation; soil moisture via `GWETROOT` fallback (SMAP anomaly rejected); ECOSTRESS LST demo-only; Kc generic FAO pending local review. |
| F2 local soil, crops, priorities | done | `back/app/routers/field.py` (PRIORITY_MAP, constraints); `back/knowledge/` (15 crops); `web/src/features/field/FieldLens.tsx` (CONSTRAINTS) | |
| F3 ≥3 alternatives incl. current | done | `back/app/services/rotations.py` | `top += notviable[:3 - len(top)]` — current + up to 3 alternatives. |
| F4 why/evidence/benefits/gaps/risks | done | `back/app/services/rotations.py`; `web/src/features/field/field.test.tsx` (five sections) | |
| F5 bare-soil periods, vulnerable seasons | done | `back/README.md` (`bare_soil_days_yr` card, MOD13C2 monthly); agricultural calendar in `FieldLens` | |
| F6 pests/water/infiltration/income indicators | done | `back/app/services/infiltration.py` + `back/app/routers/parcels.py` (`infiltration` card); `back/app/services/rotations.py` (`infiltration`, `erosion_risk`, `pest_break`, `income`, `burns_avoided`) | Verified live: diagnosis returns `infiltration` card; each alternative carries an infiltration effect. Honest limit shown: indicators are relative/qualitative (USDA hydrologic groups from SoilGrids texture, organic matter, slope, bare-soil days). |
| F7 AI patterns, uncertainty, fusion | done | `back/app/services/ai_explain.py` (pluggable provider, Gemini default, strict validation, template fallback); `back/app/routers/field.py` (`mode: "ai"/"template"`); analog zones `back/README.md`; confidence/Patagonia `back/knowledge/REVIEW.md` + `back/README.md` | Limit shown: provider needs a server-side key; production enablement unverifiable (see "Could not verify"). |
| F8 common grid harmonization | done | `docs/data-contract.md` (H3); `docs/decisions.md` D4 | |
| F9 explain technical terms | done | `web/src/components/Glossary.tsx` | |
| F10 satellite vs field validation | **partial** | `docs/validation/orin/README.md` (temperature, 53 stations); `docs/validation/rain-siga/` (monthly rain, 25 INTA SIGA stations, 1,346 station-months 2015–2024); `web/src/features/field/OrinCard.tsx` | Limit shown: temperature one farm 14 days; rain monthly sums only, both products ~+22 mm/month wet concentrated in Mendoza (point vs pixel); still no NDVI/soil-moisture field samples. |
| F11 climate scenarios | done | `back/app/routers/field.py` (`rain_pct -40..40`, `temp_delta_c -2..4`); `web/src/features/field/FieldLens.tsx` | Limit shown: scalings, not forecasts. |
| F12 producer constraints | done | `web/src/features/field/FieldLens.tsx` (irrigation/livestock/machinery/markets); `back/app/services/rotations.py` (filters) | |
| F13 support, not replace | done | `web/src/content/datasets.ts` LIMITATIONS; `back/knowledge/REVIEW.md` | |

## Requirement table — Hot Spots (PRD §4.1)

| ID | Status | Source | Notes |
|---|---|---|---|
| H1 harmonized series | done | `docs/metodo-fuego.md`; `docs/validation/metrics.json` | unit = equivalent VIIRS NOAA-20 (D2). |
| H2 region + time range explorer | done | `web/src/App.tsx` (globe + area panel); `docs/PRD.md` §10 | |
| H3 calendar since 2000 | done | `web/src/features/fire/AreaPanel.tsx` (calendar) | |
| H4 current vs median | done | `web/src/domain/` semaphore; `web/src/features/fire/AreaPanel.tsx` | |
| H5 counts and anomalies | done | `web/src/features/fire/AreaPanel.tsx` (anomalies toggle, baseline 2003–2022) | |
| H6 accessible palettes | done | `web/src/domain/colors.ts` (Viridis/RdBu); `web/scripts/contrast.mjs` | |
| H7 CSV download | done | `web/src/features/fire/AreaPanel.tsx` (`downloadCsv`) | |

## Proof / trust numbers

| Claim | Source | Section |
|---|---|---|
| R² 0.979 global monthly; 0.926 linear res-3 cell-month; 0.654 log1p; bias −0.8 %; cell-day R² 0.61 / +1.4 % | `docs/validation/metrics.json` | harmonization metrics |
| 18 latitude bands × 12 months = 216 strata; 208 with data; 71 fall back to global coefficients | `docs/metodo-fuego.md`; `docs/decisions.md` | D3 |
| Holdout 2023–2024 | `docs/validation/metrics.json` | |
| Risk model: LightGBM ROC-AUC 0.920 / PR-AUC 0.427 / Brier 0.0302; climatology 0.843/0.295/0.0350; persistence 0.852/0.310/0.0452; Platt calibration; holdout 2023–2025 | `model/fire_risk/report.md` | results table |
| Outside Argentina: climatology + persistence, no ML | `docs/decisions.md` | D7 |
| Orin: 53 stations, 742 station-days, 2026-10-04→20; Tmax RMSE 5.05→2.82 °C, bias −2.82 °C; Tmin 3.89→2.28 °C; POWER cell ~2,485 m vs stations 1,000–1,500 m; correction −6.5 °C/km | `docs/validation/orin/README.md` | elevation finding |
| No field samples for NDVI / soil moisture | `docs/validation/orin/README.md` | limitations |

## Data table / pending / limits / human-in-the-loop / team

| Claim | Source | Section |
|---|---|---|
| Data table rows | `web/src/content/datasets.ts` (DATASETS_USED) | except NDVI row: file names `MOD13Q1` but `model/field_grid/README.md` + `back/README.md` show MOD13C2 (0.05° monthly) is what feeds `bare_soil_days_yr`, with MOD13Q1 used only on demand — page says both. |
| IMERG pending (GES DISC EULA), GAEZ pending (manual license), SMAP anomaly rejected (no positive relation to POWER rain; GWETROOT fallback) | `web/src/content/datasets.ts` (DATASETS_PENDING) | |
| Field grid Argentina only; on-demand worldwide | `web/src/content/datasets.ts` LIMITATIONS; `model/field_grid/README.md` | |
| 2000–2011 lowest confidence (2000-11 → 2012-01); Terra safe-mode gap Jun–Jul 2001 | `docs/data-contract.md` §2.1 (D30); `docs/metodo-fuego.md` | |
| 365-day fire history incomplete Jan–Oct 2026 | `model/fire_risk/report.md` | limitations |
| Elevation bias corrected in diagnosis, not in risk features | `docs/validation/orin/README.md` | |
| 15 crops, 12 rotation templates, 6 prevention measures; knowledge draft pending agronomic review | `back/knowledge/README.md`; `back/knowledge/REVIEW.md` | |
| Patagonia: low confidence, "sin rotaciones validadas", no soja-soja fallback | `back/README.md`; `back/knowledge/REVIEW.md` (corrected) | |
| Team roles | `docs/decisions.md` | D14 |
| Orin data collected before hackathon, data only | `docs/decisions.md` | D17 |
| AI prompt strips coordinates/plot IDs/place names; JSON + numeric + blocklist validation | `back/app/services/ai_explain.py` | docstring + validation |
| NASA credits list | `web/src/content/datasets.ts`; `docs/DEPLOY.md` | |
| Scenarios ranges −40..+40 % rain, −2..+4 °C | `back/app/routers/field.py` | input validation |

## Could not verify → shown as pending / honest limit

| Item | How the page shows it |
|---|---|
| Demo video URL | Button omitted entirely until the URL exists (`hero.video` unset). |
| Harmonized dataset download URL | Listed without link + visible `[PENDIENTE]` tag. |
| Site domain (`[PENDIENTE: dominio]`) | Canonical/hreflang/OG bake `%SITE_URL%` → env `VITE_SITE_URL`; sitemap emits `PENDIENTE-DOMINIO` placeholder if unset. |
| AI provider enabled in production | Page describes the mechanism (optional provider, template fallback) without claiming it is on; enablement requires `GEMINI_API_KEY`/`ANTHROPIC_API_KEY` in Vercel env, not verifiable from the repo. |
| Code license | No `LICENSE` file in repo; not claimed anywhere on the page. |

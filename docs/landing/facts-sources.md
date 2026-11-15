# Landing page — claim-to-source map (internal)

Every claim, number and status on the landing (`web/index.html`, `web/es/index.html`,
rendered from `web/src/landing/content.ts`), mapped to the repository file that
backs it. Not for publication.

## Hero / problem

| Claim | Source | Section |
|---|---|---|
| NASA data scattered across products/resolutions; plot-scale gap | `docs/idea-general.md`; `PRODUCT.md` | problema |
| Stubble burning stays in the decision as parcel-level fire probability/alerts/burn months | `docs/PRD.md`; `docs/decisions.md` | §1; D34 (fire retired to plot level) |
| Registered challenge: Field Shift only | `docs/decisions.md` | D1, D34 |
| Hero promise: decide what to plant / rotation comparison | `back/app/services/rotations.py` (current + top-3); `web/src/features/field/` | producer-first pitch (task 45) |
| Block: parcels fire/water % with reasons; agricultural calendar vulnerable months | `back/app/routers/parcels.py` (badges + reasons); `back/README.md` (`bare_soil_days_yr`, calendar) | |
| Block: one grid — POWER 0.5°, IMERG 0.1°, MODIS NDVI 0.05°, SoilGrids 250 m on the same H3 grid; Sentinel-2 20 m on demand | `docs/data-contract.md` (field grid H3 res 5); `back/app/services/current_crop.py` | F8 claim |
| Block: temperature checked vs 53 stations; rain vs 25 SIGA stations | `docs/validation/orin/README.md`; `docs/validation/rain-siga/validation.json` | |

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

## Proof / trust numbers

| Claim | Source | Section |
|---|---|---|
| Orin: 53 stations, 742 station-days, 2026-10-04→20; Tmax RMSE 5.05→2.82 °C, bias −2.82 °C; Tmin 3.89→2.28 °C; POWER cell ~2,485 m vs stations 1,000–1,500 m; correction −6.5 °C/km | `docs/validation/orin/README.md` | elevation finding |
| SIGA rain: 25 stations, 1,346 station-months 2015–2024; IMERG bias +22.1 / RMSE 51.2 / r 0.59; POWER bias +22.4 / RMSE 49.4 / r 0.62; Mendoza point-vs-pixel | `docs/validation/rain-siga/validation.json`; `docs/validation/rain-siga/README.md` | |
| No field samples for NDVI / soil moisture | `docs/validation/orin/README.md` | limitations |

## Data table / pending / limits / human-in-the-loop / team

| Claim | Source | Section |
|---|---|---|
| Data table rows | `web/src/content/datasets.ts` (DATASETS_USED) | except NDVI row: file names `MOD13Q1` but `model/field_grid/README.md` + `back/README.md` show MOD13C2 (0.05° monthly) is what feeds `bare_soil_days_yr`, with MOD13Q1 used only on demand — page says both. |
| IMERG monthly V07 used for the Argentina rain grid (2015–2024, precomputed); GAEZ pending (manual license); SMAP anomaly rejected (no positive relation to POWER rain; GWETROOT fallback) | `model/field_grid/`; `web/src/content/datasets.ts` (DATASETS_PENDING) | |
| Field grid Argentina only; on-demand worldwide | `web/src/content/datasets.ts` LIMITATIONS; `model/field_grid/README.md` | |
| Parcel fire history window incomplete Jan–Oct 2026 until the annual Parquet lands | `model/fire_risk/report.md` | limitations (parcel-level caveat kept) |
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
| Site domain (`[PENDIENTE: dominio]`) | Canonical/hreflang/OG bake `%SITE_URL%` → env `VITE_SITE_URL`; sitemap emits `PENDIENTE-DOMINIO` placeholder if unset. |
| AI provider enabled in production | Page describes the mechanism (optional provider, template fallback) without claiming it is on; enablement requires `GEMINI_API_KEY`/`ANTHROPIC_API_KEY` in Vercel env, not verifiable from the repo. |
| Code license | `LICENSE` — MIT, copyright 2026 Ashfield team (added task 45; team must confirm the choice). |

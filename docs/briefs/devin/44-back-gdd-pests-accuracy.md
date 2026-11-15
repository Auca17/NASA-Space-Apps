# Devin task 44 — Back end: degree days per crop, pest cycle with real hosts, accuracy block, hazard-to-priority support

Branch: `git fetch; git checkout -B feat/back-fieldshift origin/main`. Edit only `back/**` and `docs/data-contract.md`. Commit on the branch, push, never main. Never print secrets. Do not stop servers on 8000, 5173, 5174.

## 1. Degree days (F9 glossary promises them; `gdd_base10` is null for all 20 crops)

Fill `gdd_base10` (thermal time from sowing to maturity, base 10 °C, in °C·day) for every crop in `back/knowledge/crops.json` with a cited source per value (INTA, FAO Ecocrop, university extension), marked "pending local review" in `REVIEW.md`. Perennials (vid, olivo, frutal_carozo, monte_nativo) get the value for the annual cycle (budbreak to harvest) or null with a reason. Add a `gdd_year` indicator to the diagnosis (accumulated degree days per year from POWER T2M, base 10, capped at 30 °C) with its basis, and per crop in the rotation cards: "este lote acumula X °C·día por año; el maíz necesita Y" so the viability of each crop is visible. Tests.

## 2. Pest cycle with real hosts

Today `pest_break` counts distinct botanical families in the cycle. Add `back/knowledge/pests.json`: for the catalog crops, the main diseases and pests with their hosts and whether the inoculum survives in residue or soil (for example roya de la soja, roya del trigo, Fusarium en trigo y maíz, chicharrita del maíz / Spiroplasma with maíz guacho as bridge, Diaporthe, Sclerotinia en soja y girasol, nematodos), cited (INTA, Aapresid, university pathology guides). Compute per rotation `pest_break` as: number of host-sharing pairs of consecutive crops avoided versus the current rotation, and list the specific risks ("maíz sobre maíz mantiene Fusarium y chicharrita"). Keep the family count as a secondary note. Update the rotation card "risks" section with these specifics. Tests.

## 3. Accuracy block in every diagnosis

Add `accuracy` to `/api/field/diagnose` and to each parcel of `/api/field/parcels`:

```json
"accuracy": {"temp_rmse_c": 2.9, "temp_rmse_adjusted_c": 1.8, "rain_bias_mm_month": 22.1, "rain_rmse_mm_month": 51.2, "rain_r": 0.59, "stations": {"temperature": 53, "rain": 25}, "elevation_correction_c": -1.2, "note": "plain sentence", "sources": ["orin_validation", "siga_rain_validation"]}
```

Values read from `docs/validation/orin/validation.json` and `docs/validation/rain-siga/validation.json` (ship copies under `back/knowledge/validation/` so Vercel has them), choosing regional numbers when the validation file has per-station data near the point (within 200 km, at least 3 stations), else the global ones, and saying which in `note`. Tests.

## 4. Hazard profile accepted by the rotations endpoint

`/api/field/rotations` accepts an optional `hazards` list (the parcels profile: ids and ranks). The back end maps it to engine priorities exactly like the front will (drought → water, fire → avoid_burning, flood → erosion and soil, El Niño → water, frost and heat → viability checks that penalize crops whose frost window or heat tolerance fail in this cell, income when economics present), returns `priorities_used` and `mapping_note`, so the front can show "Para las rotaciones usamos: ...". Explicit `priorities` in the body still win. Tests, contract update.

## 5. Quick fixes

- The review reported a failing test `test_gaps_use_human_card_titles` expecting "Sin dato de Cobertura del suelo"; the suite passes now (222), so just confirm and note it.
- Run the whole back suite and the validator.

## Report

Values for Pergamino and Valle de Uco, tests before and after, sources used.

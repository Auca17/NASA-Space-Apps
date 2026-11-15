# Devin task 39 — Evaporation (F1), infiltration (F6), Mendoza crops, INTA data scan (back end and knowledge)

Branch: `git fetch; git checkout -B feat/f1-f6 origin/main` (main is c3146e2 or later). Edit only `back/**`, `docs/data-contract.md`, `docs/` research notes. Commit on the branch (conventional commits, no AI trailers), push, never main. Never print secrets. Do not stop servers on ports 8000, 5173, 5174.

## 1. Evaporation and evapotranspiration (Field Shift F1 asks for "evaporation")

- Find the exact NASA POWER daily parameters for evaporation from land and for evapotranspiration (check the POWER parameter catalogue through its API; do not guess names). Add them to the existing POWER fetch (same single call, no extra request) for `/api/field/diagnose` and `/api/field/parcels`.
- New indicator `evaporation`: annual total in mm and the monthly profile; plus the water balance it implies (rain minus evapotranspiration per month, mm), reusing the existing monthly water-balance helper instead of a new one. Plain `basis` ("cuánta agua pierde el suelo y las plantas al aire por año"). Add to the diagnose cards (new card id `evaporation`) and to the parcels indicators.
- Tests with a stubbed POWER series; update the contract and fixtures.

## 2. Infiltration (Field Shift F6 asks how each alternative affects "soil infiltration")

- Indicator `infiltration` from data we already have: SoilGrids texture class and organic carbon of the cell, slope, and bare-soil days. Output a class (`alta | media | baja`) and a 0 to 100 score with the formula documented in `basis` and in `back/knowledge/README.md` (cite the source of the texture-to-infiltration ranking, for example the USDA hydrologic soil groups).
- Per rotation alternative: estimate the change in infiltration class from the alternative's cover (bare-soil days and residue) and add it to the alternative's indicators next to erosion, labelled as relative and qualitative. Update the landing requirement text later (another terminal does the landing).
- Tests.

## 3. Crops for a Mendoza demo farm

The demo will be a fictional producer in Mendoza. The catalog (`back/knowledge/crops.json`) has no vineyard. Add display crops for **vid (vineyard), olivo, ajo, alfalfa (if missing), frutales de carozo, and monte nativo / sin cultivo**, each with: id, Spanish and English names, color, icon hint, water need (mm per season, cited from INTA EEA Mendoza / Junín or FAO 56 Kc tables), frost sensitivity window, and `rotatable: false` for perennials so the rotation engine never proposes rotating a vineyard. The parcels endpoint must accept them and compute water and frost alerts with the crop's own frost window. Mark every value with its source in `back/knowledge/REVIEW.md` as "pending local agronomist review". Tests.

## 4. INTA data scan (research only, no code)

Write `docs/research/inta-data.md`: what INTA publishes openly that could validate our satellite estimates: SIGA (Sistema de Información y Gestión Agrometeorológica) stations (variables, coverage in Mendoza and the pampas, access method, license), any soil moisture measurements (stations with probes, not model maps), any NDVI field or ground-truth data, and the INTA soil maps (GeoINTA). For each: URL, variables, period, format, whether it can be downloaded automatically, and whether it is measurement or model. Conclude which could close Field Shift F10 (validate satellite against field) for rain, soil moisture and NDVI. Do not download large data; a small sample to confirm access is fine.

## Report

Values for the pampa demo and for a point in Valle de Uco (-33.73, -69.12): evaporation, water balance, infiltration, the crops added with sources, the INTA findings, tests.

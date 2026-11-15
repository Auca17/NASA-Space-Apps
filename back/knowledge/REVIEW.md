# Knowledge review checklist (B1 / B1b draft)

Everything in `crops.json`, `rotations.json` and `measures.json` is a
**draft to validate with agronomists and the producer contact** before the
demo. Numbers come from the cited reference works; dates and qualitative
levels are general agronomic knowledge and were **not** checked line by
line against a regional INTA/MAGyP calendar. `null` means no source was
found.

## Priority 1 — values the rotation engine uses in arithmetic

| Item | Current draft | Basis | Ask |
|---|---|---|---|
| `water_mm_cycle` soja, maiz, trigo, girasol, sorgo, mani, algodon, arveja | 575, 650, 550, 800, 550, 600, 1000, 425 | FAO-33 range midpoints (Doorenbos & Kassam 1979) | Are FAO-33 midpoints OK for rainfed Argentina? Girasol 800 and algodón 1000 look high. |
| `water_mm_cycle` alfalfa | 1200 (per year) | FAO-33 800–1600 | Perennial: engine compares it with rain over the sowing→last-cut window only (see Pendientes). |
| `water_mm_cycle` cebada, colza | 400, 440 | Alberta Agri-Facts 2011 (Canadian conditions) | Replace with an Argentine source (INTA Anguil / Balcarce). |
| `water_mm_cycle` garbanzo | 268 | Zhang et al. 2000 (Syria, rainfed) | Argentine value (NOA / Córdoba). |
| `water_mm_cycle` avena, centeno, vicia | 194, 194, 175 | Cover-crop consumptive use to desiccation (Scianca UNS thesis 88–299 mm; INTA Gral. Villegas 110–241 mm) | Not a full grain cycle. Confirm that cover-crop use is what we want. |
| `residue_t_ha` (all crops except alfalfa) | soja 3.4, maiz 7.5, trigo 4.5, girasol 3.7, sorgo 6.1, cebada 4.3, mani 2.0, algodon 3.0, avena 3.0, colza 3.0, garbanzo 1.5, arveja 2.0 | Our estimate: yield × (1 − HI) / HI. Assumed yields (t/ha): soja 2.8, maiz 7.5, trigo 3.0, girasol 2.0, sorgo 5.0, cebada 3.5, avena 2.0. Assumed HI: 0.45, 0.50, 0.40, 0.35, 0.45, 0.45, 0.40. mani, algodon, colza, garbanzo and arveja are rough. | Replace with the AAPRESID-INTA *Red de Brechas de Carbono* 2023–24 per-crop coefficients. |
| `residue_t_ha` centeno 5.0, vicia 4.0 | | Cover biomass at desiccation, order of magnitude only | INTA cover-crop trial data. |
| `residue_t_ha` alfalfa 0.0 | | Aboveground biomass is removed by cutting or grazing | Is 0 right, or should root and crown carbon count? |
| `market_ar` (15 crops) | high: soja, maiz, trigo. medium: girasol, sorgo, cebada, mani, algodon, alfalfa, garbanzo. low: avena, centeno, vicia, colza, arveja | Qualitative, MAGyP area and exports | Producer view. Trigo was "medium" in the placeholder. |
| `frost_tolerance` (only `high` skips the frost check) | high: trigo, cebada, alfalfa, centeno, vicia | FAO ECOCROP (qualitative) | Garbanzo, arveja and colza are `medium`, so they fail the frost check on winter cycles. Is that right? |

## Priority 2 — sowing and harvest windows (`sowing`, `harvest` per zone)

- **All 15 crops, all zones:** windows are general agronomic knowledge. Bases: MAGyP Estimaciones Agrícolas, Bolsa de Cereales PAS, USDA IPAD calendar (wheat: May–Jul sowing, Nov–Jan harvest) and INTA 2024 maize zoning (chicharrita). Validate each one per zone.
- **Maíz `pampa_humeda` harvest end is 06-15, sorgo 06-15.** Late maize is harvested into July. The window was cut at 06-15 because the engine treats sowing start → harvest end as the crop cycle and would flag maize as out of the frost-free window (see Pendientes).
- **Zones per crop.** Check presence and absence:
  - cuyo: maiz, alfalfa only.
  - patagonia: alfalfa only.
  - nea: soja, maiz, trigo, girasol, sorgo, algodon, alfalfa, vicia.
  - noa: soja, maiz, trigo, sorgo, algodon, alfalfa, garbanzo.
  - mani, cebada, avena, centeno, colza and arveja: pampa_humeda only.
- **Alfalfa `harvest`** holds the cutting period (first cut → last cut), not a single harvest.

## Priority 3 — not used by the engine today

- `gdd_base10`: **null for all 15 crops.** We found no Argentine base-10 °C source; maize literature uses base 8 °C and soybean is photoperiod-driven. Ask whether the field should change base or be dropped.
- `root_depth_cm`: FAO-56 table 22 midpoints. Wheat uses the spring-wheat range (1.0–1.5 m). Centeno and vicia are **null** because they are not in the table.
- `heat_tolerance`, `drought_tolerance`: FAO ECOCROP (qualitative), all crops.

## Rotations (`rotations.json`)

| id | zones | typical for |
|---|---|---|
| soja-soja | pampa_humeda, nea, noa | pampa_humeda, nea, noa (first in file) |
| trigo-soja2-maiz | pampa_humeda | |
| maiz-soja-vicia | pampa_humeda | |
| sorgo-soja-trigo-soja2 | pampa_humeda | |
| maiz-soja | pampa_humeda, nea, noa | |
| trigo-soja2-maiz-soja | pampa_humeda | |
| soja-centeno | pampa_humeda | |
| girasol-trigo-soja2 | pampa_humeda | |
| cebada-soja2-maiz | pampa_humeda | |
| alfalfa3-maiz-trigo-soja2 | pampa_humeda | |
| garbanzo-maiz | noa | |
| alfalfa4-maiz | cuyo (irrigated) | cuyo |

- **Patagonia has no rotation.** The engine returns `confidence: "low"` and "sin rotaciones validadas para esta zona" — no soja-soja fallback (see `back/README.md`). Which rotation should it be?
- Is soja-soja really the typical current rotation for NEA and NOA? PRD 7.3 says "la típica de la zona según MAGyP".
- `bare_soil_days` = (years × 365 − days with a live crop) / years. Standing stubble is not subtracted. Confirm the definition.
- All sequence dates fall inside the crop windows (checked by script). Confirm the dates themselves, especially soja 2ª after trigo and cebada, and garbanzo / maíz in NOA as a double crop.

## Measures (`measures.json`) — validate with the producer contact

- **Facts sourced from INTA / UIB Balcarce + Bomberos Tandil (2023-12-28):**
  - stop work at wind > 40 km/h, temperature > 35 °C or RH < 30 %;
  - motor > 600 °C, about 80 % of fires start at the motor;
  - 20–30 min per cleaning;
  - ABC extinguishers sized to each harvester;
  - tank ≥ 500 l with pump;
  - firebreaks inside and outside the crop;
  - an extinction protocol for each harvest.
- **`requires` is our judgment except cleaning downtime (0.5 h, from INTA):**
  - `people`, `machinery`, `cost` for every measure;
  - `downtime_h` is null for `harvest_timing` (depends on weather) and `maintain_firebreak` (no width or effort given by INTA);
  - `people` is null for `fire_response_protocol`.
- `no_residue_burning` is sourced from Ley 26.562 (2009), not from the INTA page.
- **Trigger mapping is ours.** Check that each trigger makes sense:
  - `water_and_extinguisher` also fires on `fire_weather_high`;
  - `fire_response_protocol` fires on `risk_high` and `burn_season_now`.

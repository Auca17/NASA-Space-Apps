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
| `water_mm_cycle` soja, maiz, trigo, girasol, sorgo, mani, algodon, arveja | 575, 650, 550, 800, 550, 600, 1000, 425 | FAO-33 range midpoints (Doorenbos & Kassam 1979) — kept as the FAO reference the engine uses. Observed use added: `water_mm_observed` maiz 487, trigo 319, girasol 443 (INTA–FAUBA, 138 ensayos de secano, semiárido pampeano) — **respondido con fuente**, pendiente de validación local. Algodón 1000 (FAO 700–1300) y colza 440 quedan **sin valor local — sigue pendiente de validación local**. | Girasol 800 and algodón 1000 still look high; validate FAO midpoints for rainfed Argentina. |
| `water_mm_cycle` alfalfa | 1200 (per year) | FAO-33 800–1600 | Perennial: engine compares it with rain over the sowing→last-cut window only (see Pendientes). |
| `water_mm_cycle` cebada, colza | 400, 440 | Cebada: INTA Anguil 380–400 mm — **respondido con fuente**, pendiente de validación local. Colza 440 queda **sin valor local — sigue pendiente de validación local**. | Colza: Argentine source still needed. |
| `water_mm_cycle` garbanzo | 300 (era 268) | EEAOC / NOA — **respondido con fuente**, pendiente de validación local. Además `water_mm_observed` 328 (simulación CROPWAT-FAO Córdoba). | — |
| `water_mm_cycle` avena, centeno, vicia | 194, 194, 175 | Cover-crop consumptive use to desiccation (Scianca UNS thesis 88–299 mm; INTA Gral. Villegas 110–241 mm) | Not a full grain cycle. Confirm that cover-crop use is what we want. |
| `residue_t_ha` (all crops except alfalfa) | soja 3.30, maiz 9.52, trigo 4.62, girasol 3.74, sorgo 11.23 | Ensayos CEI Barrow / INTA: t MS/ha por cosecha, de ensayos con sus propios rindes (`residue_note`) — **respondido con fuente**, pendiente de validación local. cebada 4.3, mani 2.0, algodon 3.0, avena 3.0, colza 3.0, garbanzo 1.5, arveja 2.0 siguen siendo estimación rinde × (1 − IC) / IC — **sigue pendiente de validación local** (idealmente AAPRESID-INTA *Red de Brechas de Carbono* 2023–24). | — |
| `residue_t_ha` centeno 5.0, vicia 4.0 | | Cover biomass at desiccation, order of magnitude only — sigue pendiente de validación local | INTA cover-crop trial data. |
| `residue_t_ha` alfalfa 0.0 | `root_carbon_note`: "aporte de carbono por raíz y corona: sin valor, depende del manejo y de la duración de la pastura" | Aboveground biomass is removed by cutting or grazing; root/crown carbon has no value — **sin valor, sigue pendiente**; se muestra como vacío de información cuando alfalfa aparece. | Confirm whether root and crown carbon should count. |
| `market_ar` (15 crops) | high: soja, maiz, trigo. medium: girasol, sorgo, cebada, mani, algodon, alfalfa, garbanzo. low: avena, centeno, vicia, colza, arveja | Qualitative, MAGyP area and exports | Producer view. Trigo was "medium" in the placeholder. |
| `frost_tolerance` (only `high` skips the frost check) | high: trigo, cebada, alfalfa, centeno, vicia | FAO ECOCROP (qualitative) | Garbanzo, arveja and colza are `medium`, so they fail the frost check on winter cycles. Is that right? |

## Priority 2 — sowing and harvest windows (`sowing`, `harvest` per zone)

- **All 15 crops, all zones:** windows are general agronomic knowledge. Bases: MAGyP Estimaciones Agrícolas, Bolsa de Cereales PAS, USDA IPAD calendar (wheat: May–Jul sowing, Nov–Jan harvest) and INTA 2024 maize zoning (chicharrita). Validate each one per zone.
- **Maíz `pampa_humeda` harvest end es 07-31, sorgo 07-15.** Respondido: se agregó `cycle_end` por zona (maíz 04-30, sorgo 05-15) — fin fisiológico del ciclo que el motor usa para heladas y agua de ciclo; `harvest` quedó como la ventana real de cosecha y dispara las reglas de cosecha. El maíz tardío queda viable con ventana libre de heladas hasta el 11/06. **Respondido con fuente**, pendiente de validación local.
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

- **Patagonia has no rotation.** The engine returns no rotation for Patagonia (confidence low, no soja-soja fallback). Which rotation should it be? → **Respondido con fuente (parcial):** `zone_references` (raíz de `rotations.json`) lleva la referencia de INTA para el Valle Inferior del Río Negro bajo riego (4 a 5 ciclos de pastura de alfalfa, 2 de cebolla y 2 de maíz). No se calcula rotación para Patagonia: el motor sigue devolviendo confianza baja y sin fallback; el front muestra la referencia en el estado vacío. Sigue pendiente una rotación validada para la zona.
- Is soja-soja really the typical current rotation for NEA and NOA? PRD 7.3 says "la típica de la zona según MAGyP". → **Sigue pendiente de validación local:** la respuesta "no sé" sigue usando soja-soja, pero el motor agrega el vacío "La rotación típica de esta zona no está validada con datos por subzona; elegí la tuya si la conocés (fuentes: INTA, EEAOC)" cuando la usa en NEA/NOA.
- **Soja de segunda:** ambas rotaciones con soja 2ª citan INTA RIA 2018 (siembra 02-12 tras cebada, 16-12 tras trigo) — respondido con fuente, sin cambiar fechas ni valores.
- **Garbanzo–maíz (NOA):** fuentes EEAOC agregadas (maíz sucesor principal de verano 2017/2018; cosecha de garbanzo fines de oct–mediados de nov) — respondido con fuente, sin cambiar la rotación.
- `bare_soil_days` = (years × 365 − days with a live crop) / years. Standing stubble is not subtracted. Confirm the definition.
- All sequence dates fall inside the crop windows (checked by script). Confirm the dates themselves, especially soja 2ª after trigo and cebada, and garbanzo / maíz in NOA as a double crop.

## Measures (`measures.json`) — validate with the producer contact

- **Stop thresholds are now regional (`stop_thresholds`, raíz del archivo):**
  - NEA y NOA: viento > 35 km/h, temperatura > 30 °C, humedad < 30 % — guía de prevención de incendios de INTA para el Chaco. **Respondido con fuente**, pendiente de validación local.
  - `pampa_humeda`, `cuyo`, `patagonia` y `default`: viento > 40 km/h, temperatura > 35 °C, humedad < 30 % — INTA/UIB Balcarce + Bomberos Tandil; el umbral de humedad queda "por confirmar con INTA" (`rh_unconfirmed`). **Respondido con fuente**, pendiente de validación local.
  - Cada condición detallada termina con "confirmá con Bomberos locales si corresponde suspender".
- **`maintain_firebreak`:** `reference_width_m: 30` — guía INTA del Chaco, sección 5.6 (referencia prudente para la región chaqueña; el diseño depende del combustible, la pendiente y el viento). **Respondido con fuente**, pendiente de validación local.
- **`clean_harvester`:** se agregaron `checks` — "revisar pérdidas de gasoil y aceite" y "revisar el matachispas del escape" (guía INTA del Chaco, sección 5.5); sigue en 30 min con sus fuentes. **Respondido con fuente**, pendiente de validación local.
- **`cases.json` (nuevo):** incendio de cosechadora en San Genaro, Santa Fe (2026-05-04) — reporte periodístico (MDR), no testimonio de trabajadores. Se muestra como "Un caso real" cuando aparece `clean_harvester` o `harvest_timing`. **Respondido con fuente**; el reporte no dice qué equipamiento ni cortafuegos había (`unknown`).
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

## Mendoza display crops (F1–F6 additions) — pending local agronomist review

Every value below is a draft pending review by a local agronomist
(INTA EEA Mendoza / Junín ideally). None was checked against a
regional trial.

| Item | Current draft | Basis | Ask |
|---|---|---|---|
| `water_mm_cycle` vid | 550 | FAO-56 tabla 12 (Kc 0,30/0,70/0,45): ETc estacional Mendoza ~450–700 mm — **pendiente de validación local** | Confirmar con ETc medido en EEA Mendoza. |
| `water_mm_cycle` olivo | 700 | FAO-56 (Kc ~0,65 todo el año): ~600–900 mm anual — **pendiente de validación local** | Olivar en secano vs riego. |
| `water_mm_cycle` ajo | 450 | FAO-56: ETc ~350–500 mm ciclo — **pendiente de validación local** | Cuenca del sur mendocina. |
| `water_mm_cycle` frutal_carozo | 800 | FAO-56 (Kc caducifolios ~0,45/0,90): ~700–900 mm — **pendiente de validación local** | Durazno/ciruela/cereza Valle de Uco. |
| `water_mm_cycle` monte_nativo | 350 | Algarrobo/monte: ~300–400 mm anual, orden de magnitud bibliográfico — **pendiente de validación local** | Uso hídrico del monte degradado vs conservado. |
| `frost_window` vid `cuyo` | 09-01 – 11-15 | Brotación–cuajado, sensible a helada tardía — **pendiente de validación local** | Ajustar por variedad y zona (Uco vs este). |
| `frost_window` olivo `cuyo` | 09-15 – 11-30 | Floración oct–nov — **pendiente de validación local** | — |
| `frost_window` frutal_carozo `cuyo` | 08-15 – 10-31 | Floración ago–sep muy sensible — **pendiente de validación local** | Cereza florece antes que durazno. |
| `rotatable: false` vid, olivo, frutal_carozo, monte_nativo | — | Perennes/cobertura nativa: el motor no debe proponer rotarlas — **pendiente de validación local** | — |
| `color`/`icon` de los 5 cultivos | hex + hint | Solo display; sin base agronómica — **pendiente de validación local** | — |
| `residue_t_ha` perennes | 0.0 con `residue_note` | Poda sin valor normalizado — **pendiente de validación local** | Contar carbono de poda/raíz. |
| `sowing`/`harvest`/`cycle_end` nuevos | ver crops.json | Calendario general Mendoza, no validado con EEA — **pendiente de validación local** | Especialmente ajo (siembra otoño). |

## Kc mid-season (task 40, ET0 fallback)

`kc_mid` por cultivo viene de FAO-56 tabla 12 (Allen et al., 1998) y se
usa solo cuando EVLAND/EVPTRNS no están disponibles y el agua de
cultivo se estima como ET0 × Kc. Valores representativos genéricos —
**pendiente de validación local** con Kc regionales (INTA/FAO para
Mendoza en vid/olivo/ajo pueden diferir por conducción y cobertura).

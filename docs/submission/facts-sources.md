# Mapeo figura → fuente (uso interno)

Archivo privado del equipo: cada número que aparece en `README.md`, `README.es.md`,
`video-script-es.md`, `slides-outline-es.md` y `checklist.md`, con el archivo del
repo de donde se copió. **No publicar.**

| Figura | Dónde aparece | Fuente (archivo → sección) |
|---|---|---|
| R² serie mundial mensual = 0,979 | README EN/ES validación, slides, video | `docs/validation/metrics.json` → `r2_global_monthly`; también `docs/metodo-fuego.md` → Validación y `pipeline/README.md` → Armonización |
| R² lineal celda res 3 × mes = 0,926 | README EN/ES validación, slides, video | `docs/validation/metrics.json` → `r2_linear`; `docs/metodo-fuego.md` → Validación |
| R² log1p celda res 3 × mes = 0,654 | README EN/ES validación, video | `docs/validation/metrics.json` → `r2`; `docs/metodo-fuego.md` → Validación |
| Sesgo total = −0,8 % | README EN/ES validación, slides | `docs/validation/metrics.json` → `bias_pct`; `docs/metodo-fuego.md` → Validación |
| Celdas-día: R² log1p 0,61 / sesgo +1,4 % | README EN/ES validación | `docs/validation/metrics.json` → `r2_cells_day`, `bias_pct_cells_day`; `pipeline/README.md` → Armonización |
| Entrenamiento 2012-02 → 2022-12, hold-out 2023–2024 | README EN/ES validación, video | `docs/validation/metrics.json` → `train`, `holdout`; `pipeline/README.md` → Armonización |
| 18 bandas × 12 meses = 216 estratos, 208 con datos | README EN/ES método, slides | `pipeline/README.md` → Armonización (paso 4); `docs/decisions.md` → D30 |
| 71 de 208 estratos con coeficientes globales (`low`) | README EN/ES método y limitaciones | `pipeline/README.md` → Armonización; `docs/metodo-fuego.md` → Armonización paso a paso |
| Umbral de 200 pares por estrato | README EN/ES método | `docs/metodo-fuego.md` → Armonización paso a paso (regla de baja confianza) |
| Factor S-NPP → NOAA-20 entre 0,98 y 1,0 en Argentina | README EN/ES método | `pipeline/README.md` → Armonización; `docs/metodo-fuego.md` → paso 2 |
| Serie final: MODIS 2000-11→2012-01 / S-NPP 2012-02→2018-03 / NOAA-20 2018-04→hoy | README EN/ES método, slides | `docs/metodo-fuego.md` → Serie final; `pipeline/README.md` → Armonización |
| ~568 millones de detecciones procesadas | README EN/ES método, slides | `docs/metodo-fuego.md` → Fuentes |
| Filtros: `type = 0`, MODIS conf ≥ 30, VIIRS `nominal`/`high` | README EN/ES método | `docs/metodo-fuego.md` → Limpieza; `docs/PRD.md` → 9.1 |
| Máscara NRT: descarta 5,7 % (NOAA-20 NRT) vs 8,6 % (SP) | README EN/ES método y limitaciones | `docs/metodo-fuego.md` → Limitaciones; `pipeline/README.md` → 2026 por la API |
| SP: MODIS hasta 2026-08-31, NOAA-20 hasta 2026-07-31 | README EN/ES tabla de datos | `pipeline/README.md` → 2026 por la API; `docs/metodo-fuego.md` → Fuentes |
| Hueco de Terra 2001-06-15 → 2001-07-03; junio 2001 a un tercio | README EN/ES limitaciones | `docs/metodo-fuego.md` → Limitaciones; `pipeline/README.md` → Armonización; `docs/decisions.md` → D30 |
| Tramo de baja confianza 2000-11 → 2012-01 | README EN/ES limitaciones, video | `docs/metodo-fuego.md` → Limitaciones; `docs/decisions.md` → D30 |
| Res 5 ≈ 253 km²; círculo de 50 km ≈ 31 celdas; res 3 ≈ 12.400 km² | README EN/ES método | `docs/metodo-fuego.md` → Grilla; `docs/decisions.md` → D9 |
| Celda POWER ≈ 55 × 60 km, altura media 2.485 m (Valle de Uco) | README EN/ES validación, video | `docs/validation/orin/README.md` → Por qué: la altura |
| Estaciones Orin a 1.000–1.500 m; sesgo −6,7 °C en máxima (Valle de Uco); 10 de 53 estaciones | README EN/ES validación, video, slides | `docs/validation/orin/README.md` → Por qué: la altura |
| 53 estaciones, 2026-10-04 → 2026-10-20, 742 pares por variable | README EN/ES validación y datos, video | `docs/validation/orin/README.md` → encabezado; `docs/validation/orin/metricas.json` |
| Tmax: RMSE 5,05 °C, sesgo −2,82 °C, r 0,63 | README EN/ES validación, video, slides | `docs/validation/orin/README.md` → Resultado; `docs/validation/orin/metricas.json` → `temp_max.crudo` |
| Tmin: RMSE 3,89 °C, sesgo −0,67 °C, r 0,46 | README EN/ES validación, video, slides | `docs/validation/orin/README.md` → Resultado; `docs/validation/orin/metricas.json` → `temp_min.crudo` |
| Sin las 10 estaciones de montaña: 3,32 / 2,31 °C | README EN/ES validación | `docs/validation/orin/README.md` → tabla Por qué |
| Corregido por altura (6,5 °C/km): 2,82 / 2,28 °C | README EN/ES validación, video, slides | `docs/validation/orin/README.md` → tabla Por qué; `docs/validation/orin/metricas.json` → `corregido_por_altura` |
| LightGBM ROC-AUC 0,920 / PR-AUC 0,427 / Brier 0,0302 | README EN/ES validación, video, slides | `model/fire_risk/report.md` → Test 2023-2025 |
| Climatología ROC-AUC 0,843 / PR-AUC 0,295 / Brier 0,0350 | README EN/ES validación, slides | `model/fire_risk/report.md` → Test 2023-2025 |
| Persistencia ROC-AUC 0,852 / PR-AUC 0,310 / Brier 0,0452 | README EN/ES validación | `model/fire_risk/report.md` → Test 2023-2025 |
| Test 2023–2025; train 7.031.862 / val 700.492 / test 2.101.476; tasa positiva 0,0476 | README EN/ES validación | `model/fire_risk/report.md` → encabezado |
| Calibración Platt (split 2022) | README EN/ES método | `model/fire_risk/report.md` → cuerpo |
| Regla riesgo mundial `p = min(0,95, clim × (1 + 2·A + B))` | README EN/ES método | `docs/metodo-fuego.md` → Qué se calcula; `pipeline/README.md` → Riesgo nivel historial |
| `fires_365d_complete` / hueco ene–oct 2026 en el historial | README EN/ES limitaciones | `model/fire_risk/report.md` → Known limitation |
| Corrientes ene+feb 2022: 33.255 focos | video, slides | `docs/case-study/README.md` → Números clave; `docs/case-study/numeros.json` → `province_jan_feb_2022` |
| Mediana ene+feb 2003–2022 Corrientes: 1.846 → 18× | video, slides | `docs/case-study/README.md` → Números clave; `docs/case-study/numeros.json` |
| Corrientes ene+feb 2021: 883 → ~38× el año anterior | video | `docs/case-study/README.md` → Números clave; `docs/case-study/numeros.json` |
| Celda Iberá `85a9441bfffffff`: pico feb-2022 = 416 (ene-2022 = 320); mediana feb = 0 | video, slides | `docs/case-study/README.md` → Números clave; `docs/decisions.md` → D27 |
| 15 cultivos, 12 rotaciones, 6 medidas | README EN/ES método, slides | `back/knowledge/README.md`; `docs/revision-agronomica.md` → encabezado |
| POWER 0,5° × 0,625°, 2001 → ayer; MERRA-2 + cola GEOS-IT | README EN/ES datos, limitaciones | `docs/data-contract.md` → 5.2; `docs/decisions.md` → D25 y Pendientes; `docs/validation/orin/README.md` → Limitaciones |
| IMERG pendiente (acuerdo GES DISC); la lluvia sale de NASA POWER | README EN/ES datos (no usado) | `web/src/content/datasets.ts` → `DATASETS_PENDING` |
| FAO GAEZ pendiente (paso manual de licencia) | README EN/ES datos (no usado) | `web/src/content/datasets.ts` → `DATASETS_PENDING` |
| SMAP SPL3SMP_E 9 km calculada pero rechazada por las pruebas de calidad; la tarjeta usa POWER `GWETROOT` | README EN/ES datos y limitaciones | `web/src/content/datasets.ts` → `DATASETS_PENDING`; `model/field_grid/smap_gate.py` |
| GRACE-FO 2018 → hoy | README EN/ES datos | `web/src/content/datasets.ts` → `DATASETS_USED` |
| ECOSTRESS ECO_L2T_LSTE LST 70 m, 2024–2025, solo lotes demo de Orin | README EN/ES datos | `web/src/content/datasets.ts` → `DATASETS_USED`; `model/field_grid/ecostress_demo.py` |
| Corrección por altura −6,5 °C/km aplicada a demanda en el diagnóstico | README EN/ES limitaciones | `docs/data-contract.md` → 4.2 (`temp_adjust_c`, `elevation_m`, `power_cell_elevation_m`); `model/field_grid/update_elevation.py` |
| Features del modelo de riesgo sin corrección por altura | README EN/ES limitaciones | `model/fire_risk/report.md` → Known limitation (elevation correction) |
| Escenarios climáticos = escalado simple de la serie POWER (lluvia ×(1+pct), T ± delta), no pronósticos | README EN/ES limitaciones | `back/README.md` → Climate scenarios (task 17A); `web/src/content/datasets.ts` → `LIMITATIONS` |
| Explicación IA: proveedor intercambiable, Gemini Flash por defecto, prompt sin coordenadas ni ids, validación de números y citas, fallback a plantillas | README EN/ES método | `back/README.md` → Optional AI explanation (task 19); `back/app/services/ai_explain.py` |
| MOD13C2 0,05° mensual para suelo desnudo; MOD13Q1 inviable | README EN/ES datos y limitaciones | `model/field_grid/README.md` → bare_soil_days_yr rule; `back/README.md` → Note (06) |
| SoilGrids 250 m (WCS 0–30 cm); ORNL/SolGrids > 15 s a demanda | README EN/ES datos y limitaciones | `back/README.md` → card sources y Note (03b)/(06); `docs/decisions.md` → Pendientes |
| SRTM ~30 m vía AWS Terrain Tiles | README EN/ES datos | `back/README.md` → card sources (`slope`) |
| MAGyP por departamento | README EN/ES datos | `docs/PRD.md` → 8.1; `docs/data-contract.md` → 2.8 |
| ~9 GB de zips FIRMS (~41 GB descomprimidos); ~70 GB de disco | README EN/ES cómo correr | `pipeline/README.md` → Requisitos; `docs/metodo-fuego.md` → Cómo reproducirlo |
| 20,2 M de focos 2026; 124 mil en Argentina | (contexto, no usado en piezas finales) | `pipeline/README.md` → 2026 por la API |
| Línea base 2003–2022; climatología semanal 52 valores | README EN/ES método | `docs/decisions.md` → D10; `pipeline/README.md` → Agregados |
| Escenarios lluvia −20 % / +1 °C | README EN/ES método y demo | `docs/PRD.md` → 7.4 |
| Umbral semáforo: percentiles <50 / 50–80 / 80–95 / >95; ventana 30 días | (contexto del semáforo) | `docs/decisions.md` → D9 |
| Riesgo categorías por ratio <0,75 / 0,75–1,5 / 1,5–3 / >3 | (contexto del semáforo) | `docs/data-contract.md` → 2.6 |
| Demo: finca ficticia de Mendoza (`/app/#demo`; persona inventada, ubicación y datos reales; sin rotaciones — viñedos/olivos) | README EN/ES demo, video, slides | `docs/decisions.md` → D33; `web/src/features/demo/mendozaFarm.ts` |
| 25 años de focos (2000 → hoy) | README EN/ES pitch | `docs/PRD.md` → 1; `docs/metodo-fuego.md` → El problema |
| MODIS 1 km desde 2000, se apaga 2026; VIIRS 375 m desde 2012 | README EN/ES problema | `docs/PRD.md` → 2; `docs/metodo-fuego.md` → El problema |
| ~300 M de focos que procesa la laptop (stack) | no usado (ver contradicciones: 568 M en metodo-fuego) | `docs/PRD.md` → 11 |
| Ingesta primera corrida: MODIS 111,4 M → 102,7 M; VIIRS 437,1 M → 358,9 M | no usado (contradice metodo-fuego, ver reporte) | `pipeline/README.md` → Números de la primera corrida |
| Limpieza final: MODIS 114,5 M → 105,4 M; VIIRS 454,1 M → 372,7 M | no usado (contradice pipeline/README, ver reporte) | `docs/metodo-fuego.md` → Limpieza |
| Ley 26.562; umbrales INTA (viento > 40 km/h, > 35 °C, HR < 30 %; motor > 600 °C; ~80 % focos en motor; 20–30 min limpieza; tanque ≥ 500 l) | slides (humano en el loop) | `docs/revision-agronomica.md` → §4; `back/knowledge/REVIEW.md` → Measures |
| GitHub Actions: solo job diario de riesgo (live sin cron) | checklist | `docs/decisions.md` → D6 (contradice PRD 11, ver reporte) |

## Figuras sin fuente en el repo (quedaron como `[PENDIENTE: ...]`)

- URL de la demo online.
- URL del video.
- Licencia del código (no hay archivo LICENSE en el repo).
- URL de descarga del dataset armonizado publicado (GitHub Release / Zenodo).
- ~Nombre del proyecto~ — resuelto: **Ashfield** (actualización del equipo tras el brief; brand en `web/public/brand/` y `tools/brand/`).

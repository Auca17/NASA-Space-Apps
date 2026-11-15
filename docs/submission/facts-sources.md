# Mapeo figura → fuente (uso interno)

Archivo privado del equipo: cada número que aparece en `README.md`, `README.es.md`,
la landing (`web/src/landing/content.ts`), `video-script-es.md`, `video-script.md`,
`slides-outline-es.md` y `checklist.md`, con el archivo del repo de donde se copió.
**No publicar.**

La sección 1 cubre solo lo que está en la entrega (Field Shift). La sección 2
guarda los números del pipeline de fuego que quedan en el repo pero **fuera de
esta entrega** (D34) — se citan únicamente en el apartado "Fuera de la entrega"
de las slides y en la línea de puntero del README.

## 1. Cifras de la entrega — Field Shift

| Figura | Dónde aparece | Fuente (archivo → sección) |
|---|---|---|
| 53 estaciones, 2026-10-04 → 2026-10-20, 742 pares por variable | README EN/ES validación y datos, landing (trust), video, slides | `docs/validation/orin/README.md` → encabezado; `docs/validation/orin/metricas.json` |
| Tmax: RMSE 5,05 °C, sesgo −2,82 °C, r 0,63 | README EN/ES validación, landing, video, slides | `docs/validation/orin/README.md` → Resultado; `docs/validation/orin/metricas.json` → `temp_max.crudo` |
| Tmin: RMSE 3,89 °C, sesgo −0,67 °C, r 0,46 | README EN/ES validación, landing, video, slides | `docs/validation/orin/README.md` → Resultado; `docs/validation/orin/metricas.json` → `temp_min.crudo` |
| Corregido por altura (6,5 °C/km): 2,82 / 2,28 °C | README EN/ES validación, landing, video, slides | `docs/validation/orin/README.md` → tabla Por qué; `docs/validation/orin/metricas.json` → `corregido_por_altura` |
| Celda POWER ≈ 55 × 60 km, altura media 2.485 m (Valle de Uco); estaciones Orin a 1.000–1.500 m; 10 de 53 en montaña | README EN/ES validación, video, slides | `docs/validation/orin/README.md` → Por qué: la altura |
| 25 estaciones INTA SIGA, 1.346 estación-meses, 2015–2024 | README EN/ES validación, landing, video, slides | `docs/validation/rain-siga/README.md` → encabezado; `docs/validation/rain-siga/validation.json` |
| IMERG: sesgo +22,1 mm/mes, RMSE 51,2, r 0,59 | README EN/ES validación, landing, video, slides | `docs/validation/rain-siga/validation.json` → `imerg` |
| POWER: sesgo +22,4 mm/mes, RMSE 49,4, r 0,62 | README EN/ES validación, landing, video, slides | `docs/validation/rain-siga/validation.json` → `power` |
| Sesgo húmedo concentrado en Mendoza, punto vs. píxel | README EN/ES validación y limitaciones, landing, slides | `docs/validation/rain-siga/README.md` → lectura |
| 15 cultivos, 12 rotaciones, 6 medidas | README EN/ES método, slides | `back/knowledge/README.md`; `docs/revision-agronomica.md` → encabezado |
| 8 riesgos ordenables por el productor | README EN/ES demo, landing, video, slides | `web/src/i18n/es.json`, `web/src/i18n/en.json` → hazards; `back/app/services/hazards.py` |
| Grilla de campo: celdas H3 res 5, shards res 2 (`field/grid/{h3_r2}.json`) | README EN/ES método, landing (F8), slides | `docs/data-contract.md` → 3 (grilla de campo); `model/field_grid/` |
| POWER 0,5° × 0,625° diario, 2001 → ayer; MERRA-2 + cola GEOS-IT | README EN/ES datos y limitaciones, landing (F8) | `docs/data-contract.md` → 5.2; `docs/decisions.md` → D25 y Pendientes; `docs/validation/orin/README.md` → Limitaciones |
| GPM IMERG 0,1° mensual (lluvia de la grilla de campo) | README EN/ES datos, landing (F8) | `web/src/content/datasets.ts` → `DATASETS_USED`; `model/field_grid/` |
| MODIS NDVI MOD13C2 0,05° mensual para suelo desnudo; MOD13Q1 inviable | README EN/ES datos y limitaciones, landing (F8) | `model/field_grid/README.md` → bare_soil_days_yr rule; `back/README.md` → Note (06) |
| SoilGrids 250 m (WCS 0–30 cm); ORNL/SoilGrids > 15 s a demanda | README EN/ES datos y limitaciones, landing (F8) | `back/README.md` → card sources y Note (03b)/(06); `docs/decisions.md` → Pendientes |
| SRTM ~30 m vía AWS Terrain Tiles (pendiente) | README EN/ES datos, landing (F8) | `back/README.md` → card sources (`slope`) |
| Sentinel-2 L2A ~20 m a demanda (cultivo en curso) | README EN/ES datos y método, landing (F8) | `back/app/services/current_crop.py` → fuente "Sentinel-2 L2A (ESA Copernicus)" |
| MAGyP por departamento | README EN/ES datos | `docs/PRD.md` → 8.1; `docs/data-contract.md` → 2.8 |
| GRACE-FO 2018 → hoy | README EN/ES datos | `web/src/content/datasets.ts` → `DATASETS_USED` |
| ECOSTRESS ECO_L2T_LSTE LST 70 m, 2024–2025, solo lotes demo de Orin | README EN/ES datos | `web/src/content/datasets.ts` → `DATASETS_USED`; `model/field_grid/ecostress_demo.py` |
| OpenStreetMap para agua y distancia a servicios; puede fallar por timeout → `incomplete` | README EN/ES datos y limitaciones, landing (F8) | `back/app/routers/geocode.py`, `back/app/services/georef.py`; bandera `incomplete` en `/api/field/diagnose` |
| Capas de campo precalculadas solo en Argentina; fuera de Argentina, capa por punto a demanda | README EN/ES limitaciones, landing (F8 y límites) | `docs/data-contract.md` → 3; `back/README.md` → field grid coverage |
| FIRMS historial por lote (riesgo de fuego por parcela + alertas + aviso n8n planeado) | README EN/ES datos | `back/app/services/firms.py`, `back/app/services/field_moisture.py`; `ops/n8n/` (planeado) |
| Corrección por altura −6,5 °C/km aplicada a demanda en el diagnóstico | README EN/ES limitaciones | `docs/data-contract.md` → 4.2 (`temp_adjust_c`, `elevation_m`, `power_cell_elevation_m`); `model/field_grid/update_elevation.py` |
| Evaporación (`EVLAND`) + ET0 FAO-56 Penman-Monteith con fallback Hargreaves donde POWER está enmascarado; Kc FAO genérico pendiente de revisión local | README EN/ES demo y limitaciones, landing (F1) | `back/app/services/et0.py`, `back/app/services/crop_water.py`; prueba en vivo `/api/field/diagnose` → tarjetas `evaporation`/`crop_water` |
| Infiltración por parcela y por alternativa (grupos hidrológicos USDA; textura SoilGrids, materia orgánica, pendiente, días de suelo desnudo); relativa y cualitativa | README EN/ES demo y limitaciones, landing (F6), slides | `back/app/services/infiltration.py`; prueba en vivo `/api/field/diagnose` → tarjeta `infiltration`, `/api/field/rotations` |
| SMAP SPL3SMP_E 9 km calculada pero rechazada por las pruebas de calidad; la tarjeta usa POWER `GWETROOT` | README EN/ES datos y limitaciones | `web/src/content/datasets.ts` → `DATASETS_PENDING`; `model/field_grid/smap_gate.py` |
| FAO GAEZ pendiente (paso manual de licencia) | README EN/ES datos (no usado) | `web/src/content/datasets.ts` → `DATASETS_PENDING` |
| Escenarios climáticos = escalado simple de la serie POWER (lluvia ×(1+pct), T ± delta), no pronósticos | README EN/ES limitaciones | `back/README.md` → Climate scenarios (task 17A); `web/src/content/datasets.ts` → `LIMITATIONS` |
| Explicación IA: Gemini Flash por defecto, prompt sin coordenadas ni ids, validación de números y citas, fallback a plantillas; requiere clave del servidor | README EN/ES método, landing (F7) | `back/README.md` → Optional AI explanation (task 19); `back/app/services/ai_explain.py` |
| Granizo: sin dato satelital — la app lo dice | README EN/ES limitaciones, landing (límites), slides | `back/app/services/hazards.py`; `web/src/i18n/es.json` |
| El Niño/La Niña = tendencia histórica NOAA CPC ONI, no pronóstico | README EN/ES limitaciones, landing (límites) | `back/app/services/enso.py` |
| Historial de focos por parcela incompleto fuera de las capas precalculadas | README EN/ES limitaciones, landing (límites) | `back/app/services/firms.py`, `back/app/services/field_moisture.py` |
| Márgenes bruto por parcela: referenciales (MAGyP), no contabilidad | README EN/ES limitaciones, landing | `back/README.md` → parcels; `docs/PRD.md` → 8.1 |
| Infiltración cualitativa / indicadores relativos que ordenan alternativas, no predicen rindes | README EN/ES limitaciones, landing, slides | `back/app/services/rotations.py`, `back/app/services/infiltration.py` |
| Demo: finca ficticia de Mendoza (`/app/#demo`; persona inventada, ubicación y datos reales; sin rotaciones — viñedos/olivos) | README EN/ES demo, landing, video, slides | `docs/decisions.md` → D33; `web/src/features/demo/mendozaFarm.ts` |
| Rotaciones solo por "Analizar mi campo" en un punto de zona de granos (la finca demo no rota) | README EN/ES demo, video, slides | `web/src/features/field/FieldLens.tsx`; verificado en vivo: `/api/field/diagnose` → `/api/field/rotations` devuelve 4 estrategias en la pampa |
| Alerta de fuego + bloque de servicios de emergencia con teléfonos clicables (la app nunca marca sola) | README EN/ES demo, landing, video | `back/app/routers/parcels.py`; `web/src/features/field/` |
| Ley 26.562; umbrales INTA (viento > 40 km/h, > 35 °C, HR < 30 %; motor > 600 °C; ~80 % focos en motor; 20–30 min limpieza; tanque ≥ 500 l) | slides (humano en el loop), README (medidas INTA en la app) | `docs/revision-agronomica.md` → §4; `back/knowledge/REVIEW.md` → Measures |
| Escenarios lluvia −20 % / +1 °C | README EN/ES método | `docs/PRD.md` → 7.4 |
| Alertas n8n **planeadas**: workflows existen, entrega probada en sandbox, notificaciones todavía no integradas a la app | README EN/ES, slides ("Fuera de la entrega") | `ops/n8n/`; `docs/ideas/alerts-and-identity.md` |
| Estado F1/F6 = done; F10 = parcial (sin muestras NDVI/humedad de suelo) | landing (tabla de requisitos) | Verificado en vivo contra `localhost:8000` (`evaporation`, `crop_water`, `infiltration` en `/api/field/diagnose`); `docs/validation/orin/`, `docs/validation/rain-siga/` |

## 2. Fuera de la entrega — pipeline de fuego que queda en el repo

Estos números **no aparecen como afirmaciones del producto** en la entrega. Se
conservan aquí porque el apéndice de slides y la línea de puntero del README los
referencian como trabajo de repo (D34). Pipeline en `pipeline/`, modelo en
`model/fire_risk/`.

| Figura | Fuente (archivo → sección) |
|---|---|
| R² serie mundial mensual = 0,979 · R² lineal celda = 0,926 · R² log1p = 0,654 · sesgo −0,8 % | `docs/validation/metrics.json`; `docs/metodo-fuego.md` → Validación |
| Entrenamiento 2012-02 → 2022-12, hold-out 2023–2024 | `docs/validation/metrics.json` → `train`, `holdout` |
| 18 bandas × 12 meses = 216 estratos, 208 con datos; 71 con coeficientes globales (`low`); umbral de 200 pares | `pipeline/README.md` → Armonización; `docs/metodo-fuego.md`; `docs/decisions.md` → D30 |
| ~568 millones de detecciones procesadas | `docs/metodo-fuego.md` → Fuentes |
| Serie final: MODIS 2000-11→2012-01 / S-NPP 2012-02→2018-03 / NOAA-20 2018-04→hoy | `docs/metodo-fuego.md` → Serie final |
| Tramo de baja confianza 2000-11 → 2012-01; hueco de Terra 2001-06→07 | `docs/metodo-fuego.md` → Limitaciones; `docs/decisions.md` → D30 |
| Modelo de riesgo: LightGBM ROC-AUC 0,920 vs. climatología 0,843 (test 2023–2025) | `model/fire_risk/report.md` → Test 2023-2025 |
| `fires_365d_complete` / hueco ene–oct 2026 en el historial | `model/fire_risk/report.md` → Known limitation |
| Corrientes ene+feb 2022: 33.255 focos, 18× la mediana; celda Iberá pico feb-2022 = 416 | `docs/case-study/README.md` → Números clave; `docs/case-study/numeros.json` |
| ~9 GB de zips FIRMS (~41 GB descomprimidos); ~70 GB de disco | `pipeline/README.md` → Requisitos |
| Línea base 2003–2022; climatología semanal; umbrales semáforo <50/50–80/80–95/>95 | `docs/decisions.md` → D9, D10; `docs/data-contract.md` → 2.6 |

## Figuras sin fuente en el repo (quedaron como `[PENDIENTE: ...]`)

- URL de la demo online.
- URL del video.
- URL de descarga del dataset armonizado publicado (GitHub Release / Zenodo).
- ~Licencia del código~ — resuelto: MIT, `LICENSE` en el repo.
- ~Nombre del proyecto~ — resuelto: **Ashfield** (brand en `web/public/brand/` y
  `tools/brand/`).

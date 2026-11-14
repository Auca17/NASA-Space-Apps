# Contrato de datos — v0

Qué produce cada parte del sistema y qué espera la otra. Cuatro productores trabajan en paralelo sin verse (pipeline de fuego, conocimiento agronómico, modelos de Devin, back a demanda) y un consumidor (front). Este documento es el plano común.

Los ejemplos reales de cada archivo están en `fixtures/`, con celdas H3 válidas (Corrientes y Pergamino) y valores inventados. El front puede arrancar con ellos desde el minuto uno.

Decisiones que lo sustentan: `docs/decisions.md` (D2, D4, D5, D7, D9, D10, D12, D16, D18).

---

## 1. Convenciones

| Tema | Regla |
|---|---|
| Versionado | Todo lo estático vive bajo el prefijo `v1/`. Un cambio incompatible crea `v2/`; nunca se pisa un archivo publicado. |
| Ubicación | Cloudflare R2, bucket público con CDN. URL base en el front: `DATA_BASE_URL` (variable de entorno). Rutas de este documento son relativas a `v1/`. |
| H3 | Índices como string hexadecimal de 15 caracteres. Res 2 = unidad de archivo (shard). Res 3 = globo. Res 5 = panel, riesgo, campo. Res 6 = caché de APIs. |
| Fechas | Meses `YYYY-MM`. Días `YYYY-MM-DD`. Instantes en UTC ISO 8601 (`2026-11-15T03:00:00Z`). En series diarias comprimidas, el día es un entero: días desde `2000-01-01`. |
| Conteos de fuego | Campo `n`: detecciones armonizadas, **equivalente VIIRS NOAA-20**, número decimal con 1 decimal. Los crudos (`raw`) son enteros. |
| Línea base | 2003-01 → 2022-12 (D10). Toda mediana, percentil o climatología sale de ahí. |
| Confianza | Donde aplica, `confidence`: `high` \| `medium` \| `low`. Los períodos de baja confianza globales están en `meta.json`. |
| Idioma | Claves en inglés. Textos para el usuario (razones, etiquetas) en español neutro; el front traduce con i18n cuando haga falta. |
| Nulos | Un dato ausente es `null`, nunca `0` ni `""`. |
| Compresión | JSON se sirve con `Content-Encoding: gzip` o `br` desde R2. CSV se publica ya comprimido (`.csv.gz`). |
| Tamaño objetivo | Ningún archivo que el front cargue en el primer render supera **300 KB comprimido**. Un shard bajo demanda no supera **800 KB comprimido**; si lo hace, el productor lo reporta y se decide (ver `fire/daily`). |

---

## 2. Archivos estáticos (R2)

### 2.1 `meta.json`

Productor: pipeline de fuego. Consumidor: front, Devin, README. Se carga siempre primero.

| Campo | Tipo | Significado |
|---|---|---|
| `version` | string | Prefijo de versión del contrato (`v1`). |
| `generated_at` | instante | Fecha de la última exportación. |
| `units.n` | string | Texto de la unidad de `n`. |
| `range.start`, `range.end` | mes | Primer y último mes con datos. |
| `baseline.start`, `baseline.end` | mes | Línea base (D10). |
| `h3.globe`, `h3.panel`, `h3.shard`, `h3.cache` | int | Resoluciones H3 en uso (3, 5, 2, 6). |
| `harmonization` | objeto | `unit`, `method`, `overlap`, `holdout`, `validation.{r2, bias_pct, r2_cells_day}`. Va al README y al video. |
| `low_confidence_periods` | lista de `[mes, mes]` | Tramos de menor confianza (2000-11 → 2011-12). |
| `sp_until` | objeto | Último día con datos Standard Processing por sensor; de ahí en adelante es NRT. |
| `semaphore` | objeto | `window_days` (30), `categories` con rangos de percentil, `ratio_min_median` (5). Parámetros de D9 para que el front no los tenga hardcodeados. |

Ejemplo: `fixtures/meta.json`.

### 2.2 `globe/{YYYY-MM}.json`

Productor: pipeline de fuego. Consumidor: front (animación del globo). Un archivo por mes, ~300 archivos. Solo celdas con `n > 0`.

```json
{ "month": "2022-02", "cells": [["83a963fffffffff", 1842.5], ["83c2e8fffffffff", 37.0]] }
```

`cells` es una lista de pares `[h3_r3, n]`. Lista y no objeto para que pese menos. Objetivo: ≤ 60 KB comprimido por mes; el front precarga los meses siguientes al reproducir.

### 2.3 `fire/cal/{h3_r2}.json`

Productor: pipeline de fuego. Consumidor: front (calendario, estacionalidad, focos por año, CSV agregado) y riesgo mundial (D7). Un archivo por shard res 2 que tenga algún foco. Contiene solo las celdas res 5 del shard con algún foco en la serie.

```json
{
  "shard": "82a967fffffffff",
  "months": ["2000-11", "2000-12", "..."],
  "cells": {
    "85a963c3fffffff": {
      "m": [0, 2.3, 41.0, "..."],
      "clim": [0.05, 0.05, "...52 valores..."],
      "lc": "grass"
    }
  }
}
```

| Campo | Tipo | Significado |
|---|---|---|
| `months` | lista de meses | Índice compartido por todas las series `m` del archivo. |
| `cells[h].m` | lista de decimales | `n` mensual, misma longitud que `months`. Ceros incluidos. |
| `cells[h].clim` | lista de 52 decimales | Climatología semanal: fracción de los años de la línea base con ≥ 1 foco en esa semana del año. Base del riesgo mundial (D7). |
| `cells[h].lc` | string \| null | Cobertura dominante MCD12C1: `crop` \| `forest` \| `grass` \| `shrub` \| `other`. `null` hasta que exista (D3). |

El front suma las celdas del área elegida (círculo de 50 km, polígono o celda bajo la retícula) con `h3-js` y arma el calendario. El CSV "serie agregada" se genera en el navegador desde estas series.

Ejemplo: `fixtures/fire/cal/82a967fffffffff.json`.

### 2.4 `fire/daily/{h3_r2}.json`

Productor: pipeline de fuego. Consumidor: front (semáforo del mes, D9). Se carga solo cuando el usuario fija un área. Series diarias comprimidas: solo los días con fuego.

```json
{
  "shard": "82a967fffffffff",
  "epoch": "2000-01-01",
  "cells": { "85a963c3fffffff": { "d": [[9420, 1.2], [9421, 4.0]] } }
}
```

`d` es una lista de pares `[días desde epoch, n]` ordenada por fecha, desde 2003-01-01 hasta el último día disponible (incluido NRT). El front suma las celdas del área, construye las sumas móviles de 30 días para la línea base y calcula los percentiles de D9.

**Presupuesto y punto de corte.** Este es el archivo con más riesgo de peso. El pipeline reporta el tamaño comprimido del percentil 95 de los shards. Si supera 800 KB, se decide entre: (a) partir por década (`fire/daily/{h3_r2}/{2003-2012}.json`), o (b) pasar D9 a percentiles mensuales. Lo que se decida se anota en `docs/decisions.md`.

Ejemplo: `fixtures/fire/daily/82a967fffffffff.json`.

### 2.5 `fire/points/{h3_r2}/{YYYY}.csv.gz`

Productor: pipeline de fuego. Consumidor: front (descarga de focos crudos). Solo shards de Argentina (D5). Una fila por detección, ya filtrada (`type = 0`, confianza según PRD 9.1).

| Columna | Tipo | Ejemplo |
|---|---|---|
| `acq_date` | día | `2022-02-14` |
| `acq_time` | string `HHMM` UTC | `0542` |
| `lat`, `lon` | decimal, 4 decimales | `-28.5123` |
| `sensor` | `MODIS` \| `VIIRS` | |
| `satellite` | `T` \| `A` \| `N` \| `N20` \| `N21` | Terra, Aqua, S-NPP, NOAA-20, NOAA-21 |
| `frp` | decimal, MW | `42.3` |
| `confidence` | MODIS: entero 0–100; VIIRS: `nominal` \| `high` | |
| `daynight` | `D` \| `N` | |
| `h3_r5` | string | Celda res 5 del punto |

Ejemplo: `fixtures/fire/points/82a967fffffffff/2022.csv.gz`.

### 2.6 `risk/{h3_r2}.json`

Productores: **pipeline de fuego** escribe el nivel mundial (`level: "historial"`, D7) para todos los shards; **Devin** sobreescribe los shards de Argentina con el modelo (`level: "clima"`) en el job diario. Consumidor: front y `/api/risk`.

```json
{
  "generated_at": "2026-11-15T06:00:00Z",
  "horizon_days": 7,
  "cells": {
    "85a963c3fffffff": {
      "p": 0.31, "clim": 0.12, "ratio": 2.6, "cat": "alto", "level": "clima",
      "model_version": "ar-lgbm-0.1",
      "reasons": ["23 días sin lluvia", "humedad relativa 28 %", "temporada de quemas"]
    }
  }
}
```

| Campo | Tipo | Significado |
|---|---|---|
| `p` | decimal 0–1 | Probabilidad de ≥ 1 foco en la celda en los próximos 7 días. |
| `clim` | decimal 0–1 | Climatología para esa semana del año (línea base). |
| `ratio` | decimal | `p / clim`. Si `clim < 0.01`, `ratio` es `null` y `cat` sale de `p` solo. |
| `cat` | `bajo` \| `moderado` \| `alto` \| `muy_alto` | Por ratio: < 0,75 / 0,75–1,5 / 1,5–3 / > 3. |
| `level` | `historial` \| `clima` | Qué nivel produjo el valor. El front lo muestra ("según historial" / "+ clima de los últimos días"). |
| `model_version` | string | Identifica el modelo o la regla. |
| `reasons` | lista de 2–3 strings | Razones en español neutro, listas para mostrar. Del modelo salen de SHAP; del nivel historial, de la climatología y la persistencia. |

Ejemplo: `fixtures/risk/82a967fffffffff.json`.

### 2.7 `field/grid/{h3_r2}.json`

Productor: pipeline de campo (D16: Argentina y lotes de demo primero; mundial como meta extendida). Consumidor: `/api/field/diagnose`. Cada valor lleva su fuente y resolución (PRD 9.4).

```json
{
  "shard": "82c2effffffffff",
  "cells": {
    "85c2e8bbfffffff": {
      "rain_mm_yr": 980, "rain_cv": 0.21, "rain_p25_mm": 790, "heavy_days_yr": 5,
      "sm_anom_pct": -18, "sm_updated": "2026-11-10",
      "frost_free": {"start": "10-15", "end": "04-20"},
      "hot_days_gt35": 9, "grace_trend": "down",
      "gaez": {"soja": "S1", "maiz": "S1"}, "lc": "crop",
      "src": { "rain": {"dataset": "GPM IMERG", "resolution": "0.1°", "period": "2001-2025"} }
    }
  }
}
```

| Campo | Tipo | Fuente prevista |
|---|---|---|
| `rain_mm_yr`, `rain_cv`, `rain_p25_mm`, `heavy_days_yr` | decimales | IMERG (lluvia anual media, coeficiente de variación, percentil 25, días > 50 mm) |
| `sm_anom_pct`, `sm_updated` | decimal, día | SMAP L3 (anomalía de humedad vs. línea base) |
| `frost_free.start`, `frost_free.end` | `MM-DD` | POWER T2M_MIN |
| `hot_days_gt35` | entero | POWER T2M_MAX |
| `grace_trend` | `up` \| `flat` \| `down` \| null | GRACE-FO regional |
| `gaez` | objeto cultivo → clase `S1`..`N` | FAO GAEZ v4 |
| `lc` | string \| null | MCD12C1 |
| `src` | objeto | Para cada grupo: `dataset`, `resolution`, `period`. Obligatorio. |

Cualquier campo puede faltar (`null`) donde la capa no esté precalculada; el back completa con APIs por punto.

Ejemplo: `fixtures/field/grid/82c2effffffffff.json`.

### 2.8 `field/analogs/{h3_r2}.json`

Productor: Devin. Consumidor: `/api/field/rotations` (sección "Evidencia").

| Campo | Tipo | Significado |
|---|---|---|
| `cells[h].cluster` | entero | Id del grupo de zonas análogas. |
| `cells[h].label` | string | Descripción corta en español neutro. |
| `cells[h].n_cells` | entero | Cuántas celdas res 5 hay en el grupo. |
| `cells[h].ar_crops` | lista | Solo Argentina: `{crop, share, yield_kg_ha, src}` desde MAGyP. |

Ejemplo: `fixtures/field/analogs/82c2effffffffff.json`.

---

## 3. Conocimiento agronómico (en el repo)

Ruta: `back/knowledge/`. Productor: responsable de la lente Campo. Consumidor: motor de rotaciones. Cada dato numérico lleva `sources`.

### 3.1 `crops.json`

| Campo | Tipo | Significado |
|---|---|---|
| `id` | string | Identificador estable en minúsculas sin acentos (`soja`, `maiz`). |
| `name.es`, `name.en` | string | Nombre para mostrar. |
| `family` | string | Familia botánica (corte de ciclos de plagas). |
| `sowing[zona]`, `harvest[zona]` | `[MM-DD, MM-DD]` | Ventanas por zona (`pampa_humeda`, `nea`, `noa`, `cuyo`, `patagonia`). |
| `gdd_base10` | entero | Grados-día base 10 °C del ciclo. |
| `frost_tolerance`, `drought_tolerance`, `heat_tolerance` | `low` \| `medium` \| `high` | |
| `water_mm_cycle` | entero | Uso de agua del ciclo. |
| `root_depth_cm` | entero | |
| `n_fixation` | bool | |
| `residue_t_ha` | decimal | Aporte de rastrojo. |
| `forage` | bool | |
| `market_ar` | `low` \| `medium` \| `high` | Cualitativo. |
| `sources` | lista de strings | Obligatorio. |

### 3.2 `rotations.json`

| Campo | Tipo | Significado |
|---|---|---|
| `id`, `name.es`, `name.en` | | |
| `years` | entero | Duración del ciclo. |
| `sequence` | lista de `{crop, start, end}` | `crop` referencia a `crops.json`; `start`/`end` en `MM-DD`. |
| `bare_soil_days` | entero | Días de suelo desnudo por año, estimados. |
| `sources` | lista | Obligatorio. |

Ejemplos: `fixtures/knowledge/crops.json`, `fixtures/knowledge/rotations.json`.

---

### 3.3 `measures.json` (D26)

Medidas de prevención de incendios. Productor del contenido: Augustus (fuente INTA). Por medida: `id`; `name.es`, `name.en`; `factor` (`machine_ignition` | `spread_boundary` | `residue_burning` | `initial_attack` | otro documentado); `addresses` (qué problema atiende, una frase); `benefit` (beneficio esperado, una frase); `requires` = `{people, machinery, downtime_h, cost: low|medium|high}`; `triggers` (lista de ids de regla: `harvest_in_dry_season`, `fire_weather_high`, `risk_high`, `bare_soil_in_burn_season`, `burn_season_now`); `sources` (obligatorio).

## 4. Back a demanda (FastAPI en Vercel Hobby, D18)

Restricciones de diseño: llamadas externas en paralelo con timeout de 3 s cada una; caché por celda H3 res 6 + día; si una fuente falla, la tarjeta correspondiente vuelve con `value: null` y `confidence: "low"`, nunca se cae el pedido completo.

### 4.1 `GET /api/live?window=24h|48h|7d&bbox=minLon,minLat,maxLon,maxLat`

Proxy a FIRMS NRT. Caché `s-maxage=10800`. Respuesta:

```json
{ "updated_at": "2026-11-14T12:00:00Z", "window_h": 24,
  "sources": ["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "VIIRS_SNPP_NRT", "MODIS_NRT"],
  "points": [[-28.51, -57.79, 42.3, "N20", "2026-11-14T05:12Z"]] }
```

`points`: `[lat, lon, frp, satellite, acq_instant]`. Ejemplo: `fixtures/api/live.response.json`.

Agregado 2026-11-14 (compatible, D22):

- El `bbox` pedido se expande hacia afuera a múltiplos de 5° antes de consultar FIRMS, para que la caché del CDN se reutilice entre usuarios. La respuesta incluye `bbox` con el valor efectivo.
- Campo `mode`: `points` o `cells`. Si el área del bbox efectivo supera 400 grados cuadrados (vista continental o mundial), la respuesta trae `cells` en lugar de `points`: lista de `[h3_r3, count, max_frp]`. El front dibuja hexágonos en vista lejana y puntos al acercarse.
- La respuesta nunca supera 4 MB sin comprimir.
- Formato real de FIRMS NRT: la confianza VIIRS viene como `l` / `n` / `h`, y el satélite MODIS como `Terra` / `Aqua`. El back normaliza a los códigos de este contrato.

### 4.2 `POST /api/field/diagnose`

Entrada: `{ "polygon": <GeoJSON Polygon> }` o `{ "point": [lat, lon], "ha": 50 }`.

Salida (`fixtures/api/diagnose.response.json`):

| Campo | Significado |
|---|---|
| `diagnosis_id` | Id para encadenar con `/rotations`. |
| `area_ha`, `centroid`, `h3_r5`, `h3_r6` | Geometría resuelta. |
| `cards[]` | Tarjetas de diagnóstico: `id`, `value`, `unit`, `text`, `source`, `resolution`, `confidence`. Ids previstos: `rain`, `heavy_rain`, `soil_moisture`, `frost`, `heat`, `crop_water`, `vigor_bare_soil`, `slope`, `soil`, `water_trend`, `fire`. |
| `calendar.months` | 12 etiquetas. |
| `calendar.rows[]` | `id`, `label`, `levels` (12 enteros 0–3). Filas previstas: `bare_soil`, `frost`, `water_stress`, `heat`, `burn_season`, `current_rotation`. |
| `calendar.scale` | Significado de 0–3. |

### 4.3 `POST /api/field/rotations`

Entrada: `{ "diagnosis": <respuesta completa de /api/field/diagnose>, "current": {"rotation_id" | "sequence": [...] | null}, "priorities": {<clave>: 0-5}, "constraints": {"irrigation": bool, "machinery": [...], "livestock": bool, "markets": [...]} }`.

Cambio 2026-11-14 (D23): se manda el diagnóstico completo y no solo `diagnosis_id`, porque las funciones serverless no comparten memoria entre instancias. `diagnosis_id` queda como identificador para logs y caché.

Claves de `priorities`: `water`, `soil`, `erosion`, `income`, `forage`, `nitrogen`, `pests`, `avoid_burning`.

Salida (`fixtures/api/rotations.response.json`): `strategies[]` con exactamente 4 elementos (la actual con `is_current: true` y 3 alternativas), cada uno con las cinco secciones del brief: `why`, `evidence[]` (`text`, `indicator`, `source`), `benefits` (indicadores comparados con la actual), `gaps[]`, `risks[]`; más `sequence`, `score` y `disclaimer` global.

### 4.4 `GET /api/risk?lat&lon`

Devuelve el objeto de la celda res 5 de `risk/{h3_r2}.json` más `h3_r5` y `generated_at`.

### 4.5 `POST /api/field/explain` (Could)

Entrada: la salida de `/rotations`. Salida: `{ "strategies": [{"id", "text"}] }`. Primero plantillas desde los indicadores; LLM solo si se decide (ver pendientes en `decisions.md`). Cada afirmación debe citar un `indicator`.

### 4.6 Medidas de prevención en las respuestas (D26, compatible)

`/api/field/diagnose`, `/api/risk` y cada estrategia de `/api/field/rotations` agregan `measures`: lista de `{id, name, factor, why, benefit, requires, cost, source}` donde `why` cita los valores que dispararon la medida. Más `measures_gaps`: reglas que no se evaluaron por falta de datos. El diagnóstico agrega la tarjeta `fire_weather` (humedad, viento y temperatura de los últimos 7 días, días sin lluvia; nivel `bajo` | `moderado` | `alto`).

Modo live (front): cada foco muestra la hora de detección y el texto fijo "Detección térmica satelital: no es un incendio confirmado y llega con horas de demora", más los teléfonos de emergencia del país.

---

## 5. Entre pipeline y Devin (archivos de trabajo, fuera de git)

Ruta local: `data/processed/model_input/`. Productor: pipeline de fuego. Consumidor: Devin (D12).

### 5.1 `fires_ar_r5_daily.parquet`

| Columna | Tipo | Significado |
|---|---|---|
| `h3_r5` | string | |
| `date` | date | Día UTC |
| `n_raw` | int32 | Detecciones crudas filtradas |
| `n` | float32 | Detecciones armonizadas (D2) |
| `n_cells_day` | int16 | Celdas res 6 hijas con fuego ese día (control) |
| `sensor_mix` | string | `MODIS` \| `VIIRS` \| `MIXED` |

Cobertura: Argentina, 2012-01-01 → último día disponible. Todas las combinaciones celda × día con fuego; las ausentes son 0.

### 5.2 `power_ar_daily.parquet` (lo produce Devin, D8)

| Columna | Tipo | Significado |
|---|---|---|
| `lat`, `lon` | float32 | Centro del punto de grilla MERRA-2 (0,5° × 0,625°) |
| `h3_r5` | string | Celda res 5 más cercana al punto |
| `date` | date | |
| `T2M_MAX`, `T2M_MIN`, `RH2M`, `WS2M`, `PRECTOTCORR` | float32 | Variables POWER diarias |

Cobertura: Argentina, 2012-01-01 → ayer.

### 5.3 Salidas de Devin

- `model/fire_risk/model.txt`, `report.md` (métricas ROC-AUC, PR-AUC, Brier, calibración, comparación con climatología en hold-out 2023–2024).
- `model/fire_risk/predict.py` → escribe `risk/{h3_r2}.json` (sección 2.6) para los shards de Argentina.
- `model/analogs/` → `field/analogs/{h3_r2}.json` (sección 2.8).

---

## 6. Validación

Antes de integrar, cada productor verifica contra este documento: nombres de archivo, claves, tipos, unidades, `null` donde falte un dato, y tamaño comprimido dentro del presupuesto. El integrador repite la verificación al recibir cada entrega. Un validador automático (JSON Schema) es tarea candidata para Devin si el tiempo lo permite.

## 7. Cambios

Un cambio incompatible crea `v2/` y se anota en `docs/decisions.md`. Un cambio compatible (campo nuevo opcional) se agrega acá con la fecha.

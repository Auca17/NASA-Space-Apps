# Ashfield — Field Shift: Adapting Farms with NASA Data

![Ashfield](web/public/brand/ashfield-lockup-light.svg)

**NASA Space Apps Challenge 2026 · Challenge inscripto: Field Shift: Adapting Farms with NASA Data**

Un productor dibuja su lote y hace la pregunta de verdad: **¿qué conviene sembrar?** Ashfield responde con datos de la NASA — un diagnóstico por parcela, la rotación actual comparada con hasta tres alternativas en tarjetas que explican *por qué, evidencia, beneficios, vacíos y riesgos*, y validación contra estaciones meteorológicas reales. Varios productos de la NASA, en resoluciones muy distintas, caen en una grilla común: cada parcela los lee celda por celda.

**Demo:** [PENDIENTE: URL de la demo] · **Video:** [PENDIENTE: URL del video]

**Categorías (decisión del equipo pendiente):** Best Use of Data · Local Impact · Galactic Impact — las tres candidatas en `docs/PRD.md` §15.

---

## El problema

Los productores enfrentan temperaturas cambiantes, lluvias menos predecibles, falta de agua y suelos degradados. Elegir una rotación que cuide el suelo y el agua es difícil: un cultivo que mejora el suelo en un lugar puede consumir demasiada agua o quedar fuera de temporada en otro. En Argentina se suma la quema de rastrojos y pastizales, que daña el suelo y amenaza el propio lote.

**Lo que lo hace difícil:** los datos de la NASA que podrían informar esa decisión están dispersos entre productos, resoluciones y portales — nadie los traduce a una decisión para quien está en el territorio.

## Qué hace la app

- **Lente Campo (Field Shift):** el productor dibuja su lote, lo divide en **parcelas con su cultivo**, ordena los ocho riesgos que más le preocupan (fuego, sequía, El Niño, heladas, calor, nevadas, granizo, inundación) y, si quiere, agrega acceso al agua, distancia a emergencias y costos, precios y márgenes por parcela. El diagnóstico le da a cada parcela un porcentaje de fuego y uno de agua **con el motivo de cada número**, evaporación/evapotranspiración (`EVLAND` de NASA POWER, con respaldo ET0 FAO-56 Penman-Monteith o Hargreaves donde POWER la enmascara), un puntaje de infiltración del suelo (grupos hidrológicos USDA desde textura de SoilGrids, materia orgánica, pendiente y días de suelo desnudo), alertas y las zonas de riesgo de fuego, suelo seco y suelo desnudo en el mapa — después su **rotación actual + 3 alternativas**, cada una con su efecto de infiltración y las cinco secciones que pide el brief: por qué, evidencia, beneficios, vacíos de información y riesgos a validar con un agrónomo. Un resumen opcional con IA (Gemini) pone los números en palabras simples; los teléfonos de emergencia están a un toque y nunca se marcan solos.
- **Planeado:** alertas que avisan sobre detecciones de fuego cerca de un lote guardado — los workflows de n8n existen y se probaron en un entorno de prueba, pero el sistema de notificaciones todavía no es parte de la app (el aviso de alerta con los contactos de emergencia dentro del diagnóstico sí está).

**Recorrido de demo de dos minutos:** bienvenida → **"Ver un ejemplo"** (una finca ficticia en Mendoza — ubicación y datos satelitales reales) → el diagnóstico por parcela con los indicadores de fuego y agua y sus motivos → la alerta de fuego y el bloque de emergencias → la pestaña de prioridades (ordenar los ocho riesgos) → el calendario agrícola con los meses vulnerables → la tarjeta de validación. Para ver tarjetas de rotación, usar **"Analizar mi campo"** y tocar un punto en zona de granos — las rotaciones no aplican a los viñedos y olivos de la finca demo.

La ubicación y los lotes quedan en el navegador: sin cuentas, sin guardado en el servidor.

## Datos usados

Todas las fuentes satelitales de NASA son globales. La resolución y el período son los de la fuente; cada indicador de la app los lleva adjuntos.

| Dataset | Para qué | Resolución | Período |
|---|---|---|---|
| FIRMS MODIS + VIIRS | Detecciones de fuego activo cerca del lote (% de fuego por parcela, alertas y la notificación planeada) | 1 km / 375 m | NRT + historial |
| NASA POWER (diario) | Heladas, calor, lluvia, evaporación | 0,5° × 0,625° (≈55 × 60 km) | 2001 → ayer (MERRA-2; cola desde GEOS-IT) |
| NASA POWER `GWETROOT` | Humedad del suelo en raíz (el indicador de agua por parcela) | 0,5° × 0,625° | Igual que POWER |
| NOAA CPC ONI | Tendencia El Niño / La Niña por parcela | Índice estacional | En curso |
| GPM IMERG (mensual V07) | Lluvia mensual de la grilla de campo argentina | 0,1°, mensual | 2015 → 2024 (precalculada) |
| OpenStreetMap (Nominatim + Overpass) | Búsqueda de lugares, servicios de emergencia y agua cercanos | Datos de punto | En vivo |
| Google Gemini (Flash) | Resumen opcional del diagnóstico en lenguaje simple | — | Requiere clave en el servidor |
| SMAP L3 (SPL3SMP_E) | Anomalía de humedad del suelo | 9 km | Calculada pero rechazada por las pruebas de calidad; la tarjeta usa POWER `GWETROOT` (ver limitaciones) |
| MODIS MOD13C2 NDVI | Días de suelo desnudo por año | 0,05°, mensual | Registro multianual |
| MCD12Q1 / ESA WorldCover | Cobertura dominante del suelo | 500 m / 10 m | Última disponible |
| SRTM (AWS Terrain Tiles) | Pendiente, corrección por altura | ~30 m | — |
| GRACE-FO (mascon) | Tendencia regional del agua | Regional | 2018 → hoy |
| ECOSTRESS (ECO_L2T_LSTE) | Temperatura de superficie (LST) | 70 m | 2024–2025, solo lotes de demo de Orin |
| ISRIC SoilGrids | Textura del suelo y carbono orgánico (0–30 cm) | 250 m | v2 |
| NASA GIBS | Imagen de fondo (Blue Marble) | — | Diaria |
| MAGyP Estimaciones Agrícolas | Rotación típica por zona, cultivos y rendimientos en zonas análogas | Por departamento (Argentina) | Última publicada |
| Sentinel-2 L2A (ESA Copernicus) | Chequeo de cultivo actual y humedad a pedido | 20 m | A pedido |
| Datos de campo de Orin | Validación satélite contra campo | 53 estaciones meteorológicas, Mendoza | 2026-10-04 → 2026-10-20 |
| IGN / Natural Earth | Provincias, departamentos, país | Polígonos | — |

**No se usa, y por qué:** los datasets de campo sugeridos para EE. UU. (SSURGO, NASS/CDL, NLDAS/PRISM, NAIP, CoCoRaHS, OpenET) cubren solo Estados Unidos; se reemplazan por SoilGrids, MAGyP, POWER y los datos de Orin para que la herramienta funcione en Argentina y en el mundo. **FAO GAEZ** está pendiente de un paso manual de licencia. **El granizo** no tiene un producto satelital usable, así que la app dice «sin dato satelital» en vez de adivinar. Landsat/HLS queda solo para lotes de demo (cobertura parcial). ERA5/GLDAS queda como respaldo de clima. Las consultas a demanda de SoilGrids y MODIS de ORNL superan el presupuesto de latencia, así que esas tarjetas usan la grilla precalculada.

## Método

**Motor del campo.** Determinístico y explicable — nunca una caja negra. Una base de conocimiento de **15 cultivos** y **12 rotaciones agronómicamente válidas** (cada dato con su fuente) se filtra por viabilidad contra el diagnóstico del lote (ventana libre de heladas, agua disponible, aptitud, restricciones del productor) y se puntúa por indicadores ponderados por los sliders de prioridad: balance de agua, carbono/rastrojo, nitrógeno, riesgo de erosión (días de suelo desnudo × lluvias extremas × pendiente), infiltración del suelo, diversidad de familias para cortar plagas, forraje, ingreso y **quemas evitadas**. Se devuelve la rotación actual más el top-3 de alternativas; cada indicador guarda qué dato lo produjo, y eso es lo que llena la sección "Evidencia". Los sliders de escenario (lluvia −20 %, +1 °C) recalculan viabilidad e indicadores.

**Zonas análogas.** Las celdas se agrupan por clima, suelo y fenología NDVI armonizados; en Argentina cada grupo se cruza con registros de MAGyP para que la evidencia pueda decir qué se siembra de verdad, y con qué rendimiento, en campos parecidos al tuyo.

**Explicación con IA.** Un proveedor de LLM opcional e intercambiable (Gemini Flash por defecto) solo traduce los números del motor a lenguaje simple: el prompt lleva indicadores calculados, unidades y fuentes — nunca coordenadas, ids de lote ni datos de Orin — y cada número y cita de la respuesta se valida contra la salida del motor antes de mostrar nada. Cualquier fallo vuelve al texto de plantillas generado desde los mismos indicadores.

**Incertidumbre.** Cada número del diagnóstico muestra su fuente y su resolución; las tarjetas marcan baja confianza cuando hay pocos datos, resolución gruesa o un estrato chico en la calibración.

**Una grilla, muchas resoluciones (requisito F8 en acción).** Las capas de campo están precalculadas sobre la misma **grilla hexagonal H3** (res 5 ≈ 253 km², res 2 como unidad de archivo): clima diario de POWER (0,5°), lluvia mensual de IMERG (0,1°), NDVI de MODIS (0,05°), textura y carbono de SoilGrids (250 m), pendiente (SRTM ~30 m), cobertura y el historial de fuego de FIRMS. Cada parcela dibujada se rasteriza a las mismas celdas, así que fuentes distintas se leen celda por celda dentro del lote — y las fuentes a pedido (Sentinel-2 a 20 m, OpenStreetMap, POWER diario) se suman en el punto cuando son más frescas que la grilla. Las capas precalculadas cubren Argentina; en el resto del mundo el diagnóstico corre con datos de punto.

**Historial de fuego por parcela.** El porcentaje de fuego de cada parcela — y los meses marcados como de quema en el calendario — salen del registro FIRMS (MODIS desde 2000, VIIRS desde 2012) llevado a las mismas celdas, más las detecciones cercanas al lote de los últimos días. El pipeline de armonización MODIS/VIIRS que produjo ese registro queda en el repositorio (`pipeline/`, `model/fire_risk/`) pero no es parte de esta entrega.

## Validación

**Satélite contra campo (estaciones de Orin).** Temperatura diaria de NASA POWER contra **53 estaciones meteorológicas de Orin** en Mendoza, 2026-10-04 → 2026-10-20 (742 pares estación-día por variable):

| Variable | RMSE | Sesgo (POWER − estación) | r |
|---|---|---|---|
| Temperatura máxima | 5,05 °C | −2,82 °C | 0,63 |
| Temperatura mínima | 3,89 °C | −0,67 °C | 0,46 |

El error lo explica la altura: una celda de POWER (~55 × 60 km) tiene una sola altura media — 2.485 m en la celda que incluye la cordillera en el Valle de Uco — mientras esas estaciones están entre 1.000 y 1.500 m, lo que produce un sesgo de −6,7 °C en la máxima allí. Corregir POWER con la altura real del lote (SRTM, 6,5 °C/km) reduce el RMSE casi a la mitad (máxima: 2,82 °C; mínima: 2,28 °C); excluyendo las 10 estaciones dentro de la celda con cordillera da 3,32 / 2,31 °C. Lección que la app reporta con honestidad: en llanura POWER sirve para patrones, pero un error de 2–3 °C en la mínima cambia si la noche hiela — confirmá las decisiones de helada con una estación cercana o con tu agrónomo.

**Satélite contra pluviómetros (INTA SIGA).** Lluvia mensual de IMERG y POWER contra **25 estaciones automáticas INTA SIGA**, 2015–2024 (1.346 estación-meses) — `docs/validation/rain-siga/`:

| Producto | Sesgo | RMSE | r |
|---|---|---|---|
| IMERG | +22,1 mm/mes | 51,2 mm/mes | 0,59 |
| POWER | +22,4 mm/mes | 49,4 mm/mes | 0,62 |

Ambos productos marcan de más en promedio, concentrado en la Mendoza árida: la estación es un pluviómetro puntual en el valle seco mientras el píxel satelital promedia toda la celda, incluida la lluvia orográfica que el pluviómetro no ve — una limitación punto vs píxel, no un producto roto. El acuerdo mensual no prueba la climatología de largo plazo; el registro completo de pares está en `pairs.csv`.

La validación anterior de la armonización de fuego MODIS/VIIRS (R² 0,979 en holdout, modelo de riesgo contra líneas base) queda en `docs/validation/` y `model/fire_risk/report.md`; ese pipeline no es parte de esta entrega.

## Limitaciones

- **Las capas de campo precalculadas cubren solo Argentina** (más los lotes de demo); en el resto del mundo el diagnóstico depende de las APIs a demanda y algunas tarjetas pueden mostrar "sin datos disponibles".
- **La temperatura de POWER en celdas de montaña** puede errar varios grados (ver validación): el diagnóstico aplica una corrección de −6,5 °C/km por altura a demanda, pero las tarjetas de helada en valles igual necesitan confirmación en campo.
- **El historial de fuego por parcela es de un solo sensor antes de 2012** — los años solo-MODIS llevan menos confianza, y un fuego chico que MODIS no vio no se puede reconstruir (junio–julio 2001 tiene un hueco real, Terra en modo seguro).
- **La anomalía de humedad de SMAP se calculó (SPL3SMP_E) pero fue rechazada por las pruebas de calidad** — no mostró relación positiva con la lluvia reciente de POWER — así que la tarjeta usa POWER `GWETROOT`.
- **Los escenarios climáticos son escalados simples** de la serie histórica de POWER (lluvia × (1 + pct), temperatura ± delta), no pronósticos. La tendencia de El Niño que se muestra por parcela es una estadística histórica, tampoco un pronóstico.
- **El granizo se informa como «sin dato satelital»** — no hay un producto satelital lo bastante honesto como para mostrar un número.
- **Las consultas de servicios cercanos (OpenStreetMap) pueden fallar o agotar el tiempo**; cuando pasa, el diagnóstico lo dice y se marca incompleto en vez de ocultarlo.
- **Los márgenes por parcela son estimaciones gruesas** a partir de los costos y precios del productor (o el promedio departamental del MAGyP) — hace falta el criterio agronómico igual.
- **ECOSTRESS** no forma parte del diagnóstico general (cobertura parcial; solo lotes de demo).
- **La base de conocimiento de cultivos es un borrador en revisión agronómica** (`docs/revision-agronomica.md`): varios valores de uso de agua y rastrojo esperan fuentes argentinas, y Patagonia no tiene rotación validada.
- **Las rotaciones son apoyo a la decisión, no consejo agronómico** — la app lo dice en cada tarjeta y lista qué validar con un agrónomo local.
- **La evaporación y el agua de cultivo son referencias, no mediciones** — `EVLAND` es la evaporación del suelo de POWER; donde viene enmascarada, la tarjeta usa ET0 FAO-56 Penman-Monteith (o Hargreaves si faltan datos de radiación), marcado como estimación de referencia. La demanda hídrica usa coeficientes `Kc` FAO genéricos pendientes de revisión agronómica local.
- **El puntaje de infiltración es relativo y cualitativo** — grupos hidrológicos USDA derivados de textura de SoilGrids, materia orgánica, pendiente y días de suelo desnudo; ordena parcelas y alternativas de rotación, no mide infiltración.
- El historial de fuego a 365 días detrás del porcentaje de fuego de cada parcela no ve los focos de enero a octubre de 2026 hasta que se agregue el Parquet anual (flag `fires_365d_complete` en cada shard).
- El piloto de pronóstico de heladas de Orin (una estación, primavera 2026, 24 noches completas) no registró ninguna helada, así que el valor de la alerta no se puede juzgar — y la corrección de sesgo por estación empeoró el RMSE en esa muestra (3,64 vs 3,07 °C): no es prueba de que la calibración ayude.

## De dónde salen los datos de Orin

Los datos de Orin (lotes, muestreos y 53 estaciones meteorológicas en Mendoza) fueron **recolectados antes del hackatón** por el proyecto Orin. Según la decisión D17 del equipo, su uso está autorizado sin restricciones: **se usan solo los datos recolectados, nunca el código de Orin**. Se aclara acá por transparencia, como piden las reglas del challenge para trabajos preexistentes.

## Cómo correrlo localmente

**Pipeline** (Python 3.12+, ~9 GB de zips de FIRMS en `~/spaceapps-fuego/data/raw/zips/`, ~70 GB libres en disco, `FIRMS_MAP_KEY` en `.env` para los datos de 2026):

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

(en Linux/macOS: `pip install -r back/requirements.txt`, `export DATA_BASE_URL=...`, `uvicorn back.api.index:app --port 8765`.)

**Frontend:**

```bash
cd web
npm install
npm run dev
```

Abrir http://localhost:5173/app/ — el servidor de desarrollo sirve `fixtures/` en `/data/v1/`, así que la app funciona sin backend; `/api/*` se redirige a `localhost:8000`. La landing está en `/` (inglés) y `/es/` (español).

## Deploy

Un solo proyecto de Vercel sirve el build estático de `web/` más la función serverless de Python (`api/index.py`), con los datos en un bucket público de Cloudflare R2. Paso a paso, incluidas las variables de entorno necesarias: **[`docs/DEPLOY.md`](docs/DEPLOY.md)**.

## Mapa del repositorio

```
pipeline/    Ingesta FIRMS → limpieza → grilla H3 → agregados → export (Python + DuckDB)
model/       field_grid builders, analogs (clustering), power; fire_risk queda en el repo — no es parte de esta entrega
back/        App FastAPI (serverless en Vercel): /api/field/*, knowledge/ (cultivos, rotaciones, medidas)
web/         Front React + TypeScript + MapLibre GL
api/         Punto de entrada de Vercel que reexporta la app del back
fixtures/    Datos de ejemplo con la forma del contrato para correr el front
docs/        PRD, contrato de datos, registro de decisiones, método, validación, caso de estudio, deploy
tools/       Subida a R2, assets de marca (logo y paleta: ember #b3401e, verde cultivo, beige rastrojo)
```

## Equipo

- **Ariel** — documentación y README.
- **Augustus** — datos de campo de Orin y conocimiento agronómico.
- **Ezequiel** — pipeline de datos, deploy, datos de Orin y conocimiento agronómico.
- **Alex** — front end y presentación.

## Licencias y agradecimientos

- **Licencia del código:** MIT — ver [`LICENSE`](LICENSE).
- Datos: NASA FIRMS (MODIS, VIIRS S-NPP, VIIRS NOAA-20), NASA POWER, GPM IMERG, SMAP, MODIS (NDVI, cobertura), SRTM, GRACE-FO, NASA GIBS, FAO GAEZ, ISRIC SoilGrids, MAGyP Estimaciones Agrícolas (Argentina), ESA Copernicus Sentinel-2, IGN (Argentina), Natural Earth, INTA (medidas de prevención y parámetros de cultivos, en revisión; estaciones automáticas SIGA como verdad de campo para la validación de lluvia), datos de campo de Orin (con autorización).
- Herramientas: MapLibre GL JS, OpenFreeMap, Uber H3, DuckDB, LightGBM, FastAPI, React/Vite, Cloudflare R2, Vercel.

# Ashfield — Field Shift: Adapting Farms with NASA Data

![Ashfield](web/public/brand/ashfield-lockup-light.svg)

**NASA Space Apps Challenge 2026 · Challenge inscripto: Field Shift: Adapting Farms with NASA Data** — el proyecto también cubre **Harmonization of MODIS and VIIRS Hot Spots**.

Un productor dibuja su lote y hace la pregunta de verdad: **¿qué conviene sembrar?** Ashfield responde con datos de la NASA — un diagnóstico por parcela, la rotación actual comparada con hasta tres alternativas en tarjetas que explican *por qué, evidencia, beneficios, vacíos y riesgos*, y validación contra estaciones meteorológicas reales. El mismo motor lleva datos dispersos de la NASA — distintos sensores, distintas resoluciones — a una grilla común; la armonización de 25 años de focos MODIS/VIIRS es el ejemplo que funciona.

**Demo:** [PENDIENTE: URL de la demo] · **Video:** [PENDIENTE: URL del video]

**Categorías (decisión del equipo pendiente):** Best Use of Data · Local Impact · Galactic Impact — las tres candidatas en `docs/PRD.md` §15.

---

## El problema

**Campo.** Los productores enfrentan temperaturas cambiantes, lluvias menos predecibles, falta de agua y suelos degradados. Elegir una rotación que cuide el suelo y el agua es difícil: un cultivo que mejora el suelo en un lugar puede consumir demasiada agua o quedar fuera de temporada en otro. En Argentina se suma la quema de rastrojos y pastizales, que daña el suelo y es una fuente importante de focos de calor.

**Fuego.** El registro satelital de focos de calor está partido entre sensores que no se pueden comparar: MODIS (píxel de 1 km, desde 2000, termina su misión en 2026) y VIIRS (píxel de 375 m, desde 2012), que ve fuegos más chicos y fragmenta un mismo incendio en más detecciones. Sin armonizar, la serie salta cuando entra VIIRS y no hay forma de saber si un año fue peor por el fuego o por el sensor.

**Lo que une a los dos:** datos de NASA dispersos, en resoluciones distintas, que nadie traduce a decisiones para quien está en el territorio.

## Qué hace la app

- **Lente Campo (Field Shift):** el productor dibuja su lote, lo divide en **parcelas con su cultivo**, ordena los ocho riesgos que más le preocupan (fuego, sequía, El Niño, heladas, calor, nevadas, granizo, inundación) y, si quiere, agrega acceso al agua, distancia a emergencias y costos, precios y márgenes por parcela. El diagnóstico le da a cada parcela un porcentaje de fuego y uno de agua **con el motivo de cada número**, evaporación/evapotranspiración (`EVLAND` de NASA POWER, con respaldo ET0 FAO-56 Penman-Monteith o Hargreaves donde POWER la enmascara), un puntaje de infiltración del suelo (grupos hidrológicos USDA desde textura de SoilGrids, materia orgánica, pendiente y días de suelo desnudo), alertas y las zonas de riesgo de fuego, suelo seco y suelo desnudo en el mapa — después su **rotación actual + 3 alternativas**, cada una con su efecto de infiltración y las cinco secciones que pide el brief: por qué, evidencia, beneficios, vacíos de información y riesgos a validar con un agrónomo. Un resumen opcional con IA (Gemini) pone los números en palabras simples; los teléfonos de emergencia están a un toque y nunca se marcan solos.
- **Planeado:** alertas proactivas cuando el riesgo de una parcela sube (el aviso con los contactos de emergencia ya está; el aviso tipo notificación todavía no).

**Recorrido de demo de dos minutos:** bienvenida → **"Analizar mi campo"** → elegir el **lote de demo de Pergamino** → el diagnóstico por parcela → comparar la rotación actual con las 3 alternativas, incluidos los sliders de escenario climático (lluvia −20 %, +1 °C) → después **"Ver mi zona"** (ubicación, el globo vuela a una vista de 50 km) → modo histórico reproduciendo **Corrientes 2022** → riesgo y semáforo en el panel del área.

La ubicación y los lotes quedan en el navegador: sin cuentas, sin guardado en el servidor.

## Datos usados

Todas las fuentes satelitales de NASA son globales. La resolución y el período son los de la fuente; cada indicador de la app los lleva adjuntos.

| Dataset | Para qué | Resolución | Período |
|---|---|---|---|
| FIRMS MODIS Collection 6.1 | Focos de calor | 1 km | 2000-11 → 2026-08-31 (SP), luego NRT |
| FIRMS VIIRS S-NPP | Focos de calor | 375 m | 2012-01-20 → 2025-12-31 |
| FIRMS VIIRS NOAA-20 | Focos de calor, unidad de la serie | 375 m | 2018-04-01 → 2026-07-31 (SP), luego NRT |
| NASA POWER (diario) | Heladas, calor, lluvia, clima de fuego, features del modelo | 0,5° × 0,625° (≈55 × 60 km) | 2001 → ayer (MERRA-2; cola desde GEOS-IT) |
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
| NASA GIBS | Imagen de fondo (Blue Marble; VIIRS True Color en modo live) | — | Diaria |
| MAGyP Estimaciones Agrícolas | Rotación típica por zona, cultivos y rendimientos en zonas análogas | Por departamento (Argentina) | Última publicada |
| Datos de campo de Orin | Validación satélite contra campo | 53 estaciones meteorológicas, Mendoza | 2026-10-04 → 2026-10-20 |
| IGN / Natural Earth | Provincias, departamentos, país | Polígonos | — |

**No se usa, y por qué:** los datasets de campo sugeridos para EE. UU. (SSURGO, NASS/CDL, NLDAS/PRISM, NAIP, CoCoRaHS, OpenET) cubren solo Estados Unidos; se reemplazan por SoilGrids, MAGyP, POWER y los datos de Orin para que la herramienta funcione en Argentina y en el mundo. **FAO GAEZ** está pendiente de un paso manual de licencia. **El granizo** no tiene un producto satelital usable, así que la app dice «sin dato satelital» en vez de adivinar. Landsat/HLS y Sentinel-2 quedan solo para lotes de demo (cobertura parcial). ERA5/GLDAS queda como respaldo de clima. Las consultas a demanda de SoilGrids y MODIS de ORNL superan el presupuesto de latencia, así que esas tarjetas usan la grilla precalculada.

## Método

**Motor del campo.** Determinístico y explicable — nunca una caja negra. Una base de conocimiento de **15 cultivos** y **12 rotaciones agronómicamente válidas** (cada dato con su fuente) se filtra por viabilidad contra el diagnóstico del lote (ventana libre de heladas, agua disponible, aptitud, restricciones del productor) y se puntúa por indicadores ponderados por los sliders de prioridad: balance de agua, carbono/rastrojo, nitrógeno, riesgo de erosión (días de suelo desnudo × lluvias extremas × pendiente), infiltración del suelo, diversidad de familias para cortar plagas, forraje, ingreso y **quemas evitadas**. Se devuelve la rotación actual más el top-3 de alternativas; cada indicador guarda qué dato lo produjo, y eso es lo que llena la sección "Evidencia". Los sliders de escenario (lluvia −20 %, +1 °C) recalculan viabilidad e indicadores.

**Zonas análogas.** Las celdas se agrupan por clima, suelo y fenología NDVI armonizados; en Argentina cada grupo se cruza con registros de MAGyP para que la evidencia pueda decir qué se siembra de verdad, y con qué rendimiento, en campos parecidos al tuyo.

**Explicación con IA.** Un proveedor de LLM opcional e intercambiable (Gemini Flash por defecto) solo traduce los números del motor a lenguaje simple: el prompt lleva indicadores calculados, unidades y fuentes — nunca coordenadas, ids de lote ni datos de Orin — y cada número y cita de la respuesta se valida contra la salida del motor antes de mostrar nada. Cualquier fallo vuelve al texto de plantillas generado desde los mismos indicadores.

**Incertidumbre.** Cada número del diagnóstico muestra su fuente y su resolución; las tarjetas marcan baja confianza cuando hay pocos datos, resolución gruesa o un estrato chico en la calibración.

**Una grilla, muchas resoluciones — la armonización (requisito F8 en acción).** El brief de Field Shift pide datos heterogéneos sobre una grilla común; la serie de fuego es el ejemplo que funciona. Todos los conteos se expresan en **detecciones equivalentes a VIIRS NOAA-20**, porque MODIS se apaga y todo dato nuevo llega en VIIRS. La calibración se hace por estrato — banda de latitud de 10° × mes (18 bandas, 208 estratos con datos) — sobre el solapamiento 2012–2025:

1. **Terra → Terra + Aqua** (2000-11 → 2002-06): factor (T+A)/T por estrato medido en 2003–2011.
2. **S-NPP → NOAA-20** (2012-02 → 2018-03): factor N20/N por estrato calculado solo con los meses en que funcionan los dos satélites (2018-04 → 2025-12); en Argentina el factor queda entre 0,98 y 1,0.
3. **MODIS → VIIRS:** `log(VIIRS + 1) = a + b · log(MODIS + 1)` por estrato sobre pares celda res 3 × mes (entrenamiento 2012-02 → 2022-12), más un factor de totales `k` por estrato que corrige el sesgo de volver del logaritmo y el fuego que VIIRS ve donde MODIS no ve nada. Los estratos con menos de 200 pares usan los coeficientes globales del mes y quedan marcados con confianza `low` (71 de 208).
4. **De res 3 a res 5:** la predicción de cada celda res 3 se reparte entre sus hijas res 5 en proporción a sus detecciones MODIS, así la suma de las celdas chicas siempre coincide con la grande.

Serie final: MODIS convertido para 2000-11 → 2012-01, S-NPP × factor para 2012-02 → 2018-03, NOAA-20 tal cual desde 2018-04. Las detecciones crudas se filtran a `type = 0` (fuego de vegetación presunto), confianza MODIS ≥ 30 y VIIRS `nominal`/`high`; los NRT no traen `type`, así que se aplica una máscara de fuentes fijas inferida de la historia de NOAA-20. En total se procesaron ~568 millones de detecciones de todo el mundo sobre celdas H3 (res 5 ≈ 253 km² para paneles y riesgo, res 3 para el globo, res 2 como unidad de archivo).

**Riesgo de fuego en 7 días.** Dos niveles. En todo el mundo, sin ML: `p = min(0,95, clim × (1 + 2·A + B))`, donde `clim` es la climatología semanal (fracción de los años 2003–2022 con ≥ 1 foco en esa semana) y A/B indican si hubo focos en la celda en los últimos 7 y 30 días. En Argentina, un modelo **LightGBM** suma el clima de NASA POWER (lluvia acumulada, días sin lluvia, humedad, temperatura, viento) más historial de fuego, estacionalidad, cobertura y focos en celdas vecinas; las probabilidades se calibran con Platt y cada predicción trae 2–3 razones basadas en SHAP. La climatología se calcula en todo el mundo y es la línea base que el modelo debe superar.

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

**Hold-out de la armonización.** Entrenada con 2012-02 → 2022-12 y evaluada con **2023–2024** — años que la calibración no vio — convirtiendo el MODIS del hold-out y comparándolo con el NOAA-20 real:

| Métrica | Valor |
|---|---|
| R² de la serie mundial mensual | **0,979** |
| R² lineal, por celda res 3 × mes | **0,926** |
| R² log1p, por celda res 3 × mes | **0,654** |
| Sesgo total | **−0,8 %** |
| Celdas-día con fuego: R² log1p / sesgo | 0,61 / +1,4 % |

El R² log1p es más bajo porque le da el mismo peso a cada celda y la mayoría tiene pocos focos por mes: ahí la diferencia entre 1 y 3 focos es ruido de muestreo (horario de pasada, nubes, píxeles más chicos de VIIRS), no un error de calibración. Las celdas con mucho fuego, que son las que mueven los totales y los picos, se predicen bien, como muestran el R² lineal y el mundial. La serie armonizada no muestra salto en 2012 ni en 2018 (`docs/validation/series_global.png`).

**Modelo de riesgo contra líneas base** (partición de test 2023–2025, Argentina):

| Predictor | ROC-AUC | PR-AUC | Brier |
|---|---|---|---|
| LightGBM (clima + historial) | **0,920** | **0,427** | **0,0302** |
| Climatología | 0,843 | 0,295 | 0,0350 |
| Persistencia | 0,852 | 0,310 | 0,0452 |

## Limitaciones

- **2000-11 → 2012-01 es el tramo de menor confianza** (marcado en la app): esos años son MODIS convertido a un sensor más sensible, y un fuego chico que MODIS no vio no se puede reconstruir. Junio y julio de 2001 llevan una marca extra de baja confianza porque Terra no registró nada entre el 15/06/2001 y el 03/07/2001 (modo seguro), antes de que existiera Aqua.
- **La calibración es por banda de latitud × mes, no por cobertura** — un pastizal y una selva de la misma latitud comparten coeficientes; la estratificación por cobertura es una mejora prevista. 71 de 208 estratos usan coeficientes globales.
- **Las capas de campo precalculadas cubren solo Argentina** (más los lotes de demo); en el resto del mundo el diagnóstico depende de las APIs a demanda y algunas tarjetas pueden mostrar "sin datos disponibles".
- **La temperatura de POWER en celdas de montaña** puede errar varios grados (ver validación): el diagnóstico aplica una corrección de −6,5 °C/km por altura a demanda, pero las tarjetas de helada en valles igual necesitan confirmación en campo — y las features del modelo de riesgo quedan sin corregir (el modelo no se reentrenó).
- **La anomalía de humedad de SMAP se calculó (SPL3SMP_E) pero fue rechazada por las pruebas de calidad** — no mostró relación positiva con la lluvia reciente de POWER — así que la tarjeta usa POWER `GWETROOT`.
- **Los escenarios climáticos son escalados simples** de la serie histórica de POWER (lluvia × (1 + pct), temperatura ± delta), no pronósticos. La tendencia de El Niño que se muestra por parcela es una estadística histórica, tampoco un pronóstico.
- **El granizo se informa como «sin dato satelital»** — no hay un producto satelital lo bastante honesto como para mostrar un número.
- **Las consultas de servicios cercanos (OpenStreetMap) pueden fallar o agotar el tiempo**; cuando pasa, el diagnóstico lo dice y se marca incompleto en vez de ocultarlo.
- **Los márgenes por parcela son estimaciones gruesas** a partir de los costos y precios del productor (o el promedio departamental del MAGyP) — hace falta el criterio agronómico igual.
- **ECOSTRESS** no forma parte del diagnóstico general (cobertura parcial; solo lotes de demo).
- **Los focos NRT infieren `type`** con una máscara de fuentes fijas (descarta 5,7 % del NRT de NOAA-20 contra 8,6 % con el flag real); una fuente industrial nueva podría pasar en los últimos meses.
- **La base de conocimiento de cultivos es un borrador en revisión agronómica** (`docs/revision-agronomica.md`): varios valores de uso de agua y rastrojo esperan fuentes argentinas, y Patagonia no tiene rotación validada.
- **Las rotaciones son apoyo a la decisión, no consejo agronómico** — la app lo dice en cada tarjeta y lista qué validar con un agrónomo local.
- **La evaporación y el agua de cultivo son referencias, no mediciones** — `EVLAND` es la evaporación del suelo de POWER; donde viene enmascarada, la tarjeta usa ET0 FAO-56 Penman-Monteith (o Hargreaves si faltan datos de radiación), marcado como estimación de referencia. La demanda hídrica usa coeficientes `Kc` FAO genéricos pendientes de revisión agronómica local.
- **El puntaje de infiltración es relativo y cualitativo** — grupos hidrológicos USDA derivados de textura de SoilGrids, materia orgánica, pendiente y días de suelo desnudo; ordena parcelas y alternativas de rotación, no mide infiltración.
- El historial de fuego a 365 días del modelo de riesgo de Argentina no ve los focos de enero a octubre de 2026 hasta que se agregue el Parquet anual (flag `fires_365d_complete` en cada shard).
- El piloto de pronóstico de heladas de Orin (una estación, primavera 2026, 24 noches completas) no registró ninguna helada, así que el valor de la alerta no se puede juzgar — y la corrección de sesgo por estación empeoró el RMSE en esa muestra (3,64 vs 3,07 °C): no es prueba de que la calibración ayude.

## De dónde salen los datos de Orin

Los datos de Orin (lotes, muestreos y 53 estaciones meteorológicas en Mendoza) fueron **recolectados antes del hackatón** por el proyecto Orin. Según la decisión D17 del equipo, su uso está autorizado sin restricciones: **se usan solo los datos recolectados, nunca el código de Orin**. Se aclara acá por transparencia, como piden las reglas del challenge para trabajos preexistentes.

## También construido: Hot Spots (Armonización de MODIS y VIIRS)

La segunda lente de la misma app — comparte el motor y la grilla H3, y es lo que convierte al fuego en un dato del lote y no en una curiosidad del mapa: el porcentaje de fuego por parcela, los meses de quema del calendario agrícola, el indicador de *quemas evitadas* por rotación y las medidas de prevención INTA salen de esta capa.

- **Modo histórico:** un globo 3D reproduciendo la serie mensual armonizada, noviembre 2000 → hoy — 25 años en una sola unidad comparable.
- **Modo live:** detecciones de las últimas 24 h / 48 h / 7 d sobre la imagen NASA GIBS del día.
- **Calendario + semáforo:** calendario de fuego año × mes y comparación del mes actual contra su línea base 2003–2022.
- **Riesgo a 7 días:** el modelo descrito arriba, con sus 2–3 razones, más descarga en CSV.
- **Idea de alertas:** notificaciones proactivas (por ejemplo un flujo n8n) cuando el riesgo de una celda sube — bosquejado, no implementado.

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
pipeline/    Ingesta FIRMS → limpieza → grilla H3 → armonización → agregados → export (Python + DuckDB)
model/       fire_risk (LightGBM + reporte), analogs (clustering), power, field_grid builders
back/        App FastAPI (serverless en Vercel): /api/live, /api/risk, /api/field/*, knowledge/ (cultivos, rotaciones, medidas)
web/         Front React + TypeScript + MapLibre GL (globo)
api/         Punto de entrada de Vercel que reexporta la app del back
fixtures/    Datos de ejemplo con la forma del contrato para correr el front
docs/        PRD, contrato de datos, registro de decisiones, método, validación, caso de estudio, deploy
tools/       Subida a R2, assets de marca (logo y paleta: ember #b3401e, verde cultivo, beige rastrojo)
```

## Equipo

- **Ariel** — documentación y README.
- **Augustus** — datos de campo de Orin y conocimiento agronómico.
- **Ezequiel** — datos de fuego y pipeline, deploy, datos de Orin y conocimiento agronómico.
- **Alex** — front end y presentación.

## Licencias y agradecimientos

- **Licencia del código:** MIT — ver [`LICENSE`](LICENSE).
- Dataset de fuego armonizado: se publica en Parquet + CSV con metadatos y `CITATION.cff` — [PENDIENTE: URL de descarga del dataset armonizado]
- Datos: NASA FIRMS (MODIS, VIIRS S-NPP, VIIRS NOAA-20), NASA POWER, GPM IMERG, SMAP, MODIS (NDVI, cobertura), SRTM, GRACE-FO, NASA GIBS, FAO GAEZ, ISRIC SoilGrids, MAGyP Estimaciones Agrícolas (Argentina), IGN (Argentina), Natural Earth, INTA (medidas de prevención y parámetros de cultivos, en revisión; estaciones automáticas SIGA como verdad de campo para la validación de lluvia), datos de campo de Orin (con autorización).
- Herramientas: MapLibre GL JS, OpenFreeMap, Uber H3, DuckDB, LightGBM, FastAPI, React/Vite, Cloudflare R2, Vercel.

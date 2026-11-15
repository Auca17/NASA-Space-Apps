# PRD — Fuego y Campo

**NASA Space Apps Challenge 2026**
**Challenges:** Field Shift: Adapting Farms with NASA Data + Harmonization of MODIS and VIIRS Hot Spots
Versión 2 · 14/11/2026 · Equipo de 4 personas · **Ashfield**

---

## 1. Resumen

Una web **mobile-first** y de **alcance mundial**, con un **globo 3D**, construida sobre un **motor de armonización** que lleva datos de NASA de distintas resoluciones a una **grilla común**. Los dos challenges piden lo mismo en el fondo: armonizar. Sobre ese motor hay dos lentes:

- **Lente Fuego** (Hot Spots): 25 años de focos de calor MODIS + VIIRS en una sola serie comparable. Tiene modo histórico animado sobre el globo, modo live, calendario de fuego, comparación del mes actual contra la mediana y riesgo de fuego en 7 días.
- **Lente Campo** (Field Shift): el productor dibuja su lote y recibe un **diagnóstico con datos de NASA**, un **calendario agrícola** y la **comparación de su rotación actual con 3 alternativas**. Cada estrategia explica por qué se sugiere, la evidencia, los beneficios, los vacíos de información y los riesgos.

Las dos lentes **se cruzan** en la quema de rastrojos, el riesgo de fuego del lote y los períodos de suelo desnudo. Es una sola historia, *fuego y campo*, no dos proyectos pegados.

Al abrir, la app pide la ubicación (con un botón), centra el globo en el usuario y le muestra su zona en cualquier lugar del mundo.

---

## 2. Problema

**Fuego.** El registro satelital de focos de calor está partido entre sensores que no se pueden comparar: MODIS (1 km, desde 2000, se apaga en 2026) y VIIRS (375 m, desde 2012, detecta muchos más focos). Sin armonizar, la serie salta y no se puede saber si un año fue peor por el fuego o por el sensor.

**Campo.** Los productores enfrentan temperaturas cambiantes, lluvias menos predecibles, falta de agua y suelos degradados. Elegir una rotación que cuide el suelo y el agua es difícil: un cultivo que mejora el suelo en un lugar puede consumir demasiada agua o quedar fuera de temporada en otro. En Argentina se suma la **quema de rastrojos y pastizales**, que daña el suelo y es una fuente importante de focos de calor.

**Lo que une a los dos:** datos de NASA dispersos, en resoluciones distintas, que nadie traduce a decisiones para quien está en el territorio.

---

## 3. Usuarios

| Usuario | Lente | Qué hace en la app |
|---|---|---|
| Productor / asesor agrónomo | Campo + Fuego | Dibuja su lote, ve el diagnóstico, compara rotaciones, ve el riesgo de fuego y el calendario de quemas de su zona |
| Vecino de zona rural | Fuego | "Cerca mío": riesgo de 7 días y actividad del mes |
| Brigadista / Defensa Civil | Fuego | Modo live + semáforo del mes contra la mediana |
| Gestor de territorio / municipio | Fuego + Campo | Calendario histórico, zonas con quemas recurrentes, CSV |
| Científico / estudiante | Ambas | Dataset armonizado descargable |
| Jurado | Ambas | Entiende el problema y la solución en 2 minutos |

---

## 4. Requisitos de los challenges y cómo los cubrimos

### 4.1 Hot Spots

| Requisito del brief | Solución | Sección |
|---|---|---|
| Armonizar MODIS y VIIRS para que el sensor de origen no importe | Calibración por estrato con 14 años de solapamiento, validada | 9.2 |
| Web app con selección de región y rango de fechas | Globo + retícula, ubicación, buscador, polígono, slider temporal | 6 |
| Calendario de actividad desde 2000 | Calendario año × mes por región | 6.3 |
| Mes actual vs. mediana histórica | Semáforo con ratio y percentil | 6.5 |
| Anomalías contra promedios plurianuales | Línea base 2003–2022 | 9.3 |
| Escalas de color accesibles | Viridis / RdBu, nunca solo color | 12 |
| CSV descargable | Serie del área + focos crudos | 8.3 |

### 4.2 Field Shift

| Requisito del brief | Solución | Sección |
|---|---|---|
| Datos de NASA: temperatura, estrés térmico, lluvia, humedad del suelo, evaporación, heladas, extremos, estrés de vegetación, agua a largo plazo | POWER, IMERG, SMAP, MODIS NDVI/ET/LST, ECOSTRESS, SRTM, GRACE | 8.1 |
| Suelo local, características de cultivos, prioridades del productor | SoilGrids + base de cultivos + sliders de prioridades | 7.3, 10.1 |
| Comparar **≥ 3 rotaciones, incluida la actual** | Actual + 3 alternativas en tarjetas | 7.4 |
| Para cada una: **por qué, evidencia, beneficios, vacíos, riesgos** | Las 5 secciones en cada tarjeta, con datos del lote | 7.4 |
| Períodos de suelo desnudo y estaciones vulnerables | Calendario agrícola | 7.2 |
| Interrumpir ciclos de plagas, reducir agua, mejorar infiltración, ingreso extra | Indicadores del motor de rotaciones | 10.2 |
| IA para patrones, incertidumbre y fusión de datos | Zonas análogas, modelo de riesgo, explicación en lenguaje simple | 10.3 |
| Armonizar datasets a una grilla común | El mismo motor de armonización (H3) | 9 |
| Explicar términos (evapotranspiración, NDVI, anomalías, heladas, balance hídrico) | Glosario contextual (ícono "?") | 7.5 |
| Satélite vs. medición en campo | **Validación con muestreos de Orin** | 10.4 |
| Escenarios de lluvia / temperatura (opcional) | Sliders de escenario | 7.4 |
| Restricciones del productor (agua, maquinaria, mercado) | Formulario de restricciones | 7.3 |
| Que apoye y no reemplace al productor | Aviso fijo + "qué validar con tu agrónomo" | 7.4 |

---

## 5. Alcance

| Prioridad | Funcionalidad |
|---|---|
| **Must** | Motor de armonización: FIRMS MODIS ↔ VIIRS (global) + capas de campo a la grilla H3 |
| **Must** | Globo 3D con modo histórico animado |
| **Must** | Calendario de fuego + semáforo del mes + CSV (mundial) |
| **Must** | Ubicación del usuario con fallback a buscador (mundial) |
| **Must** | Lente Campo: lote → diagnóstico → calendario agrícola → actual + 3 rotaciones con las 5 secciones |
| **Must** | Mobile-first y accesible |
| **Should** | Modo live |
| **Should** | Riesgo de fuego 7 días: nivel base mundial + nivel con clima en Argentina |
| **Should** | Validación satélite vs. campo con datos de Orin |
| **Should** | Zonas análogas ("campos parecidos al tuyo") |
| **Should** | Explicación en lenguaje simple con LLM |
| **Could** | Sliders de escenario climático |
| **Could** | Fuego agrícola vs. forestal (cobertura del suelo) |
| **Could** | ECOSTRESS para lotes de demo |
| **Could** | Inglés |
| **Won't** | Cuentas de usuario, alertas push, precios de mercado en tiempo real |

---

## 6. Experiencia: Lente Fuego

### 6.1 Primer ingreso
1. Bienvenida corta + botón **"Ver mi zona"** + link "Explorar el planeta".
2. Al tocar, se pide la geolocalización (exige HTTPS).
   - **Acepta:** el globo vuela a su ubicación, marca **50 km de radio** y abre el panel.
   - **Rechaza / sin GPS:** buscador de ciudad o región; vista inicial del país detectado por idioma o de Argentina.
3. Aviso visible: *"Tu ubicación se usa solo en tu navegador y no se guarda."*
4. Desde el panel: **"Analizar mi campo"** lleva a la Lente Campo.

### 6.2 Globo
- **MapLibre GL JS v5 con proyección `globe`**: globo 3D al ver el planeta y mapa al acercarse.
- Fondo **NASA GIBS Blue Marble**; al acercarse, etiquetas y rutas (OpenFreeMap).
- Focos agregados en **hexágonos H3**: nivel 3 para la animación global y nivel 5 al acercarse.
- **Retícula en el centro**: la región bajo la retícula es la que muestra el panel. Al girar, se actualiza con *debounce* de ~300 ms.
- Modo "tour" con auto-rotación lenta, desactivado con `prefers-reduced-motion`.

### 6.3 Modo histórico (núcleo de Hot Spots)
- Slider mes a mes **nov-2000 → hoy** + Play/Pausa + velocidad.
- Mientras se reproduce, el globo cambia mes a mes y el calendario resalta el mes actual de la animación. Se puede girar el globo durante la reproducción.
- Toggles: **año calendario / temporada de fuego (jul–jun)** y **cantidades / anomalías**.

### 6.4 Modo live
- Focos de las últimas 24 h (toggle 48 h / 7 días), coloreados por intensidad (FRP).
- Fondo opcional con la **imagen satelital del día** (GIBS VIIRS True Color), donde se ve el humo.
- "Última actualización hace X horas".

### 6.5 Panel de área (mobile: hoja deslizable; desktop: lateral)
1. **Riesgo de fuego en 7 días**: categoría + "x veces lo normal para esta época" + 2–3 razones. Indica el nivel ("según historial" o "+ clima de los últimos días").
2. **Semáforo del mes**: "Noviembre 2026: 340 focos — 2,3× la mediana — percentil 95".
3. **Calendario**: filas = años, columnas = meses.
4. Focos por año y estacionalidad.
5. **Descargar CSV**.
6. Si el riesgo es alto: qué hacer y teléfonos de emergencia del país (en Argentina, Bomberos 100 y Emergencias 911).

---

## 7. Experiencia: Lente Campo

### 7.1 Elegir el lote
- Dibujar el polígono en el mapa, tocar un punto (se usa un lote estándar de 50 ha) o elegir un **lote de demo** (pampeano y Orin/Mendoza).
- Los lotes se guardan **solo en el navegador** (localStorage), sin cuentas.

### 7.2 Diagnóstico y calendario agrícola
**Tarjetas de diagnóstico**, cada una con su número, una frase y la fuente:

| Indicador | Dato de NASA | Ejemplo |
|---|---|---|
| Lluvia anual y confiabilidad | IMERG / POWER | "780 mm/año; 1 de cada 4 años < 600 mm" |
| Lluvias extremas (erosión) | IMERG | "6 días/año > 50 mm" |
| Humedad del suelo y anomalía | SMAP | "Hoy 18 % bajo lo normal" |
| Heladas | POWER | "Período libre de heladas: 15/10 – 20/04" |
| Calor y grados-día | POWER / MODIS LST | "12 días/año > 35 °C en floración" |
| Agua del cultivo | MODIS ET / ECOSTRESS | "ET de verano 5,2 mm/día" |
| Vigor y suelo desnudo | MODIS NDVI (250 m) / Landsat / Sentinel-2 | "Suelo desnudo ~110 días/año (may–ago)" |
| Pendiente y erosión | SRTM | "Pendiente media 2,1 %" |
| Suelo | SoilGrids | "Franco limoso, MO 2,8 %" |
| Tendencia del agua | GRACE (regional) | "Agua total almacenada en descenso desde 2015" |
| Fuego | Nuestra serie armonizada | "Temporada de quemas: ago–sep; riesgo 7 días: moderado" |

**Calendario agrícola** (mismo componente visual que el de fuego): una fila por variable a lo largo de los 12 meses, con suelo desnudo, ventana de heladas, estrés hídrico, calor, temporada de quemas y **ciclo de la rotación actual superpuesto**. Así se ve a simple vista cuándo el lote está expuesto.

### 7.3 Rotación actual, prioridades y restricciones
- **Rotación actual**: selector de secuencia (ej. *soja – soja*, *trigo/soja 2ª – maíz*) o "no sé" (se sugiere la típica de la zona según MAGyP).
- **Prioridades** (sliders 0–5): conservar agua · mejorar suelo · reducir erosión · ingreso · forraje · fijar nitrógeno · cortar ciclos de plagas · evitar quemas.
- **Restricciones**: riego sí/no, maquinaria disponible, ganadería sí/no, mercado cercano para qué cultivos.

### 7.4 Comparación de estrategias
**Actual + 3 alternativas** en tarjetas lado a lado (carrusel en mobile). Cada tarjeta tiene:

| Sección | Contenido |
|---|---|
| **Secuencia** | Línea de tiempo de 2–3 años con cada cultivo y los períodos de suelo cubierto o desnudo |
| **Por qué** | Qué prioridad atiende y qué problema del diagnóstico resuelve |
| **Evidencia** | Datos concretos del lote (ej. "SMAP muestra déficit en dic–ene; el sorgo tolera sequía") y estadísticas de zonas análogas |
| **Beneficios** | Indicadores comparados con la actual: agua, carbono/MO, nitrógeno, cobertura (días desnudos), erosión, diversidad (plagas), quemas evitadas |
| **Vacíos de información** | Qué no sabemos (ej. "SMAP tiene 9 km de resolución: no ve diferencias dentro del lote") |
| **Riesgos / validar con agrónomo** | Ej. "Vicia puede ser hospedante de…; consultar disponibilidad de semilla" |

- **Sliders de escenario** (opcional): lluvia −20 % / +1 °C recalculan viabilidad e indicadores.
- **Aviso fijo:** *"Herramienta de apoyo: no reemplaza tu experiencia ni la de un agrónomo local."*

### 7.5 Glosario
Ícono "?" junto a cada término técnico (evapotranspiración, NDVI, anomalía, balance hídrico, grados-día). Explica en una frase qué es y la diferencia entre medición satelital y de campo.

---

## 8. Datos

### 8.1 Fuentes

| Dato | Lente | Cobertura | Cómo se obtiene |
|---|---|---|---|
| FIRMS MODIS C6.1 SP | Fuego | Mundial, 2000–2025 | ✅ Zips anuales ya descargados |
| FIRMS VIIRS S-NPP SP | Fuego | Mundial, 2012–2025 | ✅ Zips ya descargados |
| FIRMS VIIRS NOAA-20 SP | Fuego | Mundial, 2018–2025 | ✅ Zips ya descargados |
| FIRMS 2026 (SP hasta jul/ago, NRT hasta hoy) | Fuego | Mundial | API FIRMS (MAP_KEY) |
| NASA POWER (diario y climatología) | Ambas | Mundial, punto | API por punto, a demanda |
| GPM IMERG (lluvia, extremos) | Campo | Mundial, 0,1° | Precálculo mensual (GES DISC / Earthdata) |
| SMAP L3/L4 (humedad del suelo) | Campo + riesgo | Mundial, 9 km | Precálculo (Earthdata) |
| MODIS NDVI / ET / LST | Campo | Mundial, 250 m–1 km | API de series por punto (ORNL DAAC), a demanda |
| Landsat / HLS | Campo | Mundial, 30 m | Lotes de demo (AppEEARS) |
| ECOSTRESS (LST, ET) | Campo | Parcial, 70 m | Lotes de demo (AppEEARS) |
| SRTM (elevación) | Campo | Mundial, 30 m | Tiles por punto |
| GRACE / GRACE-FO | Campo | Mundial, regional | Precálculo anual |
| MCD12C1 (cobertura del suelo) | Ambas | Mundial | AppEEARS (GeoTIFF) |
| NASA GIBS | Ambas | Mundial | WMTS, sin key |
| SoilGrids (ISRIC) | Campo | Mundial, 250 m | API por punto |
| FAO GAEZ (aptitud de cultivos) | Campo | Mundial | Precálculo |
| ERA5 / GLDAS (respaldo de clima) | Campo | Mundial | Solo si POWER no alcanza |
| Sentinel-2 (ESA, socio oficial) | Campo | Mundial, 10 m | Lotes de demo |
| **Estimaciones Agrícolas MAGyP** | Campo | Argentina, por departamento | datos.gob.ar (CSV) |
| **Datos de Orin** (lotes, muestreos, estaciones, umbrales de helada) | Campo | Mendoza | Export de Firestore (GeoJSON + CSV) |

**Datos de Orin:** solo se usan los datos recolectados, no el código. Se aclara en el README que fueron recolectados antes del hackatón y de dónde provienen.

**Por qué no usamos los datasets de EE. UU. de la lista** (SSURGO, CDL, NASS, PRISM, NAIP, etc.): cubren solo EE. UU. Los reemplazamos con SoilGrids, MAGyP, POWER/GLDAS y Orin para que funcione en Argentina y en el resto del mundo.

### 8.2 Dos modos de obtener datos

| Modo | Para qué | Datos |
|---|---|---|
| **Precalculado** (pipeline offline) | Lo que es pesado o se compara en el tiempo | FIRMS armonizado, IMERG, SMAP, GRACE, GAEZ, cobertura del suelo, zonas análogas |
| **A demanda** (API del back) | Lo que depende del punto exacto del lote | POWER, series MODIS, SoilGrids, SRTM; se cachea por celda H3 nivel 6 + día |

### 8.3 Dónde se guarda cada cosa

| Capa | Formato | Dónde | En Git |
|---|---|---|---|
| Crudo | Zips FIRMS (9,1 GB) + descargas de NASA | `~/spaceapps-fuego/data/raw/` | ❌ |
| Trabajo | Parquet particionado + `fuego.duckdb` | `data/processed/` | ❌ |
| Datos para la web | JSON / Parquet chicos por región (ver 8.4) | **Cloudflare R2** (10 GB gratis, CDN) | ❌ |
| Base de cultivos | `crops.json` | `back/knowledge/` | ✅ |
| Plantillas de rotación | `rotations.json` | `back/knowledge/` | ✅ |
| Live / riesgo | `live.json`, `risk_*.json` | R2, generados por Actions | ❌ |
| Dataset armonizado publicable | Parquet + CSV | GitHub Release / Zenodo | ❌ (link) |
| Datos de Orin exportados | GeoJSON + CSV | `data/orin/` (privado) | ❌ |
| Secretos | `.env` | Local + env vars | ❌ **nunca** |

### 8.4 Contrato de datos para el front

Todos los conteos de fuego están en **unidades equivalentes a VIIRS NOAA-20**.

| Archivo | Contenido |
|---|---|
| `meta.json` | Fechas, versión, unidades, métricas de validación |
| `globe/{YYYY-MM}.json` | `[{h3, n}]` H3 nivel 3, para la animación del globo |
| `fire/cal/{h3_r2}.json` | Series mensuales de las celdas nivel 5 hijas + mediana y percentiles por mes. Se carga solo la región del usuario |
| `fire/points/{h3_r2}/{YYYY}.csv.gz` | Focos crudos para el CSV |
| `field/grid/{h3_r2}.json` | IMERG, SMAP, GRACE, GAEZ y cobertura agregados por celda nivel 5 |
| `field/analogs/{h3_r2}.json` | Zona análoga de cada celda nivel 5 |
| `live.json` | Focos NRT últimas 24 h / 7 días |
| `risk/{h3_r2}.json` | `{h3_r5: {p, cat, ratio, nivel, razones[]}}` |

**Por qué H3:** hexágonos de área casi igual en todo el planeta, jerarquía para cargar por partes (`h3_r2` ≈ región de ~87.000 km²) y `h3-js` en el navegador para pasar de círculo o polígono a celdas.

---

## 9. Motor de armonización

### 9.1 Ingesta y limpieza (FIRMS)
- Descomprimir los zips y leer con DuckDB. Esquema común: `sensor, satellite, acq_datetime, lat, lon, frp, confidence_norm, daynight, type, country`.
- Sumar 2026 por API (SP y luego NRT), sin duplicar: SP manda donde existe.
- Filtros: `type = 0`; MODIS confianza ≥ 30; VIIRS `nominal` y `high`.
- Asignar celdas H3 niveles 3, 5 y 6 (extensión `h3` de DuckDB).

### 9.2 Armonización MODIS ↔ VIIRS
- **Unidad final: equivalente VIIRS NOAA-20.** MODIS se apaga y el modo live es VIIRS, así que la historia se lleva a la escala que se seguirá usando.

| Período | Sensor disponible | Qué se usa |
|---|---|---|
| 2000 → 2011 | Solo MODIS | MODIS convertido |
| 2012 → 2025 | MODIS + VIIRS | VIIRS; MODIS sirve para calcular la conversión |
| 2026 → hoy | VIIRS | VIIRS |

- **Paso 1:** S-NPP → NOAA-20 con el solapamiento 2018–2025.
- **Paso 2:** MODIS → VIIRS con el solapamiento **2012–2025**, por estrato (cobertura del suelo × banda de latitud × mes): `log(VIIRS + 1) = a + b · log(MODIS + 1)` sobre conteos mensuales por celda.
- Se calibran por separado los conteos de detecciones y de **celdas-día con fuego**, porque VIIRS fragmenta un mismo fuego en más píxeles.
- **2000–2002:** solo Terra. Se calibra aparte y la línea base arranca en 2003.
- **Validación:** dejar 2023–2024 afuera y medir R², sesgo y error por bioma. Va en el README, en `meta.json` y en el video.
- 2000–2011 se marca como el tramo de **menor confianza**, porque convertir de un sensor menos sensible a uno más sensible tiene más incertidumbre.

### 9.3 Agregados de fuego
- Series mensuales por celda (nivel 3 para el globo, nivel 5 para los paneles).
- Línea base 2003–2022: mediana, p10, p90 y percentiles por celda y mes.
- Temporada de fuego (jul–jun) además del año calendario.
- Opcional: fuego agrícola vs. forestal con MCD12C1.

### 9.4 Capas de campo a la grilla común
- IMERG mensual (0,1°) → por celda nivel 5: lluvia media, variabilidad y días > 50 mm.
- SMAP (9 km) → humedad media mensual y anomalía. Se **marca la resolución** para los "vacíos de información".
- GRACE → tendencia regional del agua.
- GAEZ → aptitud por cultivo.
- MCD12C1 → cobertura dominante.
- Regla general: **los datos más gruesos que la celda se reparten; los más finos se promedian**, y cada valor guarda su resolución de origen.

---

## 10. Motor del campo e IA

### 10.1 Base de conocimiento de cultivos (`crops.json`)
~15 cultivos relevantes para Argentina y climas templados: soja, maíz, trigo, girasol, sorgo, cebada, maní, algodón, alfalfa, avena, centeno (cobertura), vicia (cobertura), colza/carinata, garbanzo, arveja.

Por cultivo: ventana de siembra y cosecha por zona, grados-día necesarios, tolerancia a heladas, sequía y calor, uso de agua (mm por ciclo), profundidad de raíz, fijación de N, aporte de rastrojo/carbono, familia (para plagas), valor forrajero y mercado en Argentina (cualitativo). **Cada dato lleva su fuente** (INTA, FAO, bibliografía), como los umbrales de helada de Orin.

### 10.2 Motor de rotaciones (determinístico y explicable)
1. **Plantillas** (`rotations.json`): ~12 rotaciones agronómicamente válidas (ej. *trigo/soja 2ª – maíz – soja*, *maíz – soja + vicia*, *pastura de alfalfa 3 años – agricultura*, *sorgo – soja – trigo/soja*).
2. **Filtro de viabilidad** con el diagnóstico del lote: ventana libre de heladas, grados-día, agua disponible (lluvia + humedad del suelo vs. uso del cultivo), aptitud GAEZ y restricciones del productor.
3. **Indicadores** por estrategia, comparados con la actual:
   - Balance de agua (uso vs. disponibilidad)
   - Aporte de carbono / materia orgánica
   - Balance de nitrógeno (leguminosas)
   - Días de suelo desnudo × lluvias extremas × pendiente → **riesgo de erosión**
   - Diversidad de familias → **corte de ciclos de plagas**
   - Ingreso / mercado (cualitativo)
   - Forraje
   - **Quemas evitadas** (rastrojo que no se quema)
4. **Puntaje** = indicadores ponderados por las prioridades del usuario → **top 3 alternativas** + la actual.
5. Cada indicador guarda **qué dato lo produjo** para armar la sección "Evidencia".

El motor no es una caja negra: siempre se puede explicar por qué una estrategia quedó primera.

### 10.3 IA

| Componente | Qué hace | Cómo |
|---|---|---|
| **Riesgo de fuego en 7 días** (Devin) | Probabilidad de ≥ 1 foco en la celda H3 nivel 5 | **Nivel base mundial:** LightGBM con historial de fuego, estacionalidad y cobertura del suelo (nuestros datos). **Nivel clima, Argentina:** + POWER (lluvia acumulada, días sin lluvia, humedad, temperatura, viento). Partición temporal: train 2012–2021, validación 2022, test 2023–2025. Tiene que superar a la línea base de climatología. Métricas: ROC-AUC, PR-AUC, Brier, calibración. Razones con SHAP |
| **Zonas análogas** | "Campos parecidos al tuyo" para la evidencia | Clustering (k-means / HDBSCAN) sobre clima, suelo y fenología NDVI armonizados por celda. En Argentina se cruza con MAGyP: qué se siembra y con qué rendimiento en zonas análogas |
| **Patrones del calendario** | Detecta suelo desnudo, transiciones y períodos de estrés | Umbrales y suavizado sobre la serie NDVI y las anomalías de humedad y temperatura |
| **Explicación en lenguaje simple** | Convierte puntajes y evidencia en texto para el productor | LLM con salida estructurada. **Solo explica**, no decide. Recibe los números y fuentes del motor y no puede inventar datos: cada afirmación debe citar un indicador |

**Incertidumbre:** cada número muestra su resolución y su fuente. Las tarjetas marcan baja confianza cuando hay pocos datos, resolución gruesa o estratos chicos en la calibración.

### 10.4 Validación satélite vs. campo (datos de Orin)
- Con los **muestreos de campo de Orin** (lotes de Mendoza): comparar NDVI satelital (MODIS, Landsat, Sentinel-2) y temperatura (MODIS LST, POWER) con lo medido en el lote o en estaciones.
- Reportar el error (RMSE, sesgo) y mostrarlo en la app como **"qué tan bien ve el satélite tu lote"**.
- Es exactamente lo que pide el brief al hablar de diferencias entre satélite y suelo, y casi nadie lo va a tener fuera de EE. UU.

### 10.5 Entregables pedidos a Devin
1. `model/fire_risk/`: dataset, entrenamiento de los dos niveles, `report.md` con métricas y comparación con la línea base, `predict.py` → `risk/{h3_r2}.json`.
2. `model/analogs/`: clustering + `field/analogs/*.json`.
3. **Dependencias:** tabla de focos limpia con H3 (hora 8) y capas de campo en la grilla (hora 16).
4. **Objetivo:** modelos y reportes a la hora 30.

---

## 11. Stack y arquitectura

| Capa | Tecnología | Por qué |
|---|---|---|
| Pipeline | Python 3.12, DuckDB (`h3`, `spatial`), pandas, pyarrow, xarray, earthaccess | Procesa ~300 M de focos y grillas NASA en una laptop |
| IA | LightGBM, scikit-learn, SHAP; LLM vía API | Tabular, explicable |
| Back | **FastAPI (Python)** en funciones serverless de Vercel | Reutiliza el código del pipeline; un solo lenguaje para la ciencia |
| Front | Vite + React + TypeScript | Rápido, conocido |
| Globo / mapa | MapLibre GL JS v5 (globe) + `h3-js` + NASA GIBS + OpenFreeMap | 3D y mapa local en una librería, sin keys |
| Gráficos | Calendarios en HTML/CSS (tablas accesibles) + Observable Plot | Accesible y liviano |
| Almacenamiento de datos | Cloudflare R2 (archivos estáticos con CDN) | Gratis hasta 10 GB, rápido en todo el mundo |
| Jobs | GitHub Actions: live cada 3 h, riesgo diario | Gratis |
| Hosting | Vercel (HTTPS, necesario para geolocalización) | Deploy en cada push |

**Endpoints del back**

| Endpoint | Función |
|---|---|
| `GET /api/live` | Proxy FIRMS NRT (esconde la MAP_KEY), cacheado |
| `POST /api/field/diagnose` | Recibe el polígono → consulta POWER, series MODIS, SoilGrids y SRTM, cruza con `field/grid` → diagnóstico + calendario agrícola |
| `POST /api/field/rotations` | Diagnóstico + rotación actual + prioridades + restricciones → actual + 3 estrategias con indicadores y evidencia |
| `POST /api/field/explain` | Estrategias → texto en lenguaje simple (LLM) |
| `GET /api/risk?lat&lon` | Riesgo de fuego de la celda |

```
  OFFLINE (laptop)                                   NUBE
  ┌───────────────────────────────┐   archivos    ┌──────────────┐
  │ pipeline/  FIRMS + NASA grids │ ────────────► │ Cloudflare R2│◄──┐
  │ model/     (Devin)            │               └──────┬───────┘   │
  └───────────────────────────────┘                      │           │ GitHub Actions
                                                         ▼           │ live (3 h), riesgo (diario)
  Navegador ◄──── Vercel: front (React + MapLibre) ──────┤
  (mobile)        Vercel: back (FastAPI) ── POWER, ORNL MODIS, SoilGrids, SRTM, FIRMS, LLM
```

**Sin base de datos en producción:** lo histórico es estático en R2, lo del lote se calcula a demanda y se cachea, y los lotes del usuario quedan en su navegador.

---

## 12. Mobile-first y accesibilidad (WCAG 2.2 AA)

| Requisito | Implementación |
|---|---|
| Mobile-first | Diseño a 360–400 px primero. Globo arriba, hoja deslizable abajo; en desktop, panel lateral. Tarjetas de rotación en carrusel |
| Rendimiento | < 300 KB de JS gz inicial (sin MapLibre); datos por región; precarga de meses al reproducir |
| Fallback | Sin WebGL o celular lento → mapa 2D (`projection: mercator`) o panel + tablas |
| Objetivos táctiles | ≥ 44 × 44 px |
| Lector de pantalla | Calendarios como `<table>` reales; resumen en texto; tarjetas con encabezados; `aria-live` moderado |
| Teclado | Flechas giran el globo, `+/-` zoom, espacio = play/pausa; el lote se puede definir por buscador + tamaño, sin dibujar |
| Color | Viridis/inferno y RdBu; contraste AA; nunca solo color |
| Movimiento | `prefers-reduced-motion`: sin auto-rotación ni vuelos |
| Lenguaje | Simple y sin jerga, con glosario; zoom 200 % sin romper |
| Idioma | Español (default) e inglés |

---

## 13. Equipo y plan de 48 h

### 13.1 Roles

El equipo es de **4 personas**. Cada una es dueña de una parte y la presentación se reparte al final.

| # | Persona | Es dueño/a de | Entrega principal |
|---|---|---|---|
| 1 | **Ezequiel** (+ Claude) | Lente Fuego: datos + motor de armonización + back de fuego + deploy | `pipeline/` FIRMS, calibración y validación, export a R2, `/api/live`, `/api/risk`, Vercel, R2, GitHub Actions |
| 2 | **Compañero de Orin** | Lente Campo: datos + conocimiento agronómico | Export de Orin, capas de campo a la grilla, `crops.json`, `rotations.json`, motor de rotaciones, `/api/field/*` |
| 3 | **Compañero con Devin** | IA | `model/fire_risk`, `model/analogs`; además usa Devin para tareas de front acotadas que le pase la persona 4 |
| 4 | **Cuarto integrante** | Front + UX + presentación | `web/` (globo, paneles, lote, tarjetas), accesibilidad, guion, video, slides |

Responsabilidades compartidas:
- **README:** cada uno escribe la sección de su parte; la persona 4 la unifica.
- **QA en celulares:** todos, en la ventana de las horas 32–40.
- **Revisión agronómica** de las rotaciones: persona 2.

### 13.2 Cronograma

| Horas | 1. Fuego + deploy (Ezequiel) | 2. Campo (Orin) | 3. IA (Devin) | 4. Front + presentación |
|---|---|---|---|---|
| 0–8 | Ingesta + limpieza + H3; repo, Vercel y R2 | Export de Orin; `crops.json`; prueba de APIs POWER / ORNL / SoilGrids | Diseño de features; Devin arma el esqueleto de `web/` | Wireframes mobile; globo + geolocalización |
| 8–16 | Armonización + validación; `/api/live` | IMERG, SMAP y GAEZ a la grilla; `/api/field/diagnose` | Dataset de riesgo | Modo histórico (datos de prueba); pantalla de lote |
| 16–24 | Agregados + export a R2; Actions | `rotations.json` + motor de rotaciones | Entrenamiento + línea base; clustering | Panel fuego; diagnóstico + calendario agrícola |
| 24–32 | Temporada jul–jun; 2026 por API; `/api/risk` + job diario | `/api/field/rotations` + `/explain`; validación con Orin | Evaluación, SHAP, `predict.py` | Tarjetas de rotación; modo live; riesgo; guion del video |
| 32–40 | Dataset publicable; QA | Ajuste de indicadores; QA | Reportes; QA | Accesibilidad, glosario, mobile; slides; grabación |
| 40–44 | README del método; deploy final | README del motor | `report.md` | Edición del video; README unificado |
| 44–48 | **Buffer + entrega (todos)** | | | |

Con 4 personas, los **Could** de la sección 5 (escenarios de clima, fuego agrícola vs. forestal, ECOSTRESS, inglés) solo se hacen si sobra tiempo después de la hora 32.

### 13.3 Puntos de corte
- **Hora 12:** si la armonización mundial no está, Sudamérica primero y mundo después.
- **Hora 20:** si el diagnóstico a demanda es lento, se precalculan los lotes de demo y el resto usa solo la grilla.
- **Hora 24:** si el globo no rinde en celular, 2D por defecto.
- **Hora 30:** si el modelo de riesgo no supera la línea base, se muestra la climatología ("riesgo histórico de esta época").
- **Hora 32:** si el LLM no es confiable, las tarjetas usan texto con plantillas a partir de los indicadores.
- **Hora 40:** congelar funcionalidades.

---

## 14. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Alcance grande (dos lentes) con 4 personas | Alto | MoSCoW (sección 5), puntos de corte (13.3), un dueño por parte, Devin y Claude como apoyo de código |
| La entrega exige elegir **un** challenge | Alto | Confirmar con la sede (sección 16). Elegir el que mejor cuente la historia y mencionar el otro |
| Recomendaciones agronómicas incorrectas | Alto | Base de cultivos con fuentes; motor determinístico; "validar con agrónomo"; revisión del compañero de Orin |
| LLM inventa datos | Alto | Solo recibe indicadores y debe citarlos; fallback a plantillas |
| APIs externas lentas o caídas (POWER, ORNL, SoilGrids) | Medio | Caché por celda; lotes de demo precalculados |
| Rendimiento del globo en celular | Alto | H3 por niveles, carga por región, fallback 2D |
| Datos de Orin: uso previo al hackatón | Medio | Solo datos, no código; transparencia en el README |
| MAP_KEY / keys del LLM expuestas | Medio | Solo en el back y en `.env` / env vars |
| Validación de la armonización floja | Alto | Calibrar por estrato y reportar el error honestamente |

---

## 15. Entrega y criterios de aceptación

Evaluación virtual con lo entregado. Criterios de la sede, con el mismo peso: **presentación, originalidad, solidez**.

**Lista de entrega**
- [ ] Demo online (celular y desktop).
- [ ] Video de 2–3 min: problema → motor de armonización (gráfico de validación) → globo histórico → "mi zona" + riesgo → "mi campo" con 3 rotaciones → validación con datos reales de campo. Se muestra sobre un evento conocido y un lote real. Sin menores de 18.
- [ ] Repo público con README: problema, datos, método, validación, limitaciones, origen de los datos de Orin, cómo correrlo.
- [ ] Dataset armonizado descargable.
- [ ] Categorías (a elegir 1–3): **Best Use of Data**, **Local Impact**, **Galactic Impact**.

**Criterios de aceptación**
- [ ] La serie de fuego armonizada no muestra salto en 2012 ni en 2018.
- [ ] Con ubicación aceptada, en < 5 s se ve el panel de la zona en un celular con 4G, **en cualquier país**.
- [ ] Dibujar un lote devuelve diagnóstico + calendario agrícola en < 10 s.
- [ ] Se comparan actual + 3 estrategias, cada una con las 5 secciones del brief.
- [ ] Cada número del diagnóstico muestra su fuente y su resolución.
- [ ] El semáforo compara el mes actual contra la mediana 2003–2022.
- [ ] El CSV coincide con el calendario.
- [ ] Toda la app se usa con teclado; Lighthouse Accessibility ≥ 90.
- [ ] Ninguna key aparece en el repo ni en el bundle del front.

---

## 16. Preguntas abiertas
- **¿En qué challenge presentamos?** Confirmar con la sede si se puede elegir más de uno. Recomendación: Field Shift como principal (el fuego entra como capa del campo), o Hot Spots si el equipo prefiere que el globo sea lo central.
- ¿Quién es el cuarto integrante y confirma el rol de front + presentación (sección 13.1)?
- ¿Qué lote pampeano usamos para la demo de rotaciones?
- ¿Qué datos de Orin exportamos exactamente (lotes, muestreos, estaciones) y en qué formato?
- ¿Qué LLM usamos (créditos disponibles)?
- ~~¿Nombre del proyecto?~~ Resuelto: **Ashfield** (D20).

# PRD — Globo de Fuego

**NASA Space Apps Challenge 2026 · Challenge: Harmonization of MODIS and VIIRS Hot Spots**
Versión 1 · 14/11/2026

---

## 1. Resumen

Una web mobile-first con un **globo 3D** que muestra 25 años de focos de calor de NASA en **una sola serie comparable** (MODIS + VIIRS armonizados). Tiene dos modos:

- **Histórico** (lo que pide el challenge): el globo anima mes a mes desde 2000 hasta hoy y, mientras el usuario lo gira, un panel muestra el **calendario de fuego** de la región que tiene en el centro.
- **Live**: focos detectados en las últimas 24 h / 7 días sobre la imagen satelital del día.

Además, un **modelo de IA** estima la **probabilidad de que haya fuego cerca del usuario en los próximos 7 días**. Así deja de ser solo una herramienta de información y pasa a ser útil para alguien en un campo, una brigada o un municipio.

Al abrir, la app pide la ubicación (con un botón, no automáticamente), centra el globo en el usuario y le muestra su zona.

---

## 2. Problema y objetivo

**Problema.** Los satélites registran focos de calor desde 2000, pero el registro está partido entre sensores que no se pueden comparar directamente:

- **MODIS** (Terra/Aqua, píxel de 1 km, desde 2000) está terminando su vida útil en 2026.
- **VIIRS** (S-NPP desde 2012, NOAA-20 desde 2018, NOAA-21 desde 2023, píxel de 375 m) detecta muchos más focos.

Si se juntan sin corregir, la serie "salta" y no se puede saber si un año fue peor que otro por el fuego o por el sensor.

**Objetivo.** Que el sensor de origen deje de importar y el usuario pueda responder rápido:

1. ¿En qué meses del año hay más fuego en esta zona?
2. ¿Qué años tuvieron más actividad?
3. ¿Cómo viene el mes actual contra la mediana histórica?
4. **(Nuestro extra)** ¿Qué tan probable es que haya fuego cerca mío en los próximos días?

---

## 3. Usuarios y casos de uso

| Usuario | Necesidad | Qué hace en la app |
|---|---|---|
| Productor rural / vecino de zona rural | Saber si se viene una semana de riesgo | Abre la app, comparte ubicación, ve el riesgo de 7 días y el calendario de su zona |
| Brigadista / bombero / Defensa Civil | Saber si la actividad actual es anómala | Modo live + semáforo "mes actual vs mediana" de su área |
| Gestor de territorio / municipio | Planificar temporada (personal, prevención) | Calendario histórico de su área, exporta CSV |
| Científico / estudiante | Serie consistente para analizar | Descarga el dataset armonizado y la serie del área |
| Jurado | Entender el problema y la solución en 2 minutos | Abre la demo y el globo se explica solo |

---

## 4. Alcance

| Prioridad | Funcionalidad |
|---|---|
| **Must** (MVP) | Armonización MODIS ↔ VIIRS validada (global, mensual) |
| **Must** | Globo 3D con modo histórico animado (slider + play) |
| **Must** | Calendario año × mes de la región en el centro del globo / área elegida |
| **Must** | Mes actual vs mediana histórica (semáforo + número) |
| **Must** | Ubicación del usuario con fallback a buscador |
| **Must** | Descarga CSV de la serie del área |
| **Must** | Mobile-first y accesible (ver sección 11) |
| **Should** | Modo live (últimas 24 h / 7 días) |
| **Should** | Modelo de riesgo de 7 días en Argentina |
| **Should** | Calendario por temporada de fuego (julio–junio) para hemisferio sur |
| **Could** | Separación fuego agrícola vs. forestal (cobertura del suelo) |
| **Could** | Dibujar polígono libre como área de interés |
| **Could** | Inglés además de español |
| **Won't** (en 48 h) | Modelo de riesgo global, alertas push, cuentas de usuario |

---

## 5. Experiencia de usuario

### 5.1 Primer ingreso

1. Pantalla de bienvenida corta: qué es la app + botón **"Ver fuego cerca mío"** + link "Explorar el planeta".
2. Al tocar el botón se pide la geolocalización (exige HTTPS).
   - **Acepta:** el globo vuela hasta su ubicación, marca un área de **50 km de radio** y abre el panel con riesgo de 7 días, semáforo del mes y calendario.
   - **Rechaza / sin GPS:** buscador de ciudad o provincia; vista inicial de Argentina. La app nunca queda bloqueada.
3. Texto visible: *"Tu ubicación se usa solo en tu navegador y no se guarda."*

### 5.2 El globo

- **MapLibre GL JS v5 con proyección `globe`**: es un globo 3D cuando se ve el planeta entero y se aplana a mapa al acercarse. Eso resuelve con una sola librería tanto la vista global como la vista "cerca mío" de 50 km.
- Fondo: **NASA GIBS Blue Marble** (sin API key). Al acercarse se superponen etiquetas de ciudades y rutas (OpenFreeMap, sin key).
- Los focos agregados se dibujan como **hexágonos H3** coloreados por cantidad (escala secuencial apta para daltonismo).
- **Retícula en el centro**: la región que queda bajo la retícula es la que muestra el panel. Al girar el globo, el panel se actualiza (con *debounce* de ~300 ms).
- Modo **"tour"** opcional: auto-rotación lenta que se detiene al tocar; desactivado si el usuario tiene `prefers-reduced-motion`.

### 5.3 Modo histórico (el núcleo del challenge)

- Slider temporal mes a mes **nov-2000 → hoy** + botón **Play/Pausa** + velocidad.
- Al reproducir, los hexágonos del globo cambian mes a mes y en el calendario del panel se resalta la celda del mes que se está mostrando.
- El usuario puede **girar el globo mientras se reproduce**: la animación sigue y el calendario cambia a la nueva región.
- Toggle **año calendario / temporada de fuego (jul–jun)**.
- Toggle **cantidades / anomalías** (desvío contra la mediana 2003–2022, escala divergente).

### 5.4 Modo live

- Focos de las **últimas 24 h** (toggle 48 h / 7 días) de VIIRS (NOAA-20, NOAA-21, S-NPP) y MODIS, como puntos coloreados por intensidad (FRP).
- Fondo opcional: **imagen satelital del día** (GIBS VIIRS True Color), donde se ve el humo.
- Panel: focos en el área hoy, semáforo del mes contra la mediana, riesgo de 7 días.
- Leyenda: "última actualización hace X horas" (los datos NRT llegan cada ~3 h).

### 5.5 Panel de área (mobile: hoja deslizable abajo; desktop: lateral)

1. **Riesgo próximos 7 días** (solo Argentina en el MVP): categoría (Bajo / Moderado / Alto / Muy alto) + "x veces lo normal para esta época" + 2–3 razones ("23 días sin lluvia", "humedad baja", "temporada de quemas").
2. **Semáforo del mes**: "Noviembre 2026: 340 focos — 2,3× la mediana — percentil 95".
3. **Calendario**: filas = años, columnas = 12 meses. Tocar una celda muestra el número.
4. **Gráficos breves**: focos por año (barras) y estacionalidad (mediana por mes).
5. **Descargar CSV**.
6. Si el riesgo es alto: qué hacer y teléfonos (**Bomberos 100**, **Emergencias 911**).

---

## 6. Arquitectura

```
                 ┌───────────────────────────── OFFLINE (laptop, una vez) ─────────────────────────────┐
FIRMS zips ──►   │ pipeline/ (Python + DuckDB)                                                       │
(MODIS, S-NPP,   │  01_ingest → 02_clean → 03_grid (H3) → 04_harmonize → 05_aggregate → 06_export   │
 NOAA-20)        │                                  ▲                                                │
FIRMS API SP ──► │                                  │ cobertura de suelo (MCD12C1, AppEEARS)         │
 (ene–ago 2026)  │                                                                                   │
NASA POWER ────► │ model/ (Devin): features → LightGBM → evaluación → model.txt                     │
                 └──────────────────────────────┬────────────────────────────────────────────────────┘
                                                │ archivos estáticos chicos (JSON/Parquet)
                                                ▼
          ┌────────────────── Vercel ──────────────────┐        ┌──────── GitHub Actions (cron) ────────┐
          │ web/ (Vite + React + TS + MapLibre)         │◄───────│ cada 3 h: live.json (FIRMS NRT)        │
          │ /data/...  (estáticos del pipeline)         │        │ diario: risk_ar.json (modelo + POWER)  │
          │ /api/live  → proxy FIRMS NRT (MAP_KEY oculta)│        │ diario: mes actual vs mediana          │
          │ /api/risk  → lookup en risk_ar.json         │        └────────────────────────────────────────┘
          └─────────────────────────────────────────────┘
                                ▲
                          Navegador (mobile)
```

**Decisiones clave**

- **Sin base de datos en producción.** Todo lo histórico se precalcula y se sirve como archivos estáticos. Es más rápido, gratis y no se cae durante la evaluación.
- **Back mínimo** en funciones serverless de Vercel: solo para no exponer la MAP_KEY de FIRMS y para el lookup de riesgo.
- **Jobs programados** en GitHub Actions para refrescar live y riesgo. Si fallan, la app muestra el último dato con su fecha.

---

## 7. Datos

### 7.1 Fuentes

| Dato | Período | Uso | Origen |
|---|---|---|---|
| MODIS C6.1 SP (Terra + Aqua) | 2000-11 → 2025 (zips) + 2026-01 → 2026-08 (API) | Serie histórica | FIRMS zips anuales all countries + API `MODIS_SP` |
| VIIRS S-NPP SP | 2012 → 2025 (zips) + 2026 (API) | Solapamiento largo con MODIS | FIRMS zips + API `VIIRS_SNPP_SP` |
| VIIRS NOAA-20 SP | 2018 → 2025 (zips) + 2026 (API) | Referencia VIIRS | FIRMS zips (`viirs-jpss1`) + API `VIIRS_NOAA20_SP` |
| NRT (todos los sensores) | Desde donde termina SP → hoy | Mes actual + modo live | API FIRMS `*_NRT` |
| MCD12C1 (cobertura del suelo) | Anual | Agrícola vs. forestal, calibración por bioma | NASA AppEEARS (pedir GeoTIFF para evitar HDF4) |
| NASA POWER (diario) | 2012 → hoy | Variables del modelo de riesgo | API POWER (regional) |
| Imágenes GIBS | — | Fondo del globo (Blue Marble, True Color diario) | GIBS WMTS, sin key |
| Límites de provincias / ciudades | — | Buscador | IGN / Natural Earth |

Disponibilidad confirmada con la API (14/11): `MODIS_SP` hasta 2026-08-31, `VIIRS_NOAA20_SP` y `VIIRS_SNPP_SP` hasta 2026-07-31; NRT hasta hoy.

### 7.2 Dónde se guarda cada cosa

| Capa | Formato | Dónde | En Git |
|---|---|---|---|
| Crudo | Zips FIRMS (~10 GB) | `~/spaceapps-fuego/data/raw/` | ❌ |
| Limpio | Parquet particionado por año y sensor | `data/processed/hotspots/` | ❌ |
| Trabajo | `fuego.duckdb` (tablas intermedias, calibración) | `data/processed/` | ❌ |
| Dataset armonizado publicable | Parquet + CSV mensual por celda H3 | GitHub Release / Zenodo | ❌ (link en README) |
| Para la web | JSON/Parquet chicos (ver 7.3) | `web/public/data/` | ✅ (< 100 MB total) |
| Live / riesgo | `live.json`, `risk_ar.json` | Generados por Actions | ✅ / artefacto |
| Secretos | `.env` (`FIRMS_MAP_KEY`) | Local + env vars de Vercel/Actions | ❌ **nunca** |

### 7.3 Contrato de datos para el front

Todos los conteos están en **unidades armonizadas** (ver 8.4).

| Archivo | Contenido | Tamaño estimado |
|---|---|---|
| `data/meta.json` | Rango de fechas, versión, unidades, métricas de validación | < 5 KB |
| `data/globe/{YYYY-MM}.json` | `[{h3, n}]` por celda **H3 res 3** (~12.000 km²) con fuego ese mes, para el globo | ~30–60 KB gz c/u, ~300 archivos |
| `data/cal/{h3_r1}.json` | Para cada celda res 3 hija: serie mensual + mediana y percentiles por mes | ~840 archivos, carga bajo demanda |
| `data/ar/cal/{h3_r3}.json` | Detalle Argentina: series mensuales por celda **H3 res 5** (~250 km²) | carga bajo demanda |
| `data/ar/points/{h3_r3}/{YYYY}.csv.gz` | Focos crudos de Argentina, para el CSV | carga bajo demanda |
| `live.json` | Focos NRT últimas 24 h / 7 d | 1–5 MB |
| `risk_ar.json` | `{h3_r5: {p, cat, ratio, razones[]}}` | < 1 MB |

**Por qué H3:** hexágonos de área casi igual en todo el planeta (una grilla lat/lon deforma en latitudes altas), jerarquía padre/hijo para cargar por partes y `h3-js` en el navegador para pasar de "círculo de 50 km" o "polígono" a la lista de celdas a sumar.

**Por qué no DuckDB-WASM en el front:** pesa varios MB y es lento de iniciar en celulares. Con archivos precalculados el front solo hace `fetch` + suma.

---

## 8. Procesamiento y análisis

### 8.1 Ingesta (`01_ingest.py`)
- Descomprimir zips y leer CSVs con DuckDB (`read_csv` en paralelo). Normalizar columnas MODIS vs. VIIRS en un esquema común: `sensor, satellite, acq_datetime, lat, lon, frp, confidence_norm, daynight, type`.
- Sumar 2026 por API SP y luego NRT, **sin duplicar** (SP manda donde existe).

### 8.2 Limpieza (`02_clean.py`)
- Solo `type = 0` (vegetación presunta; fuera volcanes, fuentes industriales fijas y offshore).
- Confianza: MODIS ≥ 30; VIIRS `nominal` y `high`.
- Normalizar día local vs. UTC para agrupar por día.

### 8.3 Grilla (`03_grid.py`)
- Asignar celdas H3 res 3, 5 y 6 (extensión `h3` de DuckDB).
- Para comparar sensores con resolución distinta: contar **celdas-día con fuego** además de detecciones, porque VIIRS fragmenta un mismo fuego en más píxeles.

### 8.4 Armonización (`04_harmonize.py`)
- **Unidad final: equivalente VIIRS NOAA-20.** El futuro es VIIRS (MODIS se apaga y el modo live es VIIRS), así que la historia se lleva a la escala que se va a seguir usando.
- **Paso 1 – VIIRS ↔ VIIRS:** S-NPP → NOAA-20 con el solapamiento 2018–2025 (factor cercano a 1).
- **Paso 2 – MODIS → VIIRS:** con el solapamiento **2012–2025 (14 años)**, ajustar por estrato (grupo de cobertura del suelo × banda de latitud × mes):
  `log(VIIRS + 1) = a + b · log(MODIS + 1)` sobre conteos mensuales por celda H3 res 3.
- **Ojo con 2000–2002:** solo Terra (Aqua empieza a mediados de 2002). Se calibra Terra-solo aparte, o la línea base de anomalías arranca en 2003.
- **Validación:** dejar afuera 2023–2024, aplicar la conversión a MODIS y comparar con VIIRS real. Reportar **R², sesgo y error por bioma**. Va en el README, en `meta.json` y en el video.
- Las celdas o estratos con pocos datos usan el factor global y se marcan con menor confianza.

### 8.5 Agregados y anomalías (`05_aggregate.py`)
- Serie mensual armonizada por celda (res 3 global, res 5 Argentina).
- **Línea base 2003–2022**: mediana, p10, p90 y percentiles por celda y mes.
- **Anomalía del mes** = conteo / mediana y percentil.
- **Temporada de fuego**: además del año calendario, agregación julio–junio.
- Opcional: separar agrícola vs. forestal cruzando con MCD12C1.

### 8.6 Exportación (`06_export.py`)
- Genera todo `web/public/data/` según el contrato 7.3 y el dataset armonizado publicable.

---

## 9. Modelo de IA: riesgo de fuego en 7 días (lo entrena Devin)

### 9.1 Objetivo
Para cada celda **H3 res 5** (~250 km²) de **Argentina**, estimar la **probabilidad de que haya al menos un foco VIIRS en los próximos 7 días**, con lo observado hasta hoy.

No necesita pronóstico meteorológico: usa condiciones **pasadas** (sequía acumulada, días sin lluvia, historial de fuego), que son las que más predicen.

### 9.2 Datos de entrenamiento
- **Unidad:** celda × semana, 2012–2025.
- **Etiqueta:** 1 si hubo ≥ 1 foco VIIRS (armonizado) en los 7 días siguientes.
- **Features:**

| Grupo | Variables |
|---|---|
| Historial de fuego | Focos en los últimos 7 / 30 / 365 días; climatología de la celda para esa semana del año |
| Estacionalidad | Semana del año (seno/coseno), hemisferio/temporada |
| Clima (NASA POWER) | Temp. máx., humedad relativa, viento, precipitación acumulada 7 / 30 / 90 días, días desde la última lluvia |
| Terreno | Cobertura del suelo (MCD12C1), latitud/longitud de la celda |
| Opcional | Anomalía de NDVI (MODIS MOD13) |

### 9.3 Modelo y validación
- **LightGBM** binario (rápido, bueno con tablas, explicable). Manejo de desbalance con pesos.
- **Partición temporal** (nunca aleatoria): train 2012–2021, validación 2022, test 2023–2025.
- **Línea base a superar:** "climatología" (frecuencia histórica de fuego en esa celda y semana). Si el modelo no le gana, se dice.
- **Métricas:** ROC-AUC, PR-AUC, Brier score y curva de calibración. Estas métricas van en el video y el README.
- **Explicabilidad:** valores SHAP → las 2–3 "razones" que se muestran al usuario.

### 9.4 Salida y servicio
- Job diario (GitHub Actions): baja POWER de los últimos días, calcula features, corre el modelo y genera `risk_ar.json`.
- Categorías por **ratio contra la climatología**: Bajo (< 0,75×), Moderado (0,75–1,5×), Alto (1,5–3×), Muy alto (> 3×).
- **Aviso siempre visible:** *"Estimación experimental basada en datos satelitales. No reemplaza alertas oficiales."*

### 9.5 Entregables pedidos a Devin
1. `model/build_dataset.py`: genera el dataset de entrenamiento desde `fuego.duckdb` + POWER.
2. `model/train.py` → `model/model.txt` + `model/report.md` (métricas, curvas, comparación con la línea base).
3. `model/predict.py` → `risk_ar.json` según el contrato 7.3.
4. Tiempo objetivo: modelo y reporte a la **hora 30**.

**Dependencia:** necesita la tabla de focos limpia (8.2–8.3) a la **hora 8**.

---

## 10. Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Pipeline | Python 3.12, DuckDB (+ extensiones `h3`, `spatial`), pandas, pyarrow | Procesa los ~300 M de focos en una laptop |
| Modelo | LightGBM, scikit-learn, SHAP | Estándar para datos tabulares, explicable |
| Front | Vite + React + TypeScript | Rápido de armar; el equipo lo conoce |
| Globo / mapa | **MapLibre GL JS v5 (proyección globe)** | Globo 3D y mapa local con la misma librería, buen rendimiento en celulares, sin key |
| Celdas | `h3-js` | Círculo/polígono → celdas a sumar |
| Gráficos | Calendario en HTML/CSS (tabla accesible) + Observable Plot para barras | Accesible por defecto, liviano |
| Fondo | NASA GIBS (Blue Marble, VIIRS True Color) + OpenFreeMap | Imágenes de NASA, sin key |
| Back | Funciones serverless de Vercel (TypeScript) | Esconde la MAP_KEY, gratis |
| Jobs | GitHub Actions (cron) | Live cada 3 h, riesgo diario |
| Hosting | Vercel (HTTPS, necesario para geolocalización) | Deploy en cada push |
| i18n | JSON es/en | Liviano |

**Alternativas descartadas:** CesiumJS (muy pesado para celular, necesita token para fondo); globe.gl/three.js (lindo, pero hay que resolver aparte el mapa local y la accesibilidad); DuckDB-WASM (peso y arranque en celular).

---

## 11. Mobile-first y accesibilidad (WCAG 2.2 AA)

| Requisito | Implementación |
|---|---|
| Mobile-first | Se diseña a 360–400 px primero. Globo arriba, panel como hoja deslizable abajo. En desktop, panel lateral |
| Rendimiento | Carga inicial < 300 KB de JS gz (sin contar MapLibre); datos bajo demanda; precarga de los meses siguientes al reproducir |
| Fallback | Sin WebGL o celular lento → vista 2D (misma librería, `projection: mercator`) o directamente panel + tabla |
| Objetivos táctiles | ≥ 44 × 44 px |
| Lector de pantalla | El calendario es una `<table>` real con encabezados; cada celda tiene su número. Resumen en texto arriba del calendario. `aria-live` anuncia el mes durante la reproducción (con moderación) |
| Teclado | Todo usable sin mouse: flechas giran el globo, `+/-` zoom, espacio = play/pausa, foco visible, orden lógico; el área se puede elegir por buscador |
| Color | Viridis/inferno (cantidades) y RdBu (anomalías); contraste AA; **nunca solo color**: número, ícono o texto al lado |
| Movimiento | `prefers-reduced-motion`: sin auto-rotación ni animaciones de vuelo |
| Texto | Lenguaje simple, tamaños relativos (`rem`), zoom del navegador al 200 % sin romper |
| Idioma | Español (default) e inglés |

---

## 12. Equipo y plan de 48 h

### 12.1 Roles

| Rol | Responsable | Entrega principal |
|---|---|---|
| Datos + armonización | _(asignar)_ + Claude | `pipeline/`, dataset armonizado, validación |
| Modelo de IA | Compañero con Devin | `model/`, `risk_ar.json`, reporte |
| Front (globo + panel) | _(asignar, 1–2 personas)_ | `web/` |
| Back + deploy + jobs | _(asignar)_ | `/api/*`, Actions, Vercel |
| Presentación | _(asignar)_ | Video, slides, README, categorías |

### 12.2 Cronograma

| Horas | Datos | Modelo (Devin) | Front | Back / deploy | Presentación |
|---|---|---|---|---|---|
| 0–8 | Ingesta + limpieza + H3 | Diseño de features, bajar POWER | Esqueleto Vite + globo MapLibre + geolocalización | Repo, Vercel, `/api/live` | Guion del video |
| 8–16 | Armonización + validación | Dataset de entrenamiento | Modo histórico con datos de prueba | GitHub Actions live | Identidad visual |
| 16–24 | Agregados + export | Entrenamiento + línea base | Panel: calendario + semáforo | Integración de datos reales | Capturas |
| 24–32 | Temporada jul–jun, agrícola/forestal | Evaluación + `predict.py` | Modo live + riesgo | `/api/risk` + job diario | Slides |
| 32–40 | Dataset publicable | Ajustes + SHAP | Accesibilidad + mobile pulido | QA en celulares reales | Grabación del video |
| 40–44 | README del método | `report.md` | Bugs | Deploy final | Edición |
| 44–48 | **Buffer + entrega** | | | | |

### 12.3 Puntos de corte
- **Hora 12:** si la armonización global no está, se sigue con Argentina + Sudamérica.
- **Hora 24:** si el globo 3D tiene problemas de rendimiento en celular, se usa 2D por defecto y globo como opción.
- **Hora 30:** si el modelo no le gana a la línea base, se muestra la **climatología** como "riesgo histórico de esta época" (sigue siendo útil y honesto).
- **Hora 40:** congelar funcionalidades; solo bugs y presentación.

---

## 13. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Rendimiento del globo en celulares de gama baja | Alto | Agregados H3 res 3, carga bajo demanda, fallback 2D |
| Armonización con mala validación | Alto | Calibrar por estrato; mostrar el error honestamente; usar celdas-día |
| MAP_KEY expuesta | Medio | Solo en `.env` / env vars; proxy `/api/live` |
| Límite de la API FIRMS (transacciones por 10 min) | Medio | Live cacheado por Actions, no por usuario |
| Modelo sobreprometiendo | Alto (reputación) | Línea base, métricas, aviso visible, categorías relativas |
| HDF4 de MCD12C1 | Bajo | Pedir GeoTIFF por AppEEARS o dejar como "could" |
| Tiempo | Alto | MoSCoW (sección 4) y puntos de corte (12.3) |

---

## 14. Entrega y criterios de aceptación

Se evalúa virtualmente con lo entregado. Criterios de la sede, con el mismo peso: **presentación, originalidad, solidez**.

**Lista de entrega**
- [ ] Demo online en Vercel que abre en celular y desktop.
- [ ] Video de 2–3 min: problema → armonización (gráfico de validación) → globo histórico → "cerca mío" + riesgo → caso Corrientes 2022. Sin menores de 18.
- [ ] Repo público con README: problema, datos, método, validación, limitaciones, cómo correrlo.
- [ ] Dataset armonizado descargable.
- [ ] Categorías: **Best Use of Data** (armonización de dos sensores de NASA) y **Local Impact** (riesgo para zonas rurales argentinas, CONAE).

**Criterios de aceptación del MVP**
- [ ] La serie armonizada no muestra salto en 2012 ni en 2018 (verificado en gráfico).
- [ ] Con ubicación aceptada, en < 5 s se ve el panel de la zona en un celular con 4G.
- [ ] Sin ubicación, el buscador lleva a cualquier provincia argentina.
- [ ] El calendario responde a "qué mes y qué año tuvieron más fuego" sin leer números (color) y con números (tocar/lector de pantalla).
- [ ] El semáforo compara el mes actual contra la mediana 2003–2022.
- [ ] El CSV descargado coincide con lo que muestra el calendario.
- [ ] La app se usa completa con teclado y pasa una revisión con Lighthouse Accessibility ≥ 90.
- [ ] La MAP_KEY no aparece en el repo ni en el bundle del front.

---

## 15. Preguntas abiertas
- ¿Quién toma cada rol de la sección 12.1?
- ¿El equipo prefiere React o algo más liviano (Svelte) para el front?
- ¿Devin puede correr con acceso a `fuego.duckdb` o le pasamos un Parquet exportado?
- ¿Incluimos el caso Corrientes 2022 o elegimos otro evento más reciente?

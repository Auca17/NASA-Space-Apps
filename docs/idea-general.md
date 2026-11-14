# Proyecto Hot Spots – Space Apps 2026

Nov 14, 2026 · @Ezequiel

Vamos con el challenge **Harmonization of MODIS and VIIRS Hot Spots**: una web mobile-first con un globo 3D que une 25 años de focos de calor de NASA en una sola serie comparable, la muestra como calendario de fuego y estima el riesgo de fuego cerca del usuario. El detalle completo está en el [PRD](PRD.md).

## La idea

MODIS (Terra/Aqua) detecta focos de calor desde 2000 y se apaga en 2026; VIIRS lo reemplaza con píxeles de 375 m que ven muchos más focos. Si se juntan sin corregir, la serie salta y no se puede comparar un año con otro. Nosotros los armonizamos y construimos:

- **Modo histórico** (lo que pide el challenge): el globo anima mes a mes desde 2000 y, mientras el usuario lo gira, el panel muestra el calendario de fuego de la región que tiene en el centro.
- **Modo live**: focos de las últimas 24 h / 7 días sobre la imagen satelital del día.
- **Riesgo de 7 días** (modelo de IA, Argentina): probabilidad de fuego cerca del usuario, para que sea útil a alguien en un campo y no solo informativo.

Por qué este challenge:

- Entregable claro y medible: armonización + calendario + comparación con la mediana + CSV.
- Poca competencia visible frente a Field Shift, que ya tiene muchos proyectos casi iguales.
- Relevancia local: el challenge tiene foto de CONAE y Argentina tiene incendios grandes (Corrientes, Delta, Córdoba, Patagonia).
- Es oportuno: MODIS deja de operar este año.

Los tres criterios del jurado de sede valen igual (presentación, originalidad, solidez, 1 a 5 cada uno). Nuestra fuerza es la solidez; la originalidad la ganamos con el globo, el riesgo de 7 días y los diferenciales.

## Armonización MODIS ↔ VIIRS

El objetivo es que al final "el sensor de origen no importe": una sola serie en **unidades equivalentes a VIIRS NOAA-20**, porque MODIS se apaga y todo dato nuevo (incluido el modo live) llega en VIIRS.

| Período | Sensor disponible | Qué se usa en la serie |
| --- | --- | --- |
| 2000 → 2011 | Solo MODIS | MODIS convertido a equivalente VIIRS |
| 2012 → 2025 | MODIS + VIIRS | VIIRS tal cual; MODIS sirve para calcular la conversión |
| 2026 → hoy | VIIRS | VIIRS tal cual |

1. Filtrar: solo `type = 0` (fuego de vegetación; fuera volcanes, industria y offshore). VIIRS sin confianza `low`; MODIS con confianza ≥ 30.
2. Unidad común: celdas hexagonales **H3** (res 3 global, res 5 Argentina), conteo mensual de focos y de celdas-día con fuego.
3. Calibrar S-NPP → NOAA-20 con el solapamiento 2018–2025.
4. Calibrar MODIS → VIIRS con el solapamiento **2012–2025 (14 años)**: regresión log-log por cobertura del suelo × banda de latitud × mes.
5. 2000–2002 es solo Terra: se calibra aparte y la línea base de anomalías arranca en 2003.
6. Validar: dejar 2023–2024 afuera y medir R² y sesgo. Ese gráfico va a la presentación: es la prueba de solidez.

## La web app

| Lo que pide el brief | Cómo lo resolvemos |
| --- | --- |
| Elegir un área de interés | Globo 3D (MapLibre): retícula en el centro, ubicación del usuario, buscador o polígono |
| Calendario de actividad desde 2000 | Calendario año × mes con focos armonizados de la región elegida |
| Mes actual vs mediana histórica | Semáforo: "Nov 2026: 340 focos, 2,3× la mediana, percentil 95" |
| Anomalías vs promedio plurianual | Percentil y ratio por mes contra la mediana 2003–2022 |
| Escalas de color accesibles | Viridis/inferno para cantidades, RdBu para anomalías |
| Descargar CSV | Serie del área (global) y focos crudos (Argentina) |

Alcance: global en celdas H3 res 3 mensual y Argentina en detalle (H3 res 5, puntos crudos). Si lo global no llega a tiempo, entregamos Argentina con la arquitectura lista para escalar.

### Ubicación del usuario

Al abrir, la app ubica al usuario y le muestra su zona; desde ahí puede girar el globo o elegir otra área.

1. Pantalla inicial con un botón "Ver fuego cerca mío": el permiso se pide al tocarlo, no apenas carga.
2. Con permiso: el globo vuela hasta el usuario y toma como área un círculo de 50 km, con riesgo de 7 días, semáforo y calendario de esa zona.
3. Sin permiso o sin GPS: buscador de ciudad o provincia y vista inicial de Argentina. La app nunca queda bloqueada.
4. La ubicación se usa solo en el navegador y no se guarda ni se envía a ningún servidor. Lo decimos en pantalla.
5. La geolocalización exige HTTPS: Vercel lo cumple.

### Mobile-first y accesibilidad

| Requisito | Cómo lo resolvemos |
| --- | --- |
| Mobile-first | Se diseña primero a 360–400 px: globo arriba, panel deslizable abajo; en escritorio, panel lateral |
| Rendimiento | Datos precalculados y bajo demanda; si el celular no aguanta el 3D, vista 2D con la misma librería |
| Calendario en pantalla chica | Filas = años, columnas = 12 meses (entran a 400 px); toque en una celda para ver el número |
| Objetivos táctiles | Botones y celdas de 44 × 44 px mínimo |
| Lector de pantalla | El calendario es una tabla HTML real con encabezados y valores; resumen en texto ("Noviembre está 2,3 veces sobre la mediana") |
| Teclado | Todo se usa sin mouse: flechas giran el globo, espacio = play/pausa, foco visible; el área se puede elegir por buscador |
| Color | Paletas aptas para daltonismo, contraste WCAG 2.2 AA y nunca solo color: número o ícono al lado |
| Movimiento | `prefers-reduced-motion`: sin auto-rotación ni animaciones de vuelo |
| Idioma | Español e inglés (suma para Global Connection) |

## Riesgo de fuego en 7 días (modelo de IA con Devin)

Para cada celda H3 res 5 (~250 km²) de Argentina, probabilidad de al menos un foco en los próximos 7 días.

- Features: historial de fuego de la celda, estacionalidad, clima de NASA POWER (lluvia acumulada, días sin lluvia, humedad, temperatura, viento) y cobertura del suelo.
- Modelo: LightGBM con partición temporal (train 2012–2021, validación 2022, test 2023–2025). Tiene que superar a la línea base de climatología.
- Salida: categoría (Bajo / Moderado / Alto / Muy alto) relativa a lo normal para la época, con 2–3 razones (SHAP).
- Aviso siempre visible: estimación experimental, no reemplaza alertas oficiales. Si el riesgo es alto, teléfonos: Bomberos 100, Emergencias 911.

## Diferenciales

Hacer solo lo que pide el brief da un 3 en originalidad. Estos nos llevan a 4–5:

1. Globo 3D con modo histórico animado y modo live.
2. Riesgo de 7 días cerca del usuario: pasa de información a herramienta útil.
3. Calendario por temporada de fuego del hemisferio sur (julio–junio), no por año calendario: Patagonia arde de diciembre a marzo y el Chaco de agosto a octubre.
4. Fuego agrícola vs forestal: cruzar focos con cobertura del suelo (MODIS MCD12C1).
5. Casos de estudio argentinos en la presentación: Corrientes 2022, Delta 2020, Córdoba 2024.

## Datos y cuentas

| Dato | Para qué | Dónde |
| --- | --- | --- |
| MODIS, todos los países, 2000–2025 | Serie histórica larga | [FIRMS Country Yearly Summary](https://firms.modaps.eosdis.nasa.gov/country/) (zips anuales) |
| VIIRS S-NPP, todos los países, 2012–2025 | Solapamiento largo con MODIS | FIRMS zips anuales |
| VIIRS NOAA-20, todos los países, 2018–2025 | Referencia VIIRS | FIRMS zips anuales |
| 2026 hasta julio/agosto (SP) y de ahí a hoy (NRT) | Mes actual y modo live | API de FIRMS (`*_SP` y `*_NRT`) |
| MODIS MCD12C1 (cobertura del suelo) | Agrícola vs forestal, calibración por bioma | NASA AppEEARS (GeoTIFF), con cuenta Earthdata |
| NASA POWER | Clima para el modelo de riesgo | API POWER |
| NASA GIBS | Fondo del globo (Blue Marble, imagen del día) | WMTS, sin key |
| Límites de provincias / ciudades | Buscador | IGN / Natural Earth |

Cuentas (gratis):

- [x] MAP\_KEY de FIRMS: [firms.modaps.eosdis.nasa.gov/api/map\_key](https://firms.modaps.eosdis.nasa.gov/api/map_key/)
- [x] Cuenta Earthdata: [urs.earthdata.nasa.gov/users/new](https://urs.earthdata.nasa.gov/users/new)

Los zips anuales son Standard Processing (calidad final) y llegan hasta 2025; lo de 2026 se baja por la API. Donde haya SP, se usa SP, para no duplicar focos. La MAP\_KEY va en `.env` y nunca se sube al repo.

## Stack técnico

| Capa | Herramienta |
| --- | --- |
| Procesamiento | Python + DuckDB (extensiones `h3` y `spatial`), salida en Parquet y JSON |
| Modelo | LightGBM + SHAP (lo entrena Devin) |
| Front-end | Vite + React + TypeScript |
| Globo / mapa | MapLibre GL JS v5 (proyección globe) + NASA GIBS + `h3-js` |
| Back | Funciones serverless de Vercel: `/api/live` (proxy FIRMS, esconde la key) y `/api/risk` |
| Jobs | GitHub Actions: live cada 3 h, riesgo diario |
| Deploy | Vercel (HTTPS, necesario para la geolocalización) |

## Plan de 48 horas y entrega

| Horas | Tarea |
| --- | --- |
| 0–8 | Datos: ingesta, filtrado, H3. Front: esqueleto + globo + geolocalización |
| 8–16 | Armonización + validación. Modo histórico con datos de prueba. Devin arma el dataset |
| 16–24 | Agregados + export. Panel: calendario + semáforo. Entrenamiento del modelo |
| 24–32 | Modo live + riesgo. Temporada jul–jun. `/api/*` y jobs |
| 32–40 | Accesibilidad, mobile, QA en celulares. Video y slides |
| 40–44 | README, deploy final, edición del video |
| 44–48 | Buffer y entrega en la página del equipo |

Puntos de corte: hora 12 (si lo global no está, Argentina + Sudamérica), hora 24 (si el 3D no rinde en celular, 2D por defecto), hora 30 (si el modelo no supera a la línea base, se muestra la climatología), hora 40 (congelar funcionalidades).

El jurado evalúa virtualmente con lo que entregamos, así que la entrega es un tercio del puntaje:

- Video de 2–3 minutos: problema, armonización con el gráfico de validación, globo histórico, "cerca mío" + riesgo, caso Corrientes. Sin menores de 18.
- Demo online que el jurado pueda abrir.
- README con datos, método, validación y limitaciones.
- Categorías: Best Use of Data (armonizar dos sensores de NASA) y Local Impact (riesgo para zonas rurales argentinas, CONAE).

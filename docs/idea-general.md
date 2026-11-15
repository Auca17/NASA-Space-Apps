# Fuego y Campo – Space Apps 2026

Nov 14, 2026 · Equipo de 4 · **Ashfield**

Unimos dos challenges de NASA en un solo producto: **Harmonization of MODIS and VIIRS Hot Spots** y **Field Shift: Adapting Farms with NASA Data**. Es una web mobile-first, de alcance mundial y con un globo 3D, que convierte datos satelitales de NASA en decisiones para quien está en el territorio: **cuánto fuego hay y habrá cerca mío** y **qué rotación le conviene a mi campo**. El detalle técnico completo está en el [PRD](PRD.md).

## La idea en una frase

Un **motor de armonización** que lleva datos de NASA de distintos sensores y resoluciones a una **grilla común**, mirado desde dos lentes: **Fuego** y **Campo**.

```
                   Motor de armonización (grilla común H3)
   FIRMS MODIS+VIIRS · SMAP · IMERG · POWER · MODIS NDVI/ET · SRTM · ECOSTRESS · suelos
                                    │
              ┌─────────────────────┴─────────────────────┐
         LENTE FUEGO (Hot Spots)                  LENTE CAMPO (Field Shift)
   Globo 3D · histórico · live · calendario    Diagnóstico del lote · calendario agrícola
   semáforo · riesgo 7 días · CSV              actual + 3 rotaciones comparadas
              └─────────────── se cruzan en ───────────────┘
     quema de rastrojos · riesgo de fuego del lote · períodos de suelo desnudo
```

## Por qué unir los dos challenges

- **Los dos piden lo mismo en el fondo:** armonizar datos de NASA de distintas resoluciones a una grilla común. Hot Spots lo pide para MODIS y VIIRS; Field Shift, para SMAP, IMERG, Landsat, MODIS y suelos.
- **Fuego y campo son una sola historia.** En Argentina gran parte de los focos de calor son quemas agrícolas (rastrojos y pastizales), y una mejor rotación reduce la necesidad de quemar.
- **Originalidad:** Hot Spots tiene muchos equipos y Field Shift tiene muchos proyectos casi iguales. La combinación es difícil de encontrar en otro equipo.
- **Utilidad real:** deja de ser una herramienta solo informativa y le sirve a alguien en un campo.

## Cómo funciona para el usuario

1. Abre la app y toca **"Ver mi zona"**. La app pide la ubicación, el globo vuela hasta él y muestra **50 km a la redonda**, en cualquier lugar del mundo.
2. **Lente Fuego:** riesgo de fuego en los próximos 7 días, cómo viene el mes contra la historia y el calendario de fuego de su zona desde 2000.
3. Si es productor, toca **"Analizar mi campo"** y dibuja su lote.
4. **Lente Campo:** diagnóstico del lote con datos de NASA, calendario agrícola, y su rotación actual comparada con 3 alternativas según sus prioridades.

Si no comparte la ubicación, usa un buscador. La ubicación y los lotes quedan solo en su navegador.

## Lente Fuego (Hot Spots)

**El problema:** MODIS detecta focos desde 2000 y se apaga en 2026; VIIRS lo reemplaza con píxeles de 375 m que ven muchos más focos. Sin armonizar, la serie salta y no se pueden comparar los años.

**La armonización:** una sola serie en **unidades equivalentes a VIIRS NOAA-20**, porque MODIS se apaga y todo dato nuevo llega en VIIRS.

| Período | Sensor disponible | Qué se usa |
| --- | --- | --- |
| 2000 → 2011 | Solo MODIS | MODIS convertido a equivalente VIIRS |
| 2012 → 2025 | MODIS + VIIRS | VIIRS; MODIS sirve para calcular la conversión (14 años de solapamiento) |
| 2026 → hoy | VIIRS | VIIRS |

Se calibra por cobertura del suelo, latitud y mes, y se **valida** dejando 2023–2024 afuera (R² y sesgo). Ese gráfico es la prueba de solidez.

**Lo que ve el usuario:**
- **Globo 3D** (MapLibre) con dos modos:
  - **Histórico** (lo que pide el challenge): animación mes a mes desde 2000. Mientras gira el globo, el panel muestra el calendario de la región que tiene en el centro.
  - **Live:** focos de las últimas 24 h / 7 días sobre la imagen satelital del día, donde se ve el humo.
- **Calendario de fuego** año × mes, por año calendario o por temporada de fuego (julio–junio, clave en el hemisferio sur).
- **Semáforo del mes:** "Noviembre 2026: 340 focos — 2,3× la mediana — percentil 95".
- **Riesgo de fuego en 7 días** (IA): nivel base en todo el mundo y nivel con clima en Argentina, con 2–3 razones.
- **Descarga en CSV.**

## Lente Campo (Field Shift)

**El problema:** los productores enfrentan clima cambiante, falta de agua y suelos degradados, y elegir una rotación que cuide el suelo y el agua es difícil.

**Lo que ve el usuario:**
1. **Diagnóstico del lote**, cada número con su fuente y su resolución: lluvia y su variabilidad (IMERG), lluvias extremas, humedad del suelo y su anomalía (SMAP), heladas y grados-día (POWER), calor, evapotranspiración (MODIS / ECOSTRESS), vigor y días de suelo desnudo (MODIS NDVI / Landsat / Sentinel-2), pendiente (SRTM), suelo (SoilGrids), tendencia del agua (GRACE) y fuego (nuestra serie).
2. **Calendario agrícola**, con el mismo diseño que el de fuego: suelo desnudo, heladas, estrés hídrico, calor y temporada de quemas, con la rotación actual superpuesta.
3. **Rotación actual + prioridades + restricciones:** agua, suelo, erosión, ingreso, forraje, nitrógeno, plagas, evitar quemas; riego, maquinaria, ganadería.
4. **Actual + 3 alternativas** en tarjetas, cada una con lo que pide el brief: **por qué, evidencia, beneficios, vacíos de información y riesgos a validar con un agrónomo**.
5. Opcional: **escenarios de clima** (lluvia −20 %, +1 °C).

**Cómo se generan las rotaciones:** un motor determinístico y explicable. Parte de una base de ~15 cultivos con fuentes (INTA, FAO) y ~12 rotaciones agronómicamente válidas; filtra por viabilidad según el diagnóstico y puntúa según las prioridades del productor. Un LLM **solo traduce** los resultados a lenguaje simple y tiene que citar los indicadores.

**Validación satélite vs. campo:** con los **datos de campo de Orin** (lotes y muestreos en Mendoza) comparamos lo que ve el satélite con lo medido en el lote. Es lo que pide el brief y casi nadie lo va a tener fuera de EE. UU. Usamos solo los datos, no el código de Orin, y lo aclaramos en el README.

## Inteligencia artificial

| Componente | Qué hace |
| --- | --- |
| Riesgo de fuego en 7 días (Devin) | LightGBM con historial de fuego, estacionalidad, cobertura y clima (POWER). Tiene que superar a la línea base de climatología |
| Zonas análogas | Agrupa celdas con clima, suelo y vegetación parecidos: "campos parecidos al tuyo". En Argentina se cruza con lo que se siembra en esas zonas (MAGyP) |
| Patrones del calendario | Detecta suelo desnudo, transiciones y estrés en las series satelitales |
| Explicación | LLM que convierte indicadores en texto para el productor, sin inventar datos |

## Datos

**Todos los satélites de NASA que usamos son globales**, así que funcionan en Argentina y en todo el mundo. Lo único que es solo de EE. UU. son los datos de campo de la lista del brief, y los reemplazamos:

| De EE. UU. (lista del brief) | Lo que usamos |
| --- | --- |
| SSURGO / Web Soil Survey | SoilGrids (global) + INTA |
| NASS QuickStats / CDL | Estimaciones Agrícolas de MAGyP (por departamento) |
| NLDAS / PRISM | POWER, GLDAS, ERA5 |
| Mediciones de campo (CoCoRaHS, OpenET) | Datos de campo de Orin |

**Ya tenemos:**
- [x] FIRMS MODIS 2000–2025, VIIRS S-NPP 2012–2025 y VIIRS NOAA-20 2018–2025, de todo el mundo (9,1 GB descargados).
- [x] MAP\_KEY de FIRMS (para 2026 y el modo live). Va en `.env` y nunca se sube.
- [x] Cuenta Earthdata (para SMAP, IMERG, MCD12C1 y AppEEARS).

**Falta:** export de los datos de Orin, capas de campo (SMAP, IMERG, GAEZ) y lo de 2026 por la API.

## Stack

| Capa | Herramienta |
| --- | --- |
| Pipeline | Python + DuckDB (H3), pandas, xarray |
| IA | LightGBM, scikit-learn, SHAP, LLM vía API |
| Back | FastAPI (Python) en Vercel |
| Front | Vite + React + TypeScript + MapLibre GL (globo 3D) + NASA GIBS |
| Datos para la web | Cloudflare R2 (archivos por región) |
| Jobs | GitHub Actions: live cada 3 h, riesgo diario |
| Deploy | Vercel (HTTPS, necesario para la ubicación) |

## Mobile-first y accesibilidad

- Diseño a 360–400 px primero: globo arriba y panel deslizable abajo; en desktop, panel lateral.
- Si el celular no aguanta el 3D, mapa 2D con la misma librería.
- Botones de 44 px, todo usable con teclado, calendarios como tablas reales para lectores de pantalla.
- Colores aptos para daltonismo, contraste WCAG AA y el color nunca va solo.
- Sin animaciones para quien las desactiva; lenguaje simple con glosario.

## Equipo (4 personas)

| # | Persona | Parte |
| --- | --- | --- |
| 1 | Ezequiel (+ Claude) | Lente Fuego: datos, armonización, back de fuego y deploy |
| 2 | Compañero de Orin | Lente Campo: datos, base de cultivos, motor de rotaciones |
| 3 | Compañero con Devin | IA: riesgo de fuego y zonas análogas; apoyo de front con Devin |
| 4 | Cuarto integrante | Front, UX y presentación |

## Plan de 48 horas

| Horas | Hito |
| --- | --- |
| 0–8 | Datos de fuego limpios; export de Orin; esqueleto de la web con globo y ubicación |
| 8–16 | Armonización validada; capas de campo en la grilla; modo histórico; pantalla de lote |
| 16–24 | Datos en R2; motor de rotaciones; modelos entrenados; paneles de fuego y diagnóstico |
| 24–32 | Rotaciones con explicación; modo live; riesgo; validación con Orin |
| 32–40 | Accesibilidad, mobile, QA en celulares; slides y grabación |
| 40–44 | README, deploy final, edición del video |
| 44–48 | Buffer y entrega |

**Puntos de corte:** hora 12 (si el mundo no está, Sudamérica primero), hora 24 (si el 3D no rinde, 2D por defecto), hora 30 (si el modelo no supera la línea base, se muestra la climatología), hora 32 (si el LLM no es confiable, texto con plantillas), hora 40 (congelar funcionalidades).

## Entrega

El jurado evalúa virtualmente con lo que entregamos. Los criterios valen igual: presentación, originalidad y solidez.

- **Video de 2–3 minutos:** problema → armonización (gráfico de validación) → globo histórico → "mi zona" + riesgo → "mi campo" con 3 rotaciones → validación con datos reales de campo. Se muestra sobre un evento conocido y un lote real. Sin menores de 18.
- **Demo online** que el jurado pueda abrir.
- **README** con datos, método, validación, limitaciones y origen de los datos de Orin.
- **Dataset armonizado** descargable.
- **Categorías:** Best Use of Data, Local Impact y Galactic Impact.

## Pendientes del equipo

- [ ] **Confirmar con la sede si nos podemos presentar en los dos challenges** o en cuál.
- [ ] Confirmar el rol del cuarto integrante.
- [ ] Elegir un lote pampeano para la demo de rotaciones.
- [ ] Exportar los datos de Orin (lotes, muestreos, estaciones).
- [ ] Elegir el LLM (Gemini Flash por defecto, D32 pendiente de registrar). Nombre del proyecto: **Ashfield** (D20).

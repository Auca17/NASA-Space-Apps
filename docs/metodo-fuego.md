# Focos de calor armonizados MODIS + VIIRS: método y limitaciones

## El problema

Los satélites de NASA registran focos de calor (fuegos activos) desde noviembre de 2000, pero con dos generaciones de sensores que no se pueden comparar directamente:

- **MODIS** (satélites Terra y Aqua): píxel de 1 km, desde 2000. Está terminando su vida útil.
- **VIIRS** (satélites S-NPP desde 2012 y NOAA-20 desde 2018): píxel de 375 m. Ve fuegos más chicos y fragmenta un mismo incendio en más detecciones.

En las zonas con fuego, VIIRS registra varias veces más focos que MODIS. Si se apilan los dos registros, la serie salta cuando entra VIIRS y no hay forma de saber si un año tuvo más fuego o solo un sensor más sensible. Nuestra respuesta es una **serie única, en una sola unidad (detecciones equivalentes a VIIRS NOAA-20), desde 2000 hasta hoy**, validada contra datos que el modelo no vio.

## Fuentes

| Sensor | Producto | Período usado | Cómo se obtuvo |
|---|---|---|---|
| MODIS (Terra + Aqua) | FIRMS MODIS Collection 6.1 | 2000-11 → hoy | Archivos anuales por país (2000–2025) + API de FIRMS (2026) |
| VIIRS S-NPP | FIRMS VIIRS 375 m | 2012-01-20 → 2025-12-31 | Archivos anuales por país |
| VIIRS NOAA-20 | FIRMS VIIRS 375 m | 2018-04-01 → hoy | Archivos anuales por país (2018–2025) + API de FIRMS (2026) |

Hasta la fecha de corte de cada sensor se usan datos de **procesamiento estándar (SP)**, la versión científica final: MODIS hasta 2026-08-31 y NOAA-20 hasta 2026-07-31. Después, datos **casi en tiempo real (NRT)**. Nunca se mezclan SP y NRT para el mismo día. En total se procesaron **568 millones de detecciones** de todo el mundo.

## Limpieza

1. **Esquema común.** Los formatos de FIRMS difieren entre sensores. La confianza de VIIRS viene como `l` / `n` / `h` y se normaliza a `low` / `nominal` / `high`; el satélite de MODIS viene como `Terra` / `Aqua` y se normaliza a `T` / `A`. La hora se combina con la fecha en UTC, y el día es siempre el día UTC.
2. **Duplicados entre países.** Los archivos vienen por país; se deduplica por posición, instante y satélite. Solo se encontraron 237 duplicados en 548 millones de filas.
3. **Solo vegetación.** Se conserva `type = 0` (fuego de vegetación presunto) y se descartan volcanes, fuentes industriales fijas y focos costa afuera.
4. **Confianza.** MODIS con confianza ≥ 30; VIIRS `nominal` o `high`.

| Sensor | Detecciones | Fuera por `type ≠ 0` | Fuera por confianza | Quedan |
|---|---|---|---|---|
| MODIS | 114.527.363 | 3.923.246 (3,4 %) | 5.171.529 (4,5 %) | **105.432.588** |
| VIIRS | 454.125.155 | 30.972.805 (6,8 %) | 50.433.320 (11,1 %) | **372.719.030** |

## Grilla

Cada foco se ubica en una celda hexagonal **H3** (sistema de grillas de Uber), de área casi igual en todo el planeta, a diferencia de una grilla de latitud y longitud:

- **Resolución 5** (~253 km²): calendario, comparación con lo normal y riesgo. Un círculo de 50 km alrededor del usuario contiene unas 31 celdas.
- **Resolución 3** (~12.400 km²): animación del globo y calibración.
- **Resolución 2:** unidad de archivo para que la web cargue solo la región que mira el usuario.

Para cada celda y mes se cuentan las **detecciones** y, como control, las **celdas-día con fuego**: pares distintos de celda de resolución 6 y día. Este segundo conteo no depende de cuántos píxeles parte cada sensor un mismo incendio.

## Armonización paso a paso

La calibración se hace por **estrato**: banda de latitud de 10° (18 bandas) × mes del año, porque la relación entre sensores cambia con la estación y el tipo de fuego de cada región.

1. **Terra sola → Terra + Aqua.** Aqua empezó a mediados de 2002. Para los meses de 2000-11 a 2002-06, que solo tienen Terra, se aplica por estrato el factor (Terra + Aqua) / Terra medido en 2003–2011.
2. **S-NPP → NOAA-20.** Con los meses en que **funcionan los dos satélites** (2018-04 → 2025-12) se calcula por estrato el factor NOAA-20 / S-NPP, y se aplica a S-NPP entre 2012-02 y 2018-03. En Argentina el factor queda entre 0,98 y 1,0. Si se incluyeran meses con un solo sensor (por ejemplo 2026, donde solo usamos NOAA-20), el factor se inflaría; por eso se excluyen.
3. **MODIS → VIIRS.** Para cada estrato, sobre los pares celda (resolución 3) × mes con MODIS > 0 del período 2012-02 → 2022-12:

   `log(VIIRS + 1) = a + b · log(MODIS + 1)`

   Se suma un **factor de totales** por estrato para que la suma predicha iguale la observada en el entrenamiento. Corrige el sesgo que aparece al volver del logaritmo y el fuego que VIIRS detecta donde MODIS no ve nada. **Regla de baja confianza:** un estrato con menos de 200 pares celda-mes usa los coeficientes globales de ese mes y se marca con confianza baja. Son 71 de 208 estratos, sobre todo bandas polares y meses con poco fuego.
4. **De resolución 3 a 5.** La predicción de cada celda de resolución 3 se reparte entre sus hijas de resolución 5 en proporción a las detecciones MODIS de cada una. Así la suma de las celdas chicas siempre coincide con la grande.

**Serie final:**

| Período | Fuente |
|---|---|
| 2000-11 → 2012-01 | MODIS convertido a equivalente NOAA-20 |
| 2012-02 → 2018-03 | VIIRS S-NPP × factor |
| 2018-04 → hoy | VIIRS NOAA-20 tal cual |

## Validación

Se entrenó con 2012–2022 y se evaluó con **2023–2024**, años que el modelo no vio: se convirtió el MODIS de esos años y se comparó con el VIIRS NOAA-20 real.

| Métrica | Valor |
|---|---|
| R² de la serie mundial mensual | **0,979** |
| R² lineal por celda (resolución 3) × mes | **0,926** |
| R² logarítmico (log1p) por celda × mes | **0,654** |
| Sesgo total | **−0,8 %** |
| Celdas-día con fuego: R² log1p / sesgo | 0,61 / +1,4 % |

**Por qué la métrica logarítmica es más baja:** le da el mismo peso a cada celda, y la mayoría tiene pocos focos por mes. Ahí la diferencia entre 1 y 3 focos es ruido de muestreo (horario de paso del satélite, nubes, tamaño de píxel), no un error de calibración. Las celdas con mucho fuego, que son las que definen los totales y los picos, se predicen bien, como muestran el R² lineal y el mundial.

Gráficos en `docs/validation/`. `series_global.png` muestra que la serie armonizada no salta en 2012 ni en 2018.

## Qué se calcula sobre la serie

- **Lo normal:** mediana y percentiles de cada mes en la línea base **2003–2022**. El mes actual se compara contra esa línea base.
- **Climatología semanal:** fracción de los años 2003–2022 con al menos un foco en cada semana del año.
- **Riesgo de fuego en 7 días, nivel historial** (todo el mundo): `p = min(0,95, clim × (1 + 2·A + B))`, donde `clim` es la climatología de la semana y A y B indican si hubo focos en la celda en los últimos 7 y 30 días. En Argentina lo reemplaza un modelo con clima de NASA POWER.

## Limitaciones

- **2000-11 → 2012-01 es el tramo de menor confianza.** Esos años no tienen VIIRS: son MODIS convertido, con la incertidumbre de pasar de un sensor menos sensible a uno más sensible. Un fuego chico que MODIS no vio no se puede reconstruir. Enero de 2012 está en ese tramo porque S-NPP empieza el 20/01/2012.
- **Hueco de Terra en 2001.** Terra no registra ninguna detección entre el 15/06/2001 y el 03/07/2001 (modo seguro del satélite), y en esa época todavía no existía Aqua. Junio de 2001 queda en un tercio de lo normal y julio pierde tres días; los dos meses están marcados con confianza baja.
- **`type` inferido en los datos casi en tiempo real.** Los NRT de FIRMS no traen la columna `type`, así que no se pueden excluir directamente los volcanes y las fuentes industriales. Se usa una **máscara de fuentes fijas**: las celdas de resolución 6 donde, con NOAA-20 2018–2025, al menos la mitad de las detecciones (y como mínimo 10) fueron de tipo no vegetación. La máscara descarta **5,7 %** de los NRT de NOAA-20, contra **8,6 %** que descarta el `type` real en los datos SP; en MODIS, 4,2 % contra 6,0 %. Es decir, en los últimos meses pueden quedar algunas fuentes no vegetales que la máscara no conoce, como una nueva antorcha de gas.
- **País en los datos de 2026.** La API no informa el país. Un foco se marca como de Argentina si su celda tiene focos argentinos históricos o si cae dentro de un departamento del IGN.
- **S-NPP de 2026 no se usa.** Desde 2018-04 la serie usa NOAA-20, así que S-NPP de 2026 no se descargó. Por eso su factor se calcula solo con 2018-04 → 2025-12.
- **La calibración es por banda de latitud, no por tipo de cobertura (D3).** Un pastizal y una selva de la misma latitud comparten coeficientes. Usar cobertura del suelo (MCD12C1) es una mejora prevista.
- **Coeficientes globales en estratos con pocos datos.** 71 de 208 estratos usan los coeficientes globales del mes; en las bandas polares el sesgo no es interpretable por falta de datos.
- **Último mes parcial.** El mes en curso tiene datos solo hasta el día de la última corrida.

## Cómo reproducirlo

**Requisitos:** Python 3.12 o superior, `pip install duckdb pyarrow pandas numpy matplotlib python-dotenv h3`, unos 70 GB libres en disco y una MAP_KEY de FIRMS en `.env` (`FIRMS_MAP_KEY=...`) para 2026. DuckDB instala solo las extensiones `h3` y `spatial`.

**Datos:** zips anuales "Country Yearly Summary" de FIRMS (MODIS 2000–2025, VIIRS S-NPP 2012–2025, VIIRS NOAA-20 2018–2025, unos 9 GB) en `~/spaceapps-fuego/data/raw/zips/`.

| Paso | Comando | Tiempo aprox. (8 núcleos, 16 GB) |
|---|---|---|
| Ingesta | `python pipeline/01_ingest.py` | 25 min (descomprime 41 GB) |
| 2026 por API | `python pipeline/07_firms_2026.py` | 50 min (límite de la API) |
| Limpieza | `python pipeline/02_clean.py` | 9 min |
| Grilla H3 | `python pipeline/03_grid.py` | 20 min |
| Armonización y validación | `python pipeline/04_harmonize.py` | 1 min |
| Insumo del modelo de riesgo | `python pipeline/model_input.py` | < 1 min |
| Agregados | `python pipeline/05_aggregate.py` | 2 min |
| Export web | `python pipeline/06_export.py` | 15 min |
| Validación del contrato | `python pipeline/validate_export.py` | 15 min |
| Dataset publicable | `python pipeline/08_release.py` | 5 min |

Los pasos 01, 03 y 07 son reanudables. Los detalles de cada paso están en `pipeline/README.md`.

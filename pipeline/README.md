# Pipeline de fuego (Frente A)

Convierte los zips anuales de FIRMS en los archivos del contrato de datos (`docs/data-contract.md`) y en la entrega para el modelo de riesgo. Brief: `docs/briefs/ezequiel-datos-fuego.md`.

## Requisitos

- Python 3.12 o superior (probado con 3.14).
- `pip install duckdb pyarrow pandas numpy matplotlib python-dotenv`
- DuckDB instala solo las extensiones `h3` (community) y `spatial` la primera vez.
- Zips de FIRMS "Country Yearly Summary" (≈9 GB) en `~/spaceapps-fuego/data/raw/zips/`, o en la carpeta que indique `FIRMS_RAW_DIR` (con subcarpeta `zips/`):
  - `modis_{2000..2025}_all_countries.zip`
  - `viirs-snpp_{2012..2025}_all_countries.zip`
  - `viirs-jpss1_{2018..2025}_all_countries.zip` (NOAA-20)

Las salidas intermedias van a `data/processed/` dentro del repo, que está ignorado por git. Nunca se suben `data/`, `*.duckdb`, `.env` ni los zips.

## Cómo correrlo

```bash
python pipeline/01_ingest.py     # zips → Parquet normalizado y deduplicado
python pipeline/02_clean.py      # filtros type = 0 y confianza
python pipeline/03_grid.py       # celdas H3 + conteos mensuales y diarios
python pipeline/04_harmonize.py  # E2: calibración MODIS → VIIRS + validación (docs/validation/)
python pipeline/model_input.py   # E1/E2: fires_ar_r5_daily.parquet para Devin (n armonizado si ya corrió el 04)
python pipeline/05_aggregate.py  # E3: series, climatología semanal, riesgo nivel historial
python pipeline/06_export.py     # E3: data/processed/export/v1/ según el contrato
python back/tools/validate_contract.py data/processed/export/v1
python pipeline/07_firms_2026.py # E4: 2026 por la API de FIRMS; después repetir 02 → 06 y model_input
```

Los pasos 01 y 03 son reanudables: si se cortan, al volver a correrlos saltean lo que ya está completo.

## Pasos

| Paso | Script | Salida | Estado |
|---|---|---|---|
| 1. Ingesta | `01_ingest.py` | `data/processed/hotspots/sensor=*/year=*/<producto>.parquet` | ✅ |
| 2. Limpieza | `02_clean.py` | `data/processed/hotspots_clean/` | ✅ |
| 3. Grilla H3 | `03_grid.py` | `hotspots_h3/`, `counts_r3.parquet`, `counts_r5.parquet`, `daily_r5.parquet` | ✅ |
| E1 | `model_input.py` | `data/processed/model_input/fires_ar_r5_daily.parquet` | ✅ |
| 4. Armonización | `04_harmonize.py` | `harmonized_r3.parquet`, `harmonized_r5.parquet`, factores, `docs/validation/` | ✅ |
| 5. Agregados | `05_aggregate.py` | `data/processed/agg/`: globo, mensual y diario res 5, climatología semanal, riesgo nivel historial | ✅ |
| 6. Export | `06_export.py` | `data/processed/export/v1/` (meta, globe, fire/cal, fire/daily, fire/points, risk) + `export/sizes.json` | ✅ |
| 2026 por API | `07_firms_2026.py` | SP hasta jul/ago 2026 y NRT hasta hoy | ✅ |
| Validación | `validate_export.py` | `_check` de `back/tools/validate_contract.py` en paralelo | ✅ |
| Subida | `upload_r2.py` | `v1/` y `work/` en R2 | ⬜ falta (sin bucket todavía) |

## Decisiones de implementación

- **Esquema común** (paso 1): `sensor` (`MODIS` | `VIIRS`), `satellite` (`T` | `A` | `N` | `N20`), `acq_datetime` (UTC), `lat`, `lon`, `frp`, `confidence_raw` (tal cual viene), `confidence_norm`, `daynight`, `type`, `country` (del nombre del CSV de FIRMS).
- **Formato real de FIRMS**: la confianza VIIRS viene como `l` / `n` / `h` y se normaliza a `low` / `nominal` / `high`; el satélite MODIS viene como `Terra` / `Aqua` y se normaliza a `T` / `A`. Verificado sobre los 548 M de filas.
- **Duplicados entre países**: se deduplica por (`lat`, `lon`, `acq_datetime`, `satellite`) y se queda el país alfabéticamente menor. Casi no hay: FIRMS ya asigna cada punto a un país.
- **Día**: siempre UTC, sin conversión a hora local.
- **H3**: se guarda como entero (UBIGINT) en los intermedios y se convierte a texto hexadecimal de 15 caracteres en las salidas del contrato.
- **E1**: S-NPP hasta el 2018-03-31 y NOAA-20 desde el 2018-04-01 (inicio de NOAA-20). Desde E2, `n` = `n_raw` × factor S-NPP → NOAA-20 del estrato en el tramo S-NPP, y `n_raw` en el tramo NOAA-20. `sensor_mix` es `VIIRS` en todo el período.

## Armonización (paso 4)

- **Estratos:** banda de latitud de 10° del centro de la celda res 3 × mes del año. Son 18 bandas × 12 meses = 216 estratos posibles (el brief dice 36 bandas, pero con 10° son 18); 208 tienen datos.
- **Terra → Terra + Aqua** (2000-11 a 2002-06): factor (T+A)/T por estrato con 2003–2011.
- **S-NPP → NOAA-20:** factor N20/N por estrato con 2018-04 → 2025. Queda entre 0,98 y 1,0 en Argentina.
- **MODIS → VIIRS:** `log(V+1) = a + b·log(M+1)` por estrato sobre pares celda res 3 × mes con MODIS > 0, entrenamiento 2012-02 → 2022-12. Se agrega un **factor de totales `k`** por estrato para que la suma predicha iguale la observada en el entrenamiento: corrige el sesgo de volver del logaritmo y el fuego que VIIRS ve donde MODIS no ve nada. Estratos con < 200 pares usan los coeficientes globales del mes y quedan con `confidence = low`.
- **Res 5:** la predicción se hace en res 3 y se reparte entre las hijas res 5 en proporción a sus detecciones MODIS. La suma de las res 5 coincide con la res 3.
- **Serie final:** 2000-11 → 2012-01 MODIS convertido (S-NPP empieza el 2012-01-20, así que enero de 2012 está incompleto); 2012-02 → 2018-03 S-NPP × factor; 2018-04 en adelante NOAA-20.
- **Hold-out 2023–2024** (`docs/validation/metrics.json`), tres métricas:

  | Métrica | Valor |
  |---|---|
  | R² de la serie mundial mensual | **0,979** |
  | R² lineal por celda res 3 × mes | **0,926** |
  | R² logarítmico (log1p) por celda res 3 × mes | **0,654** |
  | Sesgo total | −0,8 % |
  | Celdas-día: R² log1p / sesgo | 0,61 / +1,4 % |

  El R² logarítmico es más bajo porque le da el mismo peso a cada celda, y la mayoría tiene pocos focos por mes: ahí la diferencia entre 1 y 3 focos es ruido de muestreo (pasadas del satélite, nubes, píxeles más chicos de VIIRS) y no un error de calibración. Las celdas con mucho fuego, que son las que mueven los totales, se predicen bien, como muestran el R² lineal y el mundial.
- **Por banda de latitud:** las bandas 90°S–60°S, 60°S–50°S y 70°N–90°N tienen menos de 200 pares celda-mes y figuran en `metrics.json` como **"sin datos suficientes"**, no como error: con 4 a 167 pares el sesgo no es interpretable. 71 de 208 estratos usan los coeficientes globales del mes (`confidence = low`).
- **Tramo de baja confianza:** 2000-11 → 2012-01 (`meta.json`).
- **Mediados de 2001:** no es un pico falso sino un **hueco de datos**. Terra no tiene ninguna detección entre el 2001-06-15 y el 2001-07-03 (modo seguro del satélite), así que junio de 2001 queda en un tercio de lo normal (36.876 focos de Terra contra ~110.000 en junio de 2002–2005) y julio pierde 3 días. Agosto de 2001 (267.596) es real: es casi igual a agosto de 2002 (266.255). Junio y julio de 2001 quedan con `confidence = low` en toda la serie.

## Agregados y export (pasos 5 y 6)

- **Serie diaria armonizada** (`fire/daily`, desde 2003-01-01): conteo crudo del sensor del período × factor mensual de la celda (n / n_raw de la serie mensual). La suma diaria de un mes coincide con el valor mensual del calendario. Solo días con fuego; un día con muy pocos focos puede redondear a 0,0.
- **Climatología semanal** (`clim`, 52 valores): fracción de los años ISO 2003–2022 con al menos un foco en esa semana ISO; la semana 53 se suma a la 52.
- **Riesgo nivel historial** (`risk/`, regla `clim-persist-0.1` del brief), con fecha de referencia = hoy (UTC):
  - `p = min(0,95, clim × (1 + 2·A + 1·B))`; A = focos en los últimos 7 días, B = en los últimos 30.
  - `ratio = p / clim`, `null` si `clim < 0,01`. `cat` por ratio según el contrato 2.6.
  - **Decisión propia:** cuando `ratio` es `null`, el contrato dice que `cat` "sale de p solo" pero no da umbrales. Uso p < 0,05 bajo · < 0,15 moderado · < 0,30 alto · resto muy_alto. Con `clim < 0,01` siempre da `bajo`.
  - **Razones:** "históricamente X % de los años con fuego en esta semana de {mes} (2003–2022)" y "focos en los últimos 7 días" / "focos en los últimos 30 días" / "sin focos en los últimos 30 días". El texto del brief ("X % de las semanas de noviembre") describía otra cosa que la que mide `clim`; lo ajusté para que diga exactamente lo que se calcula.
- **`fire/points`:** solo focos con país Argentina, todos los sensores y satélites, filtrados igual que el resto.
- **`lc`:** `null` en esta versión (D3).
- **Tamaños comprimidos** (gzip nivel 6) en `data/processed/export/sizes.json`.
- **Validación:** `python pipeline/validate_export.py` corre la misma función `_check` de `back/tools/validate_contract.py`, repartida en todos los núcleos. El validador original, de a un archivo por vez, tarda más de 2 horas con ~1,4 GB de JSON; esta versión, unos 15 minutos.

## 2026 por la API de FIRMS (paso 7, E4)

- **Fuentes:** `MODIS_SP` (2026-01-01 → 2026-08-31), `MODIS_NRT` (2026-09-01 → hoy), `VIIRS_NOAA20_SP` (2026-01-01 → 2026-07-31), `VIIRS_NOAA20_NRT` (2026-08-01 → hoy). Donde hay SP no se usa NRT.
- **S-NPP de 2026 no se baja:** la serie usa NOAA-20 desde 2018-04. `sp_until.VIIRS_SNPP` queda en 2025-12-31. Por eso el factor S-NPP → NOAA-20 del paso 4 se calcula **solo con los meses en que hay datos de los dos sensores** (2018-04 → 2025-12); si se incluyera 2026, el factor se inflaría.
- **Pedidos:** 129 pedidos mundiales de 5 días (`/api/area/csv/{key}/{fuente}/world/5/{inicio}`; la fecha es el inicio del tramo). Cada uno cuesta ~180 transacciones de las 5.000 cada 10 minutos, así que el script consulta `mapkey_status` antes de cada pedido y espera si hace falta. Las respuestas se guardan en `~/spaceapps-fuego/data/raw/firms_api/` (reanudable). Unos 50 minutos, 1,6 GB.
- **`type` en NRT:** los NRT no traen la columna `type`. Se infiere con una máscara de fuentes fijas: celdas res 6 donde, con NOAA-20 2018–2025, al menos la mitad de las detecciones (y como mínimo 10) fueron type 1, 2 o 3. Los NRT en esas celdas quedan type 2 y se descartan; el resto, type 0. Resultado: 5,7 % descartado en NOAA-20 NRT contra 8,6 % en SP con `type` real.
- **`country`:** la API no lo trae. Se marca Argentina si la celda res 6 tiene focos históricos de Argentina, o si el punto cae dentro de un departamento del IGN (GeoJSON leído con `read_json`, porque `ST_Read` de DuckDB 2.0 no puede con el archivo de 140 MB).
- **Resultado:** 20,2 M de focos de 2026 hasta el día de hoy; 124 mil en Argentina.


## Números de la primera corrida

| Producto | Zips | Filas | Duplicados entre países |
|---|---|---|---|
| MODIS | 26 | 111.424.417 | 3 |
| VIIRS S-NPP | 14 | 281.144.514 | 159 |
| VIIRS NOAA-20 | 8 | 155.932.272 | 75 |

| Sensor | Entrada | Fuera por `type ≠ 0` | Fuera por confianza | Quedan |
|---|---|---|---|---|
| MODIS | 111.424.414 | 3.750.774 | 5.023.425 | 102.650.215 |
| VIIRS | 437.076.552 | 29.720.471 | 48.505.263 | 358.850.818 |

Las estadísticas completas por año quedan en `data/processed/stats/`.

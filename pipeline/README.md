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
```

Los pasos 01 y 03 son reanudables: si se cortan, al volver a correrlos saltean lo que ya está completo.

## Pasos

| Paso | Script | Salida | Estado |
|---|---|---|---|
| 1. Ingesta | `01_ingest.py` | `data/processed/hotspots/sensor=*/year=*/<producto>.parquet` | ✅ |
| 2. Limpieza | `02_clean.py` | `data/processed/hotspots_clean/` | ✅ |
| 3. Grilla H3 | `03_grid.py` | `hotspots_h3/`, `counts_r3.parquet`, `counts_r5.parquet`, `daily_r5.parquet` | ✅ |
| E1 | `model_input.py` | `data/processed/model_input/fires_ar_r5_daily.parquet` | ✅ script listo |
| 4. Armonización | `04_harmonize.py` | `harmonized_r3.parquet`, `harmonized_r5.parquet`, factores, `docs/validation/` | ✅ |
| 5. Agregados | `05_aggregate.py` | series res 3 y res 5, climatología semanal, riesgo nivel historial | ⬜ falta |
| 6. Export | `06_export.py` | `v1/` según el contrato (meta, globe, fire/cal, fire/daily, fire/points, risk) | ⬜ falta |
| 2026 por API | `07_firms_2026.py` | SP hasta jul/ago 2026 y NRT hasta hoy | ⬜ falta |
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
- **Hold-out 2023–2024** (`docs/validation/metrics.json`): sesgo total −0,8 %; R² lineal por celda-mes 0,926; R² en escala log1p por celda-mes 0,654 (las celdas con pocos focos son ruidosas); R² de la serie mundial mensual 0,979; celdas-día: R² log1p 0,61, sesgo +1,4 %. 71 de 208 estratos con baja confianza (bandas polares y meses con poco fuego).
- **Tramo de baja confianza:** 2000-11 → 2012-01. En junio de 2001 Terra tuvo una interrupción y el mes queda bajo.

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

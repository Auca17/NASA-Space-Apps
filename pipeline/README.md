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
python pipeline/model_input.py   # E1: fires_ar_r5_daily.parquet para Devin
```

Los pasos 01 y 03 son reanudables: si se cortan, al volver a correrlos saltean lo que ya está completo.

## Pasos

| Paso | Script | Salida | Estado |
|---|---|---|---|
| 1. Ingesta | `01_ingest.py` | `data/processed/hotspots/sensor=*/year=*/<producto>.parquet` | ✅ |
| 2. Limpieza | `02_clean.py` | `data/processed/hotspots_clean/` | ✅ |
| 3. Grilla H3 | `03_grid.py` | `hotspots_h3/`, `counts_r3.parquet`, `counts_r5.parquet`, `daily_r5.parquet` | ✅ (en ejecución la primera corrida completa) |
| E1 | `model_input.py` | `data/processed/model_input/fires_ar_r5_daily.parquet` | ✅ script listo |
| 4. Armonización | `04_harmonize.py` | factores por estrato, serie armonizada, `docs/validation/` | ⬜ falta |
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
- **E1**: S-NPP hasta el primer mes completo de NOAA-20 y NOAA-20 desde ahí. En E1, `n = n_raw` (VIIRS nativo); en E2 `n` pasa a ser el valor armonizado sin cambiar el esquema. `sensor_mix` es `VIIRS` en todo el período.

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

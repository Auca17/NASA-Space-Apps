# Brief — Frente A: datos de fuego y motor de armonización

**Responsable:** Ezequiel (con su Claude).
**Herramientas:** Python 3.12, DuckDB con extensiones `h3` y `spatial`, pyarrow. Todo corre en la laptop de Ezequiel, donde están los zips de FIRMS.
**Documentos obligatorios antes de escribir código:** `docs/data-contract.md` (secciones 1, 2.1 a 2.6 y 5.1) y `docs/decisions.md` (D2, D3, D4, D5, D7, D9, D10, D12). Los archivos de ejemplo están en `fixtures/`: la salida tiene que tener exactamente esa forma.

Si algo del contrato no cierra con los datos reales, no lo cambies solo: anotalo en la sección "Pendientes" de `docs/decisions.md` y avisá al integrador.

---

## Entregas y horas

| Entrega | Hora objetivo | Qué incluye | Quién la espera |
|---|---|---|---|
| **E1** | h8 | Tabla limpia con H3 en Parquet y `fires_ar_r5_daily.parquet` subido a R2 (prefijo `work/`) | Devin (modelo de riesgo) |
| **E2** | h16 | Calibración MODIS → VIIRS validada, gráfico del hold-out en `docs/validation/` | Presentación, README |
| **E3** | h24 | Export completo `v1/` en R2: `meta.json`, `globe/`, `fire/cal/`, `fire/daily/`, `fire/points/` (Argentina), `risk/` nivel historial | Front, integrador |
| **E4** | h32 | 2026 por API FIRMS (SP y luego NRT) incorporado y re-export; dataset armonizado publicable; borrador del README del método | README, video |

Punto de corte h12 (D16 del PRD): si la armonización mundial no está, exportá Sudamérica primero y el mundo después.

---

## Estructura

```
pipeline/
  01_ingest.py      02_clean.py      03_grid.py
  04_harmonize.py   05_aggregate.py  06_export.py
  07_firms_2026.py  upload_r2.py
  README.md
~/spaceapps-fuego/data/raw/        zips de FIRMS (fuera del repo)
data/processed/                    Parquet intermedios y fuego.duckdb (ignorado por git)
data/processed/model_input/        salida para Devin (ignorado por git)
docs/validation/                   gráficos y métricas de la calibración (sí va al repo)
```

`data/`, `*.duckdb` y `.env` en `.gitignore`. La `FIRMS_MAP_KEY` solo en `.env`.

---

## Pasos

### 1. Ingesta (`01_ingest.py`)

- Leer los zips de FIRMS "Country Yearly Summary": MODIS C6.1 (2000–2025), VIIRS S-NPP (2012–2025), VIIRS NOAA-20 (2018–2025). DuckDB `read_csv` sobre los CSV descomprimidos, en paralelo.
- Normalizar a un esquema común: `sensor` (`MODIS` | `VIIRS`), `satellite` (`T` | `A` | `N` | `N20`), `acq_datetime` (UTC, de `acq_date` + `acq_time`), `lat`, `lon`, `frp`, `confidence_raw` (texto tal cual), `confidence_norm` (entero 0–100 para MODIS; `low`/`nominal`/`high` para VIIRS), `daynight`, `type`, `country`.
- **Ojo con el formato real de FIRMS:** la confianza VIIRS viene como `l` / `n` / `h` (no como palabras) y el satélite MODIS como `Terra` / `Aqua`. Mapear `l`→`low`, `n`→`nominal`, `h`→`high` y `Terra`→`T`, `Aqua`→`A`; si no, el filtro del paso 2 descarta todos los focos VIIRS. Verificado contra la API el 2026-11-14; confirmalo en los zips mirando los valores distintos de esas dos columnas.
- **Duplicados entre países:** los archivos por país repiten puntos cerca de fronteras. Deduplicar por (`lat`, `lon`, `acq_datetime`, `satellite`) antes de contar nada. Registrar cuántos se eliminaron.
- Guardar Parquet particionado por `sensor` y `year` en `data/processed/hotspots/`.

### 2. Limpieza (`02_clean.py`)

- Solo `type = 0`.
- MODIS: `confidence_norm >= 30`. VIIRS: `nominal` o `high`.
- Día en UTC para todo el pipeline (se documenta en el README; no se convierte a hora local).

### 3. Grilla (`03_grid.py`)

- Agregar `h3_r2`, `h3_r3`, `h3_r5`, `h3_r6` con `h3_latlng_to_cell` de la extensión `h3`.
- Tablas de conteo por celda y mes, por sensor y satélite:
  - `det`: detecciones.
  - `cells_day`: cantidad de pares (`h3_r6`, día) distintos con fuego, agregados a la celda padre. Es el control contra la fragmentación de píxeles de VIIRS (D2).
- Producir las dos tablas a res 3 y a res 5.

### 4. Armonización (`04_harmonize.py`) — D2, D3, D10

Unidad final: **equivalente VIIRS NOAA-20**. Estratos: **banda de latitud de 10° × mes del año** (36 bandas × 12 meses). Nada de cobertura del suelo en esta versión.

1. **Terra sola → Terra + Aqua (2000-11 a 2002-06).** Con 2003–2011, donde están los dos, calcular por estrato el factor `(T + A) / T` y aplicarlo a 2000–2002.
2. **S-NPP → NOAA-20.** Con el solapamiento 2018–2025, factor por estrato sobre conteos mensuales res 3. Aplicarlo a S-NPP 2012–2017. De 2018 en adelante se usa NOAA-20 nativo.
3. **MODIS → VIIRS.** Regresión por estrato sobre conteos mensuales por celda res 3, con el solapamiento 2012–2022 como entrenamiento:
   `log(VIIRS + 1) = a + b · log(MODIS + 1)`.
   Si un estrato tiene menos de 200 pares celda-mes con fuego, usar los coeficientes globales de ese mes y marcar el estrato como `low` en `confidence`.
4. **Aplicar la conversión a los conteos res 5** de 2000–2011 (D4). Guardar también la versión convertida de 2012–2025 solo para validar.
5. **Serie final por celda res 5 y mes:** 2000–2011 MODIS convertido; 2012–2017 S-NPP convertido a NOAA-20; 2018 en adelante NOAA-20.
6. **Validación (hold-out 2023–2024):** aplicar la conversión a MODIS 2023–2024 y comparar con VIIRS real por celda res 3 y mes. Reportar R², sesgo porcentual y error por banda de latitud, para detecciones y para celdas-día. Guardar en `docs/validation/metrics.json` y copiar `r2`, `bias_pct` y `r2_cells_day` a `meta.json`.
7. **Gráficos** (`docs/validation/`):
   - Serie mensual mundial 2000–2025 con tres líneas: MODIS crudo, VIIRS crudo, armonizada. Tiene que verse que la armonizada no salta en 2012 ni en 2018. Este es el gráfico del video.
   - Dispersión observado vs. predicho del hold-out.
   - Igual que el primero, pero solo Argentina.

### 5. Agregados (`05_aggregate.py`) — D7, D9, D10

- Serie mensual armonizada por celda res 5 y res 3 (`n`, decimal con 1 decimal).
- Serie diaria armonizada por celda res 5, solo días con fuego, desde 2003-01-01. El factor mensual del estrato se aplica a los conteos diarios.
- **Climatología semanal** (52 valores por celda res 5): fracción de los años 2003–2022 con al menos un foco en esa semana ISO del año.
- **Riesgo nivel historial** (`risk/`, D7), regla `clim-persist-0.1`, documentada en el README:
  - `clim` = climatología de la semana actual.
  - `p = min(0.95, clim × (1 + 2·A + 1·B))`, donde `A` = 1 si hubo fuego en la celda en los últimos 7 días, `B` = 1 si hubo en los últimos 30 días.
  - `ratio = p / clim` (si `clim < 0.01`, `ratio = null`).
  - `cat` por ratio según el contrato 2.6. `level = "historial"`. `model_version = "clim-persist-0.1"`.
  - `reasons`: dos frases en español neutro, por ejemplo `"históricamente 10 % de las semanas de noviembre con fuego"` y `"focos en los últimos 7 días"` o `"sin focos en los últimos 30 días"`.
- Cobertura dominante `lc` queda en `null` en esta versión (D3).

### 6. Export (`06_export.py`) — contrato sección 2

- Generar exactamente los archivos del contrato: `meta.json`, `globe/{YYYY-MM}.json`, `fire/cal/{h3_r2}.json`, `fire/daily/{h3_r2}.json`, `fire/points/{h3_r2}/{YYYY}.csv.gz` (solo shards de Argentina), `risk/{h3_r2}.json`.
- Comparar la forma de cada tipo de archivo con su ejemplo en `fixtures/` antes de subir.
- **Reportar tamaños comprimidos:** p50 y p95 de `fire/cal` y `fire/daily` por shard, y el mayor `globe/`. Si el p95 de `fire/daily` supera 800 KB, frenar y avisar (regla de corte del contrato 2.4).
- `upload_r2.py`: sube `v1/` al bucket público y `model_input/` al prefijo `work/`. Las credenciales de R2 las entrega el integrador; van en `.env`.

### 7. Entrega para Devin (E1, contrato 5.1)

`data/processed/model_input/fires_ar_r5_daily.parquet`: Argentina, 2012-01-01 → último día, una fila por celda res 5 y día con fuego, columnas `h3_r5`, `date`, `n_raw` (int32), `n` (float32), `n_cells_day` (int16), `sensor_mix`. Subir a `work/` en R2 y avisar al integrador.

En E1 la columna `n` puede ser igual a `n_raw` (VIIRS nativo, factor S-NPP → NOAA-20 pendiente). Se reemplaza en E2 sin cambiar el esquema.

### 8. 2026 por API (`07_firms_2026.py`, E4)

- FIRMS API con `FIRMS_MAP_KEY`: `MODIS_SP` hasta 2026-08-31, `VIIRS_SNPP_SP` y `VIIRS_NOAA20_SP` hasta 2026-07-31, y de ahí a hoy las fuentes `*_NRT`. Donde hay SP, no se usa NRT.
- Pedidos de a 10 días, mundo entero, con pausas para respetar el límite de transacciones. Guardar cada respuesta en disco antes de procesarla (reanudable).
- Pasar por los mismos pasos 2 a 6 y re-exportar. Actualizar `sp_until` en `meta.json`.

---

## Criterios de aceptación

- [ ] E1: el Parquet abre con pyarrow, tiene las 6 columnas con los tipos del contrato, y la suma de `n_raw` de un día de Corrientes de febrero de 2022 coincide con el conteo directo sobre los CSV crudos filtrados.
- [ ] E2: `docs/validation/metrics.json` tiene `r2`, `bias_pct` y `r2_cells_day`; el gráfico de tres líneas no muestra salto en 2012 ni en 2018.
- [ ] E3: cada archivo exportado tiene la misma forma que su `fixtures/`; `meta.json` tiene `baseline` 2003-01 → 2022-12; ningún `globe/` supera 60 KB comprimido; se reportaron los percentiles de tamaño de `fire/daily`.
- [ ] E3: para la celda res 5 de Corrientes (`85a963c3fffffff`), el valor de febrero de 2022 en `fire/cal` es el máximo de la serie de esa celda.
- [ ] Ningún archivo de `data/` ni `.env` aparece en `git status`.

---

## Qué reportar al integrador en cada entrega

1. Qué archivos subiste a R2 y con qué tamaño.
2. Filas eliminadas por deduplicación y por filtros, por sensor.
3. Métricas de validación y estratos marcados `low`.
4. Cualquier cosa que el contrato no cubra o que no cierre con los datos.

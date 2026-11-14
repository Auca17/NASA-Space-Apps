# Brief — Frente B: conocimiento agronómico y datos de Orin

**Responsable:** Augustus.
**Qué produce:** contenido, no código. Los archivos `crops.json` y `rotations.json`, el export de Orin y los números de validación satélite vs. campo. El código que los consume (motor de rotaciones, `/api/field/*`) lo escribe Devin con tu dirección en lo agronómico.
**Documentos obligatorios:** `docs/data-contract.md` (sección 3 y 4.2 a 4.3) y `docs/decisions.md` (D1, D16, D17, D19). Ejemplos: `fixtures/knowledge/crops.json` y `fixtures/knowledge/rotations.json`.

Si un campo del esquema no aplica a un cultivo, va `null`, nunca un invento. Cada número lleva su fuente.

---

## Entregas y horas

| Entrega | Hora | Qué incluye | Quién la espera |
|---|---|---|---|
| **B1** | h6 | `back/knowledge/crops.json` con **5 cultivos** (soja, maíz, trigo, sorgo, vicia) y `rotations.json` con **4 rotaciones**, completos y con fuentes | Devin (tarea 3: motor de rotaciones). Sin esto no arranca. |
| **B2** | h16 | Los **15 cultivos** y **12 rotaciones** del PRD 10.1 y 10.2; ventanas por las 5 zonas | Devin, front |
| **B3** | h24 | Export de Orin en `data/orin/`: lotes (GeoJSON), muestreos y estaciones (CSV), umbrales de helada; más un `README.md` que diga qué es cada archivo y de dónde salió | Devin (validación 10.4), presentación |
| **B4** | h30 | Números de validación satélite vs. campo: RMSE y sesgo de NDVI y temperatura contra lo medido en los lotes de Orin, en `docs/validation/orin.md` | Front ("qué tan bien ve el satélite tu lote"), video, README |

**B1b (h12): `back/knowledge/measures.json`** (contrato 3.3, D26). Medidas de prevención de incendios con fuente INTA ([pautas para prevenir incendios durante la cosecha](https://www.argentina.gob.ar/node/413622)). Devin deja 5 medidas de relleno; reemplazalas y agregá las que falten, cada una con su factor, qué requiere (personas, maquinaria, horas de parada, costo bajo/medio/alto) y qué reglas la disparan. Validalas con el contacto productor.

También: revisar con los contactos agrónomos las rotaciones y los indicadores antes de la h32.

---

## B1 y B2: `crops.json`

Esquema en `docs/data-contract.md` sección 3.1. Por cultivo:

- `id` en minúsculas sin acentos (`soja`, `maiz`, `trigo`, `girasol`, `sorgo`, `cebada`, `mani`, `algodon`, `alfalfa`, `avena`, `centeno`, `vicia`, `colza`, `garbanzo`, `arveja`).
- `sowing` y `harvest` por zona: `pampa_humeda`, `nea`, `noa`, `cuyo`, `patagonia`. Si el cultivo no se hace en una zona, esa zona no aparece.
- `gdd_base10`, tolerancias (`low` | `medium` | `high`), `water_mm_cycle`, `root_depth_cm`, `n_fixation`, `residue_t_ha`, `forage`, `market_ar`.
- `sources`: lista de strings con nombre del documento y año (INTA, FAO ECOCROP, MAGyP, bibliografía). Mínimo una por cultivo; ideal una por dato dudoso.

Prioridad B1: los 5 cultivos deben estar **completos** (sin `null` salvo que realmente no aplique) y con la zona `pampa_humeda` sí o sí, porque el lote de demo es Pergamino (D19).

## B1 y B2: `rotations.json`

Esquema en la sección 3.2. Por rotación: `id`, `name.es`, `name.en`, `years`, `sequence` (lista de `{crop, start, end}` con `crop` existente en `crops.json` y fechas `MM-DD`), `bare_soil_days` estimado, `sources`.

Las 4 de B1, todas válidas para `pampa_humeda`:

1. `soja-soja` (la actual típica, sirve de referencia).
2. `trigo-soja2-maiz` (trigo / soja de segunda – maíz).
3. `maiz-soja-vicia` (maíz – soja con vicia de cobertura).
4. `sorgo-soja-trigo-soja2`.

Para B2, completar hasta 12 incluyendo al menos una con pastura (`alfalfa` 3 años – agricultura) y una para `cuyo` o `noa`.

## B3: export de Orin (D17)

- `data/orin/lotes.geojson`: polígonos con `id`, `nombre` (o alias), `cultivo_actual`, `zona`.
- `data/orin/muestreos.csv`: `lote_id`, `fecha`, `variable` (ndvi, temp_suelo, humedad_suelo, etc.), `valor`, `unidad`, `metodo`.
- `data/orin/estaciones.csv`: `estacion_id`, `lat`, `lon`, `fecha`, `t_max`, `t_min`, `precip_mm`, `hr`.
- `data/orin/umbrales_helada.json`: por cultivo, temperatura y fuente.
- `data/orin/README.md`: origen de los datos, período, cómo se recolectaron, y la frase para el README público: datos recolectados antes del hackatón, se usan datos, no código.

`data/` no va a git. Subirlo al prefijo `work/orin/` de R2 cuando el integrador pase las credenciales; mientras, compartirlo por Drive.

## B4: validación satélite vs. campo

Con los lotes y muestreos de Orin, para cada variable medida en campo que tenga un equivalente satelital:

| Campo | Satélite | Fuente de la serie |
|---|---|---|
| NDVI medido o estado del cultivo | MODIS MOD13 (250 m), Landsat/HLS, Sentinel-2 | ORNL MODIS point API, AppEEARS |
| Temperatura (estación) | MODIS LST, POWER T2M | AppEEARS, POWER |
| Humedad de suelo (si hay) | SMAP L3 (9 km) | Earthdata |

Pedir a Devin (vía el integrador) que baje las series satelitales para los puntos de los lotes. Vos entregás la tabla comparada y el texto: RMSE, sesgo, cuántos puntos, qué resolución tiene cada fuente y qué significa para el productor ("el satélite ve bien la tendencia pero no las diferencias dentro del lote"). Va a `docs/validation/orin.md` con los gráficos.

---

## Criterios de aceptación

- [ ] B1: `crops.json` y `rotations.json` abren como JSON válido; cada `crop` de las rotaciones existe en `crops.json`; cada cultivo tiene al menos una fuente; los 5 cultivos tienen `pampa_humeda` en `sowing` y `harvest`.
- [ ] B2: 15 cultivos, 12 rotaciones; al menos una rotación para cada una de tres zonas distintas.
- [ ] B3: `data/orin/README.md` explica origen y período; ningún archivo de `data/` aparece en `git status`.
- [ ] B4: `docs/validation/orin.md` tiene RMSE y sesgo por variable, con el número de puntos comparados.

## Qué reportar al integrador

1. Qué archivos entregaste y dónde.
2. Qué datos no conseguiste y qué fuente usaste como reemplazo.
3. Observaciones de los contactos agrónomos sobre las rotaciones.

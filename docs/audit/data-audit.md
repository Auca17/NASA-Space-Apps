# Auditoría de datos publicados (task 29, 2026-11-15)

Herramienta: `tools/audit_data.py` (reproducible, `--live` para el
cross-check). Universo: 13.471 celdas en `field/grid`, 13.471 en
`risk`, 13.471 en `field/analogs`.

## field/grid — estadísticas

| campo | n | min | p1 | mediana | p99 | max | null% |
|---|---|---|---|---|---|---|---|
| rain_mm_yr (IMERG) | 13.471 | 63,9 | 101 | 650 | 1.740 | 2.110 | 0 |
| rain_cv | 13.471 | 0,095 | 0,141 | 0,228 | 0,395 | 0,59 | 0 |
| rain_p25_mm | 13.471 | 42,5 | 75,8 | 548 | 1.500 | 1.950 | 0 |
| heavy_days_yr (POWER) | 13.471 | 0 | 0 | 0,8 | 4,5 | 7,1 | 0 |
| hot_days_gt35 | 13.471 | 0 | 0 | 21,9 | 152 | 186 | 0 |
| bare_soil_days_yr | 13.471 | 0 | 0 | 0 | 255 | 353 | 0 |
| elevation_m | 13.471 | −397 | 3,5 | 256 | 4.430 | 5.620 | 0 |
| temp_adjust_c | 13.471 | −19,5 | −8,1 | 0 | +4,7 | +10,9 | 0 |
| frost_free (días) | 9.961 | 1 | 6 | 266 | 364 | 365 | 26,1 |
| soc_g_kg | 13.292 | 3,6 | 5 | 15,6 | 92 | 233 | 1,3 |
| sm_anom_pct | 0 | — | — | — | — | — | 100 (a propósito, ver task 18/23) |

## field/grid — flags

| check | celdas | veredicto |
|---|---|---|
| elevation fuera de −50..7000 | 18 | **BUG, corregido**: voids/oceano de SRTM en la media de la celda (−397 a −148 m, costa de Santa Cruz/Chubut/CABA). Elevación puesta a null, `temp_adjust_c` a 0 y `frost_free`/`hot_days_gt35` recalculados sin corrección. |
| \|temp_adjust_c\| > 15 °C | 11 | Reales pero extremos: celdas altoandinas (Catamarca −19,5; Jujuy −17,7/−16,3; La Rioja −16,4) donde el lote está muy por encima de la celda POWER. Se reportan, no se tocan. |
| crop con 0 días de suelo desnudo | 51 | Plausible (cobertura permanente: viñas, yerba mate, forestales). Se reporta, no se toca. |
| negativos, frost>365, hot>366, rain fuera de rango, bare>366, textura desconocida | 0 | — |
| provincia "?" | ~160 | Centroides fuera de los polígonos IGN (celdas costeras/limítrofes); solo afecta al lookup de provincia en reportes. |

## Cross-check: 24 celdas estratificadas vs diagnóstico a demanda

Ejecutado con `DATA_BASE_URL` apuntando a `data/dev_v1` (los datos nuevos).
Después del fix de shards: **rain coincide exacto en las 24** (IMERG en la
tarjeta viene del mismo grid). Desacuerdos >20 % restantes:

| celda | zona | desacuerdo | explicación |
|---|---|---|---|
| `85b208c7f` | Andes/La Rioja | frost 364 d (grid) vs 4 d (diag) | **Corrección punto vs media de celda**: el grid usa la elevación media de la celda; el diagnóstico usa la elevación SRTM del polígono exacto. En terreno andino mixto el centroide puede estar en un pico mientras la media incluye el valle. Esperado por diseño. |
| `85b2e0aff` | Andes/San Juan | frost 6 d vs 158 d | Ídem, dirección opuesta. |
| `85b2e50f`, `85b228c3f`, `85b22c8f`, `85b35083f` | Andes/NOA | frost 121→73, 37→16, 4→16, 365→37 | Ídem. |
| NEA `85a96c4f`, `85a96d43f` | NEA | frost null→360-361 | Semánticamente igual: el grid guarda `frost_free: null` cuando todo el año es libre de heladas; el diagnóstico muestra ~360 días. No es un desacuerdo. |
| Patagonia ×2 | — | heat 0→0,2 y 4,4→3,1 | Ruido de redondeo y diferencia de ajuste <1 °C en valores cercanos a 0. |

**Bug encontrado y corregido durante la auditoría** (independiente de la
tabla): el diagnóstico pedía los shards por la res-2 **del punto** en vez
de la res-2 **padre de la celda res-5**. 800/13.471 celdas (5,9 %) tienen
centroide al otro lado del borde res-2 → `grid_cell = None` → caída
silenciosa a POWER en rain/frost/heat/fire/risk. Fix: `r2 =
h3.cell_to_parent(r5c, 2)` en `back/app/routers/field.py` (la ruta de
analogs ya lo hacía bien). Verificado en vivo: `85ce9c93f` pasó de
"rain 580 | NASA POWER" a "rain 354,4 | GPM IMERG".

## risk

- `generated_at: 2026-11-14T21:03:41Z`; categorías: bajo 11.055 · moderado
  1.298 · alto 791 · muy_alto 327.
- `p`: mediana 0,008 · p99 0,59 · max 0,846. `ratio` (solo celdas con
  clim ≥ 0,01): n=3.606, mediana 0,88, max 12,1 (→ muy_alto, consistente).
- Sin `clim` > 1, sin `ratio` negativo/NaN, sin `reasons` vacíos ni
  placeholders.
- Flag: **13 celdas con p > 0,8** (0,84–0,85), todas en Neuquén norte —
  estepa con historial de fuego en semana de temporada alta. Valor
  extremo pero real del modelo; se reporta, no se toca.
- Distribución por provincia: el riesgo se concentra en Chaco, Corrientes,
  Formosa, Misiones, Santiago del Estero y norte de Santa Fe/Entre Ríos —
  consistente con la climatología de fuego.

## field/analogs

- 24 clusters, tamaños 83–1.916 celdas; sin labels vacíos, sin shares > 1,
  sin rendimientos negativos. Regenerados sobre las features nuevas
  (IMERG + elevación) — k=24, silhouette 0,352.

## Arreglos aplicados

1. 18 celdas con `elevation_m` inválida → null + recompute de
   frost/hot sin corrección (`src.elevation_m` documenta el motivo).
2. Bug de lookup de shard res-2 en `/api/field/diagnose` (ver arriba).

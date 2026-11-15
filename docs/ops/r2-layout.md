# R2 `v1/` — mapa de objetos, lectores y refresco

Bucket `nasa`, prefijo `v1/`. Escrito el 2026-11-15 (task 51) tras la
decisión de retirar los modos Fuego y En vivo del front
(`feat/remove-fire-modes`).

## Prefijos activos (todo lo que la app sigue leyendo)

| Prefijo | Objetos | Tamaño¹ | Quién lo lee | Cómo se regenera |
|---|---|---|---|---|
| `v1/meta.json` | 1 | ~4 KB | front `web/src/api/index.ts:28` (`loadMeta`) | `pipeline/06_export.py` |
| `v1/risk/{h3_r2}.json` | 2 364 | ~102 MB | back `back/app/services/data.py:46` (`risk_shard`) — usado por `routers/field.py:1277,1320`, `routers/risk.py:34`, `routers/parcels.py:963`; front `api/index.ts:41` | `tools/refresh_risk.py` (shards AR `clima`); `pipeline/06_export.py` (historial mundial) |
| `v1/fire/cal/{h3_r2}.json` | 2 364 | ~591 MB | back `back/app/routers/field.py:1318` (`field_shards(weights, "fire/cal", …)`, estación de quemas y riesgo de fuego del lote) | `pipeline/05_aggregate.py` + `06_export.py` (climatología, anual) |
| `v1/field/grid/{h3_r2}.json` | 62 | ~18 MB | back `back/app/routers/field.py:1319` | pipeline campo (suelo/clima por celda) |
| `v1/field/analogs/{h3_r2}.json` | 62 | ~6 MB | back `back/app/routers/field.py:1569` (`analog_shard`, comparación de rotaciones) | pipeline campo |
| `v1/knowledge/*.json` | 4–5 | <1 MB | front `api/index.ts:56` (`cases.json`), `features/parcels/ParcelsWizard.tsx` (`crops.json`) | copia de `back/knowledge/*.json` al subir |
| `v1/orin/validation.json`, `v1/orin/lots.geojson` | 2 | <1 MB | front `api/index.ts:59,62` | `pipeline/orin_export.py`, `orin_validation.py` |
| `v1/ecostress_demo.json` | 1 | ~4 KB | front `api/index.ts:186` | manual (datos ECOSTRESS) |

¹ Tamaños estimados desde el mirror local `data/dev_v1` (sin gzip);
en el bucket los `.json` viajan comprimidos y pesan bastante menos.

## Prefijos retirados (candidatos de borrado)

Los leía solo el front en los modos eliminados (`web/src/features/fire`,
`web/src/features/live`, `api/index.ts:32,38,65`). El back nunca los
lee — verificado por grep sobre `back/app/` en `main` y en
`feat/remove-fire-modes`.

| Prefijo | Objetos | Tamaño¹ | Ex-lector |
|---|---|---|---|
| `v1/globe/{YYYY-MM}.json` | 313 | ~45 MB | `globeMonth` — animación histórica |
| `v1/fire/daily/{h3_r2}.json` | 2 362 | ~821 MB | `dailyShard` — semáforo D9 |
| `v1/fire/points/{h3_r2}/{YYYY}.csv.gz` | 1 547 | ~71 MB | `pointsUrl` — descarga de focos |
| **Total retirado** | **~4 222** | **~937 MB** | |

Ojo: `v1/fire/cal/` **queda** — el back lo lee para la estación de
quemas y el riesgo de fuego de cada parcela (`field.py:1318`).

## Protecciones ya en el repo

- `tools/upload_r2.py` excluye `globe`, `fire/daily`, `fire/points`
  por defecto (`--exclude`): una re-subida del export viejo o del
  mirror `data/dev_v1` no puede resucitarlos (`--exclude ''` para
  forzar).
- `tools/verify_r2.py` ya no espera los prefijos retirados: los marca
  `(retired)` en el conteo remoto y avisa con `WARNING` si quedan
  objetos retirados en el bucket.
- El staging documentado (`r2-stage*`, `tools/refresh_risk.py`) solo
  toca `v1/risk/`; el export del pipeline (`pipeline/06_export.py`)
  se deja intacto — sus salidas retiradas quedan marcadas en
  `docs/data-contract.md` §2.2, §2.4 y §2.5.

## Comandos para el team lead

```bash
# 1. dry run: lista y totales por prefijo, sin tocar nada
python tools/prune_r2.py

# 2. borrado real (requiere la confirmación exacta; escribe primero
#    data/prune-manifest-<fecha>.json con keys/tamaños/ETags y verifica
#    que la keep-list siga intacta)
python tools/prune_r2.py --delete --confirm-prefixes globe,fire/daily,fire/points

# 3. verificación post-borrado
python tools/verify_r2.py
```

Estado conocido: el token R2 devuelve `AccessDenied` en
`ListObjectsV2` (2026-11-15; funcionaba horas antes). El paso 1 lo
reproduce — hay que arreglar el acceso antes del paso 2.

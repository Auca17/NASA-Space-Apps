# Checklist de entrega — NASA Space Apps 2026

Todo lo necesario para entregar, según `docs/PRD.md` §15 y las reglas del
challenge conocidas en el repo. Estados: **hecho** / **en curso** / **pendiente**,
con la evidencia del repo. Los dueños se infieren de `docs/decisions.md` D14
(Ezequiel: datos de fuego y pipeline; Augustus y Ezequiel: datos y conocimiento
de Orin; Alex: front y presentación; el rol "integrador" de D14 no nombra
persona — se marca donde aplica).

## Entregables obligatorios

| # | Ítem | Dueño | Estado | Evidencia |
|---|---|---|---|---|
| 1 | **Demo online** (celular y desktop) que el jurado pueda abrir | Ezequiel (deploy) + integrador | en curso | `docs/DEPLOY.md` documenta el deploy en Vercel y la URL de R2; falta la URL pública → `[PENDIENTE: URL de la demo]` en `README.md` |
| 2 | **Video de 2–3 min** con el arco productor → ejemplo de un toque → parcelas (fuego/agua) + alerta → prioridades → calendario → rotaciones → validación | Alex | en curso | Guión y storyboard listos en `docs/submission/video-script-es.md` (~140 s + versión de 60 s, solo Field Shift tras D34); falta grabar y subir → `[PENDIENTE: URL del video]` |
| 3 | **Repo público con README**: problema, datos, método, validación, limitaciones, origen de los datos de Orin, cómo correrlo | Ariel (unificar) | en curso | `README.md` y `README.es.md` escritos según brief 22; falta confirmar que el repo `github.com/Auca17/NASA-Space-Apps` sea público |
| 4 | **Dataset armonizado descargable** (fuera de la entrega tras D34 — solo si se publica como material de repo) | Ezequiel | pendiente | `pipeline/08_release.py` genera Parquet + CSV + metadatos + `CITATION.cff` + `SHA256SUMS` (`pipeline/README.md` tabla Pasos); falta publicar (GitHub Release / Zenodo) → `[PENDIENTE: URL de descarga]` |
| 5 | **Categorías a elegir (1–3)**: Best Use of Data, Local Impact, Galactic Impact | Alex (decisión del equipo) | pendiente | `docs/PRD.md` §15 lista las 3 candidatas; ninguna decisión registrada en `docs/decisions.md` |
| 6 | **Página del equipo** (nombres, roles, foto si aplica) | Alex | pendiente | Sin archivo en el repo; team listado en `README.md` (Ariel · Augustus · Ezequiel · Alex) |
| 7 | **Confirmación: sin menores de 18 en pantalla** | Alex | en curso | Regla en `docs/PRD.md` §15 e `idea-general.md` §Entrega; checklist de producción agregado en `video-script-es.md`; falta verificación sobre el material grabado |
| 8 | **Check de accesibilidad** (Lighthouse Accessibility ≥ 90, todo usable con teclado) | Alex + integrador front | en curso | Criterio en `docs/PRD.md` §15; tests del front en `web/` (`npm test`, vitest + Testing Library); no hay reporte Lighthouse en el repo |
| 9 | **Ninguna key en el repo ni en el bundle del front** | integrador | hecho | `.env` en `.gitignore`; `FIRMS_MAP_KEY` solo como nombre de variable; `back/README.md`: "Secrets are read only from env; nothing is logged"; `docs/DEPLOY.md`: la key solo existe en Vercel |

## Criterios de aceptación del PRD §15 (verificación previa a la entrega)

| # | Ítem | Dueño | Estado | Evidencia |
|---|---|---|---|---|
| 10 | ~~Serie de fuego sin salto en 2012 ni en 2018~~ (fuera de la entrega, D34 — el pipeline queda en el repo) | Ezequiel | hecho (repo) | `docs/validation/series_global.png`; `docs/metodo-fuego.md` §Validación |
| 11 | ~~Panel de la zona en < 5 s con 4G, en cualquier país~~ (criterio del modo Fuego retirado, D34) | Alex | fuera de la entrega | Criterio en `docs/PRD.md` §15 |
| 12 | Lote → diagnóstico + calendario en < 10 s | integrador (medir) | pendiente | Criterio en `docs/PRD.md` §15; timeouts diseñados (3 s / 5 s POWER) en `back/README.md`; sin medición end-to-end registrada |
| 13 | Actual + 3 estrategias, cada una con las 5 secciones | Augustus | hecho | Contrato §4.3 (`docs/data-contract.md`); `back/README.md` §rotations; `docs/PRD.md` §7.4 |
| 14 | Cada número del diagnóstico con fuente y resolución | Augustus | hecho | `docs/data-contract.md` §4.2 (`source`, `resolution` por tarjeta); `docs/PRD.md` §7.2 |
| 15 | ~~Semáforo contra mediana 2003–2022~~ (modo retirado, D34; el trabajo queda en repo) | Ezequiel | fuera de la entrega | `docs/decisions.md` D9 y D10; `pipeline/README.md` §Agregados |
| 16 | ~~El CSV coincide con el calendario~~ (exportación retirada, D34) | integrador | fuera de la entrega | `docs/PRD.md` §15; `docs/data-contract.md` §2.3 |
| 17 | Validación satélite vs. campo con datos reales (no sintéticos) | Augustus | hecho | `docs/validation/orin/validation.json` (`synthetic: false`); `docs/validation/orin/README.md`; guard de build en `web/README.md` §Orin |

## Pendientes de decisión abiertos (`docs/decisions.md` §Pendientes)

| # | Ítem | Dueño | Estado | Evidencia |
|---|---|---|---|---|
| 18 | Orden de construcción y asignación de la lente Campo (`crops.json`, `rotations.json`, `/api/field/*`) | Augustus | en curso | `docs/decisions.md` §Pendientes; los archivos existen (`back/knowledge/`) pero la asignación formal quedó "con el plan de acción" |
| 19 | Orden de las tareas de Devin | integrador | en curso | `docs/decisions.md` §Pendientes; briefs `docs/briefs/devin/01–22` ya emitidos |
| 20 | Explicación en lenguaje simple: plantillas primero, LLM solo si sobra tiempo (propuesta, no decidido) | Augustus + Alex | pendiente | `docs/decisions.md` §Pendientes; contrato §4.5 |
| 21 | Revisión agronómica de `crops.json` / `rotations.json` / `measures.json` (valores de agua, rastrojo, zonas, Patagonia sin rotación) | Augustus | en curso | `docs/revision-agronomica.md` y `back/knowledge/REVIEW.md` abiertos a respuesta de agrónomos |
| 22 | `gdd_base10` en `null` en los 15 cultivos: cambiar base o quitar el campo | Augustus | pendiente | `docs/decisions.md` §Pendientes (Frente B); `back/knowledge/REVIEW.md` §Priority 3 |
| 23 | SoilGrids y ORNL a demanda no responden (> 15 s): tarjetas `soil`, `vigor_bare_soil` y fila `bare_soil` salen del precálculo `field/grid` | Ezequiel (grid) + integrador | en curso | `docs/decisions.md` §Pendientes; `back/README.md` Notes (03b)/(06); `model/field_grid/README.md` |
| 24 | POWER: MERRA-2 termina 2026-10-01, la cola es GEOS-IT (otro producto); documentar en `report.md` y columna `source` si hace falta | Ezequiel + integrador | en curso | `docs/decisions.md` §Pendientes; mencionado en `docs/validation/orin/README.md` §Limitaciones |
| 25 | Puntos técnicos Frente A E2–E3 por discutir (18 bandas vs. 36 del brief; tramo baja confianza hasta 2012-01; celda de control `85a9441bfffffff`; shards `fire/daily` > 800 KB; riesgo `cat` con `ratio = null`) | Ezequiel | en curso | `docs/decisions.md` §Pendientes (E2–E3); D27, D28, D29, D30 ya registran la mayoría |
| 26 | Puntos Frente A E4 por discutir (`type` inferido en NRT; S-NPP 2026 no descargado; persistencia solo en la celda vs. "celda o vecinas" de D29) | Ezequiel | en curso | `docs/decisions.md` §Pendientes (E4); `pipeline/README.md` §2026 |
| 27 | Contrato 3.2 sin `zones` por rotación y 3.3 sin `applies_when`: agregar si el front lo necesita | Augustus + Alex | pendiente | `docs/decisions.md` §Pendientes (Frente B) |
| 28 | Nombre del proyecto | equipo / Alex | hecho | **Ashfield** (actualización del equipo); assets en `web/public/brand/ashfield-*` y `tools/brand/`; ojo: `web/src/config.ts` y `docs/decisions.md` D20 aún figuran "a definir" |
| 29 | Challenge(s) de inscripción confirmado con la sede | Ezequiel | hecho | `docs/decisions.md` D1 (inscripto en Field Shift) + D34 (modos Fuego/Live retirados del producto; la entrega es solo Field Shift) |
| 30 | Licencia del código | equipo | hecho | `LICENSE` (MIT, 2026 Ashfield team) en el repo — falta solo la confirmación final del equipo |

## Regla de seguridad para la entrega

- Ningún archivo servido puede llevar `"synthetic": true`: la compilación de
  producción falla si lo encuentra (`docs/data-contract.md` §2.9;
  `web/README.md` §Orin). Los datos reales de Orin ya están
  (`docs/validation/orin/validation.json`, `synthetic: false`).

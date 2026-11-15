# Guión y storyboard del video (2–3 minutos) — español

Video para el jurado de NASA Space Apps 2026. Duración total: **175 segundos** (máx. 180).
Todos los números mencionados tienen su fuente en la última columna; el mapeo completo está en `facts-sources.md` (interno, no publicar).
Versión corta de 60 segundos para redes al final.

## Checklist de producción

- [ ] Ninguna persona menor de 18 años aparece en pantalla.
- [ ] Todos los números narrados coinciden con la columna "Fuente".
- [ ] El modo histórico se graba sobre la celda de control `85a9441bfffffff` (Esteros del Iberá, D27).
- [ ] El lote de demo es el de Pergamino (D19).
- [ ] Subtítulos en español; versión con subtítulos en inglés si el tiempo lo permite.
- [ ] Portada: `web/public/brand/ashfield-cover.png` (verificar con el equipo si el nombre ya está definido; si no, tapar el wordmark).

## Guión principal (175 s)

| Segundos | En pantalla | Narración | Texto en pantalla | Fuente de los números |
|---|---|---|---|---|
| 0–15 | Globo 3D girando con focos; zoom rápido a Sudamérica | "Desde el año 2000, los satélites de la NASA ven el fuego. Pero el registro está partido entre dos sensores que no se pueden comparar. Y al mismo tiempo, un productor tiene que decidir qué sembrar con un clima que cambia." | "Dos problemas. Un mismo dato." | MODIS desde 2000, se apaga 2026 / VIIRS 375 m desde 2012 → `docs/metodo-fuego.md` §El problema |
| 15–35 | `docs/validation/series_global.png` a pantalla completa; cursor recorre 2012 y 2018 sin salto | "Unimos 568 millones de detecciones en una sola serie, en unidades equivalentes a VIIRS NOAA-20. Calibramos mes a mes y por banda de latitud, y lo validamos con años que el modelo nunca vio: R² de 0,98 en la serie mundial. No hay salto cuando cambia el sensor." | "Una serie, 2000 → hoy. R² = 0,98 (hold-out 2023–24)" | 568 M → `docs/metodo-fuego.md` §Fuentes; R² 0,979 → `docs/validation/metrics.json` `r2_global_monthly`; método → `docs/metodo-fuego.md` §Armonización |
| 35–60 | App: modo histórico con Play. El globo avanza mes a mes hasta feb-2022 sobre Corrientes; el calendario resalta | "Acá el globo cuenta la historia. Corrientes, enero y febrero de 2022: más de 33 mil focos, 18 veces lo normal en veinte años. En el corazón de los Esteros del Iberá, donde un febrero típico no tiene ni un foco, hubo 416." | "Corrientes ene–feb 2022: 33.255 focos — 18× lo normal" | 33.255 / 1.846 mediana / 18× → `docs/case-study/README.md`; pico celda 416, mediana feb = 0 → `docs/case-study/README.md`, D27 |
| 60–80 | "Ver mi zona": se acepta la ubicación, el globo vuela a 50 km; se abre el panel: riesgo 7 días con razones + semáforo del mes | "Cualquier persona toca 'Ver mi zona' y el globo vuela hasta ella. Ve el riesgo de fuego de los próximos 7 días, con sus razones, y un semáforo que compara este mes contra veinte años de historia." | "Riesgo 7 días · semáforo vs. mediana 2003–2022" | 50 km ≈ 31 celdas res 5 → `docs/decisions.md` D9; línea base 2003–2022 → D10 |
| 80–125 | "Analizar mi campo" → lote de demo Pergamino → tarjetas de diagnóstico → sliders de escenario (lluvia −20 %, +1 °C) → las 4 tarjetas de rotación abiertas en las 5 secciones | "Si es productor, dibuja su lote. Recibe un diagnóstico donde cada número muestra su fuente de la NASA. Después compara su rotación actual con tres alternativas: cada una dice por qué, la evidencia, los beneficios, lo que no sabemos y qué validar con su agrónomo. Y puede mover el clima — menos lluvia, más calor — y ver cómo cambian las respuestas." | "Actual + 3 alternativas · por qué, evidencia, beneficios, vacíos, riesgos" | 15 cultivos / 12 rotaciones → `back/knowledge/README.md`; sliders −20 % / +1 °C → `docs/PRD.md` §7.4; 5 secciones → `docs/PRD.md` §7.4 y contrato §4.3 |
| 125–145 | `docs/validation/orin/satelite_vs_estaciones.png`; luego la tarjeta "Qué tan bien ve el satélite tu lote" | "Y lo verificamos en campo. Comparamos la temperatura del satélite con 53 estaciones reales en Mendoza. El hallazgo honesto: en la montaña el satélite se equivoca varios grados porque su grilla promedia la altura de los valles con la cordillera. Corrigiendo por la altura real, el error baja casi a la mitad." | "Satélite vs. campo: RMSE 5,0 °C → 2,8 °C con corrección por altura" | 53 estaciones, 742 pares → `docs/validation/orin/README.md`; RMSE 5,05 → 2,82 °C (6,5 °C/km) → `docs/validation/orin/README.md` y `metricas.json` |
| 145–160 | La app muestra la franja de baja confianza del calendario y el aviso "herramienta de apoyo" | "Somos honestos con los límites: los años antes de 2012 tienen menor confianza, el suelo ve poco dentro de un lote, y las rotaciones apoyan la decisión — no reemplazan al agrónomo." | "Apoyo a la decisión, no consejo agronómico" | Tramo 2000-11→2012-01 baja confianza → `docs/metodo-fuego.md` §Limitaciones; SMAP 9 km / vacíos → `docs/PRD.md` §7.4; disclaimer → `docs/PRD.md` §7.4 |
| 160–175 | Cierre: portada del proyecto + las dos lentes una al lado de la otra | "Un mismo motor de armonización, dos lentes: cuánto fuego hay cerca tuyo y qué rotación le conviene a tu campo. Presentamos en Field Shift, y el proyecto cubre también Harmonization of MODIS and VIIRS Hot Spots. Los datos de NASA, traducidos a decisiones." | "[NOMBRE A DEFINIR] — Field Shift + Hot Spots" | Challenges → `docs/PRD.md` encabezado; D1 `docs/decisions.md` |

**Total: 175 s** (≤ 180 s).

## Versión corta de 60 segundos (redes)

| Segundos | En pantalla | Narración | Texto en pantalla | Fuente de los números |
|---|---|---|---|---|
| 0–10 | Globo con focos, zoom a Argentina | "25 años de fuego de la NASA estaban partidos entre dos satélites. Los unimos." | "Una sola serie, 2000 → hoy" | `docs/metodo-fuego.md` §El problema |
| 10–25 | `series_global.png` (1 s) → modo histórico llegando a feb-2022 en Corrientes | "568 millones de detecciones armonizadas. Corrientes 2022: 18 veces lo normal." | "Corrientes 2022: 33.255 focos — 18×" | `docs/validation/metrics.json`; `docs/case-study/README.md` |
| 25–40 | "Ver mi zona" → panel con riesgo → "Analizar mi campo" → 4 tarjetas de rotación | "Ves el riesgo de fuego de tu zona en 7 días. Y si sos productor, tu rotación comparada con tres alternativas, cada una con su evidencia y sus riesgos." | "Riesgo 7 días · tu rotación + 3 alternativas" | `docs/PRD.md` §6.5 y §7.4 |
| 40–50 | `satelite_vs_estaciones.png` | "Lo validamos contra 53 estaciones reales en Mendoza — y mostramos también dónde el satélite falla." | "Satélite vs. campo, honestamente" | `docs/validation/orin/README.md` |
| 50–60 | Portada + cierre | "Datos de la NASA, traducidos a decisiones para el territorio." | "[NOMBRE A DEFINIR] · NASA Space Apps 2026" | `docs/PRD.md` encabezado |

**Total: 60 s.**

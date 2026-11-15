# Outline de slides (español) — Ashfield · Field Shift primero

Nueve slides para la presentación principal. Cada una: título, máximo 3 bullets,
el visual a usar (archivo del repo) y la nota del orador. Números solo de archivos
del repo; el mapeo figura → fuente está en `facts-sources.md` (interno).
Las slides de la lente Fuego (modo live, exportación CSV, alertas n8n) van al
apéndice, listadas al final — el jurado de Field Shift no las necesita en la
narrativa principal.

---

## Slide 1 — Título

- Ashfield — ¿Qué conviene sembrar en tu lote?
- NASA Space Apps 2026 · Field Shift (también cubre Hot Spots)
- Equipo: Ariel (documentación) · Augustus (datos Orin, agronomía) · Ezequiel (datos y pipeline, deploy, agronomía) · Alex (front, presentación)

**Visual:** `web/public/brand/ashfield-cover.png` (portada de marca; lockup en
`web/public/brand/ashfield-lockup-light.svg`, paleta ember #b3401e, verde
cultivo, beige rastrojo).

**Nota:** Una sola frase de apertura: "Un productor dibuja su lote y Ashfield le
responde qué conviene sembrar, con datos de la NASA detrás de cada número".

## Slide 2 — El problema

- Productores eligiendo rotaciones con clima cambiante, agua escasa y suelos degradados
- Los datos de la NASA existen pero están dispersos entre productos, resoluciones y portales — nunca a escala de lote
- En Argentina se suma la quema de rastrojos: daña el suelo y es fuente importante de focos de calor

**Visual:** imagen satelital de un lote (NASA GIBS) o captura de la app sobre la
finca de ejemplo en Mendoza.

**Nota:** El problema no es falta de datos — es que nadie los traduce a la
decisión que el productor tiene que tomar esta campaña.

## Slide 3 — Lo que hace Ashfield

- El productor dibuja su lote → parcelas con cultivo, 8 riesgos ordenables, prioridades propias
- Diagnóstico por parcela: % fuego y % agua con el motivo, evaporación/ET0, infiltración, alertas
- Rotación actual + 3 alternativas — cada tarjeta: por qué, evidencia, beneficios, vacíos, riesgos

**Visual:** captura de la app con las 4 tarjetas de rotación de un punto en la
pampa (vía "Analizar mi campo"; la finca demo de Mendoza no rota: viñedos y
olivos), una abierta en sus 5 secciones (grabación).

**Nota:** No es un dashboard más: responde una pregunta concreta y cada número
muestra su fuente y resolución.

## Slide 4 — El motor del campo

- Determinístico y explicable: 15 cultivos + 12 rotaciones con fuentes, filtro de viabilidad y puntaje por prioridades
- Indicadores: agua, carbono, nitrógeno, erosión, infiltración (grupos hidrológicos USDA), plagas, forraje, ingreso, quemas evitadas
- El LLM solo traduce: debe citar un indicador por afirmación; fallback a plantillas

**Visual:** captura de una tarjeta de rotación con la sección "Evidencia" abierta
mostrando la fuente NASA de cada indicador.

**Nota:** Nunca una caja negra: cada estrategia dice por qué quedó primera y qué
dato de la NASA la respalda. Las medidas de prevención de incendios (INTA) se
activan con los datos del lote.

## Slide 5 — Método: una grilla, muchas resoluciones

- El brief pide datos heterogéneos en una grilla común (F8) — el ejemplo: la serie de fuego armonizada
- ~568 M de detecciones FIRMS → equivalente VIIRS NOAA-20, calibración por estrato (banda 10° × mes)
- Campo a la misma grilla: POWER, MODIS NDVI, SRTM, SoilGrids, GRACE, MAGyP (SMAP rechazada por QA, GAEZ pendiente)

**Visual:** `docs/validation/series_global.png` — la serie armonizada sin salto
en 2012 ni en 2018.

**Nota:** Todo se expresa en la unidad del sensor que queda (NOAA-20), porque
MODIS se apaga en 2026. La misma grilla H3 sirve al lote y al fuego.

## Slide 6 — Validación

- Satélite vs. campo: 53 estaciones Orin, 742 pares — RMSE 5,05 °C crudo → 2,82 °C corrigiendo por altura
- Lluvia vs. pluviómetros: 25 estaciones INTA SIGA, 1.346 estación-meses — ambos productos ~+22 mm/mes (punto vs. píxel, Mendoza)
- Armonización, hold-out 2023–2024: R² mundial 0,979 · R² lineal 0,926 · sesgo −0,8 %

**Visual:** `docs/validation/orin/satelite_vs_estaciones.png` (los puntos rojos
de la celda con cordillera cuentan la historia solos).

**Nota:** La honestidad es parte del producto: mostramos dónde el satélite falla
y por qué — no solo los números buenos.

## Slide 7 — El humano en el loop

- Cada tarjeta: "apoyo a la decisión — validar con tu agrónomo"
- Base agronómica en revisión abierta (`docs/revision-agronomica.md`); Patagonia dice "sin rotaciones validadas" antes que adivinar
- Datos de campo de Orin (53 estaciones, Mendoza) como verdad de terreno — recolectados antes del hackatón, autorizados (D17)

**Visual:** `docs/validation/orin/satelite_vs_estaciones.png` o captura del
disclaimer en la app.

**Nota:** El caso Orin resume la filosofía: el satélite da 25 años de historia,
la estación da el valor exacto; mostramos el error y corregimos por altura real.

## Slide 8 — Límites, dichos en voz alta

- Indicadores relativos y cualitativos — ordenan alternativas, no predicen rindes; Kc genérico FAO pendiente de revisión local
- POWER puede errar varios grados en celdas de montaña (la app corrige por altura); capas de campo precalculadas solo en Argentina
- Granizo: "sin dato satelital" — mejor decirlo que inventar un número

**Visual:** captura de la tarjeta de granizo "sin dato" o de los límites en la app.

**Nota:** Mostrar los límites en la app (no solo en esta slide) es lo que pide el
brief de Field Shift sobre vacíos de información e incertidumbre.

## Slide 9 — Cierre

- Un productor, una pregunta, una respuesta con evidencia NASA: rotación actual + 3 alternativas
- El fuego queda donde pertenece: un riesgo del lote, medido con la misma grilla (ver apéndice)
- Datos de la NASA, traducidos a decisiones — apoyo a la decisión, no consejo agronómico

**Visual:** `web/public/brand/ashfield-cover.png` o la app sobre la finca de
Mendoza con las parcelas y sus indicadores visibles.

**Nota:** Cerrar con la promesa del producto: "¿Qué conviene sembrar? — esto es
lo que la NASA puede decirte, y esto es lo que tenés que validar con tu agrónomo".

---

## Apéndice — slides de la lente Fuego (fuera de la narrativa principal)

Usar solo si el jurado pregunta por el segundo challenge o por la cobertura
completa del producto:

- **Serie armonizada en vivo:** `docs/validation/series_global.png` +
  `docs/validation/holdout_scatter.png` (R² 0,979 / 0,926 / 0,654, sesgo −0,8 %).
- **Modo histórico:** globo 3D reproduciendo mes a mes 2000 → hoy; caso Corrientes
  ene–feb 2022: 33.255 focos, 18× la mediana (`docs/case-study/mapa_ene-feb_2022_vs_2021.png`).
- **Modo live:** detecciones 24 h / 48 h / 7 d sobre imagen GIBS del día.
- **Semáforo y riesgo a 7 días:** mes actual vs. línea base 2003–2022; LightGBM
  ROC-AUC 0,920 vs. climatología 0,843 (`model/fire_risk/report.md`).
- **Descarga CSV** de la serie de la celda.
- **Alertas n8n (idea):** notificaciones proactivas cuando el riesgo de una celda
  sube — bosquejado, no implementado.

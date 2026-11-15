# Outline de slides (español) — Ashfield · solo Field Shift

Nueve slides para la presentación principal. Cada una: título, máximo 3 bullets,
el visual a usar (archivo del repo) y la nota del orador. Números solo de archivos
del repo; el mapeo figura → fuente está en `facts-sources.md` (interno).
Los modos Fuego y Live fueron retirados del producto (D33/D34): quedan listados al
final bajo "Fuera de la entrega" — solo si el jurado pregunta por trabajo previo.

---

## Slide 1 — Título

- Ashfield — ¿Qué conviene sembrar en tu lote?
- NASA Space Apps 2026 · Field Shift
- Equipo: Ariel (documentación) · Augustus (datos Orin, agronomía) · Ezequiel (datos y pipeline, deploy, agronomía) · Alex (front, presentación)

**Visual:** `web/public/brand/ashfield-cover.png` (portada de marca; lockup en
`web/public/brand/ashfield-lockup-light.svg`, paleta ember #b3401e, verde
cultivo, beige rastrojo).

**Nota:** Una sola frase de apertura: "Un productor dibuja su lote y Ashfield le
responde qué conviene sembrar, con datos de la NASA detrás de cada número".

## Slide 2 — El problema

- Productores eligiendo rotaciones con clima cambiante, agua escasa y suelos degradados
- Los datos de la NASA existen pero están dispersos entre productos, resoluciones y portales — nunca a escala de lote
- En Argentina se suma la quema de rastrojos: daña el suelo y amenaza el propio lote

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

- El brief pide datos heterogéneos en una grilla común (F8): todas las capas de campo van a la misma grilla H3 res 5
- POWER diario (0,5°) · IMERG mensual (0,1°) · NDVI MODIS (0,05°) · SoilGrids (250 m) · SRTM (~30 m) · historial de fuego FIRMS
- Cada parcela se rasteriza a esas celdas y lee todas las capas celda por celda; Sentinel-2 (20 m) y OpenStreetMap se suman a pedido

**Visual:** captura de la app con las zonas del lote (riesgo de fuego, suelo seco,
suelo desnudo) sobre el mapa — cada zona es una lectura de la misma grilla.

**Nota:** Es la misma idea que la armonización de sensores pero aplicada al lote:
fuentes de resoluciones y escalas distintas, comparables celda por celda.

## Slide 6 — Validación

- Satélite vs. campo: 53 estaciones Orin, 742 pares — RMSE 5,05 °C crudo → 2,82 °C corrigiendo por altura
- Lluvia vs. pluviómetros: 25 estaciones INTA SIGA, 1.346 estación-meses — ambos productos ~+22 mm/mes (punto vs. píxel, Mendoza)
- Lo que todavía no está validado: NDVI y humedad del suelo sin muestras de campo — dicho en la app

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
- El fuego queda donde pertenece: una probabilidad por parcela, con su motivo, sus alertas y sus meses de quema
- Datos de la NASA, traducidos a decisiones — apoyo a la decisión, no consejo agronómico

**Visual:** `web/public/brand/ashfield-cover.png` o la app sobre la finca de
Mendoza con las parcelas y sus indicadores visibles.

**Nota:** Cerrar con la promesa del producto: "¿Qué conviene sembrar? — esto es
lo que la NASA puede decirte, y esto es lo que tenés que validar con tu agrónomo".

---

## Fuera de la entrega — trabajo que queda en el repo, no en el producto

Usar solo si el jurado pregunta por trabajo previo; ninguno de estos modos forma
parte de la app ni de esta entrega (D34):

- **Armonización MODIS/VIIRS:** ~568 M de detecciones → equivalente NOAA-20;
  hold-out 2023–2024 R² mundial 0,979 (`docs/validation/metrics.json`,
  `docs/metodo-fuego.md`). El pipeline queda en `pipeline/` y `model/fire_risk/`.
- **Modo histórico / Live / semáforo / CSV / riesgo a 7 días:** retirados de la app.
- **Alertas n8n (planeado, no entregado):** workflows que avisan sobre detecciones
  en vivo cerca de un lote guardado — existen y se probaron en un entorno de
  prueba; el sistema de notificaciones todavía no es parte de la app
  (`ops/n8n/`, `docs/ideas/alerts-and-identity.md`).

# Outline de slides (español) — [NOMBRE A DEFINIR]

Diez slides para la presentación. Cada una: título, máximo 3 bullets, el visual
a usar (archivo del repo) y la nota del orador. Números solo de archivos del
repo; el mapeo figura → fuente está en `facts-sources.md` (interno).

---

## Slide 1 — Título

- [NOMBRE A DEFINIR] — Fuego y Campo
- NASA Space Apps 2026 · Field Shift (también cubre Hot Spots)
- Equipo: Ariel, Augustus, Ezequiel, Alex

**Visual:** `web/public/brand/ashfield-cover.png` (portada de marca; si el nombre
no está confirmado, usar solo el fondo sin el wordmark).

**Nota:** Una sola frase de apertura: "Un motor de armonización que lleva datos
de la NASA a una grilla común, visto desde dos lentes: el fuego cerca tuyo y la
rotación de tu campo".

## Slide 2 — El problema

- Focos de calor partidos entre MODIS (1 km, 2000 → 2026) y VIIRS (375 m, 2012 → hoy): la serie salta al cambiar de sensor
- Productores eligiendo rotaciones con clima cambiante y suelos degradados
- En Argentina los dos problemas se cruzan en la quema de rastrojos

**Visual:** `docs/validation/series_argentina.png` (la serie se ve partida antes
de armonizar) o captura del modo histórico sobre Sudamérica.

**Nota:** Sin armonizar no se puede saber si 2022 fue peor por el fuego o por el
sensor. Los datos de la NASA existen; falta traducirlos a una decisión.

## Slide 3 — La solución en una imagen

- Un motor de armonización (grilla H3) + dos lentes: Fuego y Campo
- Fuego: globo 3D, histórico animado, live, calendario, semáforo, riesgo 7 días, CSV
- Campo: diagnóstico del lote, calendario agrícola, rotación actual + 3 alternativas

**Visual:** el diagrama ASCII de `docs/idea-general.md` convertido en imagen, o
captura de la app con el globo y el panel (generar en la grabación).

**Nota:** No son dos proyectos pegados: las dos lentes usan la misma grilla y se
cruzan en la quema de rastrojos, el riesgo del lote y el suelo desnudo.

## Slide 4 — Datos y armonización

- ~568 M de detecciones FIRMS → una serie en equivalente VIIRS NOAA-20
- Calibración por estrato (banda de latitud 10° × mes): Terra→T+A, S-NPP→NOAA-20, MODIS→VIIRS `log(V+1)=a+b·log(M+1)` + factor de totales
- Campo a la misma grilla: POWER, IMERG, SMAP, MODIS NDVI, SRTM, SoilGrids, GRACE, GAEZ, MAGyP

**Visual:** `docs/validation/series_global.png` — la serie armonizada sin salto
en 2012 ni en 2018.

**Nota:** Todo se expresa en la unidad del sensor que queda (NOAA-20), porque
MODIS se apaga en 2026. Cada indicador conserva su fuente y resolución.

## Slide 5 — Validación

- Hold-out 2023–2024 (años no vistos): R² mundial 0,979 · R² lineal 0,926 · R² log1p 0,654 · sesgo −0,8 %
- Riesgo 7 días (test 2023–2025): LightGBM ROC-AUC 0,920 vs. climatología 0,843 y persistencia 0,852
- Satélite vs. campo: 53 estaciones Orin, 742 pares — RMSE 5,05 °C crudo → 2,82 °C corrigiendo por altura

**Visual:** `docs/validation/holdout_scatter.png` + `docs/validation/orin/satelite_vs_estaciones.png` lado a lado (o `docs/case-study/validacion_video.png`, ya en 16:9).

**Nota:** El R² logarítmico es más bajo porque pesa igual a celdas con 1 o 3
focos, donde domina el ruido de muestreo; las celdas con mucho fuego se predicen
bien. La honestidad es parte del producto.

## Slide 6 — El motor del campo

- Determinístico y explicable: 15 cultivos + 12 rotaciones con fuentes, filtro de viabilidad y puntaje por prioridades
- Indicadores: agua, carbono, nitrógeno, erosión, plagas, forraje, ingreso, quemas evitadas
- El LLM solo traduce: debe citar un indicador por afirmación; fallback a plantillas

**Visual:** captura de las 4 tarjetas de rotación del lote de Pergamino con las
5 secciones abiertas (grabación de la app).

**Nota:** Nunca una caja negra: cada estrategia dice por qué quedó primera y qué
dato de la NASA la respalda. Las medidas de prevención de incendios (INTA) se
activan con los datos del lote.

## Slide 7 — El humano en el loop

- Cada tarjeta: "apoyo a la decisión — validar con tu agrónomo"
- Base agronómica en revisión abierta con agrónomos y productores (`docs/revision-agronomica.md`)
- Datos de campo de Orin (53 estaciones, Mendoza) para validar lo que ve el satélite

**Visual:** `docs/validation/orin/satelite_vs_estaciones.png` (los puntos rojos
de la celda con cordillera cuentan la historia solos).

**Nota:** El caso Orin resume la filosofía: el satélite da 25 años de historia,
la estación da el valor exacto; mostramos el error y corregimos por altura real.

## Slide 8 — Límites, dichos en voz alta

- 2000-11 → 2012-01 marcado como baja confianza; hueco de Terra jun–jul 2001
- POWER puede errar varios grados en celdas de montaña; SMAP anulado hasta nueva línea base
- Capas de campo precalculadas solo en Argentina; rotaciones = apoyo, no consejo

**Visual:** captura del calendario con la franja de baja confianza marcada, o
`docs/validation/series_argentina.png`.

**Nota:** Mostrar los límites en la app (no solo en esta slide) es lo que pide el
brief de Field Shift sobre vacíos de información e incertidumbre.

## Slide 9 — Impacto para Argentina

- Corrientes ene–feb 2022: 33.255 focos, 18× la mediana 2003–2022 (vs. 883 en 2021)
- La quema de rastrojos une fuego y campo: una mejor rotación reduce la necesidad de quemar
- Prevención accionable: medidas INTA activadas por clima de fuego, cosecha en seco y suelo desnudo

**Visual:** `docs/case-study/mapa_ene-feb_2022_vs_2021.png` (hexágonos res 5 de
Corrientes 2021 vs. 2022).

**Nota:** En el corazón de los Esteros del Iberá la mediana de febrero es 0
focos y en 2022 hubo 416. La herramienta convierte ese dato en acción concreta.

## Slide 10 — Próximos pasos

- Estratificar la calibración por cobertura del suelo (MCD12C1) y expandir la grilla de campo al mundo
- Completar la revisión agronómica (agua, rastrojo, rotación de Patagonia) y el modelo 2026
- Publicar el dataset armonizado con `CITATION.cff`

**Visual:** `docs/case-study/serie_85a9441bfffffff.png` (serie mensual de la
celda del Iberá contra su mediana) como cierre, o la portada de marca.

**Nota:** Cerrar con la frase del caso de estudio: "donde en un febrero típico
no hay ni un foco, hubo 416". Los datos de la NASA, traducidos a decisiones.

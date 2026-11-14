# Devin task 14 — Front polish, the three P1 findings of the design critique (one unit)

Start after task 13, without waiting for review. Do not modify `docs/`, `fixtures/` or `back/` (list needed back changes in the report). Do not commit. Never print secrets. Surface mode: **Operate** (app UI): scanability, consistency and trust beat expression; brand lives in precise details and nothing decorative is added.

Before editing, read these design references and follow their absolute bans: `C:\Users\Rufda\.claude\skills\impeccable\reference\craft-floor.md`, `clarify.md`, `layout.md`, `distill.md` (same folder). Take before screenshots at 390 and 1280 px first and after screenshots at the end (git-ignored `web/screenshots/`).

Context from the critique (22 of 40, accessibility baseline good, trust writing good): the farmer-facing screens leak internal ids and English, the diagnosis is a flat wall of 12 equal cards, and the rotation form and cards carry too much at the same weight. Keep what works: the disclaimers, the 100/911 lines, the "never color alone" rule, real tables, 44 px targets.

## P1-1 Texts and trust (do this first)

1. No raw API id or English may reach the screen. Add `card.<id>` titles in `es.json` and `en.json` for every diagnosis card (`rain` "Lluvia anual", `heavy_rain` "Días de lluvia fuerte", `soil_moisture` "Humedad del suelo", `frost` "Período sin heladas", `heat` "Días de calor extremo", `crop_water` "Agua que pide el cultivo", `vigor_bare_soil` "Cobertura del suelo", `slope` "Pendiente", `soil` "Suelo", `water_trend` "Agua subterránea", `fire` "Fuego en la zona", `fire_weather` "Clima de fuego", `recent_weather` "Últimas semanas"), and render each value with its unit ("1.087 mm/año", "20 días/año", "4,1 %").
2. Confidence: replace "low/medium/high" with "baja/media/alta" plus a word-first badge and a small dot; never color alone. Replace "puntaje 0.5" with an "Afinidad con tus prioridades" bar (0 to 100) and a one-line explanation of the scale in a tooltip.
3. Indicators in the rotation benefits: human names with units ("Agua que usa (mm)", "Rastrojo (t/ha por año)", "Días sin cultivo vivo", "Riesgo de erosión", "Plagas: variedad de familias", "Quemas evitadas").
4. Hardcoded Spanish strings that break the English locale: the aria-labels "cerrar", "panel", "calendario" and the calendar header "Año": move all of them to i18n.
5. Legends and colors: the globe legend reads "focos por celda y mes" with the unit and the maximum shown as a number with its month; risk categories use distinct glyphs and word-first labels (for example ▼ bajo, ◆ moderado, ▲ alto, ▲▲ muy alto), not the same dot; the semaphore shows "mediana: N" next to the category so "sobre lo normal" and "1× la mediana" no longer read as a contradiction; calendar cell text color chosen from the cell luminance to keep contrast of at least 4.5.
6. Contrast: the warning color `#b26a00` on white is about 4.2:1. Darken the token until text and badges reach 4.5:1 and re-check every text/background pair of the palette with a small script; report the table.
7. Fix the one detector finding if it is real (`app.css` left border), and run `C:/Users/Rufda/.claude/skills/impeccable/scripts/impeccable detect --json web/src web/index.html` at the end.

## P1-2 Diagnosis as scannable groups

1. Replace the flex-wrap chip row by a two-column grid of compact tiles (label, value with unit, confidence dot), grouped under four headings: Agua (rain, heavy rain, soil moisture, water trend, crop water, recent weather), Temperatura (frost, heat), Suelo y terreno (soil, bare soil, slope), Fuego (fire, fire weather). All tiles the same width.
2. Above the grid add a two-line summary generated from the data in plain Spanish (for example "Lote en Pampa húmeda, 52 ha. Llueve 1.087 mm al año, con un verano húmedo; las heladas dejan un período de 294 días sin helada."). Template-based, never free text, citing only values present.
3. Source and resolution move behind a single tap-to-expand line per tile ("Fuente y precisión"); tiles with no data say why in one short sentence.
4. The agricultural calendar sits below the grid. The priorities and constraints form moves behind a clear second step with a button "Comparar rotaciones", so the first screen is only the diagnosis.

## P1-3 Rotations: fewer decisions, clearer cards

1. Replace the eight sliders by "Elegí hasta 3 prioridades": a chip group (agua, suelo, erosión, ingreso, forraje, nitrógeno, plagas, evitar quemas), ranked by the order of selection (first = weight 5, second = 4, third = 3, others 0), with a sensible default of none selected meaning equal weights. The request still sends the eight keys the back expects. Constraints stay as four plain controls (riego, maquinaria, ganadería, mercado) with the market checkbox no longer wrapping alone.
2. Each rotation card opens with a one-line verdict ("Cubre el suelo en invierno y baja el riesgo de erosión") built from its strongest indicator deltas, and the Afinidad bar.
3. The five sections required by the challenge brief stay on every card with their headings always visible: Por qué and Beneficios open by default; Evidencia, Vacíos de información and Riesgos collapsed with a count badge, one tap to open (native details/summary, keyboard accessible). Prevention measures become a sixth collapsed block.
4. Add a comparison summary row above the cards: current versus each alternative on four indicators (agua, días sin cultivo vivo, erosión, quemas evitadas) with deltas and arrows plus words.
5. Replace the sequence list by a simple bar timeline per card (crop segments over the months, covered versus bare shown by fill and by a text label).
6. Mobile: carousel with position dots and a visible "2 de 4" label; the first alternative is partly visible so the swipe is discoverable.

## Rules

Keep every existing test green and add tests for the i18n completeness (every card id and indicator has es and en text), the confidence labels, the priority ranking to weights mapping, and the collapsed sections being keyboard operable. Typecheck, lint and build clean. No new dependencies unless unavoidable (report them).

## Report

What changed per finding, before and after screenshots, the contrast table, the detector output, test counts, and any critique item you chose not to do and why.

## Then, in the same unit

When task 14 is complete, continue with `docs/briefs/devin/15-engine-fixes-round-2.md` (back-end engine fixes, reproduce each with a failing test first). Give one combined report for 14 and 15.

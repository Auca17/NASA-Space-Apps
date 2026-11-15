# Devin task 17 — Climate scenarios, "Datos y métodos" panel, and the visual defects (one unit)

Chain: after this task read `docs/briefs/devin/18-satellite-layers.md` and then `docs/briefs/devin/19-ai-explanation.md`, without waiting for review. One combined report at the end. Do not modify `docs/` (a short note in `back/README.md` and `web/README.md` is fine), `fixtures/` or secrets; if a contract change is needed, list it in the report. Do not commit. Never print secrets. Follow the design rules of the earlier polish (plain Spanish with units, word-first labels, no color alone, 44 px targets, contrast 4.5, keyboard operable). Surface mode: Operate.

## A. Rain and temperature scenarios (a Field Shift optional item that shows well in the video)

1. **Back end** (`/api/field/diagnose`): accept an optional `scenario`: `{ "rain_pct": -40..+40, "temp_delta_c": -2..+4 }` (validate, 400 outside). Apply it in memory to the already fetched POWER daily series before every derivation: rain multiplied by `1 + rain_pct/100`, `T2M_MAX` and `T2M_MIN` shifted by `temp_delta_c`. Recompute the cards (rain, heavy rain, frost, heat, crop water, recent weather only if it makes sense, fire weather), the monthly rain and the calendar rows. Never cache the scenario result separately from the base data (cache the POWER fetch as today; the scenario step is cheap). Return the unchanged baseline values too: each card gets `baseline_value` and `delta` when a scenario is present, and the response echoes `scenario`. Deterministic, no randomness.
2. `/api/field/rotations` already takes the diagnosis in the body, so it recomputes viability, water balance and indicators from the scenario diagnosis. Add to its response `baseline_order` (the strategy ids ranked without scenario, computed by running the same inputs with the unmodified diagnosis when the request carries `diagnosis.scenario`) so the front can say how the ranking changed.
3. **Front end**: a block "¿Y si cambia el clima?" under the diagnosis, with two sliders (lluvia −40 % a +40 %, step 5; temperatura −2 °C a +4 °C, step 0,5), three preset buttons ("Año seco: −20 % de lluvia y +1 °C", "Calentamiento: +2 °C", "Año húmedo: +20 % de lluvia"), and a reset. Cards show the delta next to the value ("−196 mm respecto de lo normal", "+14 días de calor"), with arrow plus word, never color alone. After "Comparar rotaciones" the results show a sentence built from templates: "Con este escenario la mejor rotación pasa de X a Y" or "El orden no cambia", and per strategy whether it becomes less viable (new gaps or `confidence` or irrigation need).
4. Honest copy, always visible next to the sliders: "Simulación simple: escala la lluvia y la temperatura históricas de tu lote. No es un pronóstico climático."
5. Tests: back (scenario scales rain, shifts frost window and heat days, validation 400, baseline echo, baseline_order) and front (delta text, presets, reset, keyboard). Update the OpenAPI-like notes in `back/README.md`.

## B. "Datos y métodos" panel

A page or drawer reachable from a visible footer/menu link "Datos y métodos" (es/en), keyboard operable, with three blocks:

1. **Qué usamos y para qué**: a table of datasets with name, what it gives, resolution, period, and where in the app it appears: FIRMS MODIS and VIIRS (fire series, harmonized), NASA POWER (daily weather for the diagnosis and the risk model), SMAP (to be finalized in task 18), GRACE-FO (long-term water trend), MODIS NDVI (days without live crop), MODIS land cover MCD12Q1, SRTM (slope), SoilGrids (soil), NASA GIBS (base imagery), MAGyP agricultural estimates (analog zones), Orin field data (validation, shown only when real). Read the list from one typed content file (`web/src/content/datasets.ts`) so tasks 18 can update it.
2. **Qué no usamos todavía y por qué** (honest): GPM IMERG (pending a data-use agreement at the data center; rain comes from POWER), ECOSTRESS (used only for demo plots, see task 18), FAO GAEZ (license requires a manual step), soil moisture anomaly from SMAP (state after task 18).
3. **Limitaciones en una lista corta**: the field grid covers Argentina only (on-demand diagnosis works worldwide with point data), 2000 to 2011 fire data is the lowest confidence period, risk is an experimental estimate, rotations are decision support and do not replace an agronomist, climate scenarios are simple scalings.

## C. Visual defects found in review

1. **Mobile header at 390 px**: the title clips ("Nombre a def…") and the tab "Analizar mi campo" clips. Make the top bar a compact app bar: the title on one line with ellipsis, the three modes as a segmented control with short labels ("Fuego", "En vivo", "Mi campo") that always fit, and the language switch inside a small menu or as "ES/EN" text button. Alternatively a bottom navigation bar on mobile; pick one, keep targets at 44 px, and document why.
2. **Synthetic banner shows the warning icon twice** ("⚠ ⚠ Datos de ejemplo, no reales"): keep one.
3. **Blank cream map behind the bottom sheet at 390 px** in field mode (screenshot `15-final-390px-diagnosis.png`): find out whether it is a real defect (map not rendering, tiles missing, layer hidden) or a capture timing artifact; fix it if real, and make the plot polygon visible above the sheet (the map should pan so the plot stays in the free area).
4. **Stray hexagon in the mid-Pacific** on the globe: check whether it is a real res-3 cell or a wrap artifact and remove if artifact.
5. The bottom sheet grab handle must work: drag to collapse, tap to toggle, keyboard (Enter/Space), with `aria-expanded`.
6. Re-run the contrast script and the impeccable detector (`C:/Users/Rufda/.claude/skills/impeccable/scripts/impeccable detect --json web/src web/index.html`) at the end of the chain; save before and after screenshots at 390 and 1280 px into the git-ignored `web/screenshots/`.

## Report (combined at the end of the chain)

Per section: what changed, tests, measured effects (for the scenarios give the Pergamino numbers at baseline and at -20 % rain +1 °C), screenshots, and anything not done and why.

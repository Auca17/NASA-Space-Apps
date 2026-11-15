# Devin task 16 — "Qué tan bien ve el satélite tu lote": Orin validation UI with safe mock data

Read first: `docs/data-contract.md` section 2.9, `docs/decisions.md` D31, `docs/PRD.md` section 10.4. Example files: `fixtures/orin/validation.json` and `fixtures/orin/lots.geojson` (both marked `synthetic: true`). Do not modify `docs/` or `fixtures/` (list any contract change you need in the report). Do not commit. Never print secrets. Surface mode: Operate. Follow the design rules of the previous polish (plain Spanish with units, word-first labels, no color alone, 44 px targets, contrast 4.5).

## Why the mock exists and the hard rule

The real Orin data (field samples, real lot polygons) arrives later. The screen must be built now, against files with the final shape, and swapped for real files with no code change. **Invented numbers must never look real.**

1. Any file served from the data base with `synthetic: true` at top level (or on a feature) makes the UI show a visible, persistent banner on the affected screen: "Datos de ejemplo, no reales", with an icon and text, in both languages, and the numbers are shown in a muted style.
2. The **production build must fail** (a check script wired into `npm run build`, for example `web/scripts/check-no-synthetic.mjs`) if the data base it was built for (`VITE_DATA_BASE_URL`, when it is an http URL) serves `orin/validation.json` or `orin/lots.geojson` with `synthetic: true`. With a local data folder it only warns. Add a test for the check.
3. For development, make the Vite data middleware serve `fixtures/orin/` under `/data/v1/orin/` (it already serves `fixtures/`; confirm and document).

## What to build

1. **Validation card** in the field lens, below the diagnosis grid, titled "Qué tan bien ve el satélite tu lote": one row per variable of `orin/validation.json` (temperatura máxima, temperatura mínima, vegetación NDVI, humedad del suelo), each showing: what the satellite measures and its resolution, how many field sites and pairs it was compared with, the error in plain words with the unit ("se equivoca en promedio 2,4 °C"), the bias in words ("el satélite marca 1,1 °C menos de lo que midió la estación"), and the quality as a word badge (buena, aceptable, baja) plus a small bar; a one-sentence takeaway built from templates, never free text ("La temperatura se ve bien; la humedad del suelo de 9 km no distingue diferencias dentro del lote"). Collapsed details with the exact numbers (RMSE, bias, r, n, period, dataset) for the jury and agronomists. Missing file: the card hides itself with no error.
2. **Demo plots from Orin**: in the plot chooser add the two lots of `orin/lots.geojson` next to the pampa demo plot, labeled with their `crop_label`. Choosing one runs the normal diagnosis. Because the engine has no vine or olive rotations, the "Comparar rotaciones" step for these lots says plainly that rotations are not available for this crop and shows the diagnosis and the validation card only (no error, no empty cards).
3. **Where the real number shows up too**: when `synthetic` is false the card needs no banner, and the card text must read well with the real stations data (67 sites, 742 observations of temperature).

## Tests and checks

Domain tests for the plain-language sentences (bias sign wording, quality thresholds mapping, missing variables), a component test that the synthetic banner appears and disappears with the flag, the build check test, keyboard operation of the collapsed details, es and en i18n completeness. Typecheck, lint, tests and build stay green. Run `C:/Users/Rufda/.claude/skills/impeccable/scripts/impeccable detect --json web/src web/index.html` at the end. Screenshots at 390 and 1280 px into the git-ignored `web/screenshots/`.

## Report

What was built, the build-guard behavior (show the failing output with a synthetic file against an http base), screenshots, test counts, and anything in the contract you want changed.

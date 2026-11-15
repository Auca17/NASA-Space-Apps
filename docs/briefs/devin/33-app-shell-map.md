# Devin task 33 — App shell, map, live fire, logo and glass (UI fixes from the team lead's review)

Your worktree, new branch: `git fetch; git checkout -B feat/app-shell origin/main; cd web; npm install`. Commit on the branch (conventional commits, no AI trailers), push the branch, never main.

## Ownership (other terminals work in parallel; do not touch their files)

You own: `web/src/App.tsx`, `web/src/features/globe/**`, the live mode files (find them: the "En vivo" panel and its layer), `web/src/features/welcome/**`, `web/src/components/WindLogo*`, `web/src/features/emergency/**` (layout only), `web/src/styles/glass.css`, `web/src/styles/app.css` (you are the only one editing these two shared stylesheets). In `web/src/i18n/es.json` and `en.json` add only keys prefixed `shell.`, `live.`, `welcome.`, `map.`.
Do **not** edit `web/src/features/field/**` (task 34 rebuilds field selection and the field panel) nor `web/src/landing/**` (task 35). If a fix needs a change there, describe it in your report instead.

Read first: `docs/ui-style.md` (section 2.2 glass layer, section 3 logo), `PRODUCT.md`, and the Impeccable skill at `C:/Users/Rufda/.claude/skills/impeccable/SKILL.md` (run `impeccable context` once, then use its `polish` and `adapt` references for the glass work).

## Fixes (each with a test where testable, and a screenshot at 390 and 1280 px in `web/screenshots/`)

1. **Home**: remove the separate "Inicio" button. The logo plus the name "Ashfield" at the top left is the home control (a button or link with an accessible name "Ashfield, inicio" / "Ashfield, home", keyboard operable, visible focus).
2. **Map controls overlap panels**: the "Satélite / Calles" toggle and the zoom buttons sit on top of the Emergencias panel (and can collide with the other panels: Datos y métodos, the field panel, the live panel). Make the map controls collision-free: they stay in a corner no panel uses, or move when a panel opens (for example shift left of a right-side panel, above a bottom sheet on phones). Check every panel at 390, 768 and 1280 px.
3. **Welcome "Otras vistas"**: the fire buttons wrap into a ragged pile of pills. Redesign the disclosure as a short, aligned list of rows (icon, label, one-line description, chevron), full width, 48 px rows, or a compact two-column grid at wide sizes. The main path stays "Analizar mi campo"; fire views are secondary but tidy.
4. **Live fire coverage and zoom**: (a) load and draw the detection hexagons for the whole world, not only the current viewport, so zooming or panning never cuts them off; fetch once per window choice (24h, 48h, 7d) with the world bbox, keep it in memory, refresh on window change or the retry button; if the payload is too big, request the world at coarse resolution and refine per viewport at higher zoom, but never leave an empty band; (b) the request fails ("No se pudo consultar la detección satelital") when zoomed out to the world view: the bbox likely exceeds ±180 or wraps; clamp and split it correctly and add a test; (c) limit zoom: disable world copies (`renderWorldCopies: false`), set `maxBounds` to latitudes about −75 to 85, and set per-mode min and max zoom (world views: min about 1.5 so the world fills the screen, max about 9; field view keeps its deeper max for drawing plots); no repeated Earths, no zooming into featureless pixels.
5. **Logo idle animation does not run anywhere**: `WindLogo` should sway and flicker at rest (see `docs/ui-style.md` section 3). Find why it is static (not mounted, CSS animation missing or overridden by the glass rule `.glass * { animation: none }`, the reduced-motion query misapplied, or the static SVG used instead) and make it work in the top bar and the welcome screen; keep `prefers-reduced-motion` behavior; add a test that the animated variant is rendered and that the class driving the idle animation is present.
6. **Glassmorphism, consistently**: apply the glass layer of `docs/ui-style.md` section 2.2 to the top bar, every floating panel, the map controls, the welcome card, the live panel and the emergency panel: same blur, border, highlight, radius scale and shadow; text contrast at least 4.5:1 over the brightest imagery (test over the snow and desert areas); fallback without `backdrop-filter`; reduced transparency respected. Use the Impeccable polish pass to tune it; no decorative glow.

## Verification

`npm test`, `npx tsc --noEmit`, lint, build with the synthetic-data guard, es/en key parity, and `C:/Users/Rufda/.claude/skills/impeccable/scripts/impeccable.cmd detect --json src index.html app/index.html` (the two `side-tab` markers on `.emerg` and `.diag-degraded` may stay). Run the app against the real data (`VITE_DATA_BASE_URL=https://pub-f3e35e60ad774d339f43297a54691092.r2.dev/v1/`, back end on port 8000 is already running in the main worktree; use your own dev port, not 5173).

## Report

Per item: what changed, files, tests, screenshots; the detector output; what you could not do and why.

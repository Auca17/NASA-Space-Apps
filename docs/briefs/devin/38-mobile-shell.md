# Devin task 38 — Mobile layout of the app shell (390 px)

Your worktree: `git fetch; git checkout -B feat/mobile-shell origin/main; cd web; npm install`. Commit on the branch (conventional commits, no AI trailers), push, never main.

## Ownership

You own `web/src/styles/app.css`, `web/src/styles/glass.css`, the top bar markup in `web/src/App.tsx` (only the header/top bar block and the map controls block; another terminal is wiring the parcels flow in `App.tsx` right now, so keep your `App.tsx` diff small and limited to those blocks), and the field chooser layout styles. Do not edit `web/src/features/field/**` logic or `web/src/features/parcels/**`.

## The problem (team lead's screenshot at 390 px, from the browser dev tools)

The top bar takes three rows: "Ashfield", "Emergencias", "Métodos" and "EN" as separate pills on the first two rows, then the mode switch (Analizar mi campo, Fuego, En vivo). Below it, the "Argentina / Mundo" buttons and the zoom buttons float in another row, and the bottom sheet ("Ver más mapa", "Mis campos (0)", "Llevá el mapa a tu zona", location, search, "Dibujar punto por punto") covers most of the map. The map is barely visible. It looks cramped and unprioritized.

## Build (phones first: 360 to 430 px; keep 768 and 1280 px as they are or better)

1. **One compact top bar row**: logo plus "Ashfield" at the left; at the right one menu button (hamburger or "Más") that opens a glass sheet with Emergencias, Datos y métodos and the language switch. Emergencias must stay reachable in one tap from the menu and also from the fire alert (it is a safety feature: keep a small visible emergency icon button next to the menu if it fits at 360 px with 44 px targets).
2. **Mode switch at the bottom** on phones: "Analizar mi campo", "Fuego", "En vivo" as a bottom tab bar (thumb zone, 56 px, icon plus label), above the safe-area inset. The bottom sheet sits above the tab bar.
3. **Map controls**: zoom buttons hidden on touch devices (pinch exists) or reduced to one small vertical pair at the right edge; "Argentina / Mundo" moves into the sheet or into a single "Encuadre" control; nothing floats in the middle of the map.
4. **Field chooser sheet**: collapsed by default to a peek height (about 30 percent of the screen) showing the main action ("Dibujar mi campo") and a handle; dragging or tapping the handle expands it to show location, search, saved fields and other drawing modes. The map stays visible above.
5. Glass styling per `docs/ui-style.md` 2.2, 44 px targets, focus order logical (top bar, map, sheet, tab bar), `prefers-reduced-motion` respected, safe-area insets (`env(safe-area-inset-bottom)`).
6. Test in a real mobile emulation: Playwright with `devices['iPhone 13']` and a 360 px Android profile, not only a narrow desktop window; check that the map receives touch and that the sheet drag works.

## Verification

`npm test`, `npx tsc --noEmit`, lint, build, es/en parity, `impeccable detect`, screenshots at 360, 390 and 1280 px before and after in `web/screenshots/38-*` (git-ignored).

## Report

What changed, files, screenshots, tests, anything left.

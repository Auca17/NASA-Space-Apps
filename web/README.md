# web — front-end skeleton

React 18 + Vite + TypeScript (strict), MapLibre GL v5 (globe), h3-js,
Observable Plot, Vitest + Testing Library, ESLint. Plain CSS with
variables, light/dark via `prefers-color-scheme`. No UI kit.

## Run it (three commands)

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173 — the landing page (English). The app lives
at `/app/` and the Spanish landing at `/es/` — the build is multi-page
(`index.html`, `es/index.html`, `app/index.html` via
`build.rollupOptions.input`). It serves `../fixtures` read-only at
`/data/v1/`, so the app works without a backend. `/api/*` is proxied to
`http://localhost:8000` (start `back/` with uvicorn for diagnose,
rotations and live mode).

## Environment variables

| var | default | purpose |
|---|---|---|
| `VITE_DATA_BASE_URL` | `/data/v1/` | contract data base (shards) |
| `VITE_API_BASE` | *(empty = same origin)* | API endpoints base |
| `DATA_DIR` | `../fixtures` | dev/preview: folder served at `/data/v1/` |
| `VITE_SITE_URL` | *(empty = relative)* | public site base: canonical, hreflang, OG, sitemap |

Run against the real local export:

```bash
# terminal 1 — backend on the real data
cd back && DATA_BASE_URL="file:///<abs path>/data/dev_v1/" \
  ../.venv/Scripts/python -m uvicorn app.main:app --port 8000
# terminal 2 — front
cd web && DATA_DIR="../data/dev_v1" npm run dev
```

Create `web/.env.local` (never committed) to override the VITE_ vars.

## Pointing at real R2 data

In `web/.env.local`:

```
VITE_DATA_BASE_URL=https://<bucket>.<account>.r2.dev/v1/
```

(or the public bucket URL / custom domain). No code change needed —
clients resolve every shard against this base. Missing shards render a
friendly "sin datos en esta región" state by design (404 → null).

For the API endpoints, either keep the dev proxy or set:

```
VITE_API_BASE=https://your-api.example.com
```

**Cache-Control for R2**: shards are immutable per version — serve them
with `Cache-Control: public, max-age=3600` (or longer once `generated_at`
bumps). `.json` shards are big (up to ~1.8 MB); Cloudflare compresses
JSON at the edge automatically, keep it enabled (the dev middleware
mimics this with gzip).

## Commands

| command | what |
|---|---|
| `npm run dev` | dev server + fixtures middleware + `/api` proxy |
| `npm test` | vitest unit/component tests |
| `npm run lint` | eslint |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run build` | synthetic-data guard + typecheck + production build → `dist/` |
| `node scripts/screenshots.mjs` | playwright screenshots → `web/screenshots/` (git-ignored) |

## Orin validation data (D31)

`orin/validation.json` and `orin/lots.geojson` are served by the same
`/data/v1/` middleware — no extra wiring. Until the real field data
arrives both carry `synthetic: true`: the UI shows a "Datos de ejemplo,
no reales" banner and mutes the numbers. `npm run build` runs
`scripts/check-no-synthetic.mjs` first: with an http(s)
`VITE_DATA_BASE_URL` the build **fails** if either served file is still
synthetic; against a local `DATA_DIR` it only warns. Swap the files for
real ones — no code change needed.

## Layout

```
index.html      landing (English) -> /src/landing/main.ts
es/index.html   landing (Spanish) -> same entry, <html lang="es">
app/index.html  the app -> /src/main.tsx
src/
  api/        typed clients, one per contract file/endpoint (404 -> null)
  domain/     pure logic: h3 area->cells, fire series, baseline,
              semaphore (+ Web Worker), risk presentation, color scales
  components/ Card, BottomSheet, Calendar, Legend, Tooltip, Glossary
  content/    datasets.ts — "Datos y métodos" panel content
  features/   welcome, globe, fire (historic + area panel), live, field
  i18n/       es.json (default), en.json, t() helper
  landing/    public landing: content.ts (typed, both languages),
              main.ts (vanilla renderer), landing.css
  styles/     app.css (CSS variables, light/dark, mobile-first)
```

The landing shares no app code; it duplicates the few CSS tokens it
needs in `landing.css`. `APP_NAME` lives in `src/config.ts` ("Ashfield") —
do not hardcode a project name anywhere else.

## Task 17/18/19 notes

- "Datos y métodos" drawer: top-bar link (short label under 600 px),
  content lives in `src/content/datasets.ts`.
- Climate scenarios: diagnosis cards get `baseline_value`/`delta`;
  rotations responses carry `baseline_order`; the layer selector in
  fire mode ("Capas") draws Argentina res-5 metrics from
  `field/grid` shards at zoom >= 5.
- `/api/field/explain` returns `mode`; "ai" shows the AI label with a
  link to Datos y métodos.

## Task 26/30 notes

- Emergency block (`src/features/emergency/`): `tel:` links from the
  typed country table in `src/content/emergency.ts` (AR 100/911 per
  PRD; CL, UY, PY, BR, BO, MX, US, CA, ES, PT, AU + EU 112, each row
  keeps its official source URL). Unknown country -> generic text,
  never a guessed number. Shown when a live point detection is within
  10 km of the reference (user location if shared, else map centre /
  reticle), when the 7-day risk is `alto`/`muy_alto` or the semaphore
  is `extremo`, and always from the "Emergencias" top-bar entry.
  `apiRisk` and `apiLiveResult` answers carry `country` (ISO A2).
- The "what to say" message (`src/domain/emergency.ts`) lists only
  values the app really has; the clipboard failure path falls back to
  a selectable textarea. The app never dials and never sends the
  location anywhere.
- Map fallback: `BASE_STYLE` keeps hidden `base-water`/`base-boundary`
  vector layers under the rasters; `GlobeView` counts tile errors per
  raster source, paints the fallback when one is dead, and forces a
  reload with exponential backoff (`baseStyle.ts` helpers are unit
  tested). `.map` has a permanent dark background, so the canvas is
  never blank.
- Degraded diagnosis: when `/api/field/diagnose` answers
  `degraded: true`, the panel shows a `role="alert"` notice with the
  backend `degraded_reason` and a "Reintentar" button; cards render
  whatever the backend returned.
- Orin validation: rows with `reference_kind: "finer_satellite"` get
  the resolution-mixing wording and appear only when the file has
  them; `n < 5` rows carry a "pocas mediciones" badge.

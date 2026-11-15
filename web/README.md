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

Open http://localhost:5173 — it serves `../fixtures` read-only at
`/data/v1/`, so the app works without a backend. `/api/*` is proxied to
`http://localhost:8000` (start `back/` with uvicorn for diagnose,
rotations and live mode).

## Environment variables

| var | default | purpose |
|---|---|---|
| `VITE_DATA_BASE_URL` | `/data/v1/` | contract data base (shards) |
| `VITE_API_BASE` | *(empty = same origin)* | API endpoints base |
| `DATA_DIR` | `../fixtures` | dev/preview: folder served at `/data/v1/` |

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
src/
  api/        typed clients, one per contract file/endpoint (404 -> null)
  domain/     pure logic: h3 area->cells, fire series, baseline,
              semaphore (+ Web Worker), risk presentation, color scales
  components/ Card, BottomSheet, Calendar, Legend, Tooltip, Glossary
  features/   welcome, globe, fire (historic + area panel), live, field
  i18n/       es.json (default), en.json, t() helper
  styles/     app.css (CSS variables, light/dark, mobile-first)
```

`APP_NAME` lives in `src/config.ts` and is deliberately undecided
("Nombre a definir") — do not hardcode a project name anywhere else.

## Task 17/18/19 notes

- "Datos y métodos" drawer: top-bar link (short label under 600 px),
  content lives in `src/content/datasets.ts`.
- Climate scenarios: diagnosis cards get `baseline_value`/`delta`;
  rotations responses carry `baseline_order`; the layer selector in
  fire mode ("Capas") draws Argentina res-5 metrics from
  `field/grid` shards at zoom >= 5.
- `/api/field/explain` returns `mode`; "ai" shows the AI label with a
  link to Datos y métodos.

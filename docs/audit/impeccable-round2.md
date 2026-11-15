# Impeccable critique — round 2 (landing + fire views)

Date: 2026 (post landing-v2). Surfaces reviewed:

- **A — Landing** (`/` and `/es/`, `web/src/landing/**`) — design review, isolated sub-agent.
- **B — Fire views** (`/app/` Fuego history + En vivo, 390 px and 1280 px, real browser, `VITE_DATA_BASE_URL=https://pub-f3e35e60ad774d339f43297a54691092.r2.dev/v1/`, backend `http://localhost:8000`) — design + detector evidence, isolated sub-agent.

Two isolated sub-agents were used (not degraded). Assessment A completed before detector findings entered the synthesis.

## Evidence

Screenshots (git-ignored) under `web/screenshots/critique/`:

| Surface | 1280 px | 390 px |
|---|---|---|
| Landing EN | `landing-en-1280-first.png`, `landing-en-1280-full.png` | `landing-en-390-first.png`, `landing-en-390-full.png` |
| Landing ES | `landing-es-1280-first.png`, `landing-es-1280-full.png` | `landing-es-390-first.png`, `landing-es-390-full.png` |
| App — Fuego history | `app-fire-1280.png`, `app-fire-panel-1280.png` | `app-fire-390.png`, `app-fire-panel-390.png` |
| App — En vivo | `app-live-1280.png` | `app-live-390.png` |
| App — welcome | `app-welcome-1280.png` | `app-welcome-390.png` |
| App — EN UI (for landing assets) | `en-fire.png`, `en-diagnosis.png` | — |
| Landing post-fix (this branch) | `final-en-1280-first.png`, `final-en-1280-full.png`, `final-en-1280-brief-open.png`, `final-en-800-full.png`, `final-en-800-blocks.png`, `final-en-800-reqcards.png`, `final-es-1280-first.png`, `final-es-1280-full.png`, `final-es-1280-brief-es.png`, `final-{en,es}-390-{first,full}.png`, `final-es-800-full.png` | — |

Detector (`impeccable detect --json`):

- `web/src/landing/**`, `web/index.html`, `web/es/index.html` → `[]` (clean, before and after fixes).
- `web/src/styles/app.css` → 2 findings (see B-6 below).

---

## A — Landing

**Heuristic score: 35/40 (87.5%)** — strong. Real product imagery, honest status labels, editorial ember/paper palette, no generic SaaS treatment.

### What is working

- One-sentence promise hero + two CTAs; the jury sees product, not boilerplate.
- `Done / Partial / Not included` status pills with honest `limit` column — rare and credible.
- Named NASA data only; `R² 0.979` holdout figure; Orin field note disclosed.
- Bilingual content is structurally mirrored in typed `content.ts`.
- No horizontal scroll at 390 px; dark mode and reduced-motion respected.

### Issues (P1 first) — all fixed in this branch

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| A1 | P1 | **English page showed a Spanish-UI app screenshot.** Both locales pointed to `/landing/app_diagnosis.webp` and `/landing/app_fire_risk.webp` (Spanish UI) — undermines EN credibility for the jury. The ES assets also showed the pre-parcels app UI (stale after other terminals merged app work). | `web/src/landing/content.ts` (hero `shot.src`, block figure `src`) | Recaptured all four assets in a real browser against live backend/R2 on the current app UI: `app_diagnosis_en.webp` (EN, 100 KB), `app_diagnosis.webp` (ES refreshed, 98 KB), `app_fire_risk_en.webp` (EN, 69 KB), `app_fire_risk.webp` (ES refreshed, 65 KB). Both diagnosis shots show the app's honest "incomplete" banner — the OSM nearby-services upstream was down on the backend at capture time (retried 3×, both locales; consistent real behavior, and it doubles as evidence for B5's untranslated backend strings). |
| A2 | P1 | **All proof hidden behind collapsed `<details>`** — requirements table, `R² 0.979`, limits. A hurried evaluator saw zero evidence before deciding to open it. | `web/src/landing/main.ts` `<details class="brief-details">` | Added a per-status scoreline inside `<summary>` computed from the content data — "Field Shift: 7 done · 6 partial · MODIS & VIIRS Hot Spots: 7 done" (localized; zero-count statuses omitted) — plus `id="brief"` + `#brief` auto-open so the proof is deep-linkable. |
| A3 | P1/P2 | **`[PENDIENTE]` (Spanish) rendered on the English page** for the pending dataset link. | `main.ts` `linksList()` hardcoded tag | Localized via `content.ts` `pendTag` (`[PENDING]` / `[PENDIENTE]`). |
| A4 | P2 | **Broken `aria-labelledby`**: `reqGroup` emitted `aria-labelledby="req-F"` / `req-H` but the `<h3>` had no matching `id`. | `main.ts` `reqGroup` | `<h3>` now carries `id="req-{F,H}"`. |
| A5 | P2 | **721–991 px dead zone**: `req-table` `min-width: 62rem` (≈992 px) but card layout only engaged ≤720 px → horizontal scroll on tablets. | `landing.css` `.req-table`, `@media (max-width: 720px)` | Card layout moved to `@media (max-width: 991px)`; phone-only rules kept at 720 px. |
| A6 | P2 | **Empty third grid column**: `.blocks` was 3-col; the chart block spanned `1/-1`, leaving the other two blocks in columns 1–2 with column 3 empty. | `landing.css` `.blocks`, `.blocks .block:has(.chart)` | Grid is now 2-col; the figure block spans both columns. |
| A7 | P2/minor | **Lazy-loaded first block image** rendered as a large empty bordered panel before scroll/load. | `main.ts` `block()` `loading="lazy"` | Eager loading for the in-blocks figure (lazy kept for deep-in-details figures). |
| A8 | minor | Hero image (LCP) lacked `fetchpriority`. | `main.ts` hero `<img>` | `fetchpriority="high"` added. |
| A9 | minor | `details` had no anchor — the brief section was not linkable. | `main.ts` | `id="brief"` + hash auto-open (see A2). |

### Persona red flags (landing)

- **Hurried jury evaluator**: sees status + evidence count now in the closed summary; can deep-link `#brief`; no longer sees a Spanish UI on the English page.
- **Argentine producer on 390 px**: `1 + 3` stat still requires its note to parse; acceptable.
- **Skeptical technologist**: proof reachable in one tap, and the scoreline signals honesty upfront.

### Minor observations (not changed — factual/tonal, need product decision)

- "1 + 3" stat is cryptic without its note (kept; the note is adjacent).
- Orin date wording may confuse a jury member (copy unchanged — factual claim).
- `R² 0.979` has no inline source link in the hero block (it is sourced inside the details section).

---

## B — Fire views (app) — documented only, NOT fixed here

App files are owned by other terminals (`App.tsx`, `app.css`, `glass.css`, field/parcels). These findings are for later.

**Heuristic impression**: authored, not generic — but the app's green accent conflicts with the brand's ember-for-fire / green-for-field distinction, and several state/i18n gaps hurt trust.

### Priority issues

| # | Sev | Finding | Evidence | Suggested fix |
|---|---|---|---|---|
| B1 | P0/P1 | **Risk-fetch failure or missing shard renders as "Sin datos en esta región"** — indistinguishable from "no risk". | `web/src/features/fire/AreaPanel.tsx` ~88–119, 179–199; `app-fire-panel-1280.png` | Split loading / error / empty into three states; add retry on error. |
| B2 | P1 | **Crosshair/reticle offset from the queried point.** | `web/src/App.tsx` 112–113, 553; `web/src/styles/app.css` 91; `app-fire-1280.png` | Align reticle to map center or remove it; use existing outline capability if present. |
| B3 | P1 | **Mobile bottom sheet covers playback controls** ≤720 px. | `web/src/styles/app.css` 115–117, 186–189; `web/src/styles/glass.css` 165–169; `app-fire-panel-390.png` | Anchor controls above the sheet or open the sheet collapsed. |
| B4 | P2 | **Live "fire near you" measures from an invisible map-center reference.** | `web/src/features/live/LiveMode.tsx` 160–170; `web/src/i18n/es.json` 465 | Show the reference marker/reticle in live mode or name the reference point. |
| B5 | P2 | **English UI leaks Spanish strings** — month labels, calendar day initials, units, and backend "why" text ("sin señales de riesgo destacables" visible in `en-fire.png`). | `AreaPanel.tsx` 25, 144; `Calendar.tsx` 7–8; `HistoricControls.tsx` 20–24; `ui.tsx` 47 | Route through `t()` / `Intl.DateTimeFormat`; translate or mark backend strings. |
| B6 | P3 | **Side-tab accent borders** flagged by the detector. | `web/src/styles/app.css` 555, 580 (`border-left: 4px solid #b3401e`) | Replace with in-flow accent or remove. |

### Additional observations (P2/P3, for later)

- Six-option "Capas" select leaks field metrics into the Fire view.
- Live layer has no legend; "Anomalías" is unexplained.
- "High" and "extreme" share the same red — can't distinguish.
- Risk percentage shows false precision (e.g. "3 %"); consider a band.
- Month slider has no year markers and can trigger many fetches.
- Raw coordinates are used as the place name in the panel.
- Fire panel close lacks a clear reopen affordance.
- No place search inside fire/live modes.
- Brand: fire views use green accent — contradicts ember=fire / green=field.

### Evidence limitation

A dedicated `web/screenshots/critique/` directory did not exist at capture time; shots live there now. `en-fire.png` and `en-diagnosis.png` were captured with the app toggled to English (real backend, R2 data) to fix landing asset A1 — they double as evidence for B5.

---

## Fixes applied this branch (landing only)

`web/src/landing/content.ts`, `web/src/landing/main.ts`, `web/src/landing/landing.css`, `web/src/landing/landing.test.ts`, plus `web/public/landing/{app_diagnosis,app_diagnosis_en,app_fire_risk,app_fire_risk_en}.webp`. No app-owned files touched; `git status` verified before commit.

## Verification

- `npx vitest run src/landing` — **21 passed** (5 new tests: scoreline, `#brief` deep link + auto-open, `aria-labelledby` id match, hero `fetchpriority`, localized pending tag).
- `npm run build` — clean.
- `impeccable detect --json src/landing index.html es/index.html` — `[]`.
- Post-fix screenshots in `web/screenshots/critique/final-*`: no horizontal scroll at 390/800/1280 (`scrollW` equals viewport on every shot), card tables verified at 800 px (`final-en-800-reqcards.png`), 2-col blocks with no empty column (`final-en-800-blocks.png`), `#brief` auto-open (`final-en-1280-brief-open.png`), EN-UI assets on the English page (`final-en-1280-first.png`), localized `[PENDING]` footer tag.
- Note: at capture time the backend's OpenStreetMap nearby-services upstream was unreachable, so both hero screenshots show the app's "diagnosis came back incomplete" banner — real, honest behavior (retry worked in-session for content; the banner persisted because the upstream stayed down). Not a landing defect.

## Questions to consider (product, not code)

- Should the hero stat link its `R² 0.979` to the validation doc/repo path?
- Orin dates: is the pre-hackathon collection date clear enough for a jury in the first read?
- Video CTA is hidden until a URL exists — confirm intended (currently `[PENDIENTE]`).

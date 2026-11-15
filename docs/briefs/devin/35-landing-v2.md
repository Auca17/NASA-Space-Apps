# Devin task 35 — Landing v2: less data, more product (inspiration: Satellites On Fire)

Your worktree, new branch: `git fetch; git checkout -B feat/landing-v2 origin/main; cd web; npm install`. Commit on the branch (conventional commits, no AI trailers), push the branch, never main.

## Ownership

You own only `web/src/landing/**`, `web/index.html`, `web/es/index.html` and `web/public/landing/**`. Do not edit the app (`web/src/App.tsx`, features, `glass.css`, `app.css`, i18n JSON): other terminals own them.

Read first: `PRODUCT.md` (audience: the NASA Space Apps jury first, then Argentine producers; constraints: static, fast, WCAG 2.2 AA, 360 px, dark mode, reduced motion), the current landing (`web/src/landing/content.ts`, `main.ts`, `landing.css`), and the Impeccable skill `C:/Users/Rufda/.claude/skills/impeccable/SKILL.md` (run `impeccable context` once; this is a Persuade surface, use the new-work and polish references).

## What the team lead asked

"Mejorá la landing sin tanta data." Inspiration: https://www.satellitesonfire.com/ (open it in a real browser with Playwright; the page is rendered with JavaScript, so a plain fetch shows nothing; take screenshots of the first screen and the full page at 390 and 1280 px and save them under `web/screenshots/inspiration/`, git-ignored; describe what you take from it in your report). Take its spirit (one clear promise, the live map as the hero, very little text, one action), not its look or copy.

## Build

1. **Hero**: one sentence promise (fire and field in one: "Mirá el riesgo de fuego de tu campo con datos de la NASA" or a better line in the same spirit, English equivalent for `/`), one primary button "Abrir la app" to `/app`, one secondary "Ver un ejemplo" to `/app` with the demo plot if the app supports a URL for it (check; otherwise only the first button). The visual is the product: a live-looking map view (the existing `app_diagnosis.webp`, or a new screenshot of the live fire hexagons or of the field with parcels; under 100 KB, explicit size, alt text). Subtle glass may be used over the hero image if it reads well; keep it restrained.
2. **Three short blocks at most** below the hero: what you see (fire now and the 7-day risk), what you get for your field (fire and dryness per parcel, in plain words), why trust it (one validation number with its honest limit and the NASA data names). Each block: a heading, one or two sentences, one image or number.
3. **Move the data out of the way**: the full requirement table, methods, validation figures and limits stay available but not on the first scroll: put them behind "Cómo cumple el desafío" (a collapsible section or a separate page `/brief` and `/es/brief` if the routing allows it without touching `vercel.json`; if it needs `vercel.json`, use a collapsible section and note it). Keep the honest status labels exactly as they are (Hecho / Parcial / No incluido) and do not change any claim.
4. Team, links (video, repo, demo, dataset: placeholders already exist; keep them) in a short footer.
5. Spanish and English stay in sync. Performance budget from `PRODUCT.md`. Dark mode and reduced motion. No horizontal scroll at 360 px.

## Verification

Build, the landing tests (es and en parity), `impeccable detect --json src/landing index.html es/index.html`, screenshots before and after at 390 and 1280 px in `web/screenshots/`, and the total transfer of the first screen.

## Report

What you took from the inspiration, what changed, screenshots, sizes, detector output, and anything left.

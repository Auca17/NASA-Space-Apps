# Status report (2026-11-15, end of day)

Main is `6a0a275`: back 239 tests, front 365, tsc and build clean, Impeccable detector empty. Since the morning: 53 commits, 172 files, about 22k lines (Devin terminals orchestrated by Claude, plus Carmen/Ariel's crop detection branch and Ezequiel's n8n workflows).

## Shipped today (all in main)

- Landing v2 (product first), then inverted to Field Shift first; requirement table: F1 and F6 done, F10 with the SIGA rain validation; README and video script field-first; MIT LICENSE (team must confirm).
- App shell: logo as home, compact shell to 900 px, bottom tabs, one sheet at a time, map controls never overlap, world live fire, zoom limits, logo idle animation, glass styling.
- Field: parcels (draw, split, crops with colors, needs), per-parcel fire and water with basis, alerts, zones on the map, farmer profile (8 hazards ranked, hide/show, economics), tabs (Resumen, Mis prioridades, Mas informacion), crop prefilled from INTA's crop map (Ariel), current crop from Sentinel-2, moisture zones, calendar with the rotation overlaid and red risk months, 13-term glossary next to each card, "how well the satellite sees your plot" card.
- Drawing: simple polygon whatever the click order, draggable vertices and midpoints, undo, self-crossing refused; WebGL fill layer fixes the MapLibre tile-clip artifact at high zoom.
- Back: /api/field/parcels, farmer profile (ENSO from NOAA ONI, snow, hail honestly unavailable, flood, economics), evaporation and FAO-56 ET0 fallback, infiltration score, degree days per crop, pest cycle with real hosts, accuracy block, hazards accepted by /rotations, Gemini summary with model fallback, 18 audit fixes, negative-cache TTL.
- Data and validation: R2 refreshed (risk 2026-11-15, grid, analogs, knowledge, Orin), SIGA rain validation (25 stations, 1346 station-months), INTA data scan, Mendoza crops.
- Demo: /app/#demo = Mendoza farm (live analysis, real captured fallback, guided tour). The Pergamino rotation-first demo is parked on branch feat/demo-rotations (78dbc69, WIP, 351 tests green, build/e2e not run).
- Alerts: idea and setup guide (docs/ideas, docs/ops); Ezequiel's n8n workflows in ops/n8n (Twilio sandbox because Meta blocked the account).

## Open

- Demo rework to Pergamino ending in rotation cards (parked by the team lead).
- Not covered from the review: field-variable timeline (moisture, heat, long-term water), data outside Argentina.
- Deploy on Vercel (function about 197 MB of 250 with rasterio), env vars, GEMINI quota on the production key, nearby services (OpenStreetMap unreachable from the dev network), real phone test.
- Placeholders: demo, video and dataset URLs; categories; license confirmation; agronomist review of literature values.
- Rotate FIRMS and Earthdata keys; pip-audit with network; geocode rate limit at Vercel.

---

# Overnight report (2026-11-15)

**Update after resume:** brief 31 (UI polish) finished and is merged; `main` is pushed at `3015bf3` (back 143/143, front 231/231, `tsc` clean, build OK, detector: only the two intentional side-tab markers left). `/app` metadata added. Risk on R2 is fresh (`generated_at 2026-11-15T05:10Z`), so open item 2 below is resolved. Items 1 (terminal B) is done; 3, 4, 5 remain.

## State when the machine was suspended (kept for history)

## State in one paragraph

`main` is pushed (`5a9692f`) with: Devin A's work (TTL fix, shard lookup fix, audit and refresh tools), the audit fixes branch (`feat/audit-fixes`) and the UI night branch (`feat/ui-night`, brief 30). Tests at that merge: back 143/143, front 230/230, `tsc` clean, build OK. Terminal B was then sent brief 31 (UI polish) and may have been interrupted by the suspend: its work lives on the local branch `feat/ui-night` (worktree `agronomy-21`), NOT merged into main. Check `git log feat/ui-night` against `main` before anything else.

## Done tonight

- **R2 data** (bucket `nasa`, public URL `https://pub-f3e35e60ad774d339f43297a54691092.r2.dev/v1/`): field grid (IMERG rain, elevation), analogs, knowledge JSON, ECOSTRESS demo, Orin validation (temperature rows only), Orin lots. Five grid shards that differed from the local version were re-uploaded afterwards. `verify_r2` showed 9082 objects, 0 missing remotely, 20 of 20 spot checks fine (that run was before the five-shard re-upload; not re-run).
- **Bug hunt on live data**: 24 worldwide points, 11 invalid inputs, risk and live endpoints. Input validation, `/api/live` and rotations behaved correctly.
- **Code audit (Devin C)**, details in `docs/audit/code-audit.md`: 18 defects fixed with regression tests (back tests 114 to 132). Examples: enclaves like Lesotho resolved to ZA, malformed `point` gave 500, unbounded cache and geocode caching raw queries, FIRMS key could appear in logs, `file://` data URL accepted on Vercel, non-atomic export write, undocumented AI env vars in DEPLOY.md. The bug hunt defects (Posadas as PY, ocean point with elevation -4290 and a 27.9 C correction, New York without country, polygon messages, stable body for risk 404) were sent as an addendum: confirm they are in the audit report and fixed; I did not verify.
- **Data ops (Devin A)**: negative-cache TTL split for POWER 429 versus permanent failures, `tools/refresh_risk.py`, `tools/verify_r2.py`, a disabled `risk-refresh` workflow, `docs/audit/data-audit.md`.
- **UI night (Devin B, brief 30)**: map fallback that never goes blank, readable gap ids, degraded-diagnosis notice with retry, Orin card with `reference_kind` and "pocas mediciones", emergency call block. Smoke at 390 and 1280 px: 0 defects. The emergency live/area checks use stubbed bodies.
- **Impeccable critique**: done; plan in `docs/briefs/devin/31-ui-polish.md`.

## Open and unverified (do these first)

1. **Brief 31 (UI polish)** was sent to terminal B; result unknown. If the terminal is alive, read its report; if not, resend the brief. Then merge `feat/ui-night`, run back tests, `cd web && npm test && npx tsc --noEmit && npm run build`, then push.
2. **Risk refresh not confirmed on R2.** Devin A ran `predict.py` and staged shards in `r2-stage-risk/`, but reported only the risk upload was authorized and then said remote differences remained. Run `python tools/verify_r2.py`, compare, then `python tools/refresh_risk.py` if the risk shards are stale (risk shards were dated 2026-11-14).
3. **Upload the full `orin/validation.json` (with the NDVI row)** only after the UI shows `reference_kind: finer_satellite` correctly (brief 30 built it against the fixture; check it on the real file first).
4. **Confirm the six bug hunt defects are fixed** in `docs/audit/code-audit.md` and re-run the bug hunt script (scratchpad `bughunt_api.py`, session-only) or equivalent.
5. **Untracked files in the repo**: `docs/briefs/devin/28-31`, `docs/overnight-report.md`, `.atl/`, `Proyecto Hot Spots – Space Apps 2026.md`, `r2-stage-risk/`, `r2-stage-fix/` (staging dirs should be git-ignored, not committed). Commit the briefs and report if you want them in the repo.

## Impeccable critique, remaining items (all in brief 31)

Landing hero shows no product; requirement table needs stacked cards below 720 px; Orin card and other cards must lead with the plain verdict; emergency link contrast (about 3:1 by estimate, not measured) and text below 0.8 rem; Welcome has 5 actions instead of one question and two buttons; detector items (text-wrap, 25 em dashes in English landing copy, dark glow on the main button, kicker above heading, unused `--ease-spring`); accessibility (h1 as a button, hard-coded aria-labels in one language, no verified keyboard path to select a plot); `/app` metadata. The design review did not read `GlobeView`, the area panel, the fields panel or the rotation cards, and nobody viewed the rendered app: do a visual pass at 390 and 1280 px.

## For you (cannot be done by the agents)

- Vercel account and first deploy using `docs/DEPLOY.md`. Environment variables: `FIRMS_MAP_KEY`, `DATA_BASE_URL`, `FRONT_ORIGIN`, `GEMINI_API_KEY`, plus `AI_PROVIDER`, `AI_MODEL` and `ANTHROPIC_API_KEY` if used. Test the live path of the AI explanation (untested) and POWER under load (429 risk).
- Rotate the FIRMS key and the Earthdata token (exposed in chat). Run the `pip-audit` that failed offline.
- Rate limiting for geocoding must be set at Vercel/WAF level.
- Video, dataset, demo and license URLs for README and landing; categories; the team decides the satellite base map.
- Local agronomist validation of the literature-based agronomic values; field samples from Orin (NDVI, soil moisture) do not exist yet; real phone testing on 4G.
- Project submission.

## Known data limits

SMAP anomaly is null (rejected); IMERG last full year is 2024; legacy `src.rain` still says POWER while the grid fields say IMERG; the Orin NDVI comparison has n=3 and compares against Sentinel-2, not field measurements.

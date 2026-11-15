# Devin task 23 — Resilience of the on-demand diagnosis, IMERG, and the SMAP sign check

Main worktree (it needs the local `data/`). Everything you did in tasks 17 to 20 is committed on main (`106c558`). Other Devin terminals work on branches in separate worktrees and touch `back/knowledge/*`, `rotations.py`, `measures.py` and the fire-weather function of `field.py` (terminal B) and documentation (terminal C): do not edit those files. You may commit on main in this task (conventional commits, no AI trailers) after your tests pass, but do not push; the orchestrator pushes. Never print secrets.

## 1. POWER rate limit (HTTP 429): the production risk

Your grid run hit HTTP 429 after about 1,000 calls. The deployed app calls the POWER point API on every diagnosis, on Vercel Hobby, with many cold instances and possibly several jury members at once. Make the diagnosis degrade gracefully:

1. In `field_sources.py` handle 429 and 5xx on the POWER daily call: honor `Retry-After` when present, otherwise one retry after 1.5 s with jitter; never more than one retry; a total wall-time budget of 8 seconds for the whole diagnosis.
2. In-process request de-duplication: concurrent diagnoses for the same H3 res-6 cell and date share one upstream call (an in-flight future map).
3. **Fallback to the precomputed grid**: when POWER is unavailable after the retry and the plot is in Argentina with a `field/grid` cell, build the diagnosis from the grid values (`rain_mm_yr`, `rain_cv`, `rain_p25_mm`, `heavy_days_yr`, corrected `frost_free`, corrected `hot_days_gt35`, GRACE trend, bare soil days, soil) and mark every card `confidence: "medium"` at most, with the source text "Dato precalculado (NASA POWER, 0,5°) porque el servicio no respondió" and a visible notice in the response (`degraded: true`, `degraded_reason`). Cards that need the daily series (recent weather, fire weather, scenarios, monthly rain) say "no disponible ahora" with a short reason. Outside Argentina or with no grid cell, return the cards that do not need POWER (slope, soil if any), `degraded: true`, and the message "El servicio de datos del clima no respondió; probá de nuevo en un minuto".
4. Front: when `degraded` is true show a clear notice with a retry button ("Reintentar"), keep everything else usable, and never show a blank screen.
5. Tests with a stubbed 429 and 503 (retry honored, budget respected, fallback shape, de-duplication, degraded flag), and a front test for the notice and the retry.

## 2. SMAP sign check (before accepting the rejection)

Task 18 rejected the SMAP 30-day anomaly because the correlation with the POWER recent rain departure was **strongly negative** (Pearson -0.58, Spearman -0.80). A wet recent period must give a wetter-than-normal anomaly, so a strong negative correlation is a red flag for a sign or ordering bug (anomaly computed as baseline minus recent, wrong window alignment, or the day-of-year baseline shifted), not noise. Investigate: recompute for 5 known cells with a printed trace (recent mean, baseline mean per year, final anomaly) and confirm the sign by hand against a well known wet or dry episode; then re-run the quality gates. If a bug is found, fix it, regenerate `sm_anom_*` in `field/grid`, and update the methods panel text. If there is no bug, explain exactly why a negative relation is physically plausible and keep it null.

## 3. GPM IMERG (task 21b)

Do `docs/briefs/devin/21b-imerg.md` now (the data agreement is accepted; a one-granule download works). Skip `back/knowledge/*` as that brief says.

## 4. Uploads staging (no upload)

Prepare the staging folder `r2-stage/` (git-ignored) with everything new since the last upload: `orin/validation.json`, `orin/lots.geojson`, the regenerated `field/grid/*.json`, and the new `field/analogs` if they changed. Run `python tools/upload_r2.py r2-stage` as a dry run and report the counts and sizes. Do not upload.

## Report

Per section: what changed, the 429 behavior shown with a stubbed run and the degraded response for pampa, the SMAP investigation result, the IMERG agreement numbers, the staging dry-run, and test counts (back and front).

# Code & pipeline audit — task 28

Branch `feat/audit-fixes` (from `origin/main`). Scope: backend (`back/app`),
pipeline (`pipeline/`, `model/`), operational files. No UI changes.

Tests: **114 → 132 passed** (`pytest back/tests`, +18 regression tests in
`back/tests/test_audit_fixes.py`). Fixture validator:
`python pipeline/validate_export.py fixtures` → 14 ok, 1 skip, 0 errors.

## Live-R2 bug hunt (addendum) — all fixed

| # | Reproduction | Root cause | Fix | Status |
|---|---|---|---|---|
| 1 | `diagnose [-27.37,-55.9]` (Posadas) → `country: PY` | `zone_at` trusted the coarse 110 m country map over the ~1 km IGN province map; the Paraguay polygon overlaps Posadas at this resolution | `zone_at` returns `"AR"` directly when a province matches (georef.py:183) | fixed + test |
| 2 | `diagnose [0,-150]` → 200, `elevation_m: -4290`, `temp_adjust_c: 27.9` | No land check; Terrarium bathymetry fed the lapse-rate correction | `no_land` 400 before any upstream fetch (field.py:935); `temp_adjust_for` returns 0 when either elevation < 0 or missing (field.py:432) | fixed + tests |
| 3 | `diagnose [40.7,-74.0]` → `country: null` | The 110 m coastline drops near-shore points; also NE encodes US `iso2` as `-99` | `country_at` falls back to nearest feature within 0.3°; `-99` mapped per-name (N. Cyprus→CY, Somaliland→SO) (georef.py:103–172) | fixed + test |
| 4 | bow-tie polygon → `area 0.0 ha`; antimeridian polygon → ~4.2 M ha (2.97 G ha in direct repro) | No self-intersection or antimeridian validation; `ring_area_ha` takes raw lon deltas | Explicit rejections before area: `"polygon self-intersects"`, `"polygon crosses the antimeridian, not supported"` (field.py:128–134) | fixed + tests |
| 5 | `/api/risk` → 404 `{"error":"no_risk_for_cell","h3_r5":…}` | Shape was usable but minimal | 404 kept; body is now stable `{error, h3_r5, detail}` (risk.py:14) | fixed |
| 6 | `diagnose` ≈ 5.3 s even when POWER responds | POWER daily 2001→yesterday is a multi-MB response; it is the long pole. Budget: outer httpx 6 s, POWER 5 s, other sources 3 s, all concurrent → worst case ≈ 6 s; rotations engine is local CPU (ms); `explain` AI timeout 6 s | No change needed | verified |

**Timeout budget vs `maxDuration: 60`:** diagnose worst case ~6 s
(outer client cap), rotations adds <1 s of local compute plus an optional
shard fetch (3 s cap). A UI sequence of diagnose → rotations → explain
fits comfortably at ~15 s worst case. Safe.

## Findings (fixed)

| ID | Sev | File:line | Finding | Evidence | Status |
|---|---|---|---|---|---|
| F1 | P1 | georef.py:183 | Border country resolution wrong (Posadas→PY) | live repro, `zone_at` returned PY | fixed + test `test_posadas_resolves_argentina_not_paraguay` |
| F2 | P1 | georef.py:159 | Coastal points miss the 110 m map (NYC→None); US `iso2` is `-99` | `country_at(40.7,-74.0)` → None; feature exists, iso2 `-99` | fixed + test (nearest-feature snap 0.3°, `-99` name overrides) |
| F3 | P1 | georef.py:91 | Interior rings ignored → enclaves report enclosing country | `country_at(-29.6,28.2)` → ZA (should be LS) | fixed + test |
| F4 | P1 | field.py:935 | Ocean points return a full 200 diagnosis | repro: `[0,-150]` → 200 | fixed + test `test_diagnose_ocean_no_land` |
| F5 | P1 | field.py:432 | Negative elevation drives a +27.9 °C correction | repro: `elevation_m -4290` | fixed + tests |
| F6 | P1 | field.py:133 | Self-intersecting polygon reports misleading area | bow-tie → `area 0.0 ha` | fixed + test (`"polygon self-intersects"`) |
| F7 | P1 | field.py:129 | Antimeridian polygon reports absurd area | repro: 2.97 G ha | fixed + test (`"polygon crosses the antimeridian, not supported"`) |
| F8 | P2 | risk.py:14 | 404 body too thin for the UI to distinguish errors | body lacked `detail` | fixed: stable `{error, h3_r5, detail}` |
| F9 | P2 | field.py:96–112 | `await request.json()` unguarded in all 3 POSTs | empty/malformed body → 500 | fixed + tests (`_json_body` → 400) |
| F10 | P2 | field.py:103 | `point` as dict → `KeyError` → 500 | `{"point":{"lat":…}}` | fixed + test |
| F11 | P2 | cache.py:16 | `TTLCache` unbounded; geocode caches user-raw query strings | no eviction policy | fixed + test (`MAX_ENTRIES=4096`, purge expired, evict oldest) |
| F12 | P2 | geocode.py:26 | No query length cap → upstream abuse + giant cache keys | q unbounded | fixed: 400 over 200 chars + test |
| F13 | P2 | field.py:1083 | `h3.cell_to_parent` on replayed diag with invalid r5 → 500 | `h3_r5: ["bogus"]` | fixed: try/except → analog=None |
| F14 | P2 | firms.py:68 | FIRMS error body logged verbatim could echo `MAP_KEY` | error text may echo request path | fixed: key redacted (len ≥ 8) |
| F15 | P2 | pipeline/06_export.py:41 | `write_json` non-atomic → killed run can leave truncated JSON | `path.write_bytes` direct | fixed: write `.tmp` + `replace` |
| F16 | P3 | data.py:27 | `file://` data base honored unconditionally | `fetch_json` | fixed: `file://` rejected when `VERCEL` env is set |
| F17 | P3 | DEPLOY.md | `AI_PROVIDER`/`GEMINI_API_KEY`/`ANTHROPIC_API_KEY`/`AI_MODEL` undocumented | env-var sweep | fixed: documented as optional backend vars |

## Open items (not fixed)

| ID | Sev | Finding | Why open |
|---|---|---|---|
| O1 | P2 | `pip-audit -r back/requirements.txt` could not run — PyPI unreachable from this machine | Re-run in CI (`pip install pip-audit && pip-audit -r back/requirements.txt`) |
| O2 | P3 | Geocode has no rate limit (only length cap + bounded cache) | In-process limiting is ineffective across serverless instances; needs Vercel/WAF or an upstream token bucket |
| O3 | P3 | `zone_at` keeps no fallback for Argentine points just off the IGN province grid | Deliberate: a point 15 km inside Paraguay must not become Misiones; country snap (0.3°) still labels it |

## Reviewed — clean

- **`/api/live`**: bbox NaN/inf rejected by range checks, window whitelist
  (24h/48h/7d), 5° bbox expansion for cache sharing, 4 MB / 400 sq° cap
  with graceful points→cells fallback, per-source failure isolation
  (`sources_failed` reported, one bad sensor never fails the request).
- **`/api/risk`**: coordinate validation, shard errors → clean 404,
  cache-control headers, 404 preserved.
- **`/api/geocode`**: query passed via `params` (no URL injection), min
  length, upstream errors → 502 `geocoding_unavailable`, payload trimmed.
- **Error handling**: `MissingEnv` → 503 `{error, variable, detail}` —
  never the value. `_cached` logs exception type only. No
  `except Exception: pass` found (silencers all degrade explicitly).
- **Secrets**: `FIRMS_MAP_KEY` only in URL path, never logged (F14);
  R2 bucket public by design; `.gitignore` covers `.env`, `.venv`, data.
- **CORS**: `allow_origins=[FRONT_ORIGIN or "*"]`. `*` is acceptable —
  the API serves public data only, no cookies/credentials. Set
  `FRONT_ORIGIN` in production anyway (documented).
- **Field logic**: scenario application, month wrap-around
  (`burn_season_months` clamps via `min(11, …)`), `frost_free_window`
  Feb-29 anchored, `months_range` guards, `{v:g}` None-guarded,
  `wind_gt_kmh` correctly converts POWER m/s → km/h.
- **Pipeline**: week 53 folded via `LEAST(52, week(date))` (documented);
  climatology division guarded `clim >= 0.01`; model features documented
  strictly-before-*d* (no leakage); train/val/test split by year, no
  random mixing; `woy` handled via `np.unique` (53 safe); `upload_r2`
  HEAD + `x-amz-meta-src-md5` → idempotent, partial-failure-safe resume.
- **Rotations**: priorities validated 0–5, `ValueError` → 400,
  scenario baseline ordering preserved.
- **Vercel**: `maxDuration: 60` covers worst-case diagnose (~6 s) +
  rotations + explain (~15 s sequential total). `api/index.py` thin ASGI
  wrapper; `vercel.json` includes `back/**`.

## Commands run

```text
git fetch; git checkout -B feat/audit-fixes origin/main
python -m venv .venv; pip install -r back/requirements-dev.txt pytest
pytest back/tests                      # 114 → 132 passed
python pipeline/validate_export.py fixtures   # 14 ok, 1 skip, 0 errors
pip install pip-audit                  # FAILED: PyPI unreachable (O1)
```

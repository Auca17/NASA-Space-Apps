# Devin task 02c — `/api/live`: 7-day window and failure caching

Task 02b is accepted: real FIRMS calls work for 24 h (Corrientes: 143 points, 7.6 KB, 1.5 s; world: `cells`, 2,615 cells, 73 KB, 5.4 s). Two defects remain, found with the real API. Do not modify `docs/` or `fixtures/`. Do not commit.

## Evidence

```
GET .../api/area/csv/{KEY}/VIIRS_NOAA20_NRT/-180,-90,180,90/7
-> HTTP 400 "Invalid day range. Expects [1..5]."
```

Our `/api/live?window=7d` therefore failed on all four sources and still answered HTTP 200 with an empty list and `Cache-Control: public, s-maxage=10800`. The CDN would serve that empty answer for 3 hours.

## Fixes

1. **7-day window.** The FIRMS area API accepts 1 to 5 days per request and an optional start date: `/api/area/csv/{key}/{source}/{bbox}/{day_range}/{YYYY-MM-DD}`. Confirm the date semantics in the FIRMS API docs (https://firms.modaps.eosdis.nasa.gov/api/area/) before coding. Build `7d` from two requests per source that together cover the last 7 days without gaps, then deduplicate on `(lat, lon, acq_instant, satellite)`. `24h` and `48h` stay as one request.
2. **All sources failed.** Return HTTP 502 with `{ "error": "upstream_unavailable", "sources_failed": [...] }` and `Cache-Control: no-store`.
3. **Partial failure.** If at least one source failed but others answered, keep HTTP 200 but use `Cache-Control: public, s-maxage=600` so a degraded answer does not stick for 3 hours.
4. **Upstream error text.** FIRMS answers errors as plain text (for example `Invalid day range...` or `Invalid MAP_KEY.`). Log the first 120 characters of the body and the source name at warning level. Never log the URL, because it contains the key.

## Tests to add

- `7d` issues exactly two requests per source with the expected day ranges and dates, and duplicates across them are removed.
- All four sources returning HTTP 400 gives 502 with `no-store`.
- One source failing gives 200 with `s-maxage=600` and `sources_failed`.

## Report

Changed files, test results, and one real call for `window=7d` on the Corrientes bbox and on the world (expect `points` and `cells`), with status, size and time. `FIRMS_MAP_KEY` is still not in `.env`; if it is missing, say so and skip the real calls instead of searching the filesystem for it.

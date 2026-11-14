# Devin task 03b — Corrections to `/api/field/diagnose` (review of task 03)

Task 03 structure and most cards are accepted. Two defects must be fixed in one batch. Do not modify `docs/` or `fixtures/`. Do not commit.

## 1. Frost-free period is wrong in the southern hemisphere (blocker)

`frost_free_window` in `back/app/routers/field.py` takes the last frost before day 182 and the first frost after it. In the southern hemisphere frosts fall in June to August, so it reports the gap inside winter: Pergamino came out as 16 days, 23/06 to 09/07. The real frost-free period there runs from spring to autumn, around 200 to 250 days.

Make the algorithm hemisphere-agnostic:

- Find the coldest month of the climatology (lowest median `T2M_MIN`). Start each "frost year" on the first day of that month (July in Pergamino, January in Burgos).
- Inside each frost year: last frost = last day with `T2M_MIN <= 0` in its first half; first frost = first such day in its second half. Frost-free days = first frost minus last frost.
- Median over years, with at least 3 years having both frosts; otherwise `null`. If a frost year has no frost at all, count it as a 365-day frost-free year for the median and say so in the text ("sin heladas en N de M años").
- Labels stay `DD/MM` as today. The calendar row `frost` (monthly fraction below 0 °C) is correct and stays.

Tests: a synthetic southern series with frosts only from June 1 to August 31 must give labels `01/09` and `31/05` and 272 days (or 273, document which boundary you count); a synthetic northern series with frosts December to February must give a window from March to November. Keep the real Burgos number as a regression check (209 days).

## 2. Failures are cached for 6 hours

`_cached` in `back/app/services/field_sources.py` stores `_NULL` with the same TTL as a success, so one SoilGrids timeout blanks the `soil` card for every visitor of that cell for 6 hours. Use a 10-minute TTL for negative entries and keep 6 hours for successes. Keep the "same-day replay does not hit upstreams" test for successes only, and add one asserting that a failed source is retried after its negative TTL expires (monkeypatch time).

## 3. SoilGrids and ORNL MODIS (no code change)

Measured today from this machine: both time out even at 15 seconds, three attempts each. They are not usable on demand right now. Leave the 3-second budget. Add one line to `back/README.md` saying so, and that `soil` and `vigor_bare_soil` will come from the precomputed `field/grid` shard (task 05), not from these APIs.

## Report

Changed files, test results, and the real Pergamino and Burgos frost cards after the fix (labels and days).

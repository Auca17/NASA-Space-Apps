# Devin task 15 — Rotation engine fixes, round 2 (review by Chucky at commit a9ebf7d)

Run after task 14, without waiting for review. Do not modify `docs/` (except a short note in `back/README.md`), `fixtures/` or secrets. Do not commit. Never print secrets.

Method for every item: **first reproduce the reported behavior with a failing test** (synthetic data is fine, use the numbers given), then fix it, then keep the test as a regression test. If you cannot reproduce an item, say so and show what you ran.

## 1. Web does not send the zone, and hides the empty result (check only, probably done in task 13)

Chucky reported that `web/src/features/field/FieldLens.tsx` (request near line 135, results near line 259) does not send `zone` and does not show the notice when the API returns zero strategies. Task 13 section B should have fixed both. Verify with a front test (Patagonia diagnosis, zero strategies, low confidence): the notice "sin rotaciones validadas para esta zona" is visible and no `soja-soja` appears. Fix whatever is still missing.

## 2. Zone date shift crops alfalfa to 47 days but keeps 1,200 mm/year demand

Evidence: in Cuyo the shift turns each alfalfa year into 47 days (15 March to 30 April) while keeping `water_mm_cycle` 1,200 per year. With simulated rain of 1,400 mm/year the supplemental irrigation need jumps from 0 to 815 mm/year only because of the shift.

Fix: perennial crops (cycle of at least 330 days or flagged in the knowledge as cut period) must never be shifted or cropped by the zone window logic: keep their full productive period and annual demand. For non-perennials, when the window is shifted, scale nothing silently: the cycle length stays the crop's own length. Add a unit test for the alfalfa case (irrigation need must stay 0 with 1,400 mm and zone cuyo).

## 3. `bare_soil_days` goes stale after dates are shifted

Evidence: for soja-soja in NOA the sowing moves to 1 December, but the card still reports 199 bare-soil days while the returned sequence gives 229. The same stale value feeds the erosion indicator.

Fix: always compute days without live crop from the **returned (possibly shifted) sequence**, never from the catalog value. Keep the catalog `bare_soil_days` only as a cross-check in a test. The erosion indicator must use the recomputed value. Test: NOA soja-soja gives 229 and the erosion bucket is computed from 229.

## 4. With irrigation, the "water" priority no longer orders strategies

Evidence: with `irrigation: true` and only `water` as priority, every strategy scores 0.5 although they need different supplemental irrigation. The score reads `water_balance`, which in this mode holds the text "con riego".

Fix: the water indicator used for scoring must always be numeric. Define it as the amount of water the strategy takes from the system: with irrigation, use `irrigation_need_mm` (lower is better); without irrigation, use the rain-based balance as now. Expose both `water_balance_mm` (numeric) and the display label separately. Test: with irrigation and `water` as the only priority the strategies get distinct scores in the order of their irrigation need.

## 5. Harvest stop alert may rest on data two days old, and shows no date

Evidence: with 25 C on the last available day and 36 C two days before, the alert still fires and the text shows the value without the date.

Fix: in `fire_weather_card`, evaluate `stop_conditions` on the last valid day only for the alert level, and keep the previous two days as context. Each condition in `stop_detail` carries the observation date and value ("36 °C el 12 de noviembre"). The measure text says how old the data is; if the exceeded value is older than the last available day, the measure text says "hace 2 días" and uses a softer wording ("hubo", not "hay"). Humidity stays flagged "umbral por confirmar con INTA". Tests for: condition on the last day, condition two days ago only, none.

## Report

For each item: reproduced yes or no, the fix, the new tests, and the pampa, NOA and Cuyo numbers before and after.

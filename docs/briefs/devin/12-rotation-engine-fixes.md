# Devin task 12 — Rotation engine and harvest alert fixes (review by Chucky, verified by Claude)

Start after task 11, without waiting for review. Read first: `back/app/services/rotations.py`, `back/app/routers/field.py` (fire weather card), `back/knowledge/*.json`, `back/knowledge/REVIEW.md`, `docs/revision-agronomica.md`. Do not modify `docs/` or `fixtures/` except where this brief says. Do not commit. Never print secrets. All three findings below were confirmed in the code.

## 1. Water balance uses uniform rain and ignores overlap and irrigation (blocker)

Evidence: `_crop_rain` computes `rain_annual x cycle_days / 365`. Consequences: (a) the date of the sowing window is ignored, so a crop in the dry months gets the same water as one in the wet months; (b) in sequences with overlapping periods (soja de segunda sown before the wheat harvest) the same days of rain are credited to two crops; (c) alfalfa has `water_mm_cycle` 1200 per year but the engine only counts 61 cycle days, so it is always judged short of water; (d) `constraints.irrigation: true` adds no water.

Fix:
1. `/api/field/diagnose` must return the monthly rain climatology (12 values, mm per month, mean over 2001 to last full year, from the POWER daily series it already fetches) in a compatible new field `rain_monthly_mm` on the `rain` card.
2. In the engine, compute available water per crop from the **monthly climatology over the crop's actual sowing-to-harvest window** (day weighted inside each month). For a rotation, allocate each calendar day's rain once: when two crops overlap on a day, split that day's rain between them in proportion to their daily demand (document the rule).
3. Perennials (alfalfa and any crop with `years` or a cutting period): compare annual demand with annual rain, not with the cut window.
4. `irrigation: true`: remove the water viability filter, and report the indicator as "con riego" with the supplemental water implied (demand minus rain) so the card says how much irrigation the strategy would need. `irrigation: false`: as today.
5. If monthly rain is missing, keep the current uniform fallback and add a `gaps` entry saying so.
6. Tests: a dry-season crop gets less water than a wet-season crop at equal annual rain; overlapping crops do not double count; alfalfa is viable in a plot with 1,000 mm/year and irrigation false only when its demand is met per year; `irrigation: true` makes a water-hungry crop viable and reports the irrigation need.

## 2. Zones are not enforced as constraints (blocker)

Evidence: `_current_rotation` picks the first rotation whose crops have any window in the zone, so for NOA it takes `soja-soja` with sowing on 1 November although the NOA soy window opens on 1 December; for Patagonia it falls back to `soja-soja` and can still report `confidence: "high"`.

Fix:
1. Add optional fields to `rotations.json` and its pydantic model: `zones` (list of zone ids where the rotation is agronomically valid) and `typical_for` (list of zones where it is the default current rotation). Populate them from the table in `back/knowledge/REVIEW.md` (soja-soja: pampa_humeda, nea, noa; typical for those three; garbanzo-maiz: noa; alfalfa4-maiz: cuyo, typical for cuyo; every other rotation: pampa_humeda). Add the fields to `docs/data-contract.md` section 3.2 as optional (this is the one contract edit allowed in this task) and to `back/tools/validate_contract.py`.
2. Candidate strategies are filtered by `zones` when the plot zone is known. The "no sé" default uses `typical_for`, never file order.
3. A rotation's sequence dates must sit inside each crop's sowing and harvest windows for the zone. When a rotation is used in a zone whose window differs, shift the dates of that crop to the zone window and say so in the card (`gaps`), instead of silently using the rotation's generic dates.
4. If the zone has no valid rotation (Patagonia today), return `confidence: "low"`, no fallback to `soja-soja`, and a clear message "sin rotaciones validadas para esta zona" in `gaps`; the four-strategy rule is relaxed for this case (return the current rotation only, if given, plus what is viable).
5. Tests: NOA default uses its own dates; Patagonia returns low confidence and the message; a Pampa rotation is not offered in NOA.

## 3. "Parar la cosecha" depends on a 3-of-4 weekly score (should fix)

Evidence: the `harvest_timing` measure fires on `fire_weather_high`, which needs three of four signals. INTA and Bomberos de Tandil say to stop work when any single condition is exceeded (wind above 40 km/h, temperature above 35 C, relative humidity below 30 percent). A 36 C afternoon alone never triggers it.

Fix:
1. In `fire_weather_card` keep the level as is, and add a new field `stop_conditions`: the list of single conditions exceeded in the last valid day (and the last 3 days): `wind_gt_40kmh` (WS2M above 11.1 m/s), `temp_gt_35`, `rh_lt_30` (mark this one in the text as "umbral por confirmar con INTA", because the source is ambiguous about humidity).
2. New trigger `harvest_stop_conditions` that fires when `stop_conditions` is not empty; point `harvest_timing` at it (keep `fire_weather_high` as an additional trigger). The measure text lists exactly which conditions were met and the values.
3. Tests for each single condition and for none.

## 4. Small items

- Rename the `carbon` indicator output key to `residue_t_ha_yr` (keep `carbon` as a deprecated alias for one release) and say "t/ha por año de rastrojo" in the card text.
- Rename `bare_soil_days` in user-facing text to "días sin cultivo vivo".
- `no_residue_burning` measure text: add the legal note "La Ley 26.562 exige autorización de la autoridad local competente para quemar, durante todo el año" with the source, without changing its triggers.
- Update `back/README.md` and the existing tests that depended on the old behavior.

## Report

What changed for each point, new test counts, and the strategies and scores returned for the Pergamino plot (pampa_humeda), a NOA plot (-26.8, -65.2) and a Patagonia plot (-39.0, -67.5), each with default current rotation, plus one plot with `irrigation: true`.

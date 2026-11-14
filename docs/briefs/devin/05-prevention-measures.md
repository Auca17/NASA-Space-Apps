# Devin task 05 — Fire prevention measures (one long unit)

Start right after task 04, without waiting for review. Read first: `docs/data-contract.md` sections 3.3 and 4.6 (new), `docs/decisions.md` D26, and the INTA harvest fire-prevention guidelines: https://www.argentina.gob.ar/node/413622 . Do not modify `docs/` or `fixtures/`. Do not commit. Deliver tasks 04 and 05 in one combined final report.

## Goal

Turn risk into action: for a place or a plot, return the prevention measures that apply, each saying which factor it addresses, why it applies here (with the triggering values), the expected benefit, what it requires and its source. Deterministic rules, same pattern as the rotation engine.

## Step by step

1. **Knowledge file** `back/knowledge/measures.json` (schema in contract 3.3), loaded and validated at startup with pydantic like crops and rotations. Write a placeholder with at least these 5 measures, sourced from the INTA page above (quote the source title and URL):
   - `clean_harvester`: clean dry residue from the harvester and check hot parts (factor `machine_ignition`, trigger `harvest_in_dry_season`).
   - `maintain_firebreak`: check and maintain existing firebreaks on boundaries with continuous dry vegetation (factor `spread_boundary`, triggers `fire_weather_high`, `risk_high`).
   - `no_residue_burning`: do not burn stubble; keep or incorporate residue (factor `residue_burning`, triggers `bare_soil_in_burn_season`, `burn_season_now`).
   - `harvest_timing`: avoid harvesting at the hottest, driest, windiest hours (factor `machine_ignition`, trigger `fire_weather_high`).
   - `water_and_extinguisher`: keep water and extinguishers on machines and at the field during harvest (factor `initial_attack`, trigger `harvest_in_dry_season`).
   Add `back/knowledge/README.md` noting that Augustus replaces this content.
2. **Fire weather card** in `/api/field/diagnose`: new card `fire_weather` from the POWER daily series already fetched (no new call): last 7 days mean `RH2M`, max `WS2M`, max `T2M_MAX`, plus days since rain from `recent_weather`. Levels `bajo` / `moderado` / `alto` with thresholds you document in `back/README.md`. Compatible addition (contract 4.2).
3. **Trigger evaluation** `back/app/services/measures.py`: a pure function `evaluate(context) -> list[Measure]`, where context can carry any of: diagnosis cards and calendar, risk cell, chosen rotation sequence, the crops knowledge, today's month. Trigger rules (document them in the README):
   - `harvest_in_dry_season`: a harvest window of any crop in the current or chosen rotation overlaps a month with `burn_season >= 2` or `water_stress >= 2`.
   - `fire_weather_high`: `fire_weather` level `alto`.
   - `risk_high`: risk `cat` in `alto`, `muy_alto`.
   - `bare_soil_in_burn_season`: the rotation leaves bare soil in a month with `burn_season >= 2`.
   - `burn_season_now`: the current month has `burn_season >= 2`.
   A trigger whose input is missing is skipped silently and noted in the measure list's `gaps`. Output order: most triggers fired first, then lowest cost.
4. **Wire into the endpoints** (all compatible additions, contract 4.6):
   - `/api/field/diagnose`: add `measures` (context = cards + calendar + risk if available).
   - `/api/field/rotations`: add `measures` per strategy (context = its sequence), so a rotation that avoids bare soil in the burn season shows fewer measures than the current one; and set its `burns_avoided` indicator consistently with `bare_soil_in_burn_season`.
   - `/api/risk`: add `measures` (context = risk cell + current month only).
5. **Contract validator** `back/tools/validate_contract.py`: JSON Schemas for every static file in contract section 2 and every endpoint response in section 4, generated from the pydantic models where they exist. CLI: `python back/tools/validate_contract.py <dir-or-url>` validates a local folder or an R2 base URL and prints one line per file (ok or the first error). Run it against `fixtures/` and report the result; fixture errors are reported, not fixed.
6. **Tests**: each trigger fires and does not fire on a minimal synthetic context; diagnose returns the `fire_weather` card and a non-empty `measures` list for a synthetic dry, windy harvest context; a rotation without bare soil in the burn season gets fewer measures than one with it; `/api/risk` with `cat: alto` includes `maintain_firebreak`; the validator flags a fixture copy with a removed required key.

## Combined report (tasks 04 and 05)

Changed files, test results, trigger thresholds, the measures returned for the Pergamino diagnosis and for its top rotation, the validator output on `fixtures/`, and anything the knowledge schemas lack.

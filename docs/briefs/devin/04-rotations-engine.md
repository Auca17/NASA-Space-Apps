# Devin task 04 — Rotation engine and `POST /api/field/rotations`

Read first: `docs/data-contract.md` sections 3 (knowledge files), 4.3 (endpoint, D23 note) and 4.5; `docs/decisions.md` D1, D16, D18, D19, D23; `docs/PRD.md` sections 7.3, 7.4 and 10.2 (the engine design). Examples: `fixtures/knowledge/crops.json`, `fixtures/knowledge/rotations.json`, `fixtures/api/rotations.response.json`. Build on the existing `back/` app. Do not modify `docs/` or `fixtures/`. Do not commit.

## Goal

This is the core deliverable of the Field Shift challenge: given a plot diagnosis, the current rotation, the producer's priorities and constraints, return the current rotation plus exactly three alternatives, each with the five sections the brief demands (why, evidence, benefits, information gaps, risks). Deterministic and explainable: every number in the output traces back to a knowledge entry or a diagnosis card.

## Knowledge files

The real `back/knowledge/crops.json` and `rotations.json` are being written by a teammate (first version due soon: 5 crops, 4 rotations; later 15 and 12). Until they land:

- Create `back/knowledge/` and copy `fixtures/knowledge/*.json` there as placeholders, with a `README.md` saying they are placeholders to be replaced.
- Load them at import time with validation (pydantic models matching contract section 3). A rotation referencing an unknown crop, or a crop missing `sources`, fails loudly at startup with the offending id.
- Nothing in the engine may hardcode crop names: everything comes from the files, so the teammate's version drops in without code changes.

## Engine (`back/app/services/rotations.py`)

Follow PRD 10.2 literally:

1. **Templates**: candidate strategies are the rotations in `rotations.json` valid for the plot's zone. Zone comes from the request (`zone`, one of `pampa_humeda`, `nea`, `noa`, `cuyo`, `patagonia`, `other`); when `other` or missing, use the templates whose crops have sowing windows compatible with the diagnosis (frost-free window and heat), and mark `confidence: "low"`.
2. **Viability filter** per crop of each rotation, from the diagnosis cards: sowing-to-harvest window inside the frost-free period (unless `frost_tolerance` is `high`); `gdd_base10` achievable (estimate from monthly temperatures if available, else skip the check and record a gap); water: `water_mm_cycle` versus rain in the crop's months plus `soil_moisture` sign; `irrigation: false` removes crops that need more water than available by a margin you document; producer constraints (`livestock` false removes forage-only crops; `markets` list, when given, requires `market_ar` not `low` or the crop in the list).
3. **Indicators** per strategy, each returned with its number, the inputs used and their sources:
   - `water_balance`: use minus availability over the cycle (mm).
   - `carbon`: sum of `residue_t_ha` per year.
   - `nitrogen`: count of N-fixing crops per cycle.
   - `bare_soil_days`: from the sequence gaps per year (use the rotation's `bare_soil_days` if present, else compute from the sequence).
   - `erosion_risk`: `bare_soil_days` × heavy-rain days × slope, bucketed `bajo` / `medio` / `alto` with documented thresholds.
   - `pest_break`: number of distinct botanical families per cycle.
   - `income`: qualitative from `market_ar` of the crops (`low` / `medium` / `high`).
   - `forage`: any forage crop.
   - `burns_avoided`: 1 if the rotation keeps residue covered through the local burn season (from the `fire` card or `calendar.burn_season`), else 0.
4. **Score** = weighted sum of indicators normalized against the current rotation, weights = the producer's priorities (0 to 5) mapped to indicators as in the contract (`water`, `soil`, `erosion`, `income`, `forage`, `nitrogen`, `pests`, `avoid_burning`). Document the mapping. The current rotation always comes first with `is_current: true`; then the top 3 by score. If fewer than 3 viable alternatives exist, fill with the least-bad non-viable ones and state in `risks` why they are not viable; never return fewer than 4 strategies.
5. **Five sections** per strategy, in neutral Spanish, built from templates, not free text:
   - `why`: the top two priorities it serves and the diagnosis problem it addresses.
   - `evidence`: 2 to 4 items, each `{text, indicator, source}` quoting a real card value (for example the rain p25 or the frost window) and, when `field/analogs` has the cell, the analog crops.
   - `benefits`: the indicator values compared with the current rotation (deltas).
   - `gaps`: what was not measurable: null cards, low-confidence cards, resolution caveats (SMAP 9 km, POWER 0.5 degrees).
   - `risks`: from the knowledge entries (`sources` cited) plus generic agronomic cautions you keep in a small template file, always ending with the "validar con tu agrónomo" line.
   - `sequence`: the rotation's crops with `start`/`end`, plus a `cover` flag per period for the front's timeline.

## Endpoint `POST /api/field/rotations`

Input per contract 4.3 with D23: the full diagnosis object, `current` (`rotation_id`, or `sequence`, or `null` meaning "no sé": pick the zone's typical rotation, document how), `priorities`, `constraints`, optional `zone`. Validate and return 400 with a clear message on bad input. Response per `fixtures/api/rotations.response.json` plus `disclaimer`. `Cache-Control: no-store`.

Also add `POST /api/field/explain` as the template-based version (contract 4.5): takes the rotations response and returns one short paragraph per strategy in neutral Spanish assembled from the sections; no LLM.

## Tests

- Engine with the placeholder knowledge and the fixture diagnosis returns 4 strategies, current first, each with the 5 sections non-empty and every `evidence.indicator` present in the diagnosis cards or indicators.
- Priorities change the order: `avoid_burning: 5` ranks a covered-season rotation above a bare one.
- Constraint `irrigation: false` removes a crop you mark as water-demanding in a test-only knowledge file.
- Knowledge validation: a rotation with an unknown crop fails at load with its id in the message.
- Endpoint returns 400 for a missing diagnosis and 200 for the fixture diagnosis.

## Report

Changed files; the priority-to-indicator weight mapping and the viability thresholds you chose; the four strategies returned for the Pergamino diagnosis (ids and scores) with `current: null`; test results; and anything the knowledge schema lacks that the engine needed (so the teammate can add it).

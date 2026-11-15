# Devin task 36 — Farmer profile in the parcels API: priorities, extra hazards (El Niño, snow, hail), costs and margins (back end only)

Branch from current main: `git fetch; git checkout -B feat/farmer-profile origin/main` (main has your task 32 plus a fix of the Gemini summary in `back/app/services/ai_explain.py` and `back/app/routers/parcels.py`: read them first, keep them). Edit only `back/**` and `docs/data-contract.md`. Commit on the branch (conventional commits, no AI trailers), push the branch, never main. Never print secrets.

## Why

The team lead wants the farmer to customize what the app shows: their own costs and expected benefits, which hazards they care about with a priority ranking (examples given: El Niño, snowfall, hail), with the rest of the information kept in a separate tab. The UI (task 37) will send a `profile` and needs the extra indicators.

## Contract (additive; existing fields unchanged)

Request `POST /api/field/parcels` gains optional:

```json
"profile": {
  "priorities": [{"id": "fire", "rank": 1}, {"id": "drought", "rank": 2}, {"id": "enso", "rank": 3}, {"id": "frost", "rank": 4}, {"id": "snow", "rank": 5}, {"id": "hail", "rank": 6}, {"id": "heat", "rank": 7}, {"id": "flood", "rank": 8}],
  "hidden": ["flood"],
  "economics": {"currency": "USD", "parcels": {"p1": {"cost_per_ha": 420, "price_per_t": 290, "expected_yield_t_ha": null}}}
}
```

Hazard ids: `fire, drought, frost, heat, snow, hail, enso, flood`. Ranks 1..8 unique; unknown ids ignored; `hidden` hides from `parcels[].indicators` ordering only (still computed, the UI shows them under "más información").

Response gains, per parcel:

- `indicators.snow`: `{"days_per_year": n, "pct_years_with_snow": n, "basis": "..."}` from POWER daily snowfall (`PRECSNOLAND`, mm water equivalent; a snow day is above 1 mm), same period as the other climate values. If the parameter is unavailable, `null` values and a basis saying so.
- `indicators.hail`: there is **no hail dataset in this project**. Return `{"available": false, "basis": "No hay un dato satelital de granizo para tu zona en esta app; consultá el servicio meteorológico y tu aseguradora."}`. Do not invent a proxy.
- `indicators.enso`: `{"phase_now": "el_nino | la_nina | neutral", "oni": 0.0, "oni_period": "ASO 2026", "rain_effect_pct": {"el_nino": 18, "la_nina": -22}, "basis": "..."}`. Phase from NOAA CPC ONI (`https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt`, cached 24 h, 6 s timeout, degrade to `phase_now: null`). `rain_effect_pct` from this cell's own POWER history: mean precipitation of the growing season (October to March) in El Niño years and in La Niña years versus all years, as a percent difference (ONI thresholds ±0.5 over the season). Basis explains it plainly and says it is a historical tendency, not a forecast.
- `indicators.flood`: if the field grid has a usable signal (heavy rain days, low slope, water bodies), use it with its basis; otherwise `{"available": false, "basis": "..."}`.
- `order`: the list of hazard ids in display order: the profile ranks first, then the rest by severity; hidden ones last with `"hidden": true` on an `extra` list.
- `economics` per parcel when the request has economics for it: `{"expected_yield_t_ha": n, "yield_source": "user | magyp_department", "revenue_per_ha": n, "cost_per_ha": n, "margin_per_ha": n, "margin_total": n, "break_even_yield_t_ha": n, "risk_adjusted_margin_per_ha": n, "basis": "..."}`. Expected yield: user value if given, else the MAGyP department yield already in the analogs data (`ar_crops[].yield_kg_ha` for that crop, converted to t/ha), else null and no margin. Risk-adjusted margin: margin minus revenue times a plain, documented loss share derived from the indicators (for example drought `seco` minus 15 %, fire alert minus 5 %); document the factors in the basis and mark them as rough assumptions. Never present it as a forecast.
- The AI summary input includes the priorities so the headline follows the farmer's first priority (fire still first when there is a fire alert). Keep the validator: pass any new numbers in the payload.

## Tests and docs

Tests for priority ordering and hidden, snow from a stubbed POWER series, ENSO phase parsing from a fixture of the ONI file and the rain-effect math, hail always unavailable, economics math (user yield, MAGyP fallback, missing yield, break-even), and the summary following priority. Update `docs/data-contract.md` and `back/tests/fixtures/parcels_example.json` (push the fixture first, early: the UI terminal uses it). Run the whole back suite.

## Report

Real calls on the Pergamino demo with a profile (enso rank 1, economics for soja and maiz), values, timings, tests, and anything approximate.

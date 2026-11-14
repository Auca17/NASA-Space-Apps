# Devin task 03 addendum — NASA POWER daily point API for on-demand queries

Applies to the task 03 work in progress (`POST /api/field/diagnose`). Decision D25 in `docs/decisions.md`.

## Instruction

Use the **NASA POWER daily point API** as the main source for on-demand (real-time) weather queries, instead of the monthly endpoint:

`https://power.larc.nasa.gov/api/temporal/daily/point?parameters=...&community=AG&latitude=..&longitude=..&start=YYYYMMDD&end=YYYYMMDD&format=JSON`

## Measured on 2026-11-14 (Pergamino point, 5 parameters)

| Range | Size | Time |
|---|---|---|
| 2026-01-01 → 2026-11-13 | 27 KB | 1.6 s |
| 2020-01-01 → 2026-11-13 | 206 KB | 1.8 s |
| 2001-01-01 → 2026-11-13 | 773 KB | 2.0 s |

The last two days come back as the fill value `-999` (data latency). Treat `-999` as null.

## What to do

1. **One request per plot**: 2001-01-01 to yesterday, all needed parameters in the same call. Cache it per `(h3_r6 of the centroid, utc_date, "power_daily")`. Timeout for this call: 5 seconds (exception to the 3-second rule, like FIRMS).
2. **Check the POWER parameter catalog** for the `AG` community and decide which daily parameters are worth pulling. At least consider: `PRECTOTCORR`, `T2M_MAX`, `T2M_MIN`, `RH2M`, `WS2M`, and soil wetness (`GWETTOP`, `GWETROOT`), and any evapotranspiration parameter available.
3. **Derive from that single series** whatever it can feed. Expected at minimum:
   - `rain`: mean annual mm, coefficient of variation, 25th percentile year.
   - `heavy_rain`: days per year above 50 mm (no longer depends on `field/grid`).
   - `frost`: frost-free period from daily `T2M_MIN`.
   - `heat`: days per year above 35 °C.
   - Calendar rows `frost`, `heat`, `water_stress` from daily data.
   - **Recent conditions**: rain of the last 30 and 90 days versus the same window in the 2003–2022 baseline, and days since the last rain above 1 mm. Expose them as a new card `recent_weather` (compatible addition; list it in the report).
   - If `GWETTOP` or `GWETROOT` is usable, use it as the on-demand fallback for `soil_moisture` when `field/grid` has no SMAP value, with its real resolution in `resolution`.
4. Keep `field/grid` as the first choice only for what POWER cannot give (SMAP at 9 km, GRACE, GAEZ).

## Report (add to the task 03 report)

A table: POWER parameter → card or calendar row it feeds → why. Plus the real latency of the daily call from your machine for Pergamino and for the non-Argentine plot.

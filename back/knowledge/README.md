# Agronomic knowledge (contract section 3)

- `crops.json`: 15 crops, sowing and harvest windows per zone (3.1).
  Optional compatible fields: `cycle_end` (physiological maturity per
  zone — used for frost/water-cycle logic while `harvest` stays the
  real harvest calendar), `water_mm_observed`/`water_observed_note`
  (observed consumptive use shown as evidence; `water_mm_cycle` stays
  the FAO reference the engine uses), `residue_note`,
  `root_carbon_note`, `gdd_base_c`, `gdd_flowering_to_maturity`.
- `rotations.json`: 12 rotations plus a top-level `zone_references`
  list — documented references for zones with no computed rotation
  (Patagonia). File order sets the typical rotation per zone: the
  engine picks the first rotation whose crops all have a window in
  that zone (3.2).
- `measures.json`: fire prevention measures from INTA and Ley 26.562
  (3.3, D26), plus a top-level `stop_thresholds` map with the regional
  harvest-stop thresholds the field router applies (NEA/NOA: guía INTA
  del Chaco; other zones and default: Balcarce/Bomberos Tandil).
- `cases.json` (3.4): documented incidents shown next to the
  prevention measures (`kind: news_report` = press report, not a
  worker testimony).

This is a B1/B1b draft. Every value carries `sources`, and `null` means no
source was found. Values answered by the 2026-05 literature review are
labeled "fuente bibliográfica, pendiente de validación local" in their
source strings. `REVIEW.md` lists what agronomists must validate.

## Optional crop fields for display and perennials

- `color`, `icon`: display hints for the frontend (hex color, icon
  name). Presentational only.
- `rotatable` (default `true`): `false` for perennials and native
  cover (`vid`, `olivo`, `frutal_carozo`, `monte_nativo`) — the
  rotation engine never proposes rotating a vineyard or ripping out
  the monte.
- `frost_window` (per zone, `[MM-DD, MM-DD]`): the crop's
  frost-sensitive stretch (e.g. vine bud-break Sep–Nov). The parcels
  endpoint alerts when that window is not fully inside the cell's
  frost-free window.

## Infiltration score (app/services/infiltration.py)

0–100 score, class `alta` (>=66) / `media` (>=33) / `baja`. It is an
ordering heuristic, not a measurement:

| input | term |
|---|---|
| texture (SoilGrids class) | base 55/45/38/35/25/12 for Arenoso / Franco-arenoso / Franco / Franco-limoso / Franco-arcilloso / Arcilloso (35 if unknown) — texture ranks come from the **USDA NRCS hydrologic soil groups** (National Engineering Handbook part 630, TR-55 method: group A sands infiltrate fastest, group D clays slowest) |
| organic carbon (soc g/kg) | +12 if >=20, +8 if >=10, +4 if >=5 |
| slope (percent) | +15 if <1, +10 if <3, +4 if <8, else 0 |
| bare-soil days/yr | +15 if <=30, +10 if <=100, +4 if <=200, else 0 |

Rotation alternatives carry a *relative, qualitative* `infiltration`
class computed only from the drivers a rotation can change — cover
days and residue (`rotations.py::_infiltration_alt`); texture, OM
and slope stay fixed.

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

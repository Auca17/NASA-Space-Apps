# Agronomic knowledge (contract section 3)

- `crops.json`: 15 crops, sowing and harvest windows per zone (3.1).
- `rotations.json`: 12 rotations. File order sets the typical rotation per
  zone: the engine picks the first rotation whose crops all have a window
  in that zone (3.2).
- `measures.json`: fire prevention measures from INTA and Ley 26.562
  (3.3, D26).

This is a B1/B1b draft. Every value carries `sources`, and `null` means no
source was found. `REVIEW.md` lists what agronomists must validate.

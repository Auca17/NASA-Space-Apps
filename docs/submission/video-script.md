# Video script — Ashfield (NASA Space Apps 2026)

Target: **~150 seconds**, for the jury — **Field Shift first**.
Arc: the producer and their question → one-tap example → the four rotation cards →
parcels with fire and water → the calendar with vulnerable months → validation with
its honest limit → method (one grid, many resolutions: the MODIS/VIIRS example) → close.
Spanish is the cut to record (`video-script-es.md`); the English version follows.
Every number's source lives in `facts-sources.md` (internal, do not publish).

---

## Versión en español (~150 s)

Ver `video-script-es.md` — es la toma a grabar (narración ES, UI en español).

---

## English version (~150 s)

| # | Time | On screen | Exact narration | Clicks |
|---|------|-----------|------------------|--------|
| 1 | 0:00–0:12 | A real field or satellite image of a plot; Ashfield lockup | "A producer looks at their plot and asks: what should I plant? The climate is shifting, water is scarce and soils degrade. Ashfield answers with NASA data, not guesswork." | — |
| 2 | 0:12–0:28 | App welcome → one-tap example button | "One tap opens the demo plot in Pergamino. They draw parcels, assign a crop to each, and rank the eight hazards that worry them most." | Welcome → "Ver un ejemplo" (or "Analizar mi campo") → Pergamino demo plot → parcels screen |
| 3 | 0:28–0:38 | Per-parcel result | "Each parcel gets its fire and water percentages — and the reason behind every number. Tap a figure and see where it came from, at what resolution." | Tap the fire and water badges on a parcel → "where the data comes from" |
| 4 | 0:38–0:52 | The plot's agricultural calendar | "The calendar marks planting, harvest and bare-soil months — the months the plot is left vulnerable, to drought and to fire." | Open the agricultural calendar → point at bare-soil months |
| 5 | 0:52–1:30 | The four rotation cards; expand one card's five sections | "Then their current rotation compared against three alternatives. Every card answers the challenge's five questions: why, the evidence with its NASA source, benefits, what we don't know, and what to validate with an agronomist. Infiltration, erosion, water, pests, income and burns avoided — scored by their own priorities." | Rotations view → expand one card's five sections → scroll the other cards |
| 6 | 1:30–1:50 | Validation card + `docs/validation/orin/satelite_vs_estaciones.png` | "Can you trust it? We compared the satellite against 53 real stations in Mendoza and against 25 INTA rain gauges. In the mountains the satellite misses several degrees — the app says so — and correcting for real elevation cuts the error almost in half." | Validation card → honest-limits note |
| 7 | 1:50–2:10 | Method slide: H3 grid with layers at different resolutions; `series_global.png` | "Behind it, an engine brings heterogeneous data onto one common grid — requirement F8 of the challenge. The clearest example: 568 million MODIS and VIIRS detections in one comparable series, validated on years the calibration never saw." | Method slide (static) |
| 8 | 2:10–2:30 | Close: the app on the plot + lockup | "Ashfield doesn't replace the agronomist — it gives the producer the right questions, with evidence. NASA data, translated into decisions." | Back to the plot → end card: Ashfield · NASA Space Apps 2026 · Field Shift (also covers Hot Spots) |

## Recording checklist

**Window 1280 px (desktop, primary take):**

- [ ] Landing `/` — new promise visible ("Decide what to plant…") + CTAs.
- [ ] Welcome → one-tap example → Pergamino demo plot.
- [ ] Parcel fire/water badges with "where the data comes from".
- [ ] Agricultural calendar with bare-soil months.
- [ ] The 4 rotation cards + one card's five sections open.
- [ ] Validation card (Orin) + SIGA mention.
- [ ] Method slide (common grid + `series_global.png`).

**Window 390 px (phone, second take — proves the mobile flow):**

- [ ] Landing at 390 px, no horizontal scroll.
- [ ] Demo → parcels → badges → calendar in the mobile sheet.
- [ ] Rotation cards on mobile.

**Both:**

- [ ] Backend on `localhost:8000`, data on the public R2 base — real numbers only.
- [ ] No personal data on screen; the producer is fictional.
- [ ] Keep every number exactly as rendered — no post-editing of figures.
- [ ] App language: record the ES cut in Spanish UI; the EN cut can reuse ES footage or toggle EN.

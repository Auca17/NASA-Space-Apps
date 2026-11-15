# Video script — Ashfield (NASA Space Apps 2026)

Target: **~140 seconds**, for the jury — **Field Shift only**.
Arc: the producer and their question → one-tap example (the Mendoza farm) →
parcels with fire and water + the alert with the emergency call → priorities →
the calendar with vulnerable months → the four rotation cards (on a grain-zone
point — the demo farm's vines and olives don't rotate) → validation with its
honest limit → close.
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
| 2 | 0:12–0:28 | App welcome → one-tap example button | "One tap opens a fictional producer's farm in Mendoza — invented person, real location and satellite data. Five parcels, each with its crop, and the eight hazards ranked their own way." | Welcome → "Ver un ejemplo" → Mendoza demo farm → parcels screen (close the guided tour before recording) |
| 3 | 0:28–0:42 | Per-parcel result + alert | "Each parcel gets its fire and water percentages — and the reason behind every number. If fire climbs, the alert appears with emergency phones one tap away — the app never dials on its own." | Tap the fire and water badges on a parcel → "where the data comes from" → alert and emergency block |
| 4 | 0:42–0:55 | The priorities tab | "The producer ranks what worries them most — drought, frost, fire — and the analysis is rebuilt around their priorities, not ours." | Priorities tab → reorder the eight hazards |
| 5 | 0:55–1:08 | The plot's agricultural calendar | "The calendar marks planting, harvest and bare-soil months — the months the plot is left vulnerable, to drought and to fire." | Open the agricultural calendar → point at bare-soil months |
| 6 | 1:08–1:40 | "Analizar mi campo" → tap a point in the humid pampa → "Comparar rotaciones" → the four cards; expand one card's five sections | "The demo farm grows vines and olives — they don't rotate. On a point in the pampa, grain country, the same analysis does compare their current rotation against three alternatives. Every card answers the challenge's five questions: why, the evidence with its NASA source, benefits, what we don't know, and what to validate with an agronomist. Infiltration, erosion, water, pests, income and burns avoided — scored by their own priorities." | Field lens → tap a point in a grain zone → "Comparar rotaciones" → expand one card's five sections → scroll the other cards |
| 7 | 1:40–2:00 | Validation card + `docs/validation/orin/satelite_vs_estaciones.png` | "Can you trust it? We compared the satellite against 53 real stations in Mendoza and against 25 INTA rain gauges. In the mountains the satellite misses several degrees — the app says so — and correcting for real elevation cuts the error almost in half." | Validation card → honest-limits note |
| 8 | 2:00–2:20 | Close: the app on the plot + lockup | "Ashfield doesn't replace the agronomist — it gives the producer the right questions, with evidence. NASA data, translated into decisions." | Back to the plot → end card: Ashfield · NASA Space Apps 2026 · Field Shift |

## Recording checklist

**Window 1280 px (desktop, primary take):**

- [ ] Landing `/` — new promise visible ("Decide what to plant…") + CTAs.
- [ ] Welcome → one-tap example → Mendoza demo farm (guided tour closed before recording).
- [ ] Parcel fire/water badges with "where the data comes from".
- [ ] Fire alert with the emergency-phones block.
- [ ] Priorities tab with the eight rankable hazards.
- [ ] Agricultural calendar with bare-soil months.
- [ ] "Analizar mi campo" → grain-zone point → the 4 rotation cards + one card's five sections open.
- [ ] Validation card (Orin) + SIGA mention.

**Window 390 px (phone, second take — proves the mobile flow):**

- [ ] Landing at 390 px, no horizontal scroll.
- [ ] Demo → parcels → badges → calendar in the mobile sheet.
- [ ] Rotation cards on mobile.

**Both:**

- [ ] Backend on `localhost:8000`, data on the public R2 base — real numbers only.
- [ ] No personal data on screen; the producer is fictional.
- [ ] Keep every number exactly as rendered — no post-editing of figures.
- [ ] App language: record the ES cut in Spanish UI; the EN cut can reuse ES footage or toggle EN.

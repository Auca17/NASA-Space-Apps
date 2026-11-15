# Devin task 48 — "How is the season going at your plot": timeline chart

Branch: `git fetch; git checkout -B feat/timeline-ui origin/main`. You own a new `web/src/features/field/Timeline.tsx` (+ test), the timeline section of `FieldLens.tsx` and of the parcel result panel (new hunks only; another terminal is not editing those files now), `field.timeline*` i18n keys, and timeline classes in `web/src/styles/app.css`. Contract: `docs/briefs/devin/47-timeline-and-global-bare-soil.md` section 1 (a back-end terminal builds it now and pushes a fixture; fetch `origin/feat/timeline-bare-soil` to read it; until it merges use your own fixture with exactly that shape). Commit on the branch, push, never main. Do not stop servers on ports 8000, 5173, 5174.

## Build

1. `Timeline.tsx`: four small multiples over the last 24 months sharing one x axis: rain (bars against the monthly normal as a line), maximum temperature (line against normal, anomaly shaded), root-zone moisture (area against normal), and heat and frost days (small bars). Each panel title is plain Spanish ("Lluvia por mes", "Temperatura máxima", "Humedad del suelo en la raíz", "Días de calor y de helada") with the unit, a one-line reading ("Febrero: 62 % menos de lo normal"), the current partial month drawn with a dashed style and labelled "mes en curso", anomalies marked with a pattern plus color (never color alone). The `headline` sentence from the API leads the section. Hover or focus shows exact values; a visually hidden `<table>` carries the same data. Works at 390 px (panels stack, horizontal scroll never needed) and respects reduced motion and dark glass contrast (4.5:1).
2. Placement: in the parcel result, a "Cómo viene el año" block in the Resumen tab below the parcel rows (collapsed to the headline and one sparkline, expandable), full chart in "Más información"; in the legacy diagnosis, the same block under the cards. Each chart's `?` opens the glossary entry for anomaly.
3. Missing data: null months drawn as gaps with the note "sin datos suficientes", never zero. When `timeline` is absent (old back end) the block is hidden.
4. The glossary gets "anomalía respecto de lo normal" if it is missing (use the existing Glossary component; another terminal added 13 terms recently).

## Verification

Component tests (anomaly marking, partial month, nulls, hidden table, headline), `npm test`, tsc, lint, build, parity, `impeccable detect`, screenshots at 390 and 1280 px (`48-*`) against the real back end once it merges, or the fixture.

## Report

What changed, screenshots, tests, what is still on the fixture.

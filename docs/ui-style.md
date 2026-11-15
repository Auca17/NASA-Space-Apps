# UI style guide: map-first glass

Reference for the visual layer of the **app** (`web/src`, served at `/app` once the landing ships). It describes a direction, not a clone: the inspiration was an agriculture dashboard (satellite canvas, floating glass panels, one accent, big numbers). Our product is about fire risk and field rotations, and our users are not data experts, so meaning, density and wording change.

Stack: React 18, MapLibre GL (`features/globe/GlobeView.tsx`, `features/globe/baseStyle.ts`), Observable Plot, plain CSS tokens in `src/styles/app.css`. No new UI library.

---

## 0. Scope

| Surface | Governed by | What it takes from this guide |
|---|---|---|
| App (`/app`): globe, fire panels, live mode, field lens | **This guide** | Everything |
| Landing (`/`, `web/src/landing/`) | `PRODUCT.md` and `docs/briefs/devin/25-landing-page.md` (editorial, paper background, Persuade mode) | Only the brand tokens (section 2.1), the logo (section 3) and screenshots of the restyled app. **No glass panels, no dashboard look**: both documents list "dashboard screenshots with no explanation" and "a map used as pure decoration" as anti-references. |

---

## 1. Principles

1. **Plain first, data on demand.** Users are producers and neighbors, not analysts. Every screen answers one question in one sentence before showing any number (section 4).
2. **The map is the page.** Satellite imagery fills the viewport; UI floats on top.
3. **Detect → explain → recommend → confirm.** Every alert follows this loop: the lot is dry, why it matters in one sentence, what to do, and "Added to your plan". This loop matters more than the glass.
4. **One action color.** Risk colors are semantic (the traffic light). One more color means "you can act here".
5. **Honest by design.** Every number comes from real data (the build rejects synthetic data via `scripts/check-no-synthetic.mjs`). No button pretends to control equipment we do not control.
6. **Readable before pretty.** Contrast, color-blind safety and phone performance beat blur.

---

## 2. Tokens

Extend the existing tokens in `src/styles/app.css`. **Do not rename** the current ones (`--bg`, `--fg`, `--panel`, `--muted`, `--accent`, `--good`, `--warn`, `--bad`, `--focus`, `--bare`, `--covered`, `--radius`, `--touch`): the landing reuses them.

### 2.1 Brand (shared with the landing and the logo)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--logo-ember` | `#b3401e` | `#d4552d` | Fire, the brand mark |
| `--logo-ember-hot` | `#e0782f` | `#f0913f` | Sparks, fire highlights |
| `--logo-crop` | `#5d8a4e` | `#6f9e5f` | Field, crops, healthy vegetation |
| `--logo-stubble` | `#a8977a` | `#8f7f63` | Stubble, bare soil |
| ink / paper | `#1b1b18` / `#f7f5f0` | `#eceae3` / `#141412` | Text / background outside the map |

The `--logo-*` tokens arrive with the logo branch (section 3).

### 2.2 Glass layer (map views only)

Map views are always dark, whatever the page theme. Glass panels **redefine the base tokens locally** so every component inside them (including the logo stem, which uses `var(--fg)`) reads correctly on dark glass even when the page is in light mode.

```css
:root {
  --glass-bg: rgba(17, 18, 16, 0.74);        /* >= 0.70 keeps text legible over imagery */
  --glass-bg-strong: rgba(17, 18, 16, 0.88); /* popovers, sheets, phones */
  --glass-border: rgba(255, 255, 255, 0.09);
  --glass-highlight: rgba(255, 255, 255, 0.04);
  --glass-blur: 18px;

  /* Fire traffic light (semantic, never decorative) */
  --risk-normal: #8f9a8c;   /* "Normal" */
  --risk-above: #e3c14f;    /* "Más que lo normal" */
  --risk-high: #ec8a2f;     /* "Alto" */
  --risk-extreme: #e0453a;  /* "Muy alto" */

  /* The single action color: crop green tuned for dark glass */
  --act: #8cc06f;
  --act-fg: #10140e;

  --radius-panel: 22px; --radius-pill: 999px; --radius-chip: 8px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px;

  --fs-label: 0.8rem; --fs-body: 0.95rem; --fs-title: 1.15rem;
  --fs-sentence: 1.25rem;  /* the plain-language answer, section 4 */
  --fs-metric: 2.2rem; --fw-metric: 300;
}

.glass {
  /* local dark scope: components inside read light-on-dark */
  --fg: #eef0ea; --muted: #a3a99f; --panel: transparent; --border: var(--glass-border);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-panel);
  box-shadow: inset 0 1px 0 var(--glass-highlight), 0 12px 32px rgba(0, 0, 0, 0.35);
  color: var(--fg);
  padding: var(--space-5);
}
@supports (backdrop-filter: blur(1px)) {
  .glass { backdrop-filter: blur(var(--glass-blur)) saturate(1.2); }
}
@media (max-width: 640px), (prefers-reduced-transparency: reduce) {
  .glass { backdrop-filter: none; background: var(--glass-bg-strong); }
}
@media (prefers-reduced-motion: reduce) {
  .glass, .glass * { transition: none !important; animation: none !important; }
}
```

Rules:

- `--act` only for the primary action, the active layer and the highlighted bar. If everything is green, nothing is.
- Risk always = color + icon + word. Never color alone.
- Numbers use `font-variant-numeric: tabular-nums`.
- **Performance:** `backdrop-filter` over a moving MapLibre canvas recomputes every frame. At most **3 blurred panels** on screen, never on chips or list items, off on phones.

### 2.3 Type

One variable sans for everything, **self-hosted** (for example Inter or Geist as a local `woff2`, `font-display: swap`), no external font requests. Hero numbers light (300), titles medium (500), labels regular in `--muted`. If the landing picks a text face, the app uses the same one.

---

## 3. Logo (Ezequiel's `WindLogo`)

- **Where it is:** `web/src/components/WindLogo.tsx` (+ test, + `--logo-*` tokens and `.wind-logo` in `app.css`, + app name "Ashfield" in `config.ts` and `index.html`) on branch `origin/feature/logo` (commit `91f08a2`). **Not merged into main yet.** Static assets (lockups, mark, favicons, cover) are already on main in `web/public/brand/`.
- **Idle behavior:** the leaf and the flame sway gently and the flame flickers. **Wind** comes from scrolling any panel and from the mouse wheel (globe zoom): with a breeze the leaves lean; with a gust sparks fly and the green leaf burns from the base up; when the wind calms, the crop regrows. With `prefers-reduced-motion` there is no sway or particles, but the leaf still changes color.
- **Placement:** top-left of the floating top bar, 32 px, followed by the wordmark "Ashfield". On the welcome screen, 72-96 px above the main question. Use the static `ashfield-mark-*.svg` where animation would distract (detail cards, print, favicon).
- **Do not** restyle or recolor the mark, do not add a second animation around it, and keep its `role="img"` and `aria-label`.
- **Check on glass:** the stem is drawn with `var(--fg)`; inside `.glass` it becomes light thanks to the local scope in section 2.2. Verify it in both page themes.

---

## 4. Plain language: make it easy to digest

The audience does not read percentiles, NDVI or H3. Everything below is mandatory, not polish.

### 4.1 Three levels of detail

| Level | What the user sees | Example |
|---|---|---|
| 1. The answer (always visible) | One sentence in everyday words + the risk word | "Esta semana hay **más fuego que lo normal** cerca tuyo." |
| 2. The why (one tap) | Up to **3 numbers**, each compared to something | "340 focos (lo normal en noviembre: 120) · 21 días sin lluvia · suelo más seco que lo habitual" |
| 3. The evidence (on demand, "Ver detalle") | Charts, sources, technical names, method | Calendar, NDVI, percentile, data source, link to the method |

Level 1 must make sense alone. Level 3 is where data experts and the jury go.

### 4.2 Wording rules

- **Words before numbers.** Show "Alto", not "p87". Show "más seco que lo habitual", not "−9 pts".
- **Every number has a comparison:** "340 focos, casi el triple de lo normal". A bare number means nothing to a non-expert.
- **Translate jargon** and keep the technical term only at level 3 or in the glossary `?`:
  - NDVI → "verdor de la vegetación"
  - soil moisture anomaly → "humedad del suelo comparada con lo normal"
  - percentile → "comparado con los últimos 25 años"
  - harmonized detections → "focos (contados igual en todos los años)"
  - H3 cell → "zona"
- **Actions are verbs the user can do:** "Hacé un cortafuegos", "Bajá el pasto seco", "No quemes esta semana".
- **Max 4 numbers per card and 1 chart per card.** If more is needed, it goes to "Ver detalle".
- **Round:** 340, not 341.7; "3 de cada 10 años", not 31.4 %.
- **Empty states are sentences:** "Históricamente casi no hay fuego en este mes."
- Every text goes through `web/src/i18n` (Spanish with voseo, neutral English).

### 4.3 First visit

The welcome screen asks **one question**: "¿Dónde está tu campo o tu casa?" with two buttons (use my location / search a place) and a third, quieter link "Ver Argentina". No numbers, no charts on the first screen. The first thing after choosing a place is the level-1 sentence.

---

## 5. Base map treatment (the look of the photos)

The inspiration's mood comes from the imagery, not from the panels. Current base (`baseStyle.ts`): NASA GIBS Blue Marble up to zoom 8, **OpenStreetMap street tiles fade in from zoom 7.5**, and Sentinel-2 cloudless (`field-satellite`) is only visible in the field mode. So close up, the default look today is a street map, not a photo.

- **Proposal (needs team approval, it changes behavior):** on close zooms use `field-satellite` as the base in every map view, and keep OSM only as an optional "Calles" layer for finding roads. Producers find their lot by recognizing it from above; streets stay one tap away.
- Darken and slightly desaturate the raster layers so glass and labels read on top: MapLibre `raster-brightness-max` around `0.75`, `raster-saturation` around `-0.2`, `raster-contrast` around `0.1`. Tune until text on glass passes 4.5:1 over the brightest areas.
- Keep every attribution (GIBS, EOX/Copernicus, OpenStreetMap) visible; restyle the attribution control as a small glass pill, do not hide it.
- Our own labels (lots, fires) on top of everything.
- The real satellite crop of a lot (not stock) is the "dry field photo" in the detail card (6.3). If no crop is available, show the lot outline on the map and skip the photo, never a stock image.

---

## 6. Layout and components

### 6.1 Layout

Desktop (≥ 1024 px): floating top bar (logo + search + language + help), icon nav rail on the left, the level-1 answer card and the KPI tiles on the right, the fire calendar at the bottom, the layer switcher near the right edge of the map.

Phone (< 640 px): map full screen; content in a **bottom sheet** with three snap points: peek (the level-1 sentence and risk word only) / half (the 3 numbers) / full (everything). The nav rail becomes a bottom tab bar; detail cards open in the sheet.

### 6.2 Map labels, lots and fires

- Pin label: dot + pill `Lote 3 · Pastura` with a status dot in the risk color.
- Lot polygon: 2 px outline + 20 % fill in the risk color; after "Agregar al plan" it transitions (300 ms) to `--act` and reads `Lote 3 · En tu plan`.
- Fire detections: small dots in `--logo-ember-hot`, recent ones (< 24 h) pulse once, then stay still.
- Layer switcher: vertical pills with plain names, `Fuego` · `Humedad` · `Verdor` · `Riesgo 7 días`, one active (`--act`), built as a `radiogroup`.

### 6.3 Lot detail card (the core loop)

```
┌───────────────────────────────────┐
│ [real satellite crop of the lot]  │
│ ⚠ Alto                            │  risk word + icon + color
│ Tu lote está más seco que lo      │  level 1: one sentence
│ normal y hay fuego cerca.         │
│                                   │
│ 21 días sin lluvia                │  level 2: max 3 numbers,
│ 12 focos a menos de 50 km         │  each with a comparison
│ Pasto: más seco que lo habitual   │
│                                   │
│ Qué podés hacer                   │
│ ▸ Hacer un cortafuegos     [+]    │  verbs, each with a
│ ▸ Bajar el pasto seco      [+]    │  one-line "por qué"
│ ▸ No quemar esta semana    [+]    │  on tap
│ [ Agregar a mi plan ]             │  --act, full width
│ Ver detalle ›                     │  level 3
│ Esto no reemplaza a tu agrónomo ? │
└───────────────────────────────────┘
```

- The CTA says "Agregar a mi plan" / "Marcar como hecho", never "Regar" or anything that implies equipment control. Afterwards: `✓ En tu plan · 2 de 4 acciones`.
- Recommendation order for fire: firebreak, reduce dry grass (mowing or grazing), no burning this week; wetting only for small perimeters or irrigated lots. "Water the field" is not a credible fire measure.
- Every metric names its source at level 3 (`NASA POWER`, `SMAP`, `VIIRS`).

### 6.4 KPI tiles (2×2, level 2)

Label + icon, one number with its comparison, risk word chip, one simple micro-chart. Plain labels:

| Tile | Shows | Micro-chart |
|---|---|---|
| Fuego cerca tuyo | "340 focos · casi 3× lo normal" | last 30 days line |
| Cómo viene la temporada | "Alto" | half-ring gauge colored by band (no percentile number at this level) |
| Humedad del suelo | "Más seco que lo habitual" | line against a shaded "normal" band |
| Próximos 7 días | "Riesgo alto" | 7 dots, one per day |

Outside Argentina the fourth tile shows the sentence "El pronóstico de 7 días está disponible para Argentina" (decision Q7).

### 6.5 Fire calendar (July to June)

Pill bars with a **ghost track**: the faint full-height track is the worst year for that month, the solid bar is the normal (median), the current month is highlighted in its risk color with a pill tooltip `Nov · 340 focos (normal: 120)`. Title in plain words: "¿En qué meses hay más fuego acá?". Build with Observable Plot, reuse `components/Calendar.tsx`.

### 6.6 Other components

- **Composition rings:** concentric arcs for a share of total (land cover around the user, or a rotation's crop mix), total in the center, max 4 rings.
- **Plan progress:** segmented bar `Tu plan · 2 de 4`, filled with `--act`.
- **Activity feed:** initials avatar + one-line sentence + relative time: `Satélite · Fuego detectado a 12 km · hace 2 h`.
- **Scenario sliders (Field):** "¿Y si llueve 20 % menos?" / "¿Y si hace 1,5 °C más?", native `input[type=range]`, re-run the deterministic engine and animate the changed numbers.
- **Satellite vs. field card (Field):** title "¿Qué tan bien ve el satélite tu lote?", verdict sentence first ("El satélite marca heladas 1,8 °C más suaves que tus estaciones"), the error table and scatter at level 3.

---

## 7. Charts

- Axes and gridlines faint; no borders; one highlighted series, the rest neutral.
- Pill tooltips with `--glass-bg-strong`.
- The subtitle states the unit in plain words ("focos por mes, contados igual en todos los años").
- Missing data is a sentence, never a blank chart.

## 8. Motion

| What | How | Duration |
|---|---|---|
| Logo | idle sway + wind (section 3) | continuous, cheap |
| Numbers | count from the previous value, not from 0 on every refresh | 600 ms ease-out |
| Charts, first render | bars grow, lines draw | 500 ms |
| Polygon state | color transition | 300 ms |
| Card / sheet open | fade + 8 px rise | 200 ms |

All off under `prefers-reduced-motion: reduce` (the logo handles its own case).

## 9. Accessibility checklist

- Text on glass ≥ 4.5:1 over the brightest imagery (reuse `web/scripts/contrast.mjs`).
- Touch targets ≥ 44 px.
- Risk = color + icon + word.
- Icon-only buttons have `aria-label`; the layer switcher is a `radiogroup`; the bottom sheet traps focus and closes on `Esc`.
- The level-1 sentence and the KPI tiles convey everything the map shows (screen reader users never need the map).

## 10. Do / don't

| Do | Don't |
|---|---|
| One sentence first, numbers after | A wall of KPIs on the first screen |
| "Alto", "más seco que lo habitual" | "p87", "−9 pts", "NDVI 0.41" at level 1 |
| Real satellite crop of the lot | Stock photos of dry wheat |
| "Agregar a mi plan" | "Regar ahora" |
| Brand palette: ember, crop, stubble | Lime green or an all-orange UI |
| Blur on ≤ 3 panels, solid on phones | Blur on every chip |
| Glass in the app only | Glass or dashboard look on the landing |

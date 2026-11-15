/** Landing content: one typed file, both languages.
 *  Every number and status is verified against the repository and mapped
 *  in docs/landing/facts-sources.md. Status labels are word-first:
 *  "done" | "partial" | "not-included". */

export type Lang = "en" | "es";
export type Status = "done" | "partial" | "not-included";

export interface SeeLink { label: string; href: string; }

export interface ReqRow {
  id: string;
  requirement: string;
  does: string;
  status: Status;
  see?: SeeLink;
  limit?: string;
}

export interface ReqGroup { title: string; short: string; rows: ReqRow[]; }

export interface MetricRow { label: string; value: string; note?: string; }
export interface DataRow { name: string; what: string; resolution: string; where: string; }
export interface PendingRow { name: string; why: string; }
export interface TeamMember { name: string; role: string; }
export interface SiteLink { label: string; href: string; pending?: boolean; }

export interface BlockFigure {
  src: string; alt: string; width: number; height: number; caption: string;
}
export interface Block {
  heading: string;
  text: string;
  figure?: BlockFigure;
  stat?: { value: string; note: string };
}

export interface Landing {
  lang: Lang;
  otherLang: { label: string; href: string };
  skip: string;
  nav: { openApp: string };
  hero: {
    title: string;   // the one-sentence promise, rendered as h1
    lede: string;    // one supporting line
    openApp: string;
    example: { label: string; href: string };
    video?: string; // hidden until the video URL exists
    tagline: string;
    markAlt: string;
    shot: { src: string; alt: string; width: number; height: number; caption: string };
  };
  blocks: Block[];
  details: { summary: string; caption: string; scoreSep: string; statusSep: string };
  pendTag: string;
  problem: { heading: string; paragraphs: string[] };
  brief: {
    heading: string;
    intro: string;
    groups: ReqGroup[];
    statusLabel: Record<Status, string>;
    cols: { requirement: string; does: string; status: string; see: string; limit: string };
  };
  proof: {
    heading: string;
    lead: string;
    img: { src: string; alt: string; width: number; height: number; caption: string };
    metrics: MetricRow[];
    logNote: string;
    method: string;
  };
  trust: {
    heading: string;
    riskTitle: string;
    riskIntro: string;
    riskRows: { label: string; roc: string; pr: string; brier: string }[];
    riskCols: { label: string; roc: string; pr: string; brier: string };
    riskNote: string;
    orinTitle: string;
    orinText: string;
    orinImg: { src: string; alt: string; width: number; height: number; caption: string };
    orinHonest: string;
    rainText: string;
  };
  data: {
    heading: string;
    cols: { name: string; what: string; resolution: string; where: string };
    rows: DataRow[];
    pendingTitle: string;
    pending: PendingRow[];
  };
  human: {
    heading: string;
    paragraphs: string[];
    disclaimer: string;
  };
  limits: { heading: string; items: string[] };
  team: {
    heading: string;
    members: TeamMember[];
    linksTitle: string;
    links: SiteLink[];
    credits: string;
    orinNote: string;
  };
  footer: { note: string };
}

const REPO = "https://github.com/Auca17/NASA-Space-Apps";
const blob = (p: string) => `${REPO}/blob/main/${p}`;

const en: Landing = {
  lang: "en",
  otherLang: { label: "ES", href: "/es/" },
  skip: "Skip to content",
  nav: { openApp: "Open the app" },
  hero: {
    title: "Decide what to plant on your field with NASA data.",
    lede: "Draw your plot and compare your current rotation against alternatives — with a plain-language diagnosis of rain, soil, frost and fire risk behind every card.",
    openApp: "Open the app",
    example: { label: "See an example", href: "/app/#demo" },
    video: undefined, // [PENDIENTE: URL del video] — hidden until it exists
    tagline: "NASA Space Apps Challenge 2026 · Field Shift (also covers Harmonization of MODIS and VIIRS Hot Spots)",
    markAlt: "Ashfield mark",
    shot: {
      src: "/landing/app_diagnosis_en.webp",
      alt: "The Ashfield app analyzing a fictional farm in Mendoza: five parcels with their crops, each with per-parcel frost, drought and fire badges over real satellite imagery.",
      width: 1100, height: 688,
      caption: "The app: a fictional producer's farm in Mendoza — the parcels, names and economics are invented; the location and satellite data are real.",
    },
  },
  blocks: [
    {
      heading: "What your field gets",
      text: "Parcels with their own fire and water percentages — each with the reason for the number — an agricultural calendar marking vulnerable months, and rotation cards that explain why, evidence, benefits, gaps and risks.",
      stat: { value: "1 + 3", note: "your current rotation plus up to three alternatives, each with why, evidence, benefits, gaps and risks" },
    },
    {
      heading: "Fire as a plot risk",
      text: "The fire lens is the same engine seen from the territory: 25 years of MODIS and VIIRS harmonized onto one grid, the 7-day risk with its reasons, the burning months on your calendar and 'burns avoided' scored per rotation.",
      figure: {
        src: "/landing/app_fire_risk_en.webp",
        alt: "The Ashfield fire view over Corrientes in February 2022: harmonized detection hexagons on the map, a 7-day fire-risk card reading 'low' with its reasons, and the 30-day fire signal panel.",
        width: 1280, height: 800,
        caption: "The app, fire view: harmonized detections over Corrientes and the 7-day risk card with its reasons.",
      },
    },
    {
      heading: "Why trust it",
      text: "Built only on named NASA data — MODIS, VIIRS, POWER, GRACE-FO, SRTM. Temperature is checked against 53 real stations and rain against 25 INTA SIGA stations; the harmonized fire series is validated on data never used in calibration, and the lowest-confidence stretch is flagged in the app.",
      stat: { value: "R² 0.979", note: "harmonized global monthly series, validated on a 2023–2024 holdout" },
    },
  ],
  details: {
    summary: "How it meets the challenge brief",
    caption: "Every requirement of both challenges, the method, the validation numbers and the honest limits — nothing removed.",
    scoreSep: " · ", statusSep: " · ",
  },
  pendTag: "[PENDING]",
  problem: {
    heading: "The problem",
    paragraphs: [
      "A producer deciding next season's rotation faces climate stress with the relevant NASA data scattered across products, resolutions and portals. Soil, rain, frost, heat and water stress exist, but not in one place, and not at the scale of a plot.",
      "Fire adds to the decision — and the satellite record of it is split between sensors that cannot be compared directly: MODIS at 1 km since 2000, VIIRS at 375 m since 2012, with a second VIIRS instrument arriving in April 2018. Any long series built by simply joining them inherits artificial jumps exactly where the instruments change.",
      "The two problems meet in stubble burning. A rotation that keeps soil covered and spreads risk is also a field less likely to burn. Ashfield treats fire and field as one story, not two products.",
    ],
  },
  brief: {
    heading: "The challenge brief, point by point",
    intro: "Both challenges Ashfield was built against, requirement by requirement. Statuses are honest: partial means partial.",
    statusLabel: { done: "Done", partial: "Partial", "not-included": "Not included" },
    cols: { requirement: "Requirement", does: "What Ashfield does", status: "Status", see: "See it", limit: "Honest limit" },
    groups: [
      {
        title: "Field Shift: Adapting Farms with NASA Data",
        short: "Field Shift",
        rows: [
          { id: "F1", status: "done",
            requirement: "NASA Earth data: temperature, heat stress, precipitation, soil moisture, evaporation, frost, extremes, vegetation stress, long-term water availability",
            does: "Daily NASA POWER for temperature, rain, frost, heat-stress days and land evaporation (EVLAND; where POWER returns it masked, a FAO-56 Penman-Monteith / Hargreaves ET0 fallback); root-zone wetness (GWETROOT) for soil moisture; MODIS NDVI for vigor and bare-soil days; GRACE-FO for the long-term water trend.",
            see: { label: "Draw a plot", href: "/app/" },
            limit: "The SMAP 30-day anomaly was computed but failed quality gates, and ECOSTRESS surface temperature only covers the Orin demo plots. Crop-water Kc coefficients are generic FAO values pending local review." },
          { id: "F2", status: "done",
            requirement: "Include local conditions: soil, crop characteristics, producer priorities",
            does: "SoilGrids organic carbon and texture, a 15-crop catalog, parcels with a crop each, a ranked list of eight hazards (fire, drought, El Niño, frost, heat, snow, hail, flood), quick needs (water access, distance to emergency services, main worry), and optional costs, prices and estimated margins per parcel. El Niño is shown as a historical tendency — not a forecast — snow as days per year, and hail is honestly flagged 'no satellite data'.",
            see: { label: "Field form", href: "/app/" } },
          { id: "F3", status: "done",
            requirement: "Compare at least three rotation alternatives, including the current one",
            does: "Returns the current rotation plus up to three alternatives ranked against the producer's priorities.",
            see: { label: "Rotation cards", href: "/app/" } },
          { id: "F4", status: "done",
            requirement: "For each alternative: why it fits, evidence from Earth data, expected benefits, information gaps, risks",
            does: "Each rotation card carries all five sections, each item citing the indicators behind it. Each parcel shows its fire and water percentages with the reason for each number, any alerts, and the fire-risk, dry and bare-soil zones drawn on the map.",
            see: { label: "Rotation cards", href: "/app/" } },
          { id: "F5", status: "partial",
            requirement: "Show bare-soil periods and seasons when soil or plants are vulnerable",
            does: "An agricultural calendar marks planting, harvest and bare-soil months; a card reports bare-soil days per year from monthly MODIS NDVI.",
            limit: "The bare-soil card comes from a precomputed layer that covers Argentina only; elsewhere the card says there is no data.",
            see: { label: "Field diagnosis", href: "/app/" } },
          { id: "F6", status: "done",
            requirement: "Indicate how each alternative affects pest cycles, water use, soil infiltration and extra income",
            does: "Indicators per alternative: an explicit soil-infiltration score (USDA hydrologic groups from SoilGrids texture, organic matter, slope and bare-soil days — shown per parcel and per alternative), erosion risk (bare-soil days × heavy-rain days × slope), pest break (distinct families in the cycle), income bucket, burns avoided, water need.",
            limit: "Indicators are relative and qualitative — they rank alternatives, they do not predict yields." },
          { id: "F7", status: "partial",
            requirement: "Use AI to detect patterns, communicate uncertainty, combine heterogeneous datasets",
            does: "Analog-zone detection finds departments with similar climates; every result carries a confidence level; an AI summary (Gemini) writes the plain-language explanation with strict output validation and a deterministic template fallback.",
            limit: "The AI provider only runs when a server-side key is configured; templates ship by default. Patagonia returns 'no validated rotations' rather than a weak guess." },
          { id: "F8", status: "partial",
            requirement: "Harmonize datasets with different resolutions and time scales into a common grid",
            does: "Everything is projected onto the same H3 hexagonal grid (fires, climate, soil, NDVI), so unlike sources can be compared cell by cell.",
            limit: "Fire data are on the grid worldwide; the climate, soil, NDVI and rain layers are precomputed for Argentina only, and the on-demand diagnosis elsewhere uses point data.",
            see: { label: "Data contract", href: blob("docs/data-contract.md") } },
          { id: "F9", status: "done",
            requirement: "Explain technical terms (evapotranspiration, NDVI, anomalies, frost thresholds, water balance)",
            does: "A glossary inside the app defines each term in plain language, in the user's language.",
            see: { label: "In the app", href: "/app/" } },
          { id: "F10", status: "partial",
            requirement: "Validate satellite estimates against field measurement",
            does: "POWER temperature against 53 real stations on the Orin farm (742 station-days); monthly rain from IMERG and POWER against 25 INTA SIGA stations (1,346 station-months, 2015–2024).",
            limit: "Temperature at one farm over fourteen days; rain at 25 stations, monthly sums — both products read ~+22 mm/month wet, concentrated in arid Mendoza (point gauge vs pixel average). Still no field samples for NDVI or soil moisture." },
          { id: "F11", status: "done",
            requirement: "Optional: let the producer explore climate scenarios (rain, temperature)",
            does: "Sliders re-run the diagnosis with rain −40 %…+40 % and temperature −2…+4 °C.",
            limit: "Scalings of the historical series, not forecasts." },
          { id: "F12", status: "done",
            requirement: "Optional: consider producer constraints (water, machinery, market)",
            does: "The form asks for irrigation, livestock, machinery and reachable markets; crops that don't fit are excluded before ranking." },
          { id: "F13", status: "done",
            requirement: "Support the producer's informed decision, never replace it",
            does: "The disclaimer ships with every diagnosis; information gaps are a required section on each rotation card." },
        ],
      },
      {
        title: "Harmonization of MODIS and VIIRS Hot Spots",
        short: "MODIS & VIIRS Hot Spots",
        rows: [
          { id: "H1", status: "done",
            requirement: "Harmonize MODIS and VIIRS into one comparable historical series",
            does: "Both sensors are converted into one unit, equivalent VIIRS NOAA-20 detections, with per-stratum calibration. Validated on a 2023–2024 holdout: R² 0.979 on the global monthly series.",
            see: { label: "Method", href: blob("docs/metodo-fuego.md") } },
          { id: "H2", status: "done",
            requirement: "Web app to select a region and time range and explore the harmonized data",
            does: "A 3D globe shows the monthly harmonized layer worldwide; the area panel opens the local history for any point.",
            see: { label: "Open the globe", href: "/app/" } },
          { id: "H3", status: "done",
            requirement: "Calendar of activity since 2000",
            does: "A year-by-month calendar of detections for the selected area, colored by count or anomaly.",
            see: { label: "Area panel", href: "/app/" } },
          { id: "H4", status: "done",
            requirement: "Compare the current month against the historical median",
            does: "A semaphore marks the current month low / normal / high against that month's median for the area." },
          { id: "H5", status: "done",
            requirement: "Show absolute counts and anomalies against multi-year averages",
            does: "A toggle switches the calendar between counts and anomalies against the 2003–2022 baseline." },
          { id: "H6", status: "done",
            requirement: "Accessible color scales",
            does: "Viridis for counts, red-blue diverging for anomalies; the palette is audited for WCAG contrast (web/scripts/contrast.mjs)." },
          { id: "H7", status: "done",
            requirement: "Download detections as CSV",
            does: "The area panel exports the monthly series and the detections list as CSV." },
        ],
      },
    ],
  },
  proof: {
    heading: "Proof the harmonization works",
    lead: "Joined naively, MODIS and VIIRS show jumps at 2012 and April 2018. After calibrating each of the strata (latitude band by calendar month), the series reads as one instrument.",
    img: {
      src: "/landing/series_global.webp",
      alt: "Global monthly fire detections 2000–2025: raw MODIS and VIIRS series before harmonization, and the harmonized series continuing through both sensor changes without a jump.",
      width: 1650, height: 630,
      caption: "Global monthly detections before and after harmonization. Source: docs/validation/series_global.png.",
    },
    metrics: [
      { label: "Global monthly series (holdout 2023–24)", value: "R² 0.979" },
      { label: "Per res-3 cell-month, linear", value: "R² 0.926" },
      { label: "Per res-3 cell-month, log1p", value: "R² 0.654" },
      { label: "Total bias (global monthly)", value: "−0.8 %" },
      { label: "Cell-day scale", value: "R² 0.61 · bias +1.4 %" },
    ],
    logNote: "The log1p number is lower by design: logarithmic space gives small values the same weight as large ones, so error on low-activity cells counts as much as error on the big fire provinces.",
    method: "Calibration is fit per stratum: 18 latitude bands crossed with the 12 calendar months, 208 strata with data; the 71 strata without enough overlap fall back to global coefficients. Validation is a 2023–2024 holdout never seen in training.",
  },
  trust: {
    heading: "How much to trust it",
    riskTitle: "7-day fire risk vs. baselines",
    riskIntro: "The risk layer is not just 'fires happened here before'. A LightGBM model trained on Argentina is measured against two baselines on the same 2023–2025 holdout:",
    riskCols: { label: "Model", roc: "ROC-AUC", pr: "PR-AUC", brier: "Brier" },
    riskRows: [
      { label: "LightGBM (Platt-calibrated)", roc: "0.920", pr: "0.427", brier: "0.0302" },
      { label: "Weekly climatology", roc: "0.843", pr: "0.295", brier: "0.0350" },
      { label: "Recent persistence", roc: "0.852", pr: "0.310", brier: "0.0452" },
    ],
    riskNote: "Outside Argentina the risk layer falls back to climatology plus persistence; no ML is claimed there. Source: model/fire_risk/report.md.",
    orinTitle: "Satellite vs. field measurement",
    orinText: "Against 53 real stations on the Orin farm in Mendoza (742 station-days, 4–20 Oct 2026), raw POWER maximum temperature read RMSE 5.05 °C with a −2.82 °C cold bias. The cause is elevation: the 0.5° POWER cell averages around 2,485 m while the stations sit at 1,000–1,500 m. Applying a −6.5 °C/km correction, maximum-temperature RMSE drops to 2.82 °C (minimum: 3.89 → 2.28 °C).",
    orinImg: {
      src: "/landing/orin_sat_vs_field.webp",
      alt: "Station-measured versus NASA POWER daily maximum and minimum temperature across 53 farm stations, before and after the elevation correction tightens the fit.",
      width: 1500, height: 720,
      caption: "POWER vs. 53 Orin stations, raw and elevation-corrected. Source: docs/validation/orin/satelite_vs_estaciones.png.",
    },
    orinHonest: "Honest gap: no field samples for NDVI or soil moisture yet.",
    rainText: "Rain is validated too — monthly IMERG and POWER against 25 INTA SIGA automatic stations (1,346 station-months, 2015–2024): IMERG bias +22.1 mm/month, RMSE 51.2, r 0.59; POWER bias +22.4, RMSE 49.4, r 0.62. The wet bias concentrates in arid Mendoza, where a pixel averages mountain rain a valley-floor gauge never sees — a point-vs-pixel effect, not a broken product. Source: docs/validation/rain-siga/.",
  },
  data: {
    heading: "Data used, and not used",
    cols: { name: "Dataset", what: "What it gives", resolution: "Resolution", where: "Where it appears" },
    rows: [
      { name: "FIRMS MODIS + VIIRS", what: "Harmonized active-fire series", resolution: "1 km / 375 m", where: "Globe and fire panel" },
      { name: "NASA POWER", what: "Daily weather for diagnosis and the risk model", resolution: "0.5°", where: "Field diagnosis, risk" },
      { name: "GPM IMERG", what: "Monthly rain in the Argentina field grid", resolution: "0.1° monthly", where: "Rain card (precomputed)" },
      { name: "GRACE-FO", what: "Long-term groundwater trend", resolution: "regional", where: "Water-trend card" },
      { name: "MODIS NDVI (MOD13C2; MOD13Q1 on demand)", what: "Months without live crop", resolution: "0.05° monthly / 250 m", where: "Vigor / bare-soil card" },
      { name: "MODIS MCD12Q1", what: "Land cover", resolution: "500 m", where: "Diagnosis context" },
      { name: "SRTM", what: "Mean plot slope", resolution: "~30 m", where: "Slope card" },
      { name: "SoilGrids", what: "Soil organic carbon and texture", resolution: "250 m", where: "Soil card" },
      { name: "NASA GIBS", what: "Base map imagery", resolution: "up to 250 m", where: "Basemap" },
      { name: "MAGyP", what: "Agricultural estimates for analog zones", resolution: "department", where: "Rotation evidence" },
      { name: "ECOSTRESS (ECO_L2T_LSTE)", what: "Land-surface temperature", resolution: "70 m", where: "Demo tile on Orin plots only" },
      { name: "Orin field data", what: "Satellite vs field-measurement validation", resolution: "plot", where: "Validation card (real data only)" },
    ],
    pendingTitle: "Pending or rejected, and why",
    pending: [
      { name: "FAO GAEZ", why: "License requires a manual step." },
      { name: "SMAP moisture anomaly", why: "Computed (SPL3SMP_E, 9 km) but failed sanity gates: no positive relation to recent POWER rain. The card falls back to POWER GWETROOT." },
    ],
  },
  human: {
    heading: "Human in the loop",
    paragraphs: [
      "The agronomic knowledge base (15 crops, 12 rotation templates, 6 prevention measures) is compiled from published sources and written down in the repository (back/knowledge/) so an agronomist can review it file by file.",
      "It remains a draft awaiting that review. Where the engine has no validated rotations (Patagonia today), it says so and returns low confidence instead of guessing.",
    ],
    disclaimer: "Ashfield supports a producer's decision. It does not replace an agronomist.",
  },
  limits: {
    heading: "Limits",
    items: [
      "2000–2011 is the lowest-confidence part of the fire series (single-sensor era, calibrated on short overlap); Terra's safe-mode gap in June–July 2001 is real, not a processing error.",
      "Fire harmonization calibrates by latitude band and month only; it does not model local differences inside a band.",
      "The precomputed field grid covers Argentina only; on-demand diagnosis works worldwide with point data, but without the local layers.",
      "The Argentina risk model's 365-day fire history is incomplete for January–October 2026 until the annual Parquet lands.",
      "The POWER mountain-cell elevation bias is corrected in the field diagnosis but not in the risk-model features.",
      "Climate scenarios are scalings of the historical series, not forecasts.",
      "ECOSTRESS covers only the Orin demo plots; GAEZ is pending; the SMAP anomaly was rejected by quality gates.",
    ],
  },
  team: {
    heading: "Team and links",
    members: [
      { name: "Ezequiel", role: "fire data and pipeline, deployment" },
      { name: "Augustus", role: "field lens, integrator and AI-agent operations" },
      { name: "Ariel (Chucky)", role: "front end" },
      { name: "Alex", role: "front end and presentation" },
    ],
    linksTitle: "Links",
    links: [
      { label: "Repository", href: REPO },
      { label: "README", href: blob("README.md") },
      { label: "Data contract", href: blob("docs/data-contract.md") },
      { label: "Harmonized dataset download", href: "#", pending: true }, // [PENDIENTE: URL de descarga]
    ],
    credits: "NASA data: FIRMS (MODIS, VIIRS), POWER, GIBS, GRACE-FO, MODIS (MOD13C2, MCD12Q1), ECOSTRESS. Also SoilGrids, MAGyP (Argentina), IGN and Natural Earth base data.",
    orinNote: "Orin field data was collected before the hackathon; only the data, not the code, is used.",
  },
  footer: { note: "Ashfield · NASA Space Apps Challenge 2026" },
};

const es: Landing = {
  lang: "es",
  otherLang: { label: "EN", href: "/" },
  skip: "Saltar al contenido",
  nav: { openApp: "Abrir la app" },
  hero: {
    title: "Decidí qué sembrar en tu lote con datos de la NASA.",
    lede: "Dibujá tu parcela y compará tu rotación actual con alternativas — con un diagnóstico en palabras simples de lluvia, suelo, heladas y riesgo de fuego detrás de cada tarjeta.",
    openApp: "Abrir la app",
    example: { label: "Ver un ejemplo", href: "/app/#demo" },
    video: undefined, // [PENDIENTE: URL del video] — oculto hasta que exista
    tagline: "NASA Space Apps Challenge 2026 · Field Shift (también cubre Armonización de focos MODIS y VIIRS)",
    markAlt: "Marca Ashfield",
    shot: {
      src: "/landing/app_diagnosis.webp",
      alt: "La app Ashfield analizando una finca ficticia en Mendoza: cinco parcelas con su cultivo, cada una con indicadores de helada, sequía y fuego sobre imagen satelital real.",
      width: 1100, height: 688,
      caption: "La app: la finca de un productor de ejemplo en Mendoza — parcelas, nombres y números económicos inventados; la ubicación y los datos satelitales son reales.",
    },
  },
  blocks: [
    {
      heading: "Lo que obtenés para tu lote",
      text: "Parcelas con su porcentaje de fuego y de agua — cada uno con el motivo del número —, un calendario agrícola que marca los meses vulnerables y tarjetas de rotación que explican por qué, evidencia, beneficios, vacíos y riesgos.",
      stat: { value: "1 + 3", note: "tu rotación actual más hasta tres alternativas, cada una con por qué, evidencia, beneficios, vacíos y riesgos" },
    },
    {
      heading: "El fuego como riesgo del lote",
      text: "La lente de fuego es el mismo motor visto desde el territorio: 25 años de MODIS y VIIRS armonizados en una sola grilla, el riesgo a 7 días con sus razones, los meses de quema en tu calendario y las «quemas evitadas» puntuadas por rotación.",
      figure: {
        src: "/landing/app_fire_risk.webp",
        alt: "La vista de fuego de Ashfield sobre Corrientes en febrero de 2022: hexágonos de detecciones armonizadas en el mapa, la tarjeta de riesgo a 7 días marcando «bajo» con sus razones y el panel de señal de fuego a 30 días.",
        width: 1280, height: 800,
        caption: "La app, vista fuego: detecciones armonizadas sobre Corrientes y la tarjeta de riesgo a 7 días con sus razones.",
      },
    },
    {
      heading: "Por qué confiar",
      text: "Construida solo sobre datos NASA nombrados — MODIS, VIIRS, POWER, GRACE-FO, SRTM. La temperatura se contrasta con 53 estaciones reales y la lluvia con 25 estaciones INTA SIGA; la serie de fuego armonizada se valida contra datos que la calibración nunca vio, y el tramo de menor confianza está señalado en la app.",
      stat: { value: "R² 0,979", note: "serie mensual global armonizada, validada en un holdout 2023–2024" },
    },
  ],
  details: {
    summary: "Cómo cumple el desafío",
    caption: "Cada requisito de los dos desafíos, el método, los números de validación y los límites honestos — nada se quitó.",
    scoreSep: " · ", statusSep: " · ",
  },
  pendTag: "[PENDIENTE]",
  problem: {
    heading: "El problema",
    paragraphs: [
      "Un productor que decide la rotación de la próxima campaña enfrenta el estrés climático con los datos de la NASA dispersos entre productos, resoluciones y portales. Suelo, lluvia, heladas, calor y estrés hídrico existen — pero no en un solo lugar ni a escala de lote.",
      "El fuego se suma a la decisión — y su registro satelital está partido entre sensores que no se pueden comparar directo: MODIS a 1 km desde 2000, VIIRS a 375 m desde 2012, y un segundo VIIRS que llegó en abril de 2018. Toda serie que simplemente los une hereda saltos artificiales justo donde cambia el instrumento.",
      "Los dos problemas se cruzan en la quema de rastrojo. Una rotación que mantiene el suelo cubierto y reparte el riesgo también es un campo que arde menos. Ashfield cuenta fuego y campo como una sola historia.",
    ],
  },
  brief: {
    heading: "El brief del desafío, punto por punto",
    intro: "Los dos desafíos para los que se construyó Ashfield, requisito por requisito. Los estados son honestos: parcial es parcial.",
    statusLabel: { done: "Hecho", partial: "Parcial", "not-included": "No incluido" },
    cols: { requirement: "Requisito", does: "Qué hace Ashfield", status: "Estado", see: "Dónde verlo", limit: "Límite honesto" },
    groups: [
      {
        title: "Field Shift: Adapting Farms with NASA Data",
        short: "Field Shift",
        rows: [
          { id: "F1", status: "done",
            requirement: "Datos NASA: temperatura, estrés por calor, precipitación, humedad del suelo, evaporación, heladas, extremos, estrés de la vegetación, agua a largo plazo",
            does: "NASA POWER diario para temperatura, lluvia, heladas, días de estrés por calor y evaporación del suelo (EVLAND; donde POWER la devuelve enmascarada, un respaldo ET0 FAO-56 Penman-Monteith / Hargreaves); humedad en raíz (GWETROOT) para el suelo; NDVI de MODIS para vigor y suelo desnudo; GRACE-FO para la tendencia del agua.",
            see: { label: "Dibujar un lote", href: "/app/" },
            limit: "La anomalía SMAP a 30 días se calculó pero no superó los controles de calidad, y la temperatura ECOSTRESS solo cubre los lotes demo de Orin. Los coeficientes Kc de agua de cultivo son valores FAO genéricos pendientes de revisión local." },
          { id: "F2", status: "done",
            requirement: "Incluir condiciones locales: suelo, características del cultivo, prioridades del productor",
            does: "Carbono orgánico y textura de SoilGrids, catálogo de 15 cultivos, parcelas con su cultivo, una lista ordenable de ocho riesgos (fuego, sequía, El Niño, heladas, calor, nevadas, granizo, inundación), necesidades rápidas (acceso al agua, distancia a emergencias, preocupación principal) y costos, precios y márgenes estimados por parcela. El Niño se muestra como tendencia histórica —no pronóstico—, la nieve como días por año, y el granizo se marca honestamente «sin dato satelital».",
            see: { label: "Formulario de campo", href: "/app/" } },
          { id: "F3", status: "done",
            requirement: "Comparar al menos tres rotaciones alternativas, incluida la actual",
            does: "Devuelve la rotación actual más hasta tres alternativas ordenadas según las prioridades del productor.",
            see: { label: "Tarjetas de rotación", href: "/app/" } },
          { id: "F4", status: "done",
            requirement: "Para cada alternativa: por qué encaja, evidencia de datos de la Tierra, beneficios esperados, vacíos de información, riesgos",
            does: "Cada tarjeta de rotación lleva las cinco secciones, y cada ítem cita los indicadores detrás. Cada parcela muestra sus porcentajes de fuego y agua con el motivo de cada número, sus alertas, y las zonas de riesgo de fuego, suelo seco y suelo desnudo dibujadas en el mapa.",
            see: { label: "Tarjetas de rotación", href: "/app/" } },
          { id: "F5", status: "partial",
            requirement: "Mostrar períodos de suelo desnudo y estaciones vulnerables",
            does: "Un calendario agrícola marca siembra, cosecha y meses de suelo desnudo; una tarjeta informa los días de suelo desnudo por año desde el NDVI mensual de MODIS.",
            limit: "La tarjeta de suelo desnudo sale de una capa precalculada que cubre solo Argentina; en otros países la tarjeta indica que no hay dato.",
            see: { label: "Diagnóstico del lote", href: "/app/" } },
          { id: "F6", status: "done",
            requirement: "Indicar cómo cada alternativa afecta plagas, uso de agua, infiltración e ingreso extra",
            does: "Indicadores por alternativa: un puntaje explícito de infiltración del suelo (grupos hidrológicos USDA desde textura de SoilGrids, materia orgánica, pendiente y días de suelo desnudo — por parcela y por alternativa), riesgo de erosión (días de suelo desnudo × lluvias intensas × pendiente), corte de plagas (familias distintas en el ciclo), franja de ingreso, quemas evitadas, necesidad de agua.",
            limit: "Los indicadores son relativos y cualitativos — ordenan alternativas, no predicen rindes." },
          { id: "F7", status: "partial",
            requirement: "Usar IA para detectar patrones, comunicar incertidumbre, combinar datasets heterogéneos",
            does: "Las zonas análogas encuentran departamentos con clima similar; cada resultado lleva un nivel de confianza; un resumen con IA (Gemini) redacta la explicación en lenguaje simple con validación estricta de salida y respaldo en plantillas deterministas.",
            limit: "El proveedor de IA solo corre si hay una clave configurada en el servidor; las plantillas son el comportamiento por defecto. Patagonia devuelve «sin rotaciones validadas» en vez de adivinar." },
          { id: "F8", status: "partial",
            requirement: "Armonizar datasets con resoluciones y escalas temporales distintas en una grilla común",
            does: "Todo se proyecta sobre la misma grilla hexagonal H3 — fuegos, clima, suelo, NDVI — para comparar fuentes distintas celda por celda.",
            limit: "Los datos de fuego están en la grilla en todo el mundo; las capas de clima, suelo, NDVI y lluvia están precalculadas solo para Argentina, y fuera de ahí el diagnóstico usa datos de punto.",
            see: { label: "Contrato de datos", href: blob("docs/data-contract.md") } },
          { id: "F9", status: "done",
            requirement: "Explicar términos técnicos (evapotranspiración, NDVI, anomalías, umbrales de helada, balance hídrico)",
            does: "Un glosario dentro de la app define cada término en lenguaje simple, en el idioma del usuario.",
            see: { label: "En la app", href: "/app/" } },
          { id: "F10", status: "partial",
            requirement: "Validar las estimaciones satelitales contra medición en campo",
            does: "Temperatura de POWER contra 53 estaciones reales de la finca Orin (742 estación-días); lluvia mensual de IMERG y POWER contra 25 estaciones automáticas INTA SIGA (1.346 estación-meses, 2015–2024).",
            limit: "Temperatura en una finca durante catorce días; lluvia en 25 estaciones, sumas mensuales — ambos productos marcan ~+22 mm/mes de más, concentrado en la Mendoza árida (pluviómetro puntual vs promedio de píxel). Todavía sin muestras de campo de NDVI ni humedad del suelo." },
          { id: "F11", status: "done",
            requirement: "Opcional: permitir explorar escenarios climáticos (lluvia, temperatura)",
            does: "Deslizadores recalculan el diagnóstico con lluvia −40 %…+40 % y temperatura −2…+4 °C.",
            limit: "Son reescalados de la serie histórica, no pronósticos." },
          { id: "F12", status: "done",
            requirement: "Opcional: considerar restricciones del productor (agua, maquinaria, mercado)",
            does: "El formulario pregunta por riego, ganadería, maquinaria y mercados alcanzables; los cultivos que no encajan se excluyen antes del ranking." },
          { id: "F13", status: "done",
            requirement: "Apoyar — nunca reemplazar — la decisión informada del productor",
            does: "La aclaración va con cada diagnóstico; los vacíos de información son una sección obligatoria de cada tarjeta." },
        ],
      },
      {
        title: "Armonización de focos de calor MODIS y VIIRS",
        short: "Focos MODIS y VIIRS",
        rows: [
          { id: "H1", status: "done",
            requirement: "Armonizar MODIS y VIIRS en una serie histórica comparable",
            does: "Los dos sensores se convierten a una sola unidad — detecciones equivalentes a VIIRS NOAA-20 — con calibración por estrato. Validado en un holdout 2023–2024: R² 0,979 en la serie mensual global.",
            see: { label: "Método", href: blob("docs/metodo-fuego.md") } },
          { id: "H2", status: "done",
            requirement: "Aplicación web para seleccionar región y rango temporal y explorar los datos armonizados",
            does: "Un globo 3D muestra la capa mensual armonizada en todo el mundo; el panel de área abre la historia local de cualquier punto.",
            see: { label: "Abrir el globo", href: "/app/" } },
          { id: "H3", status: "done",
            requirement: "Calendario de actividad desde 2000",
            does: "Un calendario año × mes de detecciones para el área elegida, coloreado por cantidad o anomalía.",
            see: { label: "Panel de área", href: "/app/" } },
          { id: "H4", status: "done",
            requirement: "Comparar el mes actual con la mediana histórica",
            does: "Un semáforo marca el mes actual como bajo / normal / alto contra la mediana de ese mes en el área." },
          { id: "H5", status: "done",
            requirement: "Mostrar cantidades y anomalías frente a promedios plurianuales",
            does: "Un conmutador alterna el calendario entre cantidades y anomalías contra la base 2003–2022." },
          { id: "H6", status: "done",
            requirement: "Paletas de colores accesibles",
            does: "Viridis para cantidades, divergente rojo-azul para anomalías; la paleta se audita contra contraste WCAG (web/scripts/contrast.mjs)." },
          { id: "H7", status: "done",
            requirement: "Descarga de detecciones a CSV",
            does: "El panel de área exporta la serie mensual y el listado de detecciones como CSV." },
        ],
      },
    ],
  },
  proof: {
    heading: "Prueba de que la armonización funciona",
    lead: "Unidos sin más, MODIS y VIIRS muestran saltos en 2012 y abril de 2018. Después de calibrar cada estrato — banda de latitud por mes del calendario — la serie se lee como un solo instrumento.",
    img: {
      src: "/landing/series_global.webp",
      alt: "Detecciones globales mensuales de focos 2000–2025: series crudas de MODIS y VIIRS antes de armonizar, y la serie armonizada que cruza los dos cambios de sensor sin salto.",
      width: 1200, height: 675,
      caption: "Detecciones mensuales globales antes y después de armonizar. Fuente: docs/validation/series_global.png.",
    },
    metrics: [
      { label: "Serie mensual global (holdout 2023–24)", value: "R² 0,979" },
      { label: "Por celda res-3 × mes, lineal", value: "R² 0,926" },
      { label: "Por celda res-3 × mes, log1p", value: "R² 0,654" },
      { label: "Sesgo total (mensual global)", value: "−0,8 %" },
      { label: "Escala celda-día", value: "R² 0,61 · sesgo +1,4 %" },
    ],
    logNote: "El número log1p es más bajo por diseño: en escala logarítmica los valores chicos pesan igual que los grandes, así que el error en celdas de poca actividad cuenta tanto como el de las provincias de mucho fuego.",
    method: "La calibración se ajusta por estrato — 18 bandas de latitud cruzadas con los 12 meses del año, 208 estratos con datos; los 71 sin solape suficiente caen a coeficientes globales. La validación es un holdout 2023–2024 nunca visto en el ajuste.",
  },
  trust: {
    heading: "Cuánto confiar",
    riskTitle: "Riesgo de fuego a 7 días vs. baselines",
    riskIntro: "La capa de riesgo no es solo «acá hubo fuego antes». Un modelo LightGBM entrenado para Argentina se mide contra dos baselines en el mismo holdout 2023–2025:",
    riskCols: { label: "Modelo", roc: "ROC-AUC", pr: "PR-AUC", brier: "Brier" },
    riskRows: [
      { label: "LightGBM (calibrado Platt)", roc: "0,920", pr: "0,427", brier: "0,0302" },
      { label: "Climatología semanal", roc: "0,843", pr: "0,295", brier: "0,0350" },
      { label: "Persistencia reciente", roc: "0,852", pr: "0,310", brier: "0,0452" },
    ],
    riskNote: "Fuera de Argentina la capa de riesgo cae a climatología más persistencia — ahí no se afirma ML. Fuente: model/fire_risk/report.md.",
    orinTitle: "Satélite vs. medición en campo",
    orinText: "Contra 53 estaciones reales de la finca Orin en Mendoza (742 estación-días, 4–20 oct 2026), la temperatura máxima cruda de POWER marcó RMSE 5,05 °C con un sesgo frío de −2,82 °C. La causa es la altitud: la celda POWER de 0,5° promedia cerca de 2.485 m mientras las estaciones están entre 1.000 y 1.500 m. Con una corrección de −6,5 °C/km, el RMSE de la máxima baja a 2,82 °C (mínima: 3,89 → 2,28 °C).",
    orinImg: {
      src: "/landing/orin_sat_vs_field.webp",
      alt: "Temperatura máxima y mínima diaria medida en estación versus NASA POWER en 53 estaciones de la finca, antes y después de que la corrección por altitud ajuste la relación.",
      width: 1500, height: 720,
      caption: "POWER vs. 53 estaciones Orin, crudo y corregido por altitud. Fuente: docs/validation/orin/satelite_vs_estaciones.png.",
    },
    orinHonest: "Brecha honesta: todavía no hay muestras de campo de NDVI ni de humedad del suelo.",
    rainText: "La lluvia también está validada — IMERG y POWER mensuales contra 25 estaciones automáticas INTA SIGA (1.346 estación-meses, 2015–2024): IMERG sesgo +22,1 mm/mes, RMSE 51,2, r 0,59; POWER sesgo +22,4, RMSE 49,4, r 0,62. El exceso se concentra en la Mendoza árida, donde el píxel promedia lluvia de montaña que el pluviómetro del valle no ve — efecto punto vs píxel, no un producto roto. Fuente: docs/validation/rain-siga/.",
  },
  data: {
    heading: "Datos usados — y no usados",
    cols: { name: "Dataset", what: "Qué aporta", resolution: "Resolución", where: "Dónde aparece" },
    rows: [
      { name: "FIRMS MODIS + VIIRS", what: "Serie de focos de calor armonizada", resolution: "1 km / 375 m", where: "Globo y panel de focos" },
      { name: "NASA POWER", what: "Clima diario para el diagnóstico y el modelo de riesgo", resolution: "0,5°", where: "Diagnóstico del lote, riesgo" },
      { name: "GPM IMERG", what: "Lluvia mensual de la grilla de campo argentina", resolution: "0,1° mensual", where: "Tarjeta de lluvia (precalculada)" },
      { name: "GRACE-FO", what: "Tendencia del agua subterránea a largo plazo", resolution: "regional", where: "Tarjeta de tendencia del agua" },
      { name: "NDVI MODIS (MOD13C2; MOD13Q1 a pedido)", what: "Meses sin cultivo vivo", resolution: "0,05° mensual / 250 m", where: "Tarjeta de vigor y suelo desnudo" },
      { name: "MODIS MCD12Q1", what: "Cobertura del suelo", resolution: "500 m", where: "Contexto del diagnóstico" },
      { name: "SRTM", what: "Pendiente media del lote", resolution: "~30 m", where: "Tarjeta de pendiente" },
      { name: "SoilGrids", what: "Carbono orgánico y textura del suelo", resolution: "250 m", where: "Tarjeta de suelo" },
      { name: "NASA GIBS", what: "Imagen base del mapa", resolution: "hasta 250 m", where: "Mapa de fondo" },
      { name: "MAGyP", what: "Estimaciones agrícolas para zonas análogas", resolution: "departamento", where: "Evidencia de rotaciones" },
      { name: "ECOSTRESS (ECO_L2T_LSTE)", what: "Temperatura de superficie (LST)", resolution: "70 m", where: "Ficha demo solo en lotes Orin" },
      { name: "Datos de campo Orin", what: "Validación de satélite contra mediciones en lote", resolution: "lote", where: "Tarjeta de validación (solo datos reales)" },
    ],
    pendingTitle: "Pendientes o rechazados — y por qué",
    pending: [
      { name: "FAO GAEZ", why: "La licencia requiere un paso manual." },
      { name: "Anomalía de humedad SMAP", why: "Se calculó (SPL3SMP_E, 9 km) pero no superó los controles: sin relación positiva con la lluvia reciente de POWER. La tarjeta usa POWER GWETROOT." },
    ],
  },
  human: {
    heading: "El humano en el circuito",
    paragraphs: [
      "La base de conocimiento agronómico — 15 cultivos, 12 plantillas de rotación, 6 medidas de prevención — se compiló de fuentes publicadas y quedó escrita en el repositorio (back/knowledge/) para que un agrónomo la revise archivo por archivo.",
      "Sigue siendo un borrador en espera de esa revisión. Donde el motor no tiene rotaciones validadas — Patagonia hoy — lo dice y devuelve baja confianza en vez de adivinar.",
    ],
    disclaimer: "Ashfield apoya la decisión del productor. No reemplaza a un agrónomo.",
  },
  limits: {
    heading: "Límites",
    items: [
      "2000–2011 es el tramo de menor confianza de la serie de fuego (era de un solo sensor, calibrada con poco solape); el hueco de modo seguro de Terra en junio–julio 2001 es real, no un error de procesamiento.",
      "La armonización de fuego calibra solo por banda de latitud y mes — no modela diferencias locales dentro de una banda.",
      "La grilla de campo precalculada cubre solo Argentina; el diagnóstico a pedido funciona en todo el mundo con datos puntuales, pero sin las capas locales.",
      "El historial de fuego de 365 días del modelo de riesgo está incompleto para enero–octubre 2026 hasta que llegue el Parquet anual.",
      "El sesgo de altitud de la celda montañosa de POWER se corrige en el diagnóstico del lote pero no en las variables del modelo de riesgo.",
      "Los escenarios climáticos son reescalados de la serie histórica, no pronósticos.",
      "ECOSTRESS cubre solo los lotes demo de Orin; GAEZ está pendiente; la anomalía SMAP fue rechazada por los controles de calidad.",
    ],
  },
  team: {
    heading: "Equipo y enlaces",
    members: [
      { name: "Ezequiel", role: "datos de fuego y pipeline, despliegue" },
      { name: "Augustus", role: "lente de campo, integración y operación de agentes de IA" },
      { name: "Ariel (Chucky)", role: "front end" },
      { name: "Alex", role: "front end y presentación" },
    ],
    linksTitle: "Enlaces",
    links: [
      { label: "Repositorio", href: REPO },
      { label: "README", href: blob("README.md") },
      { label: "Contrato de datos", href: blob("docs/data-contract.md") },
      { label: "Descarga del dataset armonizado", href: "#", pending: true }, // [PENDIENTE: URL de descarga]
    ],
    credits: "Datos NASA: FIRMS (MODIS, VIIRS), POWER, GIBS, GRACE-FO, MODIS (MOD13C2, MCD12Q1), ECOSTRESS. También SoilGrids, MAGyP (Argentina), IGN y Natural Earth.",
    orinNote: "Los datos de campo de Orin se recolectaron antes del hackatón; solo se usan los datos, no código.",
  },
  footer: { note: "Ashfield · NASA Space Apps Challenge 2026" },
};

export const CONTENT: Record<Lang, Landing> = { en, es };

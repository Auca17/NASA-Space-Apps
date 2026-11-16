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

export interface DataRow { name: string; what: string; resolution: string; where: string; }
export interface PendingRow { name: string; why: string; }
export interface TeamMember { name: string; role?: string; }
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
  trust: {
    heading: string;
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
    lede: "Draw your field and get a crop plan for the coming years: your zone's rotation and its alternatives month by month, the three best crops for next season, and the state of the land — soil, water, temperature and fire risk — in plain words.",
    openApp: "Open the app",
    example: { label: "See an example", href: "/app/#demo" },
    video: undefined, // [PENDIENTE: URL del video] — hidden until it exists
    tagline: "NASA Space Apps Challenge 2026 · Field Shift: Adapting Farms with NASA Data",
    markAlt: "Ashfield mark",
    shot: {
      src: "/landing/app_demo_en.webp",
      alt: "The Ashfield app on the example farm in Tupungato, Mendoza: nine parcels over real satellite imagery, each with its fire and soil-moisture badge, and the Crop Plan open for the maize parcel with the rotation calendar.",
      width: 2000, height: 1250,
      caption: "The example farm: about 1,150 ha in Tupungato, Mendoza, nine parcels and seven crops. The producer, names and economics are invented; the location and satellite data are real.",
    },
  },
  blocks: [
    {
      heading: "What your field gets",
      text: "A Crop Plan: your zone's rotation and its alternatives, each with a month-by-month calendar, a day-by-day plan for the months without a crop, and an estimated cost-benefit (cost, income, margin and expected harvest for your hectares). Next to it, the three crops that fit best next season, ranked with Gemini from the parcel's data, a parcel-by-parcel summary, and a test alert e-mail for fire, drought, frost, heat, snow, El Niño and hail.",
      stat: { value: "1 + 3", note: "the reference rotation plus up to three alternatives, each with why, evidence, benefits, gaps and risks" },
    },
    {
      heading: "One grid, every layer",
      text: "POWER weather at 0.5°, IMERG rain at 0.1°, MODIS vegetation at 0.05° and SoilGrids soil at 250 m land on the same hexagonal grid — every parcel reads all of them cell by cell, and Sentinel-2 at 20 m joins on demand for the current crop.",
      stat: { value: "4 + 1", note: "dataset resolutions on one grid — weather, rain, vegetation, soil — plus Sentinel-2 on demand" },
    },
    {
      heading: "Why trust it",
      text: "Built only on named data — NASA POWER, IMERG, MODIS NDVI, GRACE-FO, SRTM, SoilGrids — and checked against the field: temperature against 53 real stations on a Mendoza farm, monthly rain against 25 INTA SIGA stations. Where the satellite is weak, the app says so.",
      stat: { value: "53 + 25", note: "real stations the estimates were checked against — Orin temperature, INTA SIGA rain" },
    },
  ],
  details: {
    summary: "How it meets the challenge brief",
    caption: "Every requirement of the Field Shift challenge, the method, the validation numbers and the honest limits.",
    scoreSep: " · ", statusSep: " · ",
  },
  pendTag: "[PENDING]",
  problem: {
    heading: "The problem",
    paragraphs: [
      "A producer deciding next season's rotation faces climate stress with the relevant NASA data scattered across products, resolutions and portals. Soil, rain, frost, heat and water stress exist, but not in one place, and not at the scale of a plot.",
      "Stubble burning is part of that decision too: a rotation that keeps the soil covered and spreads risk is also a field less likely to burn. Fire stays where it belongs — inside the plot, as a probability per parcel with its reason, alerts, and the burn months on the calendar.",
    ],
  },
  brief: {
    heading: "The challenge brief, point by point",
    intro: "The Field Shift challenge, requirement by requirement. Statuses are honest: partial means partial.",
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
            does: "SoilGrids organic carbon, texture and pH, a 20-crop catalog, parcels with a crop each (named after the crop Sentinel-2 detects), and eight hazards per parcel (fire, drought, El Niño, frost, heat, snow, hail, flood). El Niño is shown as a historical tendency — not a forecast — snow as days per year, and hail is honestly flagged 'no satellite data'.",
            see: { label: "Example farm", href: "/app/#demo" } },
          { id: "F3", status: "done",
            requirement: "Compare at least three rotation alternatives, including the current one",
            does: "The Crop Plan returns the zone's reference rotation plus up to three alternatives, compared on water, soil, erosion, nitrogen, pests, forage, income and burning, with an estimated cost-benefit for the analysed hectares.",
            see: { label: "Crop Plan", href: "/app/#demo" } },
          { id: "F4", status: "done",
            requirement: "For each alternative: why it fits, evidence from Earth data, expected benefits, information gaps, risks",
            does: "Each rotation card carries all five sections, each item citing the indicators behind it; the why names what improves and what gets worse against the reference. Each parcel shows its fire and soil-moisture percentages on the map, with a legend.",
            see: { label: "Crop Plan", href: "/app/#demo" } },
          { id: "F5", status: "partial",
            requirement: "Show bare-soil periods and seasons when soil or plants are vulnerable",
            does: "Each rotation has a month-by-month calendar of what is in the field and a day-by-day plan for the months without a crop (cover crop, soil sampling, weed control, sowing). Bare-soil days per year come from MODIS NDVI in Argentina and from Sentinel-2 elsewhere.",
            limit: "Bare-soil days are an estimate from monthly vegetation indices; cloudy months reduce the sample.",
            see: { label: "Crop Plan", href: "/app/#demo" } },
          { id: "F6", status: "done",
            requirement: "Indicate how each alternative affects pest cycles, water use, soil infiltration and extra income",
            does: "Indicators per alternative: an explicit soil-infiltration score (USDA hydrologic groups from SoilGrids texture, organic matter, slope and bare-soil days — shown per parcel and per alternative), erosion risk (bare-soil days × heavy-rain days × slope), pest break (distinct families in the cycle), income bucket, burns avoided, water need.",
            limit: "Indicators are relative and qualitative — they rank alternatives, they do not predict yields." },
          { id: "F7", status: "partial",
            requirement: "Use AI to detect patterns, communicate uncertainty, combine heterogeneous datasets",
            does: "Gemini ranks the three best crops for next season from the parcel's data and explains each decision; every number it writes is validated against the engine's output, with a deterministic fallback when it is unavailable. Analog zones find departments with similar climates, and every result carries a confidence level.",
            limit: "Gemini needs a server-side key and quota; without it the app ranks with its own calculation and says so. Patagonia returns 'no validated rotations' rather than a weak guess." },
          { id: "F8", status: "partial",
            requirement: "Harmonize datasets with different resolutions and time scales into a common grid",
            does: "POWER daily weather (0.5°), IMERG monthly rain (0.1°), MODIS NDVI (0.05°) and SoilGrids (250 m) are precomputed onto the same H3 hexagonal grid (res 5); each parcel is rasterized to the same cells, so every layer is read cell by cell. Sentinel-2 at 20 m joins on demand for the current crop.",
            limit: "The precomputed layers cover Argentina only; elsewhere the on-demand diagnosis uses point data instead of the grid.",
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
            does: "The producer can say whether there is irrigation and livestock ('I don't know' is valid); crops that do not fit are excluded before ranking." },
          { id: "F13", status: "done",
            requirement: "Support the producer's informed decision, never replace it",
            does: "The disclaimer ships with every diagnosis; information gaps are a required section on each rotation card." },
        ],
      },
    ],
  },
  trust: {
    heading: "How much to trust it",
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
      { name: "FIRMS MODIS + VIIRS", what: "Active-fire detections near the plot", resolution: "1 km / 375 m", where: "Parcel fire % and alerts" },
      { name: "NASA POWER", what: "Daily weather for the diagnosis", resolution: "0.5°", where: "Field diagnosis" },
      { name: "GPM IMERG", what: "Monthly rain in the Argentina field grid", resolution: "0.1° monthly", where: "Rain card (precomputed)" },
      { name: "GRACE-FO", what: "Long-term groundwater trend", resolution: "regional", where: "Water-trend card" },
      { name: "MODIS NDVI (MOD13C2; MOD13Q1 on demand)", what: "Months without live crop", resolution: "0.05° monthly / 250 m", where: "Vigor / bare-soil card" },
      { name: "MODIS MCD12Q1", what: "Land cover", resolution: "500 m", where: "Diagnosis context" },
      { name: "SRTM", what: "Mean plot slope", resolution: "~30 m", where: "Slope card" },
      { name: "SoilGrids", what: "Soil organic carbon and texture", resolution: "250 m", where: "Soil card" },
      { name: "NASA GIBS", what: "Base map imagery", resolution: "up to 250 m", where: "Basemap" },
      { name: "MAGyP", what: "Agricultural estimates for analog zones", resolution: "department", where: "Rotation evidence" },
      { name: "Sentinel-2 L2A (ESA Copernicus)", what: "Current-crop and moisture check on demand", resolution: "20 m", where: "Crop-detection card" },
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
      "The agronomic knowledge base (20 crops, 13 rotation templates, 6 prevention measures, reference costs and prices) is compiled from published sources and written down in the repository (back/knowledge/) so an agronomist can review it file by file.",
      "It remains a draft awaiting that review. Where the engine has no validated rotations (Patagonia today), it says so and returns low confidence instead of guessing.",
    ],
    disclaimer: "Ashfield supports a producer's decision. It does not replace an agronomist.",
  },
  limits: {
    heading: "Limits",
    items: [
      "The precomputed field grid covers Argentina only; on-demand diagnosis works worldwide with point data, but without the local layers.",
      "The POWER mountain-cell elevation bias is corrected in the field diagnosis.",
      "The parcel fire history window is incomplete for January–October 2026 until the annual Parquet lands.",
      "Climate scenarios are scalings of the historical series, not forecasts.",
      "ECOSTRESS covers only the Orin demo plots; GAEZ is pending; the SMAP anomaly was rejected by quality gates.",
      "Alerts: the app sends a test e-mail with every natural hazard for the field (through n8n or SMTP); scheduled alerts that run on their own are the next step.",
      "The cost-benefit is an estimate: reference values per hectare scaled by the field's area, not a budget.",
    ],
  },
  team: {
    heading: "Team and links",
    members: [
      { name: "Augustus" },
      { name: "Ezequiel" },
      { name: "Ariel" },
      { name: "Alex" },
    ],
    linksTitle: "Links",
    links: [
      { label: "Repository", href: REPO },
      { label: "README", href: blob("README.md") },
      { label: "Data contract", href: blob("docs/data-contract.md") },
    ],
    credits: "NASA Space Apps Challenge Data: FIRMS (MODIS, VIIRS), POWER, GPM IMERG, GIBS, GRACE-FO, MODIS (MOD13C2, MCD12Q1), ECOSTRESS. Also SoilGrids, MAGyP (Argentina), Sentinel-2 (ESA Copernicus), IGN and Natural Earth base data.",
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
    lede: "Dibujá tu campo y obtené un plan de cultivos para los próximos años: la rotación de tu zona y sus alternativas mes a mes, los tres mejores cultivos para la próxima campaña y el estado de la tierra — suelo, agua, temperatura y riesgo de fuego — en palabras simples.",
    openApp: "Abrir la app",
    example: { label: "Ver un ejemplo", href: "/app/#demo" },
    video: undefined, // [PENDIENTE: URL del video] — oculto hasta que exista
    tagline: "NASA Space Apps Challenge 2026 · Field Shift: Adapting Farms with NASA Data",
    markAlt: "Marca Ashfield",
    shot: {
      src: "/landing/app_demo.webp",
      alt: "La app Ashfield en la finca de ejemplo en Tupungato, Mendoza: nueve parcelas sobre imagen satelital real, cada una con su indicador de fuego y humedad del suelo, y el Plan de Cultivos abierto para la parcela de maíz con el calendario de la rotación.",
      width: 2000, height: 1250,
      caption: "La finca de ejemplo: unas 1.150 ha en Tupungato, Mendoza, con nueve parcelas y siete cultivos. El productor, los nombres y los números económicos son inventados; la ubicación y los datos satelitales son reales.",
    },
  },
  blocks: [
    {
      heading: "Lo que obtenés para tu lote",
      text: "Un Plan de Cultivos: la rotación de tu zona y sus alternativas, cada una con su calendario mes a mes, un plan día por día para los meses sin cultivo y un costo-beneficio estimado (costo, ingreso, margen y cosecha esperada para tus hectáreas). Al lado, los tres cultivos que mejor encajan en la próxima campaña, ordenados con Gemini según los datos de la parcela, un resumen parcela por parcela y un mail de aviso de prueba por fuego, sequía, heladas, calor, nieve, El Niño y granizo.",
      stat: { value: "1 + 3", note: "la rotación de referencia más hasta tres alternativas, cada una con por qué, evidencia, beneficios, vacíos y riesgos" },
    },
    {
      heading: "Una grilla, todas las capas",
      text: "El clima de POWER a 0,5°, la lluvia de IMERG a 0,1°, la vegetación de MODIS a 0,05° y el suelo de SoilGrids a 250 m caen en la misma grilla hexagonal — cada parcela lee todas las capas celda por celda, y Sentinel-2 a 20 m se suma a pedido para el cultivo actual.",
      stat: { value: "4 + 1", note: "resoluciones de datos en una grilla — clima, lluvia, vegetación, suelo — más Sentinel-2 a pedido" },
    },
    {
      heading: "Por qué confiar",
      text: "Construida solo sobre datos nombrados — NASA POWER, IMERG, NDVI de MODIS, GRACE-FO, SRTM, SoilGrids — y contrastada en el campo: temperatura contra 53 estaciones reales en una finca de Mendoza, lluvia mensual contra 25 estaciones INTA SIGA. Donde el satélite falla, la app lo dice.",
      stat: { value: "53 + 25", note: "estaciones reales contra las que se contrastó — temperatura Orin, lluvia INTA SIGA" },
    },
  ],
  details: {
    summary: "Cómo cumple el desafío",
    caption: "Cada requisito del desafío Field Shift, el método, los números de validación y los límites honestos.",
    scoreSep: " · ", statusSep: " · ",
  },
  pendTag: "[PENDIENTE]",
  problem: {
    heading: "El problema",
    paragraphs: [
      "Un productor que decide la rotación de la próxima campaña enfrenta el estrés climático con los datos de la NASA dispersos entre productos, resoluciones y portales. Suelo, lluvia, heladas, calor y estrés hídrico existen — pero no en un solo lugar ni a escala de lote.",
      "La quema de rastrojo también es parte de esa decisión: una rotación que mantiene el suelo cubierto y reparte el riesgo es también un campo que arde menos. El fuego queda donde pertenece — dentro del lote, como probabilidad por parcela con su motivo, alertas y los meses de quema en el calendario.",
    ],
  },
  brief: {
    heading: "El brief del desafío, punto por punto",
    intro: "El desafío Field Shift, requisito por requisito. Los estados son honestos: parcial es parcial.",
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
            does: "Carbono orgánico, textura y pH de SoilGrids, catálogo de 20 cultivos, parcelas con su cultivo (nombradas según el cultivo que detecta Sentinel-2) y ocho riesgos por parcela (fuego, sequía, El Niño, heladas, calor, nevadas, granizo, inundación). El Niño se muestra como tendencia histórica —no pronóstico—, la nieve como días por año, y el granizo se marca honestamente «sin dato satelital».",
            see: { label: "Finca de ejemplo", href: "/app/#demo" } },
          { id: "F3", status: "done",
            requirement: "Comparar al menos tres rotaciones alternativas, incluida la actual",
            does: "El Plan de Cultivos devuelve la rotación de referencia de la zona más hasta tres alternativas, comparadas en agua, suelo, erosión, nitrógeno, plagas, forraje, ingreso y quemas, con un costo-beneficio estimado para las hectáreas analizadas.",
            see: { label: "Plan de Cultivos", href: "/app/#demo" } },
          { id: "F4", status: "done",
            requirement: "Para cada alternativa: por qué encaja, evidencia de datos de la Tierra, beneficios esperados, vacíos de información, riesgos",
            does: "Cada tarjeta de rotación lleva las cinco secciones, y cada ítem cita los indicadores detrás; el por qué dice qué mejora y qué empeora frente a la referencia. Cada parcela muestra en el mapa su porcentaje de fuego y de humedad del suelo, con una leyenda.",
            see: { label: "Plan de Cultivos", href: "/app/#demo" } },
          { id: "F5", status: "partial",
            requirement: "Mostrar períodos de suelo desnudo y estaciones vulnerables",
            does: "Cada rotación tiene un calendario mes a mes de qué hay en el lote y un plan día por día para los meses sin cultivo (cobertura, muestreo de suelo, control de malezas, siembra). Los días de suelo desnudo por año salen del NDVI de MODIS en Argentina y de Sentinel-2 en el resto.",
            limit: "Los días de suelo desnudo son una estimación con índices de vegetación mensuales; los meses nublados achican la muestra.",
            see: { label: "Plan de Cultivos", href: "/app/#demo" } },
          { id: "F6", status: "done",
            requirement: "Indicar cómo cada alternativa afecta plagas, uso de agua, infiltración e ingreso extra",
            does: "Indicadores por alternativa: un puntaje explícito de infiltración del suelo (grupos hidrológicos USDA desde textura de SoilGrids, materia orgánica, pendiente y días de suelo desnudo — por parcela y por alternativa), riesgo de erosión (días de suelo desnudo × lluvias intensas × pendiente), corte de plagas (familias distintas en el ciclo), franja de ingreso, quemas evitadas, necesidad de agua.",
            limit: "Los indicadores son relativos y cualitativos — ordenan alternativas, no predicen rindes." },
          { id: "F7", status: "partial",
            requirement: "Usar IA para detectar patrones, comunicar incertidumbre, combinar datasets heterogéneos",
            does: "Gemini ordena los tres mejores cultivos para la próxima campaña con los datos de la parcela y explica cada decisión; cada número que escribe se valida contra el motor, con un respaldo determinista cuando no está disponible. Las zonas análogas encuentran departamentos con clima similar, y cada resultado lleva un nivel de confianza.",
            limit: "Gemini necesita una clave y cuota en el servidor; sin eso la app ordena con su propio cálculo y lo dice. Patagonia devuelve «sin rotaciones validadas» en vez de adivinar." },
          { id: "F8", status: "partial",
            requirement: "Armonizar datasets con resoluciones y escalas temporales distintas en una grilla común",
            does: "El clima diario de POWER (0,5°), la lluvia mensual de IMERG (0,1°), el NDVI de MODIS (0,05°) y SoilGrids (250 m) están precalculados sobre la misma grilla hexagonal H3 (res 5); cada parcela se rasteriza a las mismas celdas, así que toda capa se lee celda por celda. Sentinel-2 a 20 m se suma a pedido para el cultivo actual.",
            limit: "Las capas precalculadas cubren solo Argentina; en otros países el diagnóstico a pedido usa datos de punto en vez de la grilla.",
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
            does: "El productor puede indicar si tiene riego y ganado («No sé» es válido); los cultivos que no encajan se excluyen antes del ranking." },
          { id: "F13", status: "done",
            requirement: "Apoyar — nunca reemplazar — la decisión informada del productor",
            does: "La aclaración va con cada diagnóstico; los vacíos de información son una sección obligatoria de cada tarjeta." },
        ],
      },
    ],
  },
  trust: {
    heading: "Cuánto confiar",
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
      { name: "FIRMS MODIS + VIIRS", what: "Detecciones de fuego activo cerca del lote", resolution: "1 km / 375 m", where: "% de fuego por parcela y alertas" },
      { name: "NASA POWER", what: "Clima diario para el diagnóstico", resolution: "0,5°", where: "Diagnóstico del lote" },
      { name: "GPM IMERG", what: "Lluvia mensual de la grilla de campo argentina", resolution: "0,1° mensual", where: "Tarjeta de lluvia (precalculada)" },
      { name: "GRACE-FO", what: "Tendencia del agua subterránea a largo plazo", resolution: "regional", where: "Tarjeta de tendencia del agua" },
      { name: "NDVI MODIS (MOD13C2; MOD13Q1 a pedido)", what: "Meses sin cultivo vivo", resolution: "0,05° mensual / 250 m", where: "Tarjeta de vigor y suelo desnudo" },
      { name: "MODIS MCD12Q1", what: "Cobertura del suelo", resolution: "500 m", where: "Contexto del diagnóstico" },
      { name: "SRTM", what: "Pendiente media del lote", resolution: "~30 m", where: "Tarjeta de pendiente" },
      { name: "SoilGrids", what: "Carbono orgánico y textura del suelo", resolution: "250 m", where: "Tarjeta de suelo" },
      { name: "NASA GIBS", what: "Imagen base del mapa", resolution: "hasta 250 m", where: "Mapa de fondo" },
      { name: "MAGyP", what: "Estimaciones agrícolas para zonas análogas", resolution: "departamento", where: "Evidencia de rotaciones" },
      { name: "Sentinel-2 L2A (ESA Copernicus)", what: "Chequeo de cultivo actual y humedad a pedido", resolution: "20 m", where: "Tarjeta de cultivo detectado" },
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
      "La base de conocimiento agronómico — 20 cultivos, 13 plantillas de rotación, 6 medidas de prevención y costos y precios de referencia — se compiló de fuentes publicadas y quedó escrita en el repositorio (back/knowledge/) para que un agrónomo la revise archivo por archivo.",
      "Sigue siendo un borrador en espera de esa revisión. Donde el motor no tiene rotaciones validadas — Patagonia hoy — lo dice y devuelve baja confianza en vez de adivinar.",
    ],
    disclaimer: "Ashfield apoya la decisión del productor. No reemplaza a un agrónomo.",
  },
  limits: {
    heading: "Límites",
    items: [
      "La grilla de campo precalculada cubre solo Argentina; el diagnóstico a pedido funciona en todo el mundo con datos puntuales, pero sin las capas locales.",
      "El sesgo de altitud de la celda montañosa de POWER se corrige en el diagnóstico del lote.",
      "La ventana de historial de fuego de cada parcela queda incompleta para enero–octubre 2026 hasta que llegue el Parquet anual.",
      "Los escenarios climáticos son reescalados de la serie histórica, no pronósticos.",
      "ECOSTRESS cubre solo los lotes demo de Orin; GAEZ está pendiente; la anomalía SMAP fue rechazada por los controles de calidad.",
      "Avisos: la app manda un mail de prueba con todos los fenómenos naturales del campo (por n8n o SMTP); los avisos programados que corren solos son el próximo paso.",
      "El costo-beneficio es una estimación: valores de referencia por hectárea multiplicados por la superficie, no un presupuesto.",
    ],
  },
  team: {
    heading: "Equipo y enlaces",
    members: [
      { name: "Augustus" },
      { name: "Ezequiel" },
      { name: "Ariel" },
      { name: "Alex" },
    ],
    linksTitle: "Enlaces",
    links: [
      { label: "Repositorio", href: REPO },
      { label: "README", href: blob("README.md") },
      { label: "Contrato de datos", href: blob("docs/data-contract.md") },
    ],
    credits: "Datos de NASA Space Apps Challenge: FIRMS (MODIS, VIIRS), POWER, GPM IMERG, GIBS, GRACE-FO, MODIS (MOD13C2, MCD12Q1), ECOSTRESS. También SoilGrids, MAGyP (Argentina), Sentinel-2 (ESA Copernicus), IGN y Natural Earth.",
    orinNote: "Los datos de campo de Orin se recolectaron antes del hackatón; solo se usan los datos, no código.",
  },
  footer: { note: "Ashfield · NASA Space Apps Challenge 2026" },
};

export const CONTENT: Record<Lang, Landing> = { en, es };

/** Typed content for the "Datos y métodos" panel (task 17B).
 *  Kept as data so later tasks update the list, not the UI. */

export interface DatasetRow {
  name: string;
  gives: { es: string; en: string };
  resolution: string;
  period: string;
  where: { es: string; en: string };
}

export interface PendingRow {
  name: string;
  why: { es: string; en: string };
}

export const DATASETS_USED: DatasetRow[] = [
  { name: "FIRMS MODIS + VIIRS",
    gives: { es: "Serie de focos de calor armonizada",
             en: "Harmonized active-fire series" },
    resolution: "1 km / 375 m", period: "2000-hoy",
    where: { es: "Globo y panel de focos",
             en: "Globe and fire panel" } },
  { name: "NASA POWER",
    gives: { es: "Clima diario para el diagnóstico y el modelo de riesgo",
             en: "Daily weather for diagnosis and the risk model" },
    resolution: "0.5°", period: "2001-hoy",
    where: { es: "Diagnóstico del lote, riesgo",
             en: "Field diagnosis, risk" } },
  { name: "GRACE-FO",
    gives: { es: "Tendencia del agua subterránea a largo plazo",
             en: "Long-term groundwater trend" },
    resolution: "regional", period: "2018-hoy",
    where: { es: "Tarjeta de tendencia del agua",
             en: "Water-trend card" } },
  { name: "MODIS NDVI (MOD13Q1)",
    gives: { es: "Días sin cultivo vivo",
             en: "Days without live crop" },
    resolution: "250 m", period: "2001-hoy",
    where: { es: "Tarjeta de vigor y suelo desnudo",
             en: "Vigor / bare-soil card" } },
  { name: "MODIS MCD12Q1",
    gives: { es: "Cobertura del suelo",
             en: "Land cover" },
    resolution: "500 m", period: "2001-hoy",
    where: { es: "Contexto del diagnóstico",
             en: "Diagnosis context" } },
  { name: "SRTM",
    gives: { es: "Pendiente media del lote",
             en: "Mean plot slope" },
    resolution: "~30 m", period: "estático",
    where: { es: "Tarjeta de pendiente",
             en: "Slope card" } },
  { name: "SoilGrids",
    gives: { es: "Carbono orgánico y textura del suelo",
             en: "Soil organic carbon and texture" },
    resolution: "250 m", period: "estático",
    where: { es: "Tarjeta de suelo",
             en: "Soil card" } },
  { name: "NASA GIBS",
    gives: { es: "Imagen base del mapa",
             en: "Base map imagery" },
    resolution: "hasta 250 m", period: "hoy",
    where: { es: "Mapa de fondo", en: "Basemap" } },
  { name: "MAGyP",
    gives: { es: "Estimaciones agrícolas para zonas análogas",
             en: "Agricultural estimates for analog zones" },
    resolution: "departamento", period: "2000-hoy",
    where: { es: "Evidencia de rotaciones",
             en: "Rotation evidence" } },
  { name: "ECOSTRESS (ECO_L2T_LSTE)",
    gives: { es: "Temperatura de superficie (LST)",
             en: "Land-surface temperature (LST)" },
    resolution: "70 m", period: "2024-2025",
    where: { es: "Tarjeta demo solo en lotes Orin",
             en: "Demo tile on Orin plots only" } },
  { name: "Datos de campo Orin",
    gives: { es: "Validación de satélite contra mediciones en lote",
             en: "Satellite vs field-measurement validation" },
    resolution: "lote", period: "varios",
    where: { es: "Tarjeta de validación (solo datos reales)",
             en: "Validation card (real data only)" } },
];

export const DATASETS_PENDING: PendingRow[] = [
  { name: "GPM IMERG",
    why: { es: "Pendiente de acuerdo de uso en el centro de datos "
               + "(GES DISC EULA); la lluvia sale de NASA POWER.",
           en: "Pending a data-use agreement at the data center "
               + "(GES DISC EULA); rain comes from NASA POWER." } },
  { name: "FAO GAEZ",
    why: { es: "La licencia requiere un paso manual.",
           en: "License requires a manual step." } },
  { name: "Anomalía de humedad SMAP",
    why: { es: "Se calculó (SPL3SMP_E, 9 km) pero no superó las "
               + "pruebas de calidad: sin relación positiva con la "
               + "lluvia reciente de POWER. La tarjeta usa POWER "
               + "(GWETROOT).",
           en: "Computed (SPL3SMP_E, 9 km) but failed sanity gates: "
               + "no positive relation to recent POWER rain. The "
               + "card falls back to POWER (GWETROOT)." } },
];

export const LIMITATIONS: { es: string; en: string }[] = [
  { es: "La grilla de campo cubre solo Argentina; el diagnóstico a "
        + "pedido funciona en todo el mundo con datos puntuales.",
    en: "The field grid covers Argentina only; on-demand diagnosis "
        + "works worldwide with point data." },
  { es: "Los datos de focos de 2000 a 2011 son el período de menor "
        + "confianza.",
    en: "Fire data from 2000 to 2011 is the lowest-confidence period." },
  { es: "El riesgo es una estimación experimental.",
    en: "Risk is an experimental estimate." },
  { es: "Las rotaciones son apoyo a la decisión y no reemplazan a un "
        + "agronomo.",
    en: "Rotations are decision support and do not replace an "
        + "agronomist." },
  { es: "Los escenarios climáticos son escalados simples de la serie "
        + "histórica, no pronósticos.",
    en: "Climate scenarios are simple scalings of the historical "
        + "series, not forecasts." },
  { es: "Una detección satelital no es un incendio confirmado y llega "
        + "con horas de demora: ante fuego o humo, llamá a emergencias "
        + "sin esperar a la app.",
    en: "A satellite detection is not a confirmed fire and arrives "
        + "hours late: if you see fire or smoke, call emergency "
        + "services without waiting for the app." },
];

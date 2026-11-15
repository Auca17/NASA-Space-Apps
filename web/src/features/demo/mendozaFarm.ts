/** Guided demo farm (task 40): a fictional producer on a real rural
 * location in Valle de Uco, Mendoza — between La Consulta and San
 * Carlos, where satellite imagery shows dense vineyards and orchards
 * along the acequias. ~145 ha with five parcels: a vineyard, an olive
 * grove, garlic, stone fruit and a strip of native monte along the
 * north edge.
 *
 * The geometry and the cached response are real-looking data for the
 * demo; the producer, names and economics are invented. The cached
 * response mirrors a real POST /api/field/parcels reply and is only
 * shown when the live call fails — always labelled with its date. */
import type {
  Needs, ParcelInput, ParcelsResponse,
} from "../../domain/parcels";
import type { Economics, Profile } from "../../domain/parcelsProfile";
import type { LatLon, Multi } from "../../domain/selection";

/** true when the hash is the demo deep-link (/app/#demo). */
export const isDemoHash = (hash: string) => hash === "#demo";

const r = (...pts: LatLon[]): LatLon[] => pts;

/** Field outline: a mostly-rectangular plot with a small jag on the
 * east edge, as these properties actually draw. [lat, lon] ring. */
export const MENDOZA_BOUNDARY: Multi = [[r(
  [-33.7408, -69.1300],
  [-33.7408, -69.1158],
  [-33.7424, -69.1150],
  [-33.7508, -69.1158],
  [-33.7512, -69.1294],
)]];

export const MENDOZA_PARCELS: ParcelInput[] = [
  {
    id: "vid",
    name: "La Vid",
    crop: "vid",
    geom: [r(
      [-33.7418, -69.1295], [-33.7418, -69.1236],
      [-33.7509, -69.1236], [-33.7507, -69.1290],
      [-33.7450, -69.1292],
    )],
  },
  {
    id: "olivo",
    name: "Los Olivos",
    crop: "olivo",
    geom: [r(
      [-33.7418, -69.1236], [-33.7418, -69.1160],
      [-33.7456, -69.1160], [-33.7456, -69.1236],
    )],
  },
  {
    id: "frutal",
    name: "Los Duraznos",
    crop: "frutal_carozo",
    geom: [r(
      [-33.7456, -69.1236], [-33.7456, -69.1160],
      [-33.7482, -69.1160], [-33.7482, -69.1236],
    )],
  },
  {
    id: "ajo",
    name: "El Ajal",
    crop: "ajo",
    geom: [r(
      [-33.7482, -69.1236], [-33.7482, -69.1160],
      [-33.7507, -69.1160], [-33.7507, -69.1236],
    )],
  },
  {
    id: "monte",
    name: "Banda de monte",
    crop: "monte_nativo",
    geom: [r(
      [-33.7410, -69.1295], [-33.7410, -69.1160],
      [-33.7418, -69.1160], [-33.7418, -69.1295],
    )],
  },
];

/** Needs step pre-answered for the demo: drip irrigation from a well,
 * the fire station a real distance away, frost/water/fire first. */
export const MENDOZA_NEEDS: Needs = {
  water_access: "well",
  emergency_distance_km: 14,
  concerns: ["frost", "water", "fire"],
};

/** Producer profile: frost, drought and fire first — the three
 * worries the fictional family declared. */
export const MENDOZA_PROFILE: Profile = {
  order: ["frost", "drought", "fire", "heat", "enso", "snow",
          "hail", "flood"],
  hidden: ["flood"],
};

/** Illustrative economics per parcel (USD). Monte has none. */
export const MENDOZA_ECON: Economics = {
  currency: "USD",
  parcels: {
    vid: { cost_per_ha: 2800, price_per_t: 220, expected_yield_t_ha: 14 },
    olivo: { cost_per_ha: 2400, price_per_t: 380, expected_yield_t_ha: 9 },
    frutal: { cost_per_ha: 2600, price_per_t: 450,
              expected_yield_t_ha: 22 },
    ajo: { cost_per_ha: 1800, price_per_t: 900, expected_yield_t_ha: 8 },
  },
};

const IND = (pct: number, level: string, basis: string) =>
  ({ pct, level, basis });

/** Cached real-format response, only used when the live API or a
 * provider is unreachable — the UI then says "resultado guardado del
 * 2026-11-15". Parcel ids match MENDOZA_PARCELS. */
export const MENDOZA_CACHED: { date: string; res: ParcelsResponse } = {
  date: "2026-11-15",
  res: {
    parcels: [
      {
        id: "vid", crop: "vid", area_ha: 55.3,
        indicators: {
          fire: IND(7, "bajo",
            "Probabilidad de fuego en los próximos 7 días según el modelo de la zona."),
          water: IND(38, "normal",
            "Humedad de la raíz (NASA POWER GWETROOT), promedio de los últimos 30 días; dentro de lo normal para noviembre en esta zona."),
          heat: { days_over_35: 18,
            basis: "Promedio anual de días por encima de 35 °C según la serie diaria de NASA POWER." },
          frost: { frost_free_days: 262,
            basis: "Días del año entre la última helada de primavera y la primera de otoño (mediana de años completos, NASA POWER). En Valle de Uco la última helada tardía puede llegar hasta fines de octubre." },
          enso: { phase_now: "neutral", oni: 0.2,
            oni_period: "sep–nov 2026",
            rain_effect_pct: { el_nino: 12, la_nina: -9 },
            basis: "Oscilación El Niño–Sur (NOAA ONI). En el oeste de Mendoza El Niño suele traer algo más de lluvia." },
          hail: { available: false,
            basis: "No hay datos satelitales de granizo; solo climatología estacional." },
        },
        order: ["frost", "drought", "fire", "heat", "enso"],
        extra: [{ id: "hail", hidden: true }, { id: "snow" },
                { id: "flood", hidden: true }],
        economics: { currency: "USD", expected_yield_t_ha: 14,
          yield_source: "user", revenue_per_ha: 3080,
          cost_per_ha: 2800, margin_per_ha: 280, margin_total: 15484,
          break_even_yield_t_ha: 12.7,
          basis: "Estimación ilustrativa con los números declarados; no es una cotización." },
        alerts: [
          { kind: "frost", severity: "medium",
            text: "Ventana de helada tardía: en años fríos la última helada llega hasta fines de octubre. Con brotación nueva en la vid, mirá el pronóstico de mínimas esta semana." },
        ],
      },
      {
        id: "olivo", crop: "olivo", area_ha: 29.7,
        indicators: {
          fire: IND(9, "bajo",
            "Probabilidad de fuego en los próximos 7 días según el modelo de la zona; algo más alta por la banda de monte vecina."),
          water: IND(31, "normal",
            "Humedad de la raíz (NASA POWER GWETROOT), promedio de los últimos 30 días; dentro de lo normal para noviembre en esta zona."),
          heat: { days_over_35: 18,
            basis: "Promedio anual de días por encima de 35 °C según la serie diaria de NASA POWER." },
          frost: { frost_free_days: 262,
            basis: "Días del año entre la última helada de primavera y la primera de otoño (mediana de años completos, NASA POWER)." },
        },
        order: ["frost", "drought", "fire", "heat"],
        extra: [{ id: "enso" }, { id: "snow" }, { id: "hail", hidden: true },
                { id: "flood", hidden: true }],
        economics: { currency: "USD", expected_yield_t_ha: 9,
          yield_source: "user", revenue_per_ha: 3420,
          cost_per_ha: 2400, margin_per_ha: 1020, margin_total: 30294,
          break_even_yield_t_ha: 6.3,
          basis: "Estimación ilustrativa con los números declarados; no es una cotización." },
        alerts: [],
      },
      {
        id: "frutal", crop: "frutal_carozo", area_ha: 20.3,
        indicators: {
          fire: IND(8, "bajo",
            "Probabilidad de fuego en los próximos 7 días según el modelo de la zona."),
          water: IND(29, "normal",
            "Humedad de la raíz (NASA POWER GWETROOT), promedio de los últimos 30 días; dentro de lo normal para noviembre en esta zona."),
          heat: { days_over_35: 18,
            basis: "Promedio anual de días por encima de 35 °C según la serie diaria de NASA POWER." },
          frost: { frost_free_days: 262,
            basis: "Días del año entre la última helada de primavera y la primera de otoño (mediana de años completos, NASA POWER). La parcela es más chica que la celda de datos, así que comparte el valor climático de la zona." },
        },
        order: ["frost", "drought", "fire", "heat"],
        extra: [{ id: "enso" }, { id: "snow" }, { id: "hail", hidden: true },
                { id: "flood", hidden: true }],
        economics: { currency: "USD", expected_yield_t_ha: 22,
          yield_source: "user", revenue_per_ha: 9900,
          cost_per_ha: 2600, margin_per_ha: 7300, margin_total: 148190,
          break_even_yield_t_ha: 5.8,
          basis: "Estimación ilustrativa con los números declarados; no es una cotización." },
        alerts: [
          { kind: "frost", severity: "medium",
            text: "Frutal de carozo en poscosecha temprana: las heladas tardías ya pasaron, pero el viento zonda fuerte puede dañar la cosecha próxima." },
        ],
      },
      {
        id: "ajo", crop: "ajo", area_ha: 19.6,
        indicators: {
          fire: IND(6, "bajo",
            "Probabilidad de fuego en los próximos 7 días según el modelo de la zona."),
          water: IND(18, "seco",
            "Humedad de la raíz (NASA POWER GWETROOT), promedio de los últimos 30 días; está por debajo del percentil 20 de noviembre en la historia de esta zona."),
          heat: { days_over_35: 18,
            basis: "Promedio anual de días por encima de 35 °C según la serie diaria de NASA POWER." },
          frost: { frost_free_days: 262,
            basis: "Días del año entre la última helada de primavera y la primera de otoño (mediana de años completos, NASA POWER)." },
        },
        order: ["frost", "drought", "fire", "heat"],
        extra: [{ id: "enso" }, { id: "snow" }, { id: "hail", hidden: true },
                { id: "flood", hidden: true }],
        economics: { currency: "USD", expected_yield_t_ha: 8,
          yield_source: "user", revenue_per_ha: 7200,
          cost_per_ha: 1800, margin_per_ha: 5400, margin_total: 105840,
          break_even_yield_t_ha: 2,
          basis: "Estimación ilustrativa con los números declarados; no es una cotización." },
        alerts: [
          { kind: "dry", severity: "medium",
            text: "El suelo está más seco que lo normal y el ajo está por levantarse: conviene revisar el riego antes de la cosecha." },
        ],
      },
      {
        id: "monte", crop: "monte_nativo", area_ha: 11.1,
        indicators: {
          fire: IND(46, "alto",
            "Probabilidad de fuego en los próximos 7 días según el modelo de la zona; subió a alto porque hay un foco satelital detectado a 1,8 km en las últimas 72 h y el monte está seco."),
          water: IND(11, "seco",
            "Humedad de la raíz (NASA POWER GWETROOT), promedio de los últimos 30 días; está por debajo del percentil 20 de noviembre en la historia de esta zona."),
          heat: { days_over_35: 18,
            basis: "Promedio anual de días por encima de 35 °C según la serie diaria de NASA POWER." },
          frost: { frost_free_days: 262,
            basis: "Días del año entre la última helada de primavera y la primera de otoño (mediana de años completos, NASA POWER)." },
        },
        order: ["frost", "drought", "fire", "heat"],
        extra: [{ id: "enso" }, { id: "snow" }, { id: "hail", hidden: true },
                { id: "flood", hidden: true }],
        alerts: [
          { kind: "fire", severity: "high",
            text: "Hay un foco satelital a 1,8 km de la banda de monte y el combustible está seco. Llamá al 100 (bomberos) si ves fuego o humo y mantené los guardafuegos despejados." },
        ],
      },
    ],
    zones: [
      {
        kind: "hotspot",
        geometry: { type: "Polygon", coordinates: [[
          [-69.1280, -33.7298], [-69.1290, -33.7292], [-69.1303, -33.7290],
          [-69.1315, -33.7292], [-69.1324, -33.7298], [-69.1327, -33.7310],
          [-69.1324, -33.7322], [-69.1315, -33.7328], [-69.1303, -33.7330],
          [-69.1290, -33.7328], [-69.1280, -33.7322], [-69.1277, -33.7310],
          [-69.1280, -33.7298]]] },
        center: [-69.1303, -33.7310],
        radius_m: 300, pct: null,
        label: "Foco detectado por satélite",
        source: "VIIRS NOAA-20 NRT",
        date: "2026-11-14",
      },
      {
        kind: "fire_risk",
        geometry: { type: "Polygon", coordinates: [[
          [-69.1360, -33.7360], [-69.1280, -33.7360], [-69.1200, -33.7380],
          [-69.1200, -33.7440], [-69.1300, -33.7440], [-69.1360, -33.7400],
          [-69.1360, -33.7360]]] },
        center: [-69.1290, -33.7390],
        radius_m: null, pct: 54,
        label: "Zona de riesgo alto de fuego",
        source: "modelo ar-lgbm-0.1",
        date: "2026-11-15",
      },
      {
        kind: "dry",
        geometry: { type: "Polygon", coordinates: [[
          [-69.1236, -33.7482], [-69.1160, -33.7482],
          [-69.1160, -33.7507], [-69.1236, -33.7507],
          [-69.1236, -33.7482]]] },
        center: [-69.1198, -33.7494],
        radius_m: null, pct: 18,
        label: "Suelo más seco que lo normal (ajo)",
        source: "NASA POWER GWETROOT",
        date: "2026-11-15",
      },
    ],
    nearby: {
      fire_stations: [
        { name: "Bomberos Voluntarios de San Carlos",
          distance_km: 13.9, lon: -69.044, lat: -33.766 },
      ],
      hospitals: [
        { name: "Hospital Scaravelli",
          distance_km: 25.7, lon: -69.018, lat: -33.577 },
      ],
      water: [
        { name: "Acequia / distribuidor La Consulta", kind: "canal",
          distance_km: 0.8, lon: -69.121, lat: -33.742 },
      ],
      source: "OpenStreetMap contributors",
      degraded: false,
    },
    summary: {
      headline: "Fuego en el monte vecino y helada tardía: las dos cosas a mirar en Finca Los Álamos.",
      bullets: [
        "Hay un foco satelital a 1,8 km de la banda de monte, que está seca: guardafuegos al día y nada de quema.",
        "El ajal tiene el suelo más seco que lo normal para noviembre; conviene revisar el riego antes de levantar la cosecha.",
        "Los bomberos voluntarios más cercanos están a unos 14 km, en San Carlos.",
      ],
      source: "template",
    },
    sources: [
      { id: "power",
        text: "NASA POWER — clima diario 0,5°×0,625° (lluvia, temperatura, humedad de raíz GWETROOT)" },
      { id: "risk_model",
        text: "Modelo de riesgo de fuego ar-lgbm-0.1 — probabilidad a 7 días por celda H3" },
      { id: "firms",
        text: "NASA FIRMS — detecciones activas VIIRS/MODIS de las últimas 72 h" },
      { id: "field_grid",
        text: "Grilla de campo precalculada (IMERG lluvia, SRTM pendiente, cobertura de suelo)" },
      { id: "osm",
        text: "OpenStreetMap contributors — servicios cercanos (bomberos, hospitales, agua)" },
    ],
    degraded: false,
    degraded_reason: null,
  },
};

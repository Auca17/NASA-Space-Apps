/** Parcels domain: the request/response contract for
 * POST /api/field/parcels (docs/briefs/devin/32-parcels-api.md),
 * the fixed crop palette, and the small pure helpers the UI needs. */
import type { Multi } from "./selection";

export const MAX_PARCELS = 20;
export const NOTE_MAX = 300;

/** What the user declares about a drawn parcel (geom in [lat,lon]).
 * `geom` is one Polygon (outer ring + holes): the API takes a single
 * polygon per parcel, so a drawing clipped into several pieces becomes
 * several parcels. */
export interface ParcelInput {
  id: string;
  name: string;
  /** crop id from knowledge/crops.json, or "otro" / "sin_cultivo". */
  crop: string;
  geom: import("./selection").Poly;
  /** synthesized whole-field parcel (no user split, no crop picked):
   * the UI labels it "Todo el campo" and hides the crop. */
  wholeField?: boolean;
  /** a zone of the automatic division of the field (not drawn by the
   * user): the map keeps the division outline instead of a crop fill. */
  zone?: boolean;
}

export type WaterAccess = "none" | "well" | "channel" | "irrigation" | "unknown";
export type Concern = "fire" | "water" | "frost" | "heat" | "flood" | "access";
export const CONCERNS: Concern[] =
  ["fire", "water", "frost", "heat", "flood", "access"];

export interface Needs {
  water_access: WaterAccess;
  emergency_distance_km?: number;
  concerns: Concern[];
  notes?: string;
}

/* ------------------------------------------------ API contract ------ */

export interface ApiIndicator {
  pct?: number;
  level?: string;
  days_over_35?: number;
  frost_free_days?: number;
  basis: string;
}

export interface ApiAlert {
  kind: string;
  severity: string;
  text: string;
}

export interface SnowIndicator {
  days_per_year: number | null;
  pct_years_with_snow: number | null;
  basis: string;
}

export interface HailIndicator {
  available: boolean;
  basis: string;
}

export interface EnsoIndicator {
  phase_now: "el_nino" | "la_nina" | "neutral" | null;
  oni: number | null;
  oni_period?: string;
  rain_effect_pct?: { el_nino?: number | null; la_nina?: number | null };
  basis: string;
}

export interface FloodIndicator {
  available?: boolean;
  heavy_rain_days_yr?: number;
  low_slope?: boolean;
  basis: string;
}

export interface ApiEconomics {
  currency?: string;
  expected_yield_t_ha: number | null;
  yield_source?: "user" | "magyp_department" | string;
  revenue_per_ha?: number | null;
  cost_per_ha?: number | null;
  margin_per_ha?: number | null;
  margin_total?: number | null;
  break_even_yield_t_ha?: number | null;
  risk_adjusted_margin_per_ha?: number | null;
  basis?: string;
}

export interface ApiParcel {
  id: string;
  crop: string;
  area_ha: number;
  indicators: {
    fire: ApiIndicator;
    water: ApiIndicator;
    heat: ApiIndicator;
    frost: ApiIndicator;
    snow?: SnowIndicator;
    hail?: HailIndicator;
    enso?: EnsoIndicator;
    flood?: FloodIndicator;
  };
  /** display order of hazard ids (profile ranks first, then severity). */
  order?: string[];
  /** computed but hidden from the main view. */
  extra?: { id: string; hidden?: boolean }[];
  economics?: ApiEconomics;
  alerts: ApiAlert[];
  /** Last 24 months vs normals for this parcel (task 47). */
  timeline?: import("../api/types").DiagTimeline;
}

export interface ApiZone {
  kind: "hotspot" | "fire_risk" | "dry" | "bare_soil" | string;
  geometry: { type: string; coordinates: number[][][] };
  /** [lon, lat] */
  center: [number, number] | null;
  radius_m: number | null;
  pct: number | null;
  label: string;
  source: string;
  date: string;
}

export interface ApiNearbyItem {
  name: string;
  kind?: string;
  distance_km: number;
  lon: number;
  lat: number;
}

export interface ParcelsResponse {
  parcels: ApiParcel[];
  zones: ApiZone[];
  nearby: {
    fire_stations: ApiNearbyItem[];
    hospitals: ApiNearbyItem[];
    water: ApiNearbyItem[];
    source: string;
    degraded: boolean;
  };
  summary: { headline: string; bullets: string[]; source: string };
  sources: { id: string; text: string }[];
  degraded: boolean;
  degraded_reason: string | null;
}

/** GeoJSON ring ([lon,lat], closed) from a [lat,lon] ring. */
const toGeoRing = (ring: [number, number][]) => {
  const pts = ring.map(([la, lo]) => [lo, la]);
  if (pts.length &&
      (pts[0][0] !== pts[pts.length - 1][0] ||
       pts[0][1] !== pts[pts.length - 1][1])) {
    pts.push([...pts[0]]);
  }
  return pts;
};

const toPolygon = (poly: [number, number][][]) =>
  ({ type: "Polygon", coordinates: poly.map(toGeoRing) });

/** The largest polygon of a Multi — the contract takes one Polygon as
 * the boundary, so multi-piece fields send their main piece. */
export function largestPoly(m: Multi): import("./selection").Poly {
  let best = m[0] ?? [], ba = -1;
  for (const p of m) {
    const a = Math.abs(p[0]?.reduce((s, pt, i, r) => {
      const q = r[(i + 1) % r.length];
      return s + pt[1] * q[0] - q[1] * pt[0];
    }, 0) ?? 0);
    if (a > ba) { ba = a; best = p; }
  }
  return best;
}

/** Request body for POST /api/field/parcels. `profile` is the farmer
 * profile from domain/parcelsProfile (priorities, hidden, economics). */
export function parcelsBody(
    boundary: Multi, parcels: ParcelInput[], needs: Needs | null,
    lang: string,
    profile?: {
      priorities: { id: string; rank: number }[];
      hidden: string[];
      economics?: { currency: string;
                    parcels: Record<string, {
                      cost_per_ha?: number;
                      price_per_t?: number;
                      expected_yield_t_ha?: number;
                    }> };
    }) {
  const fallback: Needs = { water_access: "unknown", concerns: [] };
  const n = needs ?? fallback;
  return {
    boundary: toPolygon(largestPoly(boundary)),
    parcels: parcels.map((p) => ({
      id: p.id, name: p.name, crop: p.crop,
      polygon: toPolygon(p.geom),
    })),
    needs: {
      water_access: n.water_access,
      ...(n.emergency_distance_km != null
          ? { emergency_distance_km: n.emergency_distance_km } : {}),
      concerns: n.concerns,
      ...(n.notes ? { notes: n.notes.slice(0, NOTE_MAX) } : {}),
    },
    ...(profile ? { profile } : {}),
    lang,
  };
}

/* ------------------------------------------------ crop palette ------ */
/* Fixed colors, picked from the Okabe–Ito / Tol qualitative sets so
 * they stay distinguishable for common color-blindness. The map still
 * never relies on color alone: every parcel carries name + crop icon. */
export const CROP_COLORS: Record<string, string> = {
  soja: "#e69f00",        // orange
  maiz: "#f0e442",        // yellow
  trigo: "#d4a017",       // wheat gold
  girasol: "#d55e00",     // vermillion
  sorgo: "#cc79a7",       // reddish purple
  cebada: "#0072b2",      // blue
  mani: "#8c564b",        // brown
  algodon: "#9e9e9e",     // grey (white bolls)
  alfalfa: "#009e73",     // bluish green
  avena: "#56b4e9",       // sky blue
  centeno: "#7a3e9d",     // purple
  vicia: "#7cb342",       // light green
  colza: "#ffd24a",       // rapeseed yellow
  garbanzo: "#a6761d",    // dark tan
  arveja: "#4dc36b",      // pea green
  vid: "#8e44ad",         // grape violet
  olivo: "#6d8b3c",       // olive green
  ajo: "#e0a458",         // garlic tan
  frutal_carozo: "#e377c2", // blossom pink
  monte_nativo: "#4f5d45",  // brushland sage
  otro: "#8a8f98",        // neutral grey
  sin_cultivo: "#6b5d4f", // stubble brown
};

export const cropColor = (crop: string): string =>
  CROP_COLORS[crop] ?? CROP_COLORS.otro;

/** Icon family per crop (drives the SVG in CropIcon). */
export function cropIconKind(crop: string): string {
  switch (crop) {
    case "maiz": case "trigo": case "cebada": case "avena":
    case "centeno": case "sorgo":
      return "grain";
    case "soja": case "vicia": case "garbanzo": case "arveja":
    case "mani": case "alfalfa":
      return "pod";
    case "girasol": case "colza":
      return "flower";
    case "algodon":
      return "boll";
    case "sin_cultivo":
      return "bare";
    default:
      return "leaf";
  }
}

/* ------------------------------------------------ result helpers ---- */

/** True when the parcel carries a high-severity fire alert. */
export function hasHighFireAlert(p: ApiParcel): boolean {
  return p.alerts.some((a) => a.kind === "fire" && a.severity === "high");
}

/** Parcels with high fire alerts first (they anchor the alert block). */
export function parcelsWithHighFire(res: ParcelsResponse): ApiParcel[] {
  return res.parcels.filter(hasHighFireAlert);
}

export function parcelsWithDry(res: ParcelsResponse): ApiParcel[] {
  return res.parcels.filter((p) =>
    p.alerts.some((a) => a.kind === "dry"));
}

/** Map API error codes to i18n keys (plain Spanish, no codes shown). */
export function parcelErrorKey(code: string | undefined): string {
  switch (code) {
    case "invalid_geometry":
    case "parcel_outside":
      return "parcels.error.geometry";
    case "too_many_parcels":
      return "parcels.error.tooMany";
    case "rate_limited":
      return "parcels.error.rate";
    case "upstream":
    case "unavailable":
      return "parcels.error.upstream";
    default:
      return "parcels.error.generic";
  }
}

/** Best-effort crop id from a free label (demo lots come with a
 * Spanish crop_label like "Soja", "Maíz", "Sin cultivo"). */
export function normalizeCropLabel(label: string | undefined): string {
  if (!label) return "otro";
  const s = label.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const table: Record<string, string> = {
    soja: "soja", maiz: "maiz", trigo: "trigo", girasol: "girasol",
    sorgo: "sorgo", cebada: "cebada", mani: "mani", algodon: "algodon",
    alfalfa: "alfalfa", avena: "avena", centeno: "centeno",
    vicia: "vicia", colza: "colza", garbanzo: "garbanzo",
    arveja: "arveja",
    "sin cultivo": "sin_cultivo", otro: "otro",
  };
  return table[s] ?? "otro";
}


/** Display names of the catalog crops (back/knowledge/crops.json), so
 * the UI never shows a raw id like "maiz". */
const CROP_NAMES: Record<string, { es: string; en: string }> = {
  "soja": {
    "es": "Soja",
    "en": "Soybean"
  },
  "maiz": {
    "es": "Maíz",
    "en": "Maize"
  },
  "trigo": {
    "es": "Trigo",
    "en": "Wheat"
  },
  "girasol": {
    "es": "Girasol",
    "en": "Sunflower"
  },
  "sorgo": {
    "es": "Sorgo granífero",
    "en": "Grain sorghum"
  },
  "cebada": {
    "es": "Cebada",
    "en": "Barley"
  },
  "mani": {
    "es": "Maní",
    "en": "Peanut"
  },
  "algodon": {
    "es": "Algodón",
    "en": "Cotton"
  },
  "alfalfa": {
    "es": "Alfalfa (pastura)",
    "en": "Alfalfa (pasture)"
  },
  "avena": {
    "es": "Avena",
    "en": "Oat"
  },
  "centeno": {
    "es": "Centeno (cobertura)",
    "en": "Cereal rye (cover crop)"
  },
  "vicia": {
    "es": "Vicia (cobertura)",
    "en": "Vetch (cover crop)"
  },
  "colza": {
    "es": "Colza / carinata",
    "en": "Rapeseed / carinata"
  },
  "garbanzo": {
    "es": "Garbanzo",
    "en": "Chickpea"
  },
  "arveja": {
    "es": "Arveja",
    "en": "Field pea"
  },
  "vid": {
    "es": "Vid (vinificación)",
    "en": "Grapevine (wine)"
  },
  "olivo": {
    "es": "Olivo",
    "en": "Olive"
  },
  "ajo": {
    "es": "Ajo",
    "en": "Garlic"
  },
  "frutal_carozo": {
    "es": "Frutales de carozo (durazno, ciruela, cereza)",
    "en": "Stone fruit (peach, plum, cherry)"
  },
  "monte_nativo": {
    "es": "Monte nativo",
    "en": "Native woodland"
  }
};

export function cropDisplayName(id: string, lang: string): string {
  const n = CROP_NAMES[id];
  if (n) return lang === "en" ? n.en : n.es;
  const plain = id.replace(/_/g, " ");
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

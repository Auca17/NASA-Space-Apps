/** Contract types, hand-written from docs/data-contract.md. */

export interface MetaJson {
  version: string;
  generated_at: string;
  range: { start: string; end: string };
  baseline: { start: string; end: string };
  h3: { globe: number; panel: number; shard: number; cache: number };
  semaphore: {
    window_days: number;
    categories: Record<string, [number, number]>;
    ratio_min_median: number;
  };
  low_confidence_periods?: [string, string][];
}

export interface GlobeShard {
  month: string;
  cells: [string, number][]; // [h3_res3, n]
}

export type { CalShard } from "../domain/fireSeries";
export type { DailyShard } from "../domain/semaphore";
export type { RiskCell } from "../domain/risk";

export interface RiskShard {
  generated_at: string;
  horizon_days?: number;
  fires_365d_complete?: boolean;
  cells: Record<string, import("../domain/risk").RiskCell>;
}

export interface LiveResponse {
  mode?: "points" | "cells";
  generated_at?: string;
  window?: string;
  bbox?: number[];
  points?: { lat: number; lon: number; frp?: number; acq_datetime?: string }[];
  cells?: { h3: string; n: number; frp_max?: number }[];
  /** ISO A2 of the bbox centre (Natural Earth), when resolved. */
  country?: string | null;
  note?: string;
}

export interface Card {
  id: string;
  value: number | string | null;
  unit?: string | null;
  text: string;
  /** English rendering of `text` (the Spanish one feeds the engines). */
  text_en?: string;
  source: string;
  resolution?: string;
  confidence: "high" | "medium" | "low";
  /** rain card: 12 monthly means mm/month (2001 -> last full year). */
  rain_monthly_mm?: number[];
  /** Scenario present: unmodified baseline value + numeric delta. */
  baseline_value?: number | string | null;
  delta?: number;
  /** fire_weather card: single INTA stop conditions met (last 3 days). */
  stop_conditions?: string[];
  stop_detail?: Record<string, string>;
  stop_detail_en?: Record<string, string>;
}

export interface CalendarRow {
  id: string;
  label?: string;
  levels: (number | null)[];
}

export interface Measure {
  id: string;
  name: string;
  name_en?: string;
  why_en?: string;
  factor?: string;
  why?: string;
  benefit?: string;
  requires?: Record<string, unknown>;
  /** Extra checklist items (e.g. harvester checks from the INTA Chaco
   * guide). */
  checks?: string[];
  cost?: string;
  source?: string;
}

export interface DiagnoseResponse {
  diagnosis_id: string;
  area_ha: number;
  centroid: [number, number];
  /** Compatible additions 2026-11: agronomic zone/province/country of
   * the plot centroid (`zone` is read by /api/field/rotations). */
  zone?: string;
  province?: string | null;
  country?: string | null;
  h3_r5: string[];
  h3_r6: string[];
  cards: Card[];
  calendar: { months: string[]; rows: CalendarRow[] };
  measures?: Measure[];
  measures_gaps?: string[];
  /** Climate scenario applied to the daily series (echoed). */
  scenario?: { rain_pct: number; temp_delta_c: number };
  /** Elevation correction (task 20): plot vs POWER cell altitude and
   * the adjustment applied to T2M_MAX/T2M_MIN (−6.5 °C/km). */
  elevation_m?: number | null;
  power_cell_elevation_m?: number | null;
  temp_adjust_c?: number;
  /** Degraded response: the backend returned whatever it could without
   * some sources. The UI shows the reason + retry, never a blank. */
  degraded?: boolean;
  degraded_reason?: string;
}

export interface Strategy {
  id: string;
  name: string;
  name_en?: string;
  is_current: boolean;
  score: number;
  confidence: string;
  indicators: Record<string, unknown>;
  why: string;
  evidence: { text: string; indicator: string; source?: string }[];
  benefits: Record<string, unknown>;
  gaps: string[];
  risks: string[];
  sequence: { crop: string; start: string; end: string; cover?: boolean }[];
  measures?: Measure[];
  measures_gaps?: string[];
}

export interface RotationsResponse {
  diagnosis_id?: string;
  strategies: Strategy[];
  disclaimer: string;
  /** "low" when the zone has no validated rotation (e.g. Patagonia). */
  confidence?: string;
  /** Top-level gaps, e.g. "sin rotaciones validadas para esta zona". */
  gaps?: string[];
  /** Documented rotation references for zones without a computed one
   * (e.g. INTA Patagonia); shown in the empty state, never computed. */
  zone_references?: { zone: string; text: string; source: string }[];
  /** Strategy ids ranked without scenario (diagnosis carried one). */
  baseline_order?: string[];
}

export interface ExplainResponse {
  strategies: { id: string; text: string; cites?: string[] }[];
  /** "ai" = validated model paragraph; "template" = fallback. */
  mode?: "ai" | "template";
}

export interface RotationEntry {
  id: string;
  name: { es?: string; en?: string };
  years: number;
  sequence: { crop: string; start: string; end: string }[];
}

export interface CropEntry {
  id: string;
  name: { es?: string; en?: string };
}

/** A documented incident shown next to the prevention measures
 * (`knowledge/cases.json`, contract 3.4). kind news_report = a press
 * report, not a worker testimony. */
export interface CaseEntry {
  id: string;
  place: string;
  date: string;
  summary: string;
  unknown?: string;
  source: { title?: string; url?: string };
  lessons?: string[];
  kind?: string;
}

/* ------------------------------------------------- orin (contract 2.9) -- */

export interface OrinVariable {
  id: string;                       // temp_max | temp_min | ndvi | soil_moisture
  satellite: { dataset: string; resolution: string; period: string };
  field: { source: string; n_sites: number };
  n: number;
  rmse: number;
  bias: number;                     // satellite minus field
  r: number;
  rmse_adjusted?: number;           // after elevation correction (task 20)
  bias_adjusted?: number;
  r_adjusted?: number;
  adjustment?: string;
  /** "field" = weather stations; "finer_satellite" = a finer satellite
   * used as reference (e.g. Sentinel-2 vs MODIS). Absent on old files. */
  reference_kind?: "field" | "finer_satellite";
  unit: string;
  quality: "good" | "fair" | "poor";
}

export interface OrinValidation {
  version: string;
  synthetic?: boolean;
  generated_at?: string;
  source?: string;
  variables: OrinVariable[];
}

export interface OrinLotProps {
  id: string;
  name: string;
  crop_label: string;
  zone: string;
  synthetic?: boolean;
  real_data_available?: boolean;
}

export interface OrinLots {
  type: "FeatureCollection";
  synthetic?: boolean;
  features: {
    type: "Feature";
    geometry: { type: "Polygon"; coordinates: number[][][] };
    properties: OrinLotProps;
  }[];
}

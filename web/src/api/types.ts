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
}

export interface ExplainResponse {
  strategies: { id: string; text: string }[];
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

/** Typed clients — one function per contract file/endpoint. */
import { dataUrl, apiUrl, fetchJson, postJson } from "./client";
import type { LiveBody } from "../domain/live";
import type {
  MetaJson, GlobeShard, CalShard, DailyShard, RiskShard,
  LiveResponse, DiagnoseResponse, RotationsResponse,
  ExplainResponse, RotationEntry, CropEntry, CaseEntry, RiskCell,
  OrinValidation, OrinLots,
} from "./types";

export const meta = () => fetchJson<MetaJson>(dataUrl("meta.json"));

export const globeMonth = (yyyyMm: string) =>
  fetchJson<GlobeShard>(dataUrl(`globe/${yyyyMm}.json`));

export const fireCal = (r2: string) =>
  fetchJson<CalShard>(dataUrl(`fire/cal/${r2}.json`));

export const fireDaily = (r2: string) =>
  fetchJson<DailyShard>(dataUrl(`fire/daily/${r2}.json`));

export const riskShard = (r2: string) =>
  fetchJson<RiskShard>(dataUrl(`risk/${r2}.json`));

export const analogsShard = (r2: string) =>
  fetchJson<{ cells: Record<string, unknown> }>(
    dataUrl(`field/analogs/${r2}.json`));

export const gridShard = (r2: string) =>
  fetchJson<{ cells: Record<string, unknown> }>(
    dataUrl(`field/grid/${r2}.json`));

export const knowledgeRotations = () =>
  fetchJson<{ rotations: RotationEntry[] }>(
    dataUrl("knowledge/rotations.json"));

export const knowledgeCrops = () =>
  fetchJson<{ crops: CropEntry[] }>(dataUrl("knowledge/crops.json"));

export const knowledgeCases = () =>
  fetchJson<{ cases: CaseEntry[] }>(dataUrl("knowledge/cases.json"));

export const orinValidation = () =>
  fetchJson<OrinValidation>(dataUrl("orin/validation.json"));

export const orinLots = () =>
  fetchJson<OrinLots>(dataUrl("orin/lots.geojson"));

export function pointsCsvUrl(r2: string, year: number): string {
  return dataUrl(`fire/points/${r2}/${year}.csv.gz`);
}

// ------------------------------------------------------------- endpoints --

export function apiRisk(lat: number, lon: number) {
  return fetchJson<RiskCell & { h3_r5?: string }>(
    apiUrl(`/api/risk?lat=${lat}&lon=${lon}`));
}

export function apiLive(window: string, bbox: [number, number, number, number]) {
  return fetchJson<LiveResponse>(
    apiUrl(`/api/live?window=${window}&bbox=${bbox.join(",")}`));
}

/** Live query that keeps failures apart from empty results. */
export async function apiLiveResult(window: string,
    bbox: [number, number, number, number]):
    Promise<{ ok: true; data: LiveBody } | { ok: false; status: number }> {
  try {
    const r = await fetch(
      apiUrl(`/api/live?window=${window}&bbox=${bbox.join(",")}`));
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: (await r.json()) as LiveBody };
  } catch {
    return { ok: false, status: 0 };
  }
}

export function apiDiagnose(body: unknown) {
  return postJson<DiagnoseResponse>("/api/field/diagnose", body);
}

export function apiRotations(body: unknown) {
  return postJson<RotationsResponse>("/api/field/rotations", body);
}

export interface EcostressDemo {
  note: string;
  sites: Record<string, {
    crop: string; bbox: [number, number, number, number];
    n_scenes: number;
    bias_c: number | null; rmse_c: number | null;
    scenes: { date: string; lst_c: number; n_px: number;
              power_t2m_max_c?: number }[];
  }>;
}

export const ecostressDemo = () =>
  fetchJson<EcostressDemo>(dataUrl("ecostress_demo.json"));

export function apiExplain(body: unknown) {
  return postJson<ExplainResponse>("/api/field/explain", body);
}

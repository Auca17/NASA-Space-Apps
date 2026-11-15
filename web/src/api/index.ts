/** Typed clients — one function per contract file/endpoint. */
import { dataUrl, apiUrl, fetchJson, postJson } from "./client";
import type { LiveBody } from "../domain/live";
import type {
  MetaJson, GlobeShard, CalShard, DailyShard, RiskShard,
  LiveResponse, DiagnoseResponse, RotationsResponse,
  ExplainResponse, RotationEntry, CropEntry, RiskCell,
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

export function apiExplain(body: unknown) {
  return postJson<ExplainResponse>("/api/field/explain", body);
}

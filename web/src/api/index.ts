/** Typed clients — one function per contract file/endpoint. */
import { dataUrl, apiUrl, fetchJson, postJson } from "./client";
import type { LiveBody } from "../domain/live";
import type {
  MetaJson, GlobeShard, CalShard, DailyShard, RiskShard,
  LiveResponse, DiagnoseResponse, RotationsResponse,
  ExplainResponse, RotationEntry, CropEntry, CaseEntry, RiskCell,
  OrinValidation, OrinLots, MoistureResult, CropDetection, CropZones,
} from "./types";

function cachedByKey<T>(load: (key: string) => Promise<T | null>, max: number) {
  const cache = new Map<string, { expires: number; value: Promise<T | null> }>();
  return (key: string) => {
    const entry = cache.get(key);
    if (entry && entry.expires > Date.now()) return entry.value;
    cache.delete(key);
    const value = load(key).then((data) => {
      if (!data && cache.get(key)?.value === value) cache.delete(key);
      return data;
    });
    cache.set(key, { expires: Date.now() + 10 * 60_000, value });
    if (cache.size > max) cache.delete(cache.keys().next().value!);
    return value;
  };
}

const loadMeta = cachedByKey(() => fetchJson<MetaJson>(dataUrl("meta.json")), 1);
export const meta = () => loadMeta("meta");

export const globeMonth = cachedByKey((yyyyMm) =>
  fetchJson<GlobeShard>(dataUrl(`globe/${yyyyMm}.json`)), 8);

export const fireCal = cachedByKey((r2) =>
  fetchJson<CalShard>(dataUrl(`fire/cal/${r2}.json`)), 8);

export const fireDaily = cachedByKey((r2) =>
  fetchJson<DailyShard>(dataUrl(`fire/daily/${r2}.json`)), 4);

export const riskShard = (r2: string) =>
  fetchJson<RiskShard>(dataUrl(`risk/${r2}.json`));

export const analogsShard = (r2: string) =>
  fetchJson<{ cells: Record<string, unknown> }>(
    dataUrl(`field/analogs/${r2}.json`));

export const gridShard = cachedByKey((r2) =>
  fetchJson<{ cells: Record<string, unknown> }>(
    dataUrl(`field/grid/${r2}.json`)), 24);

export const apiFieldCatalog = () =>
  fetchJson<{ rotations: RotationEntry[]; crops: CropEntry[] }>(
    apiUrl("/api/field/catalog"));

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
  return fetchJson<RiskCell & { h3_r5?: string; country?: string | null }>(
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

export async function apiDiagnose(body: unknown, signal?: AbortSignal):
  Promise<{ diagnosis: DiagnoseResponse | null; problem?: string }> {
  try {
    const response = await fetch(apiUrl("/api/field/diagnose"), {
      method: "POST", body: JSON.stringify(body), signal,
      headers: { "Content-Type": "application/json" },
    });
    if (response.ok) return { diagnosis: await response.json() as DiagnoseResponse };
    if (response.status === 400) {
      const error = await response.json() as { error?: string; detail?: string };
      return { diagnosis: null, problem: error.detail?.includes("area must") ? "area"
        : error.error === "invalid_polygon" ? "polygon" : "invalid" };
    }
  } catch {
    // The session may have been cancelled or the connection unavailable.
  }
  return { diagnosis: null };
}

export function apiMoisture(body: unknown, signal: AbortSignal) {
  return postJson<MoistureResult>("/api/field/moisture-zones", body, signal);
}

const cropCache = new Map<string, Promise<CropDetection | null>>();
/** Crop detected automatically for a parcel; cached per geometry so every
 * panel that shows the same parcel shares one request. Failures are not
 * cached, so a later render retries. */
export function apiCrop(body: unknown): Promise<CropDetection | null> {
  const key = JSON.stringify(body);
  let hit = cropCache.get(key);
  if (!hit) {
    hit = postJson<CropDetection>("/api/field/crop", body);
    cropCache.set(key, hit);
    hit.then((r) => { if (!r) cropCache.delete(key); });
    if (cropCache.size > 200) cropCache.delete(cropCache.keys().next().value!);
  }
  return hit;
}

export function apiCropZones(body: unknown) {
  return postJson<CropZones>("/api/field/crop-zones", body);
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

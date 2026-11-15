/** Typed clients — one function per contract file/endpoint.
 * The fire-history shards, live detections and risk-by-area clients
 * left with the fire/live views (task 49); `/api/live` stays on the
 * backend for the n8n alert workflows. */
import { dataUrl, apiUrl, fetchJson, postJson } from "./client";
import type { CropRecommendations } from "./types";
import type {
  DiagnoseResponse, RotationsResponse,
  ExplainResponse, RotationEntry, CropEntry, CaseEntry,
  OrinValidation, OrinLots, MoistureResult, CropDetection, CropZones,
  CurrentCrop,
} from "./types";

export const apiFieldCatalog = () =>
  fetchJson<{ rotations: RotationEntry[]; crops: CropEntry[] }>(
    apiUrl("/api/field/catalog"));

export const knowledgeCases = () =>
  fetchJson<{ cases: CaseEntry[] }>(dataUrl("knowledge/cases.json"));

export const orinValidation = () =>
  fetchJson<OrinValidation>(dataUrl("orin/validation.json"));

export const orinLots = () =>
  fetchJson<OrinLots>(dataUrl("orin/lots.geojson"));

// ------------------------------------------------------------- endpoints --

/** Plot risk/country lookup used to pre-select the emergency numbers
 * and flag the plot-level fire risk; 404 means "no model output". */
export function apiRisk(lat: number, lon: number) {
  return fetchJson<{ h3_r5?: string; country?: string | null;
    ratio?: number | null; risk?: number | null }>(
    apiUrl(`/api/risk?lat=${lat}&lon=${lon}`));
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
        : error.error === "invalid_polygon" ? "polygon"
        : error.error === "no_land" ? "noLand" : "invalid" };
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

const currentCache = new Map<string, Promise<CurrentCrop | null>>();
/** What is on the field now (slow: reads several Sentinel-2 dates), shared
 * by the automatic split and the panel; failures are retried later. */
export function apiCurrentCrop(body: unknown): Promise<CurrentCrop | null> {
  const key = JSON.stringify(body);
  let hit = currentCache.get(key);
  if (!hit) {
    hit = postJson<CurrentCrop>("/api/field/current-crop", body);
    currentCache.set(key, hit);
    hit.then((r) => { if (!r || r.status === "unavailable") currentCache.delete(key); });
    if (currentCache.size > 100) currentCache.delete(currentCache.keys().next().value!);
  }
  return hit;
}

export function apiCropZones(body: unknown) {
  return postJson<CropZones>("/api/field/crop-zones", body);
}

export function apiRotations(body: unknown) {
  return postJson<RotationsResponse>("/api/field/rotations", body);
}

export function apiCropRecommendations(body: unknown, signal: AbortSignal) {
  return postJson<CropRecommendations>("/api/field/recommendations", body, signal);
}

export function apiRecommendationZones(body: unknown, signal: AbortSignal) {
  return postJson<{ zones: import("./types").MoistureZone["geometry"][] }>(
    "/api/field/recommendation-zones", body, signal);
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

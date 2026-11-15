/** Client for POST /api/field/parcels.
 * Kept inside features/parcels so api/index.ts (shared file, other
 * terminals) stays untouched. Falls back to the shipped fixture only
 * when the endpoint is not deployed (404) — flagged `fixture` so the
 * panel can say the data is an example. */
import { apiUrl } from "../../api/client";
import {
  parcelErrorKey, type ParcelsResponse,
} from "../../domain/parcels";
import fixtureJson from "./__fixtures__/parcels_example.json";

export type ParcelsResult =
  | { ok: true; res: ParcelsResponse; fixture: boolean }
  | { ok: false; errorKey: string };

export function fixtureResult(): ParcelsResult {
  return { ok: true, res: fixtureJson as ParcelsResponse, fixture: true };
}

export async function apiParcels(body: unknown): Promise<ParcelsResult> {
  try {
    const r = await fetch(apiUrl("/api/field/parcels"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      return { ok: true, res: (await r.json()) as ParcelsResponse,
               fixture: false };
    }
    if (r.status === 404) return fixtureResult();
    const data = await r.json().catch(() => null) as
      { detail?: { code?: string }; code?: string } | null;
    return { ok: false,
             errorKey: parcelErrorKey(data?.detail?.code ?? data?.code) };
  } catch {
    return { ok: false, errorKey: parcelErrorKey(undefined) };
  }
}

/** Guided demo farms (task 52): the pampa grain farm is the primary
 * example — three annual crops where the rotation engine shines;
 * Mendoza stays as the secondary farm where perennial crops honestly
 * limit what rotations can say. Both producer/farm names, profiles
 * and economics are fictional; the saved captures are real API
 * responses (see pampaCached.json / mendozaCached.json). */
import type { Needs, ParcelInput, ParcelsResponse } from "../../domain/parcels";
import type { Economics, Profile } from "../../domain/parcelsProfile";
import type {
  DiagnoseResponse, RotationsResponse,
} from "../../api/types";
import type { Multi } from "../../domain/selection";
import {
  PAMPA_BOUNDARY, PAMPA_CACHED, PAMPA_ECON,
  PAMPA_NEEDS, PAMPA_PARCELS, PAMPA_PROFILE,
} from "./pampaFarm";
import {
  MENDOZA_BOUNDARY, MENDOZA_CACHED, MENDOZA_ECON,
  MENDOZA_NEEDS, MENDOZA_PARCELS, MENDOZA_PROFILE,
} from "./mendozaFarm";

export type DemoId = "pampa" | "mendoza";

export interface DemoCached {
  date: string;
  res: ParcelsResponse;
  diag?: DiagnoseResponse;
  rotations?: RotationsResponse;
  explain: Record<string, string>;
  inferred: { id: string; matched: boolean } | null;
  derived: { sel: string[]; warn: string[]; unmapped: string[] };
}

export interface DemoFarm {
  id: DemoId;
  boundary: Multi;
  parcels: ParcelInput[];
  needs: Needs;
  profile: Profile;
  econ: Economics;
  cached: DemoCached;
  /** i18n keys for the farm name, its area label, the fictional
   * producer line and the two-sentence story. */
  nameKey: string;
  areaKey: string;
  producerKey: string;
  storyKey: string;
  /** The other demo, offered in the "Otros ejemplos" switcher. */
  other: { hash: string; labelKey: string };
  /** Note shown in the Rotaciones tab when perennial crops limit
   * what the engine compares (Mendoza); undefined for the pampa. */
  rotationsNoteKey?: string;
}

export const DEMO_FARMS: Record<DemoId, DemoFarm> = {
  pampa: {
    id: "pampa",
    boundary: PAMPA_BOUNDARY,
    parcels: PAMPA_PARCELS,
    needs: PAMPA_NEEDS,
    profile: PAMPA_PROFILE,
    econ: PAMPA_ECON,
    cached: PAMPA_CACHED,
    nameKey: "demo.pampa.name",
    areaKey: "demo.pampa.area",
    producerKey: "demo.pampa.producer",
    storyKey: "demo.pampa.story",
    other: { hash: "#demo-mendoza", labelKey: "demo.other.mendoza" },
  },
  mendoza: {
    id: "mendoza",
    boundary: MENDOZA_BOUNDARY,
    parcels: MENDOZA_PARCELS,
    needs: MENDOZA_NEEDS,
    profile: MENDOZA_PROFILE,
    econ: MENDOZA_ECON,
    cached: MENDOZA_CACHED,
    nameKey: "demo.mendoza.name",
    areaKey: "demo.mendoza.area",
    producerKey: "demo.mendoza.producer",
    storyKey: "demo.mendoza.story",
    other: { hash: "#demo-pampa", labelKey: "demo.other.pampa" },
    rotationsNoteKey: "demo.rot.perennials",
  },
};

export interface DemoRoute {
  farm: DemoId;
  /** &live: run the API calls instead of the saved capture (the
   * capture stays the fallback, labelled with its date). */
  live: boolean;
  /** &notour: skip the guided tour for this visit. */
  notour: boolean;
}

/** Which demo a hash deep-links to: "#demo" and "#demo-pampa" are the
 * pampa grain farm, "#demo-mendoza" the perennial one, and any other
 * "#demo…" hash falls back to the pampa farm. "&live"/"&notour" are
 * flag suffixes, not part of the farm id. */
export function demoForHash(hash: string): DemoRoute | null {
  const base = hash.split("&")[0];
  if (!base || !base.startsWith("#demo")) return null;
  return {
    farm: base === "#demo-mendoza" ? "mendoza" : "pampa",
    live: /[&#?]live\b/.test(hash),
    notour: /[&#?]notour\b/.test(hash),
  };
}

/** true when the hash deep-links into a demo (any "#demo…"). */
export const isDemoHash = (hash: string) => demoForHash(hash) != null;

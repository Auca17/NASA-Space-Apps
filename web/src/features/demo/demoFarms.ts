/** Guided demo farms (tasks 40/42): Pergamino is the primary example
 * — annual crops where the rotation engine shines; Mendoza stays as
 * the secondary perennial example where it honestly does not apply. */
import type { Needs, ParcelInput, ParcelsResponse } from "../../domain/parcels";
import type { Economics, Profile } from "../../domain/parcelsProfile";
import type { RotationsResponse } from "../../api/types";
import type { Multi } from "../../domain/selection";
import {
  PERGAMINO_BOUNDARY, PERGAMINO_CACHED, PERGAMINO_ECON,
  PERGAMINO_NEEDS, PERGAMINO_PARCELS, PERGAMINO_PROFILE,
} from "./pergaminoFarm";
import {
  MENDOZA_BOUNDARY, MENDOZA_CACHED, MENDOZA_ECON,
  MENDOZA_NEEDS, MENDOZA_PARCELS, MENDOZA_PROFILE,
} from "./mendozaFarm";

export type DemoId = "pergamino" | "mendoza";

export interface DemoFarm {
  id: DemoId;
  boundary: Multi;
  parcels: ParcelInput[];
  needs: Needs;
  profile: Profile;
  econ: Economics;
  cached: { date: string; res: ParcelsResponse };
  cachedRotations?: RotationsResponse;
  /** i18n keys for the farm name, its area label and the fictional
   * producer line. */
  nameKey: string;
  areaKey: string;
  producerKey: string;
  /** The other demo, offered as "Otro ejemplo: …" in the scope note. */
  other: { hash: string; labelKey: string };
  /** Note shown in the Rotaciones tab when the engine does not apply
   * (perennial crops); undefined for Pergamino. */
  rotationsNoteKey?: string;
}

export const DEMO_FARMS: Record<DemoId, DemoFarm> = {
  pergamino: {
    id: "pergamino",
    boundary: PERGAMINO_BOUNDARY,
    parcels: PERGAMINO_PARCELS,
    needs: PERGAMINO_NEEDS,
    profile: PERGAMINO_PROFILE,
    econ: PERGAMINO_ECON,
    cached: PERGAMINO_CACHED,
    cachedRotations: PERGAMINO_CACHED.rotations,
    nameKey: "demo.pergamino.name",
    areaKey: "demo.pergamino.area",
    producerKey: "demo.pergamino.producer",
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
    cachedRotations: MENDOZA_CACHED.rotations,
    nameKey: "demo.mendoza.name",
    areaKey: "demo.mendoza.area",
    producerKey: "demo.mendoza.producer",
    other: { hash: "#demo", labelKey: "demo.other.pergamino" },
    rotationsNoteKey: "demo.rot.perennials",
  },
};

/** Which demo a hash deep-links to: "#demo" is the primary Pergamino
 * example, "#demo-mendoza" the secondary perennial farm. */
export function demoForHash(hash: string): DemoId | null {
  if (hash === "#demo") return "pergamino";
  if (hash === "#demo-mendoza") return "mendoza";
  return null;
}

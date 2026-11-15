/** The two example fields offered by "Probar con un ejemplo": same
 * analysis screen as any field, only the parcels are pre-drawn. */
import type { Needs, ParcelInput, ParcelsResponse } from "../../domain/parcels";
import type { Economics, Profile } from "../../domain/parcelsProfile";
import type { Multi } from "../../domain/selection";
import {
  MENDOZA_BOUNDARY, MENDOZA_CACHED, MENDOZA_ECON, MENDOZA_NEEDS,
  MENDOZA_PARCELS, MENDOZA_PROFILE,
} from "./mendozaFarm";
import {
  PAMPA_BOUNDARY, PAMPA_CACHED, PAMPA_ECON, PAMPA_NEEDS,
  PAMPA_PARCELS, PAMPA_PROFILE,
} from "./pampaFarm";

export type DemoFarmId = "mendoza" | "pampa";

export interface DemoFarm {
  boundary: Multi;
  parcels: ParcelInput[];
  needs: Needs;
  profile: Profile;
  econ: Economics;
  cached: { date: string; res: ParcelsResponse };
  /** i18n keys of the label, the farm name and the producer line. */
  keys: { area: string; name: string; producer: string };
}

export const DEMO_FARMS: Record<DemoFarmId, DemoFarm> = {
  mendoza: {
    boundary: MENDOZA_BOUNDARY, parcels: MENDOZA_PARCELS,
    needs: MENDOZA_NEEDS, profile: MENDOZA_PROFILE, econ: MENDOZA_ECON,
    cached: MENDOZA_CACHED,
    keys: { area: "demo.farmArea", name: "demo.farmName",
            producer: "demo.producer" },
  },
  pampa: {
    boundary: PAMPA_BOUNDARY, parcels: PAMPA_PARCELS,
    needs: PAMPA_NEEDS, profile: PAMPA_PROFILE, econ: PAMPA_ECON,
    cached: PAMPA_CACHED,
    keys: { area: "demo.pampa.area", name: "demo.pampa.name",
            producer: "demo.pampa.producer" },
  },
};

/** Guided demo farm (task 40): a fictional producer on a real rural
 * location in Valle de Uco, Mendoza — between La Consulta and San
 * Carlos, where satellite imagery shows dense vineyards and orchards
 * along the acequias. ~145 ha with five parcels: a vineyard, an olive
 * grove, garlic, stone fruit and a strip of native monte along the
 * north edge.
 *
 * The producer, names and economics are invented. The cached fallback
 * in mendozaCached.json is a verbatim real POST /api/field/parcels
 * reply captured by scripts/capture-demo.mjs; it is only shown when
 * the live call fails — always labelled with its capture date. */
import type {
  Needs, ParcelInput, ParcelsResponse,
} from "../../domain/parcels";
import type { RotationsResponse } from "../../api/types";
import cachedJson from "./mendozaCached.json";
import type { Economics, Profile } from "../../domain/parcelsProfile";
import type { LatLon, Multi } from "../../domain/selection";

const r = (...pts: LatLon[]): LatLon[] => pts;

/** Field outline: a mostly-rectangular plot with a small jag on the
 * east edge, as these properties actually draw. [lat, lon] ring. */
export const MENDOZA_BOUNDARY: Multi = [[r(
  [-33.7408, -69.1300],
  [-33.7408, -69.1158],
  [-33.7424, -69.1150],
  [-33.7508, -69.1158],
  [-33.7512, -69.1294],
)]];

export const MENDOZA_PARCELS: ParcelInput[] = [
  {
    id: "vid",
    name: "La Vid",
    crop: "vid",
    geom: [r(
      [-33.7418, -69.1295], [-33.7418, -69.1236],
      [-33.7509, -69.1236], [-33.7507, -69.1290],
      [-33.7450, -69.1292],
    )],
  },
  {
    id: "olivo",
    name: "Los Olivos",
    crop: "olivo",
    geom: [r(
      [-33.7418, -69.1236], [-33.7418, -69.1160],
      [-33.7456, -69.1160], [-33.7456, -69.1236],
    )],
  },
  {
    id: "frutal",
    name: "Los Duraznos",
    crop: "frutal_carozo",
    geom: [r(
      [-33.7456, -69.1236], [-33.7456, -69.1160],
      [-33.7482, -69.1160], [-33.7482, -69.1236],
    )],
  },
  {
    id: "ajo",
    name: "El Ajal",
    crop: "ajo",
    geom: [r(
      [-33.7482, -69.1236], [-33.7482, -69.1160],
      [-33.7507, -69.1160], [-33.7507, -69.1236],
    )],
  },
  {
    id: "monte",
    name: "Banda de monte",
    crop: "monte_nativo",
    geom: [r(
      [-33.7410, -69.1295], [-33.7410, -69.1160],
      [-33.7418, -69.1160], [-33.7418, -69.1295],
    )],
  },
];

/** Needs step pre-answered for the demo: drip irrigation from a well,
 * the fire station a real distance away, frost/water/fire first. */
export const MENDOZA_NEEDS: Needs = {
  water_access: "well",
  emergency_distance_km: 14,
  concerns: ["frost", "water", "fire"],
};

/** Producer profile: frost, drought and fire first — the three
 * worries the fictional family declared. */
export const MENDOZA_PROFILE: Profile = {
  order: ["frost", "drought", "fire", "heat", "enso", "snow",
          "hail", "flood"],
  hidden: ["flood"],
};

/** Illustrative economics per parcel (USD). Monte has none. */
export const MENDOZA_ECON: Economics = {
  currency: "USD",
  parcels: {
    vid: { cost_per_ha: 2800, price_per_t: 220, expected_yield_t_ha: 14 },
    olivo: { cost_per_ha: 2400, price_per_t: 380, expected_yield_t_ha: 9 },
    frutal: { cost_per_ha: 2600, price_per_t: 450,
              expected_yield_t_ha: 22 },
    ajo: { cost_per_ha: 1800, price_per_t: 900, expected_yield_t_ha: 8 },
  },
};

/** Real API response captured by scripts/capture-demo.mjs, used only
 * when the live API or a provider is unreachable — the UI then says
 * "resultado guardado del <captured_at>". Parcel ids match
 * MENDOZA_PARCELS. */
const cached = cachedJson as unknown as {
  captured_at: string;
  response: ParcelsResponse;
  rotations?: RotationsResponse;
};
export const MENDOZA_CACHED: {
  date: string; res: ParcelsResponse;
  rotations?: RotationsResponse;
} = {
  date: cached.captured_at,
  res: cached.response,
  ...(cached.rotations ? { rotations: cached.rotations } : {}),
};


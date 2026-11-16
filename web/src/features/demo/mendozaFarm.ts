/** Guided demo farm (task 40): a fictional producer on a real rural
 * location in Valle de Uco, Mendoza — between La Consulta and San
 * Carlos, where satellite imagery shows dense vineyards and orchards
 * along the acequias. ~125 ha with three parcels: a vineyard, an olive
 * grove and garlic.
 *
 * The producer, names and economics are invented. The cached fallback
 * in mendozaCached.json is a verbatim real POST /api/field/parcels
 * reply captured by scripts/capture-demo.mjs; it is only shown when
 * the live call fails — always labelled with its capture date. */
import type {
  Needs, ParcelInput, ParcelsResponse,
} from "../../domain/parcels";
import cachedJson from "./mendozaCached.json";
import type { Economics, Profile } from "../../domain/parcelsProfile";
import type { LatLon, Multi } from "../../domain/selection";

/** true when the hash is the demo deep-link (/app/#demo). */
export const isDemoHash = (hash: string) => hash === "#demo";

const r = (...pts: LatLon[]): LatLon[] => pts;

/** Field outline: a mostly-rectangular plot with a small jag on the
 * east edge, as these properties actually draw. [lat, lon] ring. */
export const MENDOZA_BOUNDARY: Multi = [[r(
  [-33.7414, -69.1299],
  [-33.7414, -69.1155],
  [-33.7512, -69.1155],
  [-33.7514, -69.1236],
  [-33.7512, -69.1294],
  [-33.7446, -69.1296],
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
      [-33.7462, -69.1160], [-33.7462, -69.1236],
    )],
  },
  {
    id: "ajo",
    name: "El Ajal",
    crop: "ajo",
    geom: [r(
      [-33.7462, -69.1236], [-33.7462, -69.1160],
      [-33.7507, -69.1160], [-33.7509, -69.1236],
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

/** Illustrative economics per parcel (USD). */
export const MENDOZA_ECON: Economics = {
  currency: "USD",
  parcels: {
    vid: { cost_per_ha: 2800, price_per_t: 220, expected_yield_t_ha: 14 },
    olivo: { cost_per_ha: 2400, price_per_t: 380, expected_yield_t_ha: 9 },
    ajo: { cost_per_ha: 1800, price_per_t: 900, expected_yield_t_ha: 8 },
  },
};

/** Real API response captured by scripts/capture-demo.mjs, used only
 * when the live API or a provider is unreachable — the UI then says
 * "resultado guardado del <captured_at>". Parcel ids match
 * MENDOZA_PARCELS. */
const cached = cachedJson as unknown as {
  captured_at: string; response: ParcelsResponse };
export const MENDOZA_CACHED: { date: string; res: ParcelsResponse } = {
  date: cached.captured_at,
  res: cached.response,
};


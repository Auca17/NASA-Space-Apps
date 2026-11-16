/** Guided demo farm (task 40): a fictional producer on a real rural
 * location south of Tupungato, Valle de Uco, Mendoza. ~1,150 ha with
 * nine parcels and seven crops: maize, garlic, alfalfa, vine, stone
 * fruit, olives and native monte — annual crops the rotation engine
 * analyses next to the valley's perennials.
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

/** Field outline: ~1,150 ha square (3.4 km a side) south of Tupungato,
 * Valle de Uco. Chosen with the Sentinel-2 current-crop detection over
 * large candidate plots in Mendoza's oases (2026-11-16): it mixes early
 * maize, winter-spring green and low-cover ground (vineyards, orchards
 * and olives read as bare in November). [lat, lon] ring. */
export const MENDOZA_BOUNDARY: Multi = [[r(
  [-33.36973, -69.12829],
  [-33.36973, -69.09171],
  [-33.40027, -69.09171],
  [-33.40027, -69.12829],
)]];

/** Nine parcels of ~128 ha (3 x 3 grid), seven crops. The crop of each
 * one is consistent with what Sentinel-2 sees there: maize where early
 * maize dominates, garlic and alfalfa where the image shows winter-
 * spring green or pasture, vine, stone fruit and olives where cover is
 * low, and a block of native monte. */
export const MENDOZA_PARCELS: ParcelInput[] = [
  {
    id: "alfalfa",
    name: "La Alfalfa",
    crop: "alfalfa",
    geom: [r(
      [-33.36983, -69.12819], [-33.36983, -69.11620],
      [-33.37981, -69.11620], [-33.37981, -69.12819],
    )],
  },
  {
    id: "ajo",
    name: "El Ajal",
    crop: "ajo",
    geom: [r(
      [-33.36983, -69.11600], [-33.36983, -69.10400],
      [-33.37981, -69.10400], [-33.37981, -69.11600],
    )],
  },
  {
    id: "vid",
    name: "La Vid",
    crop: "vid",
    geom: [r(
      [-33.36983, -69.10380], [-33.36983, -69.09181],
      [-33.37981, -69.09181], [-33.37981, -69.10380],
    )],
  },
  {
    id: "maiz",
    name: "El Maizal",
    crop: "maiz",
    geom: [r(
      [-33.38001, -69.12819], [-33.38001, -69.11620],
      [-33.38999, -69.11620], [-33.38999, -69.12819],
    )],
  },
  {
    id: "monte",
    name: "El Monte",
    crop: "monte_nativo",
    geom: [r(
      [-33.38001, -69.11600], [-33.38001, -69.10400],
      [-33.38999, -69.10400], [-33.38999, -69.11600],
    )],
  },
  {
    id: "frutal",
    name: "Los Duraznos",
    crop: "frutal_carozo",
    geom: [r(
      [-33.38001, -69.10380], [-33.38001, -69.09181],
      [-33.38999, -69.09181], [-33.38999, -69.10380],
    )],
  },
  {
    id: "maiz_sur",
    name: "Maizal del Sur",
    crop: "maiz",
    geom: [r(
      [-33.39019, -69.12819], [-33.39019, -69.11620],
      [-33.40017, -69.11620], [-33.40017, -69.12819],
    )],
  },
  {
    id: "olivo",
    name: "Los Olivos",
    crop: "olivo",
    geom: [r(
      [-33.39019, -69.11600], [-33.39019, -69.10400],
      [-33.40017, -69.10400], [-33.40017, -69.11600],
    )],
  },
  {
    id: "ajo_sur",
    name: "Ajal del Sur",
    crop: "ajo",
    geom: [r(
      [-33.39019, -69.10380], [-33.39019, -69.09181],
      [-33.40017, -69.09181], [-33.40017, -69.10380],
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

/** Illustrative economics per parcel (USD). Alfalfa (forage) and the
 * native monte have none. */
export const MENDOZA_ECON: Economics = {
  currency: "USD",
  parcels: {
    vid: { cost_per_ha: 2800, price_per_t: 220, expected_yield_t_ha: 14 },
    olivo: { cost_per_ha: 2400, price_per_t: 380, expected_yield_t_ha: 9 },
    frutal: { cost_per_ha: 2600, price_per_t: 450,
              expected_yield_t_ha: 22 },
    ajo: { cost_per_ha: 1800, price_per_t: 900, expected_yield_t_ha: 8 },
    maiz: { cost_per_ha: 780, price_per_t: 188, expected_yield_t_ha: 10 },
    maiz_sur: { cost_per_ha: 780, price_per_t: 188, expected_yield_t_ha: 10 },
    ajo_sur: { cost_per_ha: 1800, price_per_t: 900, expected_yield_t_ha: 8 },
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


/** Guided demo farm (task 42): a fictional producer on a real rural
 * location north of Pergamino, Buenos Aires — open pampa farmland
 * where annual crop rotations are the core question. ~200 ha with
 * four parcels: soybean, maize, wheat and an alfalfa pasture strip.
 *
 * The producer, names and economics are invented. The cached fallback
 * in pergaminoCached.json is a verbatim real POST /api/field/parcels
 * + /api/field/rotations reply captured by scripts/capture-demo.mjs;
 * it is only shown when the live call fails — always labelled with
 * its capture date. */
import type {
  Needs, ParcelInput, ParcelsResponse,
} from "../../domain/parcels";
import type { Economics, Profile } from "../../domain/parcelsProfile";
import type { RotationsResponse } from "../../api/types";
import type { LatLon, Multi } from "../../domain/selection";
import cachedJson from "./pergaminoCached.json";

const r = (...pts: LatLon[]): LatLon[] => pts;

/** Field outline: a mostly-rectangular pampa plot with a small jag on
 * the east edge, as rural properties actually draw. [lat, lon] ring. */
export const PERGAMINO_BOUNDARY: Multi = [[r(
  [-33.8830, -60.5780],
  [-33.8830, -60.5630],
  [-33.8850, -60.5620],
  [-33.8965, -60.5635],
  [-33.8965, -60.5780],
)]];

export const PERGAMINO_PARCELS: ParcelInput[] = [
  {
    id: "soja",
    name: "La Sojera",
    crop: "soja",
    geom: [r(
      [-33.8835, -60.5775], [-33.8835, -60.5700],
      [-33.8895, -60.5700], [-33.8895, -60.5775],
    )],
  },
  {
    id: "maiz",
    name: "El Maizal",
    crop: "maiz",
    geom: [r(
      [-33.8835, -60.5700], [-33.8835, -60.5645],
      [-33.8855, -60.5630], [-33.8895, -60.5640],
      [-33.8895, -60.5700],
    )],
  },
  {
    id: "trigo",
    name: "El Trigal",
    crop: "trigo",
    geom: [r(
      [-33.8895, -60.5700], [-33.8895, -60.5640],
      [-33.8960, -60.5645], [-33.8960, -60.5700],
    )],
  },
  {
    id: "pastura",
    name: "La Pastura",
    crop: "alfalfa",
    geom: [r(
      [-33.8895, -60.5775], [-33.8895, -60.5700],
      [-33.8960, -60.5700], [-33.8960, -60.5775],
    )],
  },
];

/** Needs step pre-answered for the demo: rainfed pampa, the fire
 * station a real distance away in Pergamino; drought, fire and
 * erosion first — the worries the fictional family declared. */
export const PERGAMINO_NEEDS: Needs = {
  water_access: "none",
  emergency_distance_km: 12,
  concerns: ["water", "fire", "flood"],
};

/** Producer profile: drought, fire and flood (soil loss) first. */
export const PERGAMINO_PROFILE: Profile = {
  order: ["drought", "fire", "flood", "frost", "heat", "enso",
          "hail", "snow"],
  hidden: ["snow"],
};

/** Illustrative economics per parcel (USD). */
export const PERGAMINO_ECON: Economics = {
  currency: "USD",
  parcels: {
    soja: { cost_per_ha: 750, price_per_t: 280, expected_yield_t_ha: 3.4 },
    maiz: { cost_per_ha: 980, price_per_t: 230, expected_yield_t_ha: 9.5 },
    trigo: { cost_per_ha: 620, price_per_t: 240, expected_yield_t_ha: 4.5 },
    pastura: { cost_per_ha: 500, price_per_t: 120,
               expected_yield_t_ha: 12 },
  },
};

/** Real API responses captured by scripts/capture-demo.mjs, used only
 * when the live API or a provider is unreachable — the UI then says
 * "resultado guardado del <captured_at>". Parcel ids match
 * PERGAMINO_PARCELS. */
const cached = cachedJson as unknown as {
  captured_at: string;
  response: ParcelsResponse;
  rotations?: RotationsResponse;
};
export const PERGAMINO_CACHED: {
  date: string; res: ParcelsResponse;
  rotations?: RotationsResponse;
} = {
  date: cached.captured_at,
  res: cached.response,
  ...(cached.rotations ? { rotations: cached.rotations } : {}),
};

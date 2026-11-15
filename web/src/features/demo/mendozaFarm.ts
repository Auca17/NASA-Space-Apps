/** Guided demo farm (tasks 40 + 52): a fictional producer on a real
 * rural location in Valle de Uco, Mendoza — between La Consulta and
 * San Carlos, where satellite imagery shows dense vineyards and
 * orchards along the acequias. ~136 ha with three parcels: a
 * vineyard, an olive grove and a garlic lot.
 *
 * The producer, names and economics are invented. The saved capture
 * in mendozaCached.json is verbatim real POST /api/field/parcels,
 * /api/field/diagnose and /api/field/rotations replies produced by
 * scripts/capture-demo.mjs; it is shown by default (labelled with its
 * capture date) and as the fallback when a live &live call fails. */
import type {
  Needs, ParcelInput, ParcelsResponse,
} from "../../domain/parcels";
import cachedJson from "./mendozaCached.json";
import type { Economics, Profile } from "../../domain/parcelsProfile";
import type { DiagnoseResponse, RotationsResponse } from "../../api/types";
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

/** Three parcels: the vine column west (~60 ha, including the former
 * monte strip — vines there in reality), the olive block north-east
 * (~39 ha) and the garlic lot south-east (~37 ha). */
export const MENDOZA_PARCELS: ParcelInput[] = [
  {
    id: "vid",
    name: "La Vid",
    crop: "vid",
    geom: [r(
      [-33.7410, -69.1295], [-33.7410, -69.1236],
      [-33.7509, -69.1236], [-33.7507, -69.1290],
      [-33.7450, -69.1292],
    )],
  },
  {
    id: "olivo",
    name: "Los Olivos",
    crop: "olivo",
    geom: [r(
      [-33.7410, -69.1236], [-33.7410, -69.1160],
      [-33.7460, -69.1160], [-33.7460, -69.1236],
    )],
  },
  {
    id: "ajo",
    name: "El Ajal",
    crop: "ajo",
    geom: [r(
      [-33.7460, -69.1236], [-33.7460, -69.1160],
      [-33.7507, -69.1160], [-33.7507, -69.1236],
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
 * worries the fictional family declared. Flood stays hidden. */
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

/** Real API responses captured by scripts/capture-demo.mjs — parcels,
 * the field diagnosis (calendar/timeline/accuracy), the rotations
 * comparison and its explanations, plus the inference metadata the
 * capture ran with. Always labelled "resultado guardado del
 * <captured_at>". */
const cached = cachedJson as unknown as {
  captured_at: string;
  inferred_rotation: { id: string; matched: boolean } | null;
  derived_priorities: { sel: string[]; warn: string[]; unmapped: string[] };
  response: ParcelsResponse;
  diagnosis?: DiagnoseResponse;
  rotations?: RotationsResponse;
  explain?: Record<string, string>;
  catalog?: { rotations: { id: string; name: string }[] };
};
export const MENDOZA_CACHED = {
  date: cached.captured_at,
  res: cached.response,
  diag: cached.diagnosis,
  rotations: cached.rotations,
  explain: cached.explain ?? {},
  inferred: cached.inferred_rotation,
  derived: cached.derived_priorities,
};

/** Guided demo farm (task 52): a fictional rainfed grain producer on a
 * real rural location in the pampa húmeda, south-east of Chacabuco
 * (Buenos Aires province), where the satellite base map shows the
 * classic quarter-section grid of rectangular fields. ~170 ha split
 * into three annual-crop parcels — soja, maíz and trigo — the exact
 * crop set a recognizable rotation is built from.
 *
 * The producer, names and economics are invented. The saved capture
 * in pampaCached.json is verbatim real POST /api/field/parcels,
 * /api/field/diagnose and /api/field/rotations replies produced by
 * scripts/capture-demo.mjs; it is shown by default (labelled with its
 * capture date) and as the fallback when a live &live call fails. */
import type {
  Needs, ParcelInput, ParcelsResponse,
} from "../../domain/parcels";
import cachedJson from "./pampaCached.json";
import type { Economics, Profile } from "../../domain/parcelsProfile";
import type { DiagnoseResponse, RotationsResponse } from "../../api/types";
import type { LatLon, Multi } from "../../domain/selection";

const r = (...pts: LatLon[]): LatLon[] => pts;

/** Field outline: one rectangular holding on the Chacabuco plot grid
 * (fields there run with the roads, so the rectangle is the honest
 * shape). [lat, lon] ring, ~170 ha. */
export const PAMPA_BOUNDARY: Multi = [[r(
  [-34.68495, -60.54205],
  [-34.68495, -60.52795],
  [-34.69705, -60.52795],
  [-34.69705, -60.54205],
)]];

/** Three north–south strips like the neighbouring quarters: ~63 ha of
 * soja, ~54 ha of maíz, ~54 ha of trigo. */
export const PAMPA_PARCELS: ParcelInput[] = [
  {
    id: "soja",
    name: "Lote Soja",
    crop: "soja",
    geom: [r(
      [-34.6850, -60.5420], [-34.6850, -60.5368],
      [-34.6970, -60.5368], [-34.6970, -60.5420],
    )],
  },
  {
    id: "maiz",
    name: "El Maizal",
    crop: "maiz",
    geom: [r(
      [-34.6850, -60.5368], [-34.6850, -60.5324],
      [-34.6970, -60.5324], [-34.6970, -60.5368],
    )],
  },
  {
    id: "trigo",
    name: "El Trigal",
    crop: "trigo",
    geom: [r(
      [-34.6850, -60.5324], [-34.6850, -60.5280],
      [-34.6970, -60.5280], [-34.6970, -60.5324],
    )],
  },
];

/** Needs step pre-answered for the demo: rainfed only (no irrigation,
 * which is the pampa húmeda norm), the volunteer fire service a real
 * drive away, drought/fire/water first. */
export const PAMPA_NEEDS: Needs = {
  water_access: "none",
  emergency_distance_km: 22,
  concerns: ["water", "fire", "flood"],
};

/** Producer profile: drought and El Niño first (a wet pampa year cuts
 * yields both ways), then fire; hail and snow stay hidden — this
 * producer does not worry about them. */
export const PAMPA_PROFILE: Profile = {
  order: ["drought", "enso", "fire", "frost", "heat", "flood",
          "hail", "snow"],
  hidden: ["hail", "snow"],
};

/** Illustrative economics per parcel (USD), typical pampa
 * magnitudes. */
export const PAMPA_ECON: Economics = {
  currency: "USD",
  parcels: {
    soja: { cost_per_ha: 780, price_per_t: 340, expected_yield_t_ha: 3.2 },
    maiz: { cost_per_ha: 950, price_per_t: 210, expected_yield_t_ha: 9.5 },
    trigo: { cost_per_ha: 620, price_per_t: 260, expected_yield_t_ha: 4.1 },
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
export const PAMPA_CACHED = {
  date: cached.captured_at,
  res: cached.response,
  diag: cached.diagnosis,
  rotations: cached.rotations,
  explain: cached.explain ?? {},
  inferred: cached.inferred_rotation,
  derived: cached.derived_priorities,
};

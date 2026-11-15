/** Parcels flow prefill: INTA's Mapa Nacional de Cultivos returns its
 * own class ids; the parcels catalog uses the knowledge ids. This maps
 * one onto the other so a detected class can pre-select the parcel
 * crop. Classes without a catalog equivalent fall back to "otro". */
import { apiCrop } from "../../api";
import { plotBody, type Multi } from "../../domain/selection";

const INTA_TO_CROP: Record<string, string> = {
  maize: "maiz", forage_maize: "maiz",
  soy: "soja",
  sunflower: "girasol",
  sorghum: "sorgo", forage_sorghum: "sorgo",
  cotton: "algodon",
  peanut: "mani",
  chickpea: "garbanzo",
  pea: "arveja",
  winter_cereals: "trigo",
  bean: "otro", sugarcane: "otro", rice: "otro", potato: "otro",
  other_crops: "otro",
};

/** What the INTA map says about one parcel: the catalog crop id plus
 * the campaign it was read from. null: no usable detection. */
export interface ParcelDetection {
  cropId: string;
  campaign: string;
}

/** Dominant detection across the seasons: a real crop always beats
 * fallow/non-agricultural; between seasons the larger classified share
 * wins and a tie keeps the first season (summer — the main one). */
export async function detectParcelCrop(geom: Multi):
    Promise<ParcelDetection | null> {
  const r = await apiCrop(plotBody(geom));
  const pick = (s: { status: string; crop: { id: string } | null;
                   share: number | null; campaign: string }) => {
    if (s.status === "crop" && s.crop && INTA_TO_CROP[s.crop.id]) {
      return { cropId: INTA_TO_CROP[s.crop.id], campaign: s.campaign,
               share: s.share ?? 0, crop: true };
    }
    if (s.status === "fallow" || s.status === "non_agricultural") {
      return { cropId: "sin_cultivo", campaign: s.campaign,
               share: s.share ?? 0, crop: false };
    }
    return null;
  };
  const ds = (r?.seasons ?? []).map(pick)
    .filter((d): d is NonNullable<typeof d> => d !== null);
  const best = ds.sort((a, b) =>
    Number(b.crop) - Number(a.crop) || b.share - a.share)[0];
  return best ? { cropId: best.cropId, campaign: best.campaign } : null;
}

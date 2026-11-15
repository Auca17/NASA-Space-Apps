import type { Field } from "../../domain/fields";
import { squareRing, type Multi } from "../../domain/selection";
import { MENDOZA_BOUNDARY, MENDOZA_PARCELS } from "./mendozaFarm";

const ruralOutline = (lat: number, lon: number, halfM: number): Multi =>
  [[squareRing(lat, lon, halfM)]];

export function testFields(lang: "es" | "en"): Field[] {
  const prefix = lang === "es" ? "Prueba" : "Sample";
  const createdAt = new Date().toISOString();
  const field = (id: string, name: string, geom: Multi): Field => ({
    id: `example-${id}`, name: `${prefix} · ${name}`, geom, zones: [], createdAt,
  });
  const mendoza = field("mendoza", "Valle de Uco, Mendoza", MENDOZA_BOUNDARY);
  mendoza.cropSplit = "done";
  mendoza.zones = MENDOZA_PARCELS.map((parcel) => ({
    id: parcel.id, name: parcel.name, crop: "", geom: [parcel.geom], source: "manual",
  }));
  return [
    field("pergamino", "Pergamino, Buenos Aires", ruralOutline(-33.884, -60.595, 350)),
    field("tres-arroyos", "Tres Arroyos, Buenos Aires", ruralOutline(-38.351, -60.353, 1600)),
    field("general-cabrera", "General Cabrera, Córdoba", ruralOutline(-32.823, -63.844, 600)),
    mendoza,
    field("tucuman", "Cruz Alta, Tucumán", ruralOutline(-26.920, -65.041, 450)),
  ];
}

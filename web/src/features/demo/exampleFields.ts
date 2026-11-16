/** Example fields always present in «Mis campos» (seeded on load when
 * missing), so the demo can be reached from the map:
 *  - the Tupungato demo farm (Mendoza), with its nine parcels;
 *  - a ~320 ha plot near Pergamino (Buenos Aires), where the rotation
 *    engine has the full set of alternatives for the Pampa. */
import type { Field } from "../../domain/fields";
import { squareRing } from "../../domain/selection";
import { MENDOZA_BOUNDARY, MENDOZA_PARCELS } from "./mendozaFarm";

export const EXAMPLE_PREFIX = "example-";

export function exampleFields(lang: string): Field[] {
  const es = lang !== "en";
  const createdAt = "2026-11-16T00:00:00.000Z";
  return [
    {
      id: `${EXAMPLE_PREFIX}mendoza`,
      name: es ? "Ejemplo · Finca Los Álamos (Tupungato, Mendoza)"
               : "Example · Los Álamos farm (Tupungato, Mendoza)",
      geom: MENDOZA_BOUNDARY, createdAt, cropSplit: "done",
      zones: MENDOZA_PARCELS.map((p) => ({
        id: p.id, name: p.name, crop: p.crop, geom: [p.geom],
        source: "manual", cropDeclared: true })),
    },
    {
      id: `${EXAMPLE_PREFIX}pergamino`,
      name: es ? "Ejemplo · Lote en Pergamino (Buenos Aires)"
               : "Example · Plot near Pergamino (Buenos Aires)",
      geom: [[squareRing(-33.884, -60.595, 900)]], createdAt, zones: [],
    },
  ];
}

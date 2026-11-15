/** Zone kind -> shapes for the map: geometry, never colour alone.
 * hotspot: filled ring band around the detection; fire_risk: outlined
 * ring band; dry: outline band along the parcel edge; bare_soil:
 * diagonal stripes + faint fill. */
import type { Shape } from "../globe/GlobeView";
import type { LatLon, Poly } from "../../domain/selection";
import type { ApiZone } from "../../domain/parcels";
import { hatch, outlineBand } from "../../domain/parcelsGeo";

const geoRingToLL = (ring: number[][]): LatLon[] =>
  ring.slice(0, -1).map(([lo, la]) => [la, lo] as LatLon);
const zonePoly = (z: ApiZone): Poly =>
  [geoRingToLL(z.geometry.coordinates[0] ?? []),
   ...(z.geometry.coordinates.slice(1).map(geoRingToLL))];

/** Band width follows the zone size (~7% of its extent). */
function bandWidth(p: Poly): number {
  const r = p[0] ?? [];
  const las = r.map((x) => x[0]), los = r.map((x) => x[1]);
  const span = Math.max(Math.max(...las) - Math.min(...las),
                        Math.max(...los) - Math.min(...los));
  return Math.max(20, Math.min(80, span * 111_000 * 0.07));
}

export function zoneShapes(z: ApiZone): Shape[] {
  const poly = zonePoly(z);
  if (!poly.length || poly[0].length < 3) return [];
  const w = bandWidth(poly);
  switch (z.kind) {
    case "hotspot":
      return outlineBand(poly, w).map((g) =>
        ({ geom: g, kind: "excluded" as const, color: "#d94f2b" }));
    case "fire_risk":
      return outlineBand(poly, w).map((g) =>
        ({ geom: g, kind: "zone" as const, color: "#e65100" }));
    case "dry":
      return outlineBand(poly, Math.max(15, w * 0.7)).map((g) =>
        ({ geom: g, kind: "piece-off" as const, color: "#c49a4a" }));
    case "bare_soil": {
      const stripes = hatch(poly, Math.max(90, w * 2.4),
                            Math.max(12, w * 0.4), 45);
      return [
        { geom: poly, kind: "piece-off" as const, color: "#8d7d64" },
        ...stripes.map((g) =>
          ({ geom: g, kind: "piece-off" as const, color: "#6b5d4f" })),
      ];
    }
    default:
      return outlineBand(poly, w).map((g) =>
        ({ geom: g, kind: "piece-off" as const }));
  }
}


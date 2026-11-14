/** Area selection -> H3 res-5 cells grouped by their res-2 shard (D4). */
import {
  latLngToCell,
  polygonToCells,
  cellToParent,
  gridDisk,
} from "h3-js";

export type LatLon = [number, number]; // [lat, lon]

const EARTH_R_KM = 6371;

/** Circle approximated as a 32-vertex polygon (lon/lat for h3-js). */
export function circleRing(lat: number, lon: number, radiusKm: number) {
  const pts: LatLon[] = [];
  const ang = radiusKm / EARTH_R_KM;
  const la = (lat * Math.PI) / 180;
  for (let i = 0; i < 32; i++) {
    const b = (i / 32) * 2 * Math.PI;
    const la2 = Math.asin(
      Math.sin(la) * Math.cos(ang) +
        Math.cos(la) * Math.sin(ang) * Math.cos(b));
    const lo2 =
      (lon * Math.PI) / 180 +
      Math.atan2(
        Math.sin(b) * Math.sin(ang) * Math.cos(la),
        Math.cos(ang) - Math.sin(la) * Math.sin(la2));
    pts.push([(la2 * 180) / Math.PI, (lo2 * 180) / Math.PI]);
  }
  return pts;
}

/** Res-5 cells covering a circle around a point. */
export function cellsInCircle(lat: number, lon: number,
                              radiusKm = 50): string[] {
  return polygonToCells(circleRing(lat, lon, radiusKm), 5);
}

/** Res-5 cells inside an arbitrary [lat, lon] ring. */
export function cellsInPolygon(ring: LatLon[]): string[] {
  return polygonToCells(ring, 5);
}

/** The single res-5 cell under a point (reticle mode). */
export function cellAt(lat: number, lon: number): string[] {
  return [latLngToCell(lat, lon, 5)];
}

/** Group res-5 cells by their res-2 shard parent. */
export function groupByShard(cells: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const c of cells) {
    const r2 = cellToParent(c, 2);
    const g = out.get(r2);
    if (g) g.push(c);
    else out.set(r2, [c]);
  }
  return out;
}

/** All res-5 cells in the k-ring around a cell (for "cell + neighbours"). */
export function cellDisk(cell: string, k = 1): string[] {
  return gridDisk(cell, k);
}

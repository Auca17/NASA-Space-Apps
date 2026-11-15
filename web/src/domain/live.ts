/** Reading /api/live responses: points (one per detection) or, for
 * large views, H3 res-5 cells with a detection count. */
import { latLngToCell } from "h3-js";

type RawCell = [string, number, number?] | { h3: string; n: number };
/** [lat, lon, frp, satellite, time] from the backend, or an object. */
type RawPoint = [number, number, ...unknown[]] | { lat: number; lon: number };
export type LiveBody = {
  mode?: "points" | "cells";
  points?: RawPoint[];
  cells?: RawCell[];
  sources_failed?: string[];
  updated_at?: string;
};

export type LiveSummary = {
  /** what the count means on screen */
  unit: "detections" | "cells";
  count: number;
  /** total detections (equal to count for points) */
  detections: number;
  /** cells to paint on the map: h3 -> detections */
  cells: Map<string, number>;
  /** sources that failed (partial result) */
  failed: string[];
};

/** `view` [w, s, e, n]: the backend widens the box it queries, so
 * points outside the visible map are left out of the count. */
export function summarizeLive(b: LiveBody,
    view?: [number, number, number, number]): LiveSummary {
  const cells = new Map<string, number>();
  if (b.mode === "cells") {
    for (const c of b.cells ?? []) {
      const [h, n] = Array.isArray(c) ? [c[0], c[1]] : [c.h3, c.n];
      cells.set(h, (cells.get(h) ?? 0) + n);
    }
    const detections = [...cells.values()].reduce((a, n) => a + n, 0);
    return { unit: "cells", count: cells.size, detections, cells,
             failed: b.sources_failed ?? [] };
  }
  const pts = (b.points ?? [])
    .map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.lat, p.lon]))
    .filter(([lat, lon]) => !view || (lon >= view[0] && lon <= view[2] &&
                                     lat >= view[1] && lat <= view[3]));
  for (const [lat, lon] of pts) {
    const h = latLngToCell(lat, lon, 5);
    cells.set(h, (cells.get(h) ?? 0) + 1);
  }
  return { unit: "detections", count: pts.length, detections: pts.length,
           cells, failed: b.sources_failed ?? [] };
}

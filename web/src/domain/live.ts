/** Reading /api/live responses: points (one per detection) or, for
 * large views, H3 res-5 cells with a detection count. */
import { cellToLatLng, latLngToCell } from "h3-js";

/** The live layer always fetches the whole world once per window so
 * panning or zooming never leaves an empty band (task 33). The
 * backend answers in cells mode at this size, which stays small. */
export const WORLD_BBOX: [number, number, number, number] =
  [-180, -85, 180, 85];

/** Above this zoom the viewport is small enough that /api/live answers
 * in points mode — that finer body refines the painted cells and feeds
 * the "fire near you" check. */
export const POINTS_MIN_ZOOM = 4;

/** A bbox as the backend accepts it: [minLon, minLat, maxLon, maxLat],
 * lon within ±180, lat within ±85. */
export type LiveBox = [number, number, number, number];

const normLon = (x: number): number =>
  ((x + 180) % 360 + 360) % 360 - 180;

/** A map view [w, s, e, n] can exceed ±180 or wrap the antimeridian
 * when the whole world fits on screen; the API rejects both. This
 * clamps the latitudes and returns the one or two valid boxes the
 * view covers (world-copy maps only). */
export function liveViewBoxes(view: LiveBox): LiveBox[] {
  const s = Math.max(-85, Math.min(85, view[1]));
  const n = Math.max(-85, Math.min(85, view[3]));
  if (n - s < 0.001) return [];
  const w = normLon(view[0]);
  const e = normLon(view[2]);
  // a span of 360° or more covers every longitude
  if (view[2] - view[0] >= 360) return [[-180, s, 180, n]];
  if (w === e) return [];
  if (w < e) return [[w, s, e, n]];
  return [[w, s, 180, n], [-180, s, e, n]]; // antimeridian split
}

/** A point falls inside the view when it is inside any of its boxes. */
export function pointInBoxes(lat: number, lon: number,
    boxes: LiveBox[]): boolean {
  return boxes.some(([w, s, e, n]) =>
    lon >= w && lon <= e && lat >= s && lat <= n);
}

type RawCell = [string, number, number?] | { h3: string; n: number };
/** [lat, lon, frp, satellite, time] from the backend, or an object. */
type RawPoint = [number, number, ...unknown[]] |
  { lat: number; lon: number; acq_datetime?: string };
export type LiveBody = {
  mode?: "points" | "cells";
  points?: RawPoint[];
  cells?: RawCell[];
  sources_failed?: string[];
  updated_at?: string;
  /** ISO A2 of the bbox centre (Natural Earth), when resolved. */
  country?: string | null;
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
  const boxes = view ? liveViewBoxes(view) : null;
  const inView = (lat: number, lon: number) =>
    !boxes || pointInBoxes(lat, lon, boxes);
  const cells = new Map<string, number>();
  if (b.mode === "cells") {
    let count = 0, detections = 0;
    for (const c of b.cells ?? []) {
      const [h, n] = Array.isArray(c) ? [c[0], c[1]] : [c.h3, c.n];
      cells.set(h, (cells.get(h) ?? 0) + n);
      // the count covers only what the user sees; the painted cells
      // cover the whole fetched body
      const [la, lo] = cellToLatLng(h);
      if (inView(la, lo)) { count++; detections += n; }
    }
    return { unit: "cells", count, detections, cells,
             failed: b.sources_failed ?? [] };
  }
  const all = (b.points ?? [])
    .map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.lat, p.lon]));
  for (const [lat, lon] of all) {
    const h = latLngToCell(lat, lon, 5);
    cells.set(h, (cells.get(h) ?? 0) + 1);
  }
  const inCount = all.filter(([lat, lon]) => inView(lat, lon)).length;
  return { unit: "detections", count: inCount, detections: inCount,
           cells, failed: b.sources_failed ?? [] };
}

/** Merge the coarse world cells with the finer cells of a viewport
 * answer: world cells covered by the view give way to the local ones,
 * so zooming in shows res-5 detail without losing the rest. */
export function mergeLiveCells(world: LiveSummary, local: LiveSummary,
    view: [number, number, number, number]): Map<string, number> {
  const boxes = liveViewBoxes(view);
  const cells = new Map<string, number>();
  for (const [h, n] of world.cells) {
    const [la, lo] = cellToLatLng(h);
    if (!pointInBoxes(la, lo, boxes)) cells.set(h, n);
  }
  for (const [h, n] of local.cells) cells.set(h, n);
  return cells;
}

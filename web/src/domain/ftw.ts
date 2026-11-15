/** Fields of The World 2025 boundaries read straight from the published
 * PMTiles archive for the whole outline (not only what the map shows).
 * Tiles that fail are counted, so "no coverage" and "could not read" are
 * never confused. */
import { PMTiles } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import type { LatLon, Multi, Poly } from "./selection";

export const FTW_URL =
  "https://data.source.coop/ftw/global-data-2e/vector/2025/fields-2025.pmtiles";
/** "fields" layer zooms in the archive (9–13). */
const MAX_Z = 13, MIN_Z = 9;
/** Tiles fetched for one outline at most (the zoom drops until it fits). */
const MAX_TILES = 64;

export type FtwRead = { fields: Multi[]; tiles: number; failed: number;
                        zoom: number };

export function tileOf(lat: number, lon: number, z: number): [number, number] {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [Math.floor(((lon + 180) / 360) * n),
          Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
}

/** Tiles covering a bbox [w, s, e, n] at the deepest zoom that keeps
 * the count within MAX_TILES. */
export function tilesFor(bbox: [number, number, number, number]):
    { z: number; tiles: [number, number][] } {
  const [w, s, e, n] = bbox;
  for (let z = MAX_Z; z >= MIN_Z; z--) {
    const [x0, y0] = tileOf(n, w, z), [x1, y1] = tileOf(s, e, z);
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (count <= MAX_TILES || z === MIN_Z) {
      const tiles: [number, number][] = [];
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push([x, y]);
      return { z, tiles };
    }
  }
  return { z: MIN_Z, tiles: [] };
}

let archive: PMTiles | null = null;

export async function readFtw(bbox: [number, number, number, number],
                              url = FTW_URL): Promise<FtwRead> {
  archive ??= new PMTiles(url);
  const { z, tiles } = tilesFor(bbox);
  const byId = new Map<string, Multi>();
  let failed = 0, next = 0;
  const one = async ([x, y]: [number, number]) => {
    try {
      const r = await archive!.getZxy(z, x, y);
      if (!r) return; // no tile: no boundaries there
      const layer = new VectorTile(new Pbf(new Uint8Array(r.data))).layers.fields;
      if (!layer) return;
      for (let i = 0; i < layer.length; i++) {
        const ft = layer.feature(i);
        const gj = ft.toGeoJSON(x, y, z);
        const g = gj.geometry;
        const polys: Poly[] = g.type === "Polygon"
          ? [g.coordinates.map((ring) => ring.map(([lo, la]) => [la, lo] as LatLon))]
          : g.type === "MultiPolygon"
            ? g.coordinates.map((p) => p.map((ring) => ring.map(([lo, la]) => [la, lo] as LatLon)))
            : [];
        const id = String(ft.properties.id ?? `${z}/${x}/${y}/${i}`);
        byId.set(id, [...(byId.get(id) ?? []), ...polys]);
      }
    } catch { failed++; }
  };
  const worker = async () => { while (next < tiles.length) await one(tiles[next++]); };
  await Promise.all(Array.from({ length: Math.min(6, tiles.length) }, worker));
  return { fields: [...byId.values()], tiles: tiles.length, failed, zoom: z };
}

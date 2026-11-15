/** Field selection geometry: area, point-in-polygon, urban check and
 * pasted-coordinate parsing. Rings are [lat, lon] arrays (open or closed). */

export type LatLon = [number, number];

/** Metres per degree on the sphere the backend uses (R = 6 371 008.8 m). */
export const M_PER_DEG = (6_371_008.8 * Math.PI) / 180;

/** Area of a polygon ring in hectares: the same spherical formula as
 * the backend (geodesy.ring_area_ha), so the map, Mis campos and the
 * diagnosis report the same figure. */
export function ringAreaHa(ring: LatLon[]): number {
  if (ring.length < 3) return 0;
  const rad = Math.PI / 180;
  let t = 0;
  for (let i = 0; i < ring.length; i++) {
    const [la0, lo0] = ring[i], [la1, lo1] = ring[(i + 1) % ring.length];
    t += (lo1 - lo0) * rad * (2 + Math.sin(la0 * rad) + Math.sin(la1 * rad));
  }
  return Math.abs(t) * EARTH_R_M * EARTH_R_M / 2 / 10_000;
}
const EARTH_R_M = 6_371_008.8;

/** Ray casting on lat/lon (fine for field-sized polygons). */
export function pointInRing([lat, lon]: LatLon, ring: LatLon[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ai, oi] = ring[i];
    const [aj, oj] = ring[j];
    if ((ai > lat) !== (aj > lat) &&
        lon < ((oj - oi) * (lat - ai)) / (aj - ai) + oi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Square ring of half-side `halfM` metres centred on a point. */
export function squareRing(lat: number, lon: number, halfM: number): LatLon[] {
  const dLa = halfM / M_PER_DEG;
  const dLo = halfM / (M_PER_DEG * Math.cos((lat * Math.PI) / 180));
  return [[lat - dLa, lon - dLo], [lat - dLa, lon + dLo],
          [lat + dLa, lon + dLo], [lat + dLa, lon - dLo]];
}

/** OpenMapTiles landuse classes that mean built-up land. */
export const URBAN_CLASSES = new Set([
  "residential", "commercial", "industrial", "retail",
]);
/** Share of the selection inside built-up landuse that flags it. */
export const URBAN_SHARE = 0.3;
/** Buildings per hectare that flag a selection (a farmstead has a few
 * buildings in 50 ha; a town block has dozens per hectare). */
export const BUILDINGS_PER_HA = 0.5;

export type Landuse = { cls: string; rings: LatLon[][] };
export type UrbanResult = { urban: boolean; urbanShare: number;
                            buildings: number };

function bbox(ring: LatLon[]) {
  const la = ring.map((p) => p[0]), lo = ring.map((p) => p[1]);
  return { s: Math.min(...la), n: Math.max(...la),
           w: Math.min(...lo), e: Math.max(...lo) };
}

/** Urban or not, from landuse polygons and building points read from a
 * map source. Samples a grid inside the selection to estimate the share
 * covered by built-up landuse. */
export function classifyUrban(selPoly: Poly, landuse: Landuse[],
                              buildings: LatLon[]): UrbanResult {
  const sel = selPoly[0];
  const inSelPoly = (p: LatLon) => pointInPoly(p, selPoly);
  const urbanRings = landuse
    .filter((l) => URBAN_CLASSES.has(l.cls)).flatMap((l) => l.rings);
  const b = bbox(sel);
  const N = 12;
  let inSel = 0, inUrban = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const p: LatLon = [b.s + ((i + 0.5) / N) * (b.n - b.s),
                         b.w + ((j + 0.5) / N) * (b.e - b.w)];
      if (!inSelPoly(p)) continue;
      inSel++;
      if (urbanRings.some((r) => pointInRing(p, r))) inUrban++;
    }
  }
  const urbanShare = inSel ? inUrban / inSel : 0;
  const n = buildings.filter(inSelPoly).length;
  const dense = n >= Math.max(10, BUILDINGS_PER_HA * polyHa(selPoly));
  return { urban: urbanShare >= URBAN_SHARE || dense, urbanShare,
           buildings: n };
}

/** "lat, lon" pasted in the search box (dot or comma decimals). */
export function parseLatLon(q: string): LatLon | null {
  const m = q.trim().match(
    /^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1].replace(",", "."));
  const lon = Number(m[2].replace(",", "."));
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lat, lon];
}

/* ----------------------------------------- polygons with holes ------ */

/** One polygon: [outer ring, ...holes]. */
export type Poly = LatLon[][];
/** Several separate polygons (pieces of a field, or of a zone). */
export type Multi = Poly[];

/** Area of a polygon minus its holes (ha). */
export function polyHa(p: Poly): number {
  if (!p.length) return 0;
  return Math.max(0, ringAreaHa(p[0]) -
    p.slice(1).reduce((a, h) => a + ringAreaHa(h), 0));
}
export const multiHa = (m: Multi) => m.reduce((a, p) => a + polyHa(p), 0);

export const pointInPoly = (q: LatLon, p: Poly) =>
  p.length > 0 && pointInRing(q, p[0]) &&
  !p.slice(1).some((h) => pointInRing(q, h));
export const pointInMulti = (q: LatLon, m: Multi) =>
  m.some((p) => pointInPoly(q, p));

/** Every vertex of every ring (bounds, fitting the map). */
export const multiPoints = (m: Multi): LatLon[] => m.flat(2);

/** Diagnose request body (GeoJSON order [lon, lat], closed rings): a
 * Polygon with its holes, or a MultiPolygon when there are several
 * pieces. The backend subtracts holes and adds up pieces. */
export type PlotBody = { polygon: {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][] } };

export function plotBody(m: Multi): PlotBody {
  const ring = (r: LatLon[]) =>
    [...r.map(([la, lo]) => [lo, la]), [r[0][1], r[0][0]]];
  const poly = (p: Poly) => p.filter((r) => r.length >= 3).map(ring);
  return m.length === 1
    ? { polygon: { type: "Polygon", coordinates: poly(m[0]) } }
    : { polygon: { type: "MultiPolygon", coordinates: m.map(poly) } };
}

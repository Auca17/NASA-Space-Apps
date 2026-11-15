/** Assisted selection: cut a drawn area by roads and urban land into
 * separate pieces, clip crop zones to a field, and clean up freehand
 * strokes. Works on a raster in local metres: simple, robust with any
 * polygon shape, and exact enough at field scale (cells of ~5–25 m). */
import {
  ringAreaHa, polyHa, URBAN_CLASSES, M_PER_DEG, type Landuse, type LatLon, type Poly,
  type Multi,
} from "./selection";

const M = M_PER_DEG;

export type Road = { cls: string; line: LatLon[] };
/** A piece keeps its holes; `ha` is the area of that same geometry, so
 * the map, Mis campos and the diagnosis all show one figure. */
export type Piece = { geom: Poly; ha: number };
export type SplitResult = {
  pieces: Piece[];
  /** built-up land and road corridors removed from the selection */
  excluded: Poly[];
  totalHa: number; roadHa: number; urbanHa: number; smallHa: number;
};

/** Half width (m) of the corridor removed for each OpenMapTiles road
 * class; tracks and service roads are narrow but still split fields. */
export const ROAD_HALF_WIDTH: Record<string, number> = {
  motorway: 15, trunk: 12, primary: 10, secondary: 8, tertiary: 7,
  minor: 6, service: 4, track: 3, busway: 6, raceway: 5,
  rail: 5, transit: 4,
};

/* ------------------------------------------------------------ grid --- */

type Grid = {
  lat0: number; lon0: number; k: number; s: number;
  x0: number; y0: number; nx: number; ny: number;
};

function xy(g: Grid, [la, lo]: LatLon): [number, number] {
  return [(lo - g.lon0) * M * g.k, (la - g.lat0) * M];
}
function ll(g: Grid, x: number, y: number): LatLon {
  return [y / M + g.lat0, x / (M * g.k) + g.lon0];
}

function makeGrid(rings: LatLon[][], maxCells = 60_000, minCell = 4): Grid {
  const pts = rings.flat();
  const lat0 = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const lon0 = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const g0: Grid = { lat0, lon0, k, s: 1, x0: 0, y0: 0, nx: 0, ny: 0 };
  const P = pts.map((p) => xy(g0, p));
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  const s = Math.max(minCell, Math.sqrt((w * h) / maxCells));
  return { ...g0, s, x0: x0 - s, y0: y0 - s,
           nx: Math.ceil(w / s) + 2, ny: Math.ceil(h / s) + 2 };
}

/** Even-odd scanline fill of rings into a mask. */
function fill(g: Grid, rings: LatLon[][]): Uint8Array {
  const m = new Uint8Array(g.nx * g.ny);
  const P = rings.map((r) => r.map((p) => xy(g, p)));
  for (let j = 0; j < g.ny; j++) {
    const y = g.y0 + (j + 0.5) * g.s;
    const xsx: number[] = [];
    for (const r of P) {
      for (let i = 0, n = r.length; i < n; i++) {
        const [ax, ay] = r[i], [bx, by] = r[(i + 1) % n];
        if ((ay > y) !== (by > y)) xsx.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    xsx.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xsx.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xsx[q] - g.x0) / g.s - 0.5));
      const i1 = Math.min(g.nx - 1, Math.floor((xsx[q + 1] - g.x0) / g.s - 0.5));
      for (let i = i0; i <= i1; i++) m[j * g.nx + i] = 1;
    }
  }
  return m;
}

/** Union of rings (map tiles repeat and clip polygons, so overlapping
 * copies must add up, not cancel as even-odd would). Rings outside the
 * grid are skipped. */
function fillUnion(g: Grid, polys: Poly[]): Uint8Array {
  const m = new Uint8Array(g.nx * g.ny);
  const W = g.x0 + g.nx * g.s, N = g.y0 + g.ny * g.s;
  for (const poly of polys) {
    if (!poly.length) continue;
    const P = poly[0].map((p) => xy(g, p));
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    if (Math.max(...xs) < g.x0 || Math.min(...xs) > W ||
        Math.max(...ys) < g.y0 || Math.min(...ys) > N) continue;
    const one = fill(g, poly);
    for (let c = 0; c < m.length; c++) if (one[c]) m[c] = 1;
  }
  return m;
}

/** Marks cells within each line's corridor (always at least a connected
 * band one cell wide, so a road crossing the area really splits it). */
function burn(g: Grid, roads: Road[]): Uint8Array {
  const m = new Uint8Array(g.nx * g.ny);
  for (const rd of roads) {
    const hw = (ROAD_HALF_WIDTH[rd.cls] ?? 0);
    if (!hw) continue;
    // wide enough to leave an unbroken band of cells, no wider than the road
    const r = Math.max(hw, g.s * 0.72);
    const P = rd.line.map((p) => xy(g, p));
    for (let q = 0; q + 1 < P.length; q++) {
      const [ax, ay] = P[q], [bx, by] = P[q + 1];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - g.x0) / g.s));
      const i1 = Math.min(g.nx - 1, Math.ceil((Math.max(ax, bx) + r - g.x0) / g.s));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - r - g.y0) / g.s));
      const j1 = Math.min(g.ny - 1, Math.ceil((Math.max(ay, by) + r - g.y0) / g.s));
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      for (let j = j0; j <= j1; j++) {
        const cy = g.y0 + (j + 0.5) * g.s;
        for (let i = i0; i <= i1; i++) {
          const cx = g.x0 + (i + 0.5) * g.s;
          const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / L2));
          const ex = ax + t * dx - cx, ey = ay + t * dy - cy;
          if (ex * ex + ey * ey <= r * r) m[j * g.nx + i] = 1;
        }
      }
    }
  }
  return m;
}

/** 4-connected components of a mask; returns label lists by size. */
function components(g: Grid, m: Uint8Array): number[][] {
  const seen = new Uint8Array(m.length);
  const out: number[][] = [];
  for (let c = 0; c < m.length; c++) {
    if (!m[c] || seen[c]) continue;
    const comp: number[] = [];
    const stack = [c]; seen[c] = 1;
    while (stack.length) {
      const v = stack.pop()!;
      comp.push(v);
      const i = v % g.nx, j = (v - i) / g.nx;
      const nb = [i > 0 ? v - 1 : -1, i < g.nx - 1 ? v + 1 : -1,
                  j > 0 ? v - g.nx : -1, j < g.ny - 1 ? v + g.nx : -1];
      for (const u of nb) if (u >= 0 && m[u] && !seen[u]) { seen[u] = 1; stack.push(u); }
    }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length);
}

/** Boundary of a component as a simplified polygon: the largest loop is
 * the outer ring, every other loop is a hole (exclusions inside it). */
function outline(g: Grid, comp: number[]): Poly {
  const inC = new Set(comp);
  const W = g.nx + 1;
  const next = new Map<number, number[]>();
  const add = (a: number, b: number) => {
    const l = next.get(a); if (l) l.push(b); else next.set(a, [b]);
  };
  for (const v of comp) {
    const i = v % g.nx, j = (v - i) / g.nx;
    const bl = j * W + i, br = bl + 1, tl = bl + W, tr = tl + 1;
    if (j === 0 || !inC.has(v - g.nx)) add(bl, br);
    if (i === g.nx - 1 || !inC.has(v + 1)) add(br, tr);
    if (j === g.ny - 1 || !inC.has(v + g.nx)) add(tr, tl);
    if (i === 0 || !inC.has(v - 1)) add(tl, bl);
  }
  const loops: [number, number][][] = [];
  while (next.size) {
    const start = next.keys().next().value as number;
    const loop: [number, number][] = [];
    let cur = start;
    for (let guard = 0; guard < 4 * comp.length + 8; guard++) {
      const l = next.get(cur);
      if (!l || !l.length) break;
      const nxt = l.pop()!;
      if (!l.length) next.delete(cur);
      const i = cur % W, j = (cur - i) / W;
      loop.push([g.x0 + i * g.s, g.y0 + j * g.s]);
      cur = nxt;
      if (cur === start) break;
    }
    if (loop.length >= 4) loops.push(loop);
  }
  loops.sort((a, b) => Math.abs(shoelace(b)) - Math.abs(shoelace(a)));
  const toLL = (l: [number, number][]) =>
    dp(l, g.s * 0.75).map(([x, y]) => ll(g, x, y));
  return loops.map(toLL).filter((r) => r.length >= 3);
}

function shoelace(p: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Douglas–Peucker on a closed ring: anchored at p[0] and at the
 * farthest point from it, each half simplified on its own. */
function dp(p: [number, number][], tol: number): [number, number][] {
  if (p.length <= 4) return p;
  const pts = [...p, p[0]]; // closing copy so the 2nd half ends at p[0]
  const keep = pts.map(() => false);
  const simplify = (s0: number, e0: number) => {
    const stack: [number, number][] = [[s0, e0]];
    while (stack.length) {
      const [s, e] = stack.pop()!;
      const [ax, ay] = pts[s], [bx, by] = pts[e];
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
      let md = -1, mi = -1;
      for (let i = s + 1; i < e; i++) {
        const [x, y] = pts[i];
        const d = Math.abs(dy * x - dx * y + bx * ay - by * ax) / L;
        if (d > md) { md = d; mi = i; }
      }
      if (md > tol) { keep[mi] = true; stack.push([s, mi], [mi, e]); }
    }
  };
  let far = 1, fd = -1;
  for (let i = 1; i < p.length; i++) {
    const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]);
    if (d > fd) { fd = d; far = i; }
  }
  keep[0] = keep[far] = true;
  simplify(0, far);
  simplify(far, p.length);
  return p.filter((_, i) => keep[i]);
}

/** Simplify a lat/lon ring with a tolerance in metres. */
export function simplifyRing(ring: LatLon[], tolM: number): LatLon[] {
  const g = makeGrid([ring]);
  return dp(ring.map((q) => xy(g, q)), tolM).map(([x, y]) => ll(g, x, y));
}

/** Closes and cleans a freehand stroke; null when it encloses < 0.1 ha.
 * The result keeps at most ~200 vertices (the API accepts up to 500). */
export function freehandToRing(stroke: LatLon[]): LatLon[] | null {
  if (stroke.length < 3) return null;
  let tol = 2, r = simplifyRing(stroke, tol);
  while (r.length > 200 && tol < 200) { tol *= 2; r = simplifyRing(stroke, tol); }
  return r.length >= 3 && ringAreaHa(r) >= 0.1 ? r : null;
}

/* ----------------------------------------------------------- split --- */

const cellHa = (g: Grid) => (g.s * g.s) / 10_000;

/** Share of built-up land from which a selection counts as urban. */
export const URBAN_CONTEXT = 0.6;
/** Leftovers below this share of a mostly urban selection are urban too. */
export const ENCLAVE_SHARE = 0.1;

/** Cut a selection by roads and built-up land. Pieces below
 * max(0.5 ha, 1 % of the selection) are dropped as slivers. */
export function splitSelection(sel: Multi,
    data: { roads: Road[]; landuse: Landuse[] }): SplitResult {
  const g = makeGrid(sel.flat());
  const inside = fillUnion(g, sel);
  const urbanPolys = data.landuse
    .filter((l) => URBAN_CLASSES.has(l.cls)).flatMap((l) => l.rings)
    .map((r) => [r]);
  const urban = fillUnion(g, urbanPolys);
  const roads = burn(g, data.roads);
  const keep = new Uint8Array(inside.length);
  const excl = new Uint8Array(inside.length);
  let total = 0, roadC = 0, urbanC = 0;
  for (let c = 0; c < inside.length; c++) {
    if (!inside[c]) continue;
    total++;
    if (urban[c]) { urbanC++; excl[c] = 1; }
    else if (roads[c]) { roadC++; excl[c] = 1; }
    else keep[c] = 1;
  }
  const ch = cellHa(g);
  const minCells = Math.max(0.5 / ch, total * 0.01);
  // In a mostly built-up selection, small leftovers (a square, a park,
  // a vacant block) belong to the town: they are not offered as fields.
  const mostlyUrban = total > 0 && urbanC / total >= URBAN_CONTEXT;
  const enclaveCells = total * ENCLAVE_SHARE;
  const pieces: Piece[] = [];
  let small = 0;
  for (const comp of components(g, keep)) {
    if (mostlyUrban && comp.length < enclaveCells) {
      urbanC += comp.length; continue;
    }
    if (comp.length < minCells) { small += comp.length; continue; }
    const geom = outline(g, comp);
    pieces.push({ geom, ha: polyHa(geom) });
  }
  pieces.sort((a, b) => b.ha - a.ha);
  const excluded = components(g, excl)
    .filter((c) => c.length * ch >= 0.05).map((c) => outline(g, c));
  return { pieces, excluded, totalHa: total * ch, roadHa: roadC * ch,
           urbanHa: urbanC * ch, smallHa: small * ch };
}

/** Part of `zone` inside the field (holes included) and outside the
 * other zones. Every piece of at least 0.1 ha is kept, so a zone split
 * by a road keeps both sides; null when nothing that size remains. */
export function clipZone(zone: Multi, field: Multi,
                         others: Multi[]): { geom: Multi; ha: number } | null {
  const g = makeGrid([...field.flat(), ...zone.flat()]);
  const f = fillUnion(g, field), z = fillUnion(g, zone);
  const o = fillUnion(g, others.flat());
  const m = new Uint8Array(f.length);
  for (let c = 0; c < m.length; c++) m[c] = f[c] && z[c] && !o[c] ? 1 : 0;
  const ch = cellHa(g);
  const geom = components(g, m).filter((c) => c.length * ch >= 0.1)
    .map((c) => outline(g, c));
  if (!geom.length) return null;
  return { geom, ha: geom.reduce((a, p) => a + polyHa(p), 0) };
}

/* -------------------------------------------------- plot detection --- */

/** Smallest piece of land still worth showing as «Límite por revisar». */
const REVIEW_MIN_HA = 0.5;

/** "crop": zones from the automatic split by crop (this season's
 * Sentinel-2, or INTA's crop map when that is not possible). */
export type ParcelSource = "ftw" | "osm" | "manual" | "crop";
export type DetectedParcel = Piece & { source: ParcelSource };
export type Detection = {
  /** plot boundaries backed by a source, inside the outline */
  parcels: DetectedParcel[];
  /** usable land no source delimits: «Límite por revisar» */
  review: Piece[];
  /** roads and built-up land left out */
  excluded: Poly[];
  totalHa: number; parcelHa: number; reviewHa: number; excludedHa: number;
};

/** Even-odd fill of one polygon limited to its own rows and columns,
 * calling `hit` for every grid cell inside it. */
function scanPoly(g: Grid, poly: Poly, hit: (c: number) => void) {
  const P = poly.map((r) => r.map((p) => xy(g, p)));
  const ys = P[0].map((p) => p[1]);
  const j0 = Math.max(0, Math.floor((Math.min(...ys) - g.y0) / g.s));
  const j1 = Math.min(g.ny - 1, Math.ceil((Math.max(...ys) - g.y0) / g.s));
  for (let j = j0; j <= j1; j++) {
    const y = g.y0 + (j + 0.5) * g.s;
    const xs: number[] = [];
    for (const r of P) {
      for (let i = 0, n = r.length; i < n; i++) {
        const [ax, ay] = r[i], [bx, by] = r[(i + 1) % n];
        if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - g.x0) / g.s - 0.5));
      const i1 = Math.min(g.nx - 1, Math.floor((xs[q + 1] - g.x0) / g.s - 0.5));
      for (let i = i0; i <= i1; i++) hit(j * g.nx + i);
    }
  }
}

/** 4-connected components of cells sharing the same non-zero label. */
function labelComponents(g: Grid, label: Int32Array): { k: number; cells: number[] }[] {
  const seen = new Uint8Array(label.length);
  const out: { k: number; cells: number[] }[] = [];
  for (let c = 0; c < label.length; c++) {
    const k = label[c];
    if (!k || seen[c]) continue;
    const cells: number[] = [];
    const stack = [c]; seen[c] = 1;
    while (stack.length) {
      const v = stack.pop()!;
      cells.push(v);
      const i = v % g.nx, j = (v - i) / g.nx;
      const nb = [i > 0 ? v - 1 : -1, i < g.nx - 1 ? v + 1 : -1,
                  j > 0 ? v - g.nx : -1, j < g.ny - 1 ? v + g.nx : -1];
      for (const u of nb) {
        if (u >= 0 && !seen[u] && label[u] === k) { seen[u] = 1; stack.push(u); }
      }
    }
    out.push({ k, cells });
  }
  return out;
}

/** Plots inside a field outline. Agricultural boundaries (Fields of The
 * World polygons) delimit plots; OpenStreetMap roads and built-up land
 * are cut out. Where no boundary covers the land it stays «Límite por
 * revisar» — no grid, size cut or moisture split is ever turned into a
 * plot. Plots never cross the outline, never overlap (the first boundary
 * that claims a cell keeps it) and keep the outline's holes. */
export function detectParcels(contour: Multi, data: {
    /** agricultural boundaries; one entry per boundary, which may come
     * in several pieces (map tiles cut polygons at their edges) */
    fields: Multi[]; roads: Road[]; landuse: Landuse[];
    /** plots the producer already drew: left as they are */
    taken?: Multi[] },
    minHa = 0.5): Detection {
  const g = makeGrid(contour.flat(), 500_000, 5);
  const inside = fillUnion(g, contour);
  const taken = fillUnion(g, (data.taken ?? []).flat());
  for (let c = 0; c < inside.length; c++) if (taken[c]) inside[c] = 0;
  const urban = fillUnion(g, data.landuse
    .filter((l) => URBAN_CLASSES.has(l.cls)).flatMap((l) => l.rings)
    .map((r) => [r]));
  const roads = burn(g, data.roads);
  const label = new Int32Array(inside.length);
  const excl = new Uint8Array(inside.length);
  let total = 0;
  for (let c = 0; c < inside.length; c++) {
    if (!inside[c]) continue;
    total++;
    if (urban[c] || roads[c]) excl[c] = 1;
  }
  // first boundary that claims a usable cell keeps it
  data.fields.forEach((multi, idx) => {
    for (const poly of multi) {
      if (!poly.length || poly[0].length < 3) continue;
      scanPoly(g, poly, (c) => {
        if (inside[c] && !excl[c] && (!label[c] || label[c] === idx + 1)) {
          label[c] = idx + 1;
        }
      });
    }
  });
  const REVIEW = -1;
  for (let c = 0; c < inside.length; c++) {
    if (inside[c] && !excl[c] && !label[c]) label[c] = REVIEW;
  }
  const ch = cellHa(g);
  const parcels: DetectedParcel[] = [];
  const review: Piece[] = [];
  for (const { k, cells } of labelComponents(g, label)) {
    const geom = outline(g, cells);
    const piece = { geom, ha: polyHa(geom) };
    // boundary pieces below minHa (slivers along the outline) and land
    // no boundary covers are both left to review, never dropped
    if (k !== REVIEW && cells.length * ch >= minHa) {
      parcels.push({ ...piece, source: "ftw" });
    } else if (cells.length * ch >= REVIEW_MIN_HA) {
      review.push(piece);
    }
  }
  // «Parcela 1, 2…» read north to south, then west to east
  const key = (p: Piece) => {
    const r = p.geom[0];
    const la = r.reduce((a, q) => a + q[0], 0) / r.length;
    const lo = r.reduce((a, q) => a + q[1], 0) / r.length;
    return [-Math.round(la * 200), lo] as const;
  };
  parcels.sort((a, b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1]);
  const excluded = components(g, excl)
    .filter((c) => c.length * ch >= 0.05).map((c) => outline(g, c));
  let exclC = 0;
  for (let c = 0; c < excl.length; c++) exclC += excl[c];
  return {
    parcels, review, excluded, totalHa: total * ch,
    parcelHa: parcels.reduce((a, p) => a + p.ha, 0),
    reviewHa: review.reduce((a, p) => a + p.ha, 0),
    excludedHa: exclC * ch,
  };
}

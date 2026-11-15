/** Geometry helpers for parcels and result zones: split a boundary
 * with a drawn line, outline bands and hatch patterns for the zone
 * kinds the API returns, and a local screen projection for badges.
 * Raster approach like split.ts: metre grid, even-odd fill,
 * connected components, simplified outlines (robust for any shape). */
import {
  M_PER_DEG, pointInRing, type LatLon, type Poly, type Multi,
} from "./selection";

const M = M_PER_DEG;

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

function makeGrid(rings: LatLon[][], maxCells = 60_000, minCell = 2): Grid {
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

/** Even-odd scanline fill. */
function fill(g: Grid, rings: LatLon[][]): Uint8Array {
  const m = new Uint8Array(g.nx * g.ny);
  const P = rings.map((r) => r.map((p) => xy(g, p)));
  for (let j = 0; j < g.ny; j++) {
    const y = g.y0 + (j + 0.5) * g.s;
    const xsx: number[] = [];
    for (const r of P) {
      for (let i = 0, n = r.length; i < n; i++) {
        const [ax, ay] = r[i], [bx, by] = r[(i + 1) % n];
        if ((ay > y) !== (by > y)) {
          xsx.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
        }
      }
    }
    xsx.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xsx.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xsx[q] - g.x0) / g.s - 0.5));
      const i1 = Math.min(g.nx - 1,
        Math.floor((xsx[q + 1] - g.x0) / g.s - 0.5));
      for (let i = i0; i <= i1; i++) m[j * g.nx + i] = 1;
    }
  }
  return m;
}

function fillUnion(g: Grid, polys: Poly[]): Uint8Array {
  const m = new Uint8Array(g.nx * g.ny);
  for (const poly of polys) if (poly.length) {
    const one = fill(g, poly);
    for (let c = 0; c < m.length; c++) if (one[c]) m[c] = 1;
  }
  return m;
}

/** Marks cells covered by a polyline corridor of half-width `hw` m. */
function burnLine(g: Grid, line: LatLon[], hw: number): Uint8Array {
  const m = new Uint8Array(g.nx * g.ny);
  const r = Math.max(hw, g.s * 0.72);
  const P = line.map((p) => xy(g, p));
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
        const t = Math.max(0, Math.min(1,
          ((cx - ax) * dx + (cy - ay) * dy) / L2));
        const ex = ax + t * dx - cx, ey = ay + t * dy - cy;
        if (ex * ex + ey * ey <= r * r) m[j * g.nx + i] = 1;
      }
    }
  }
  return m;
}

/** Marks cells touched by stripes at `angleRad` every `spacing` m. */
function hatchMask(g: Grid, spacing: number, widthM: number,
                   angleRad: number): Uint8Array {
  const m = new Uint8Array(g.nx * g.ny);
  const W = g.x0 + g.nx * g.s, N = g.y0 + g.ny * g.s;
  const diag = Math.hypot(W - g.x0, N - g.y0);
  const cx = (g.x0 + W) / 2, cy = (g.y0 + N) / 2;
  const ux = Math.cos(angleRad), uy = Math.sin(angleRad);
  const vx = -uy, vy = ux;
  const n = Math.ceil(diag / spacing);
  for (let sIdx = -n; sIdx <= n; sIdx++) {
    const off = sIdx * spacing;
    const ax = cx + vx * off - ux * diag, ay = cy + vy * off - uy * diag;
    const bx = cx + vx * off + ux * diag, by = cy + vy * off + uy * diag;
    const hw = widthM / 2;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - hw - g.x0) / g.s));
    const i1 = Math.min(g.nx - 1, Math.ceil((Math.max(ax, bx) + hw - g.x0) / g.s));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - hw - g.y0) / g.s));
    const j1 = Math.min(g.ny - 1, Math.ceil((Math.max(ay, by) + hw - g.y0) / g.s));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    for (let j = j0; j <= j1; j++) {
      const yy = g.y0 + (j + 0.5) * g.s;
      for (let i = i0; i <= i1; i++) {
        const xx = g.x0 + (i + 0.5) * g.s;
        const t = Math.max(0, Math.min(1,
          ((xx - ax) * dx + (yy - ay) * dy) / L2));
        const ex = ax + t * dx - xx, ey = ay + t * dy - yy;
        if (ex * ex + ey * ey <= hw * hw) m[j * g.nx + i] = 1;
      }
    }
  }
  return m;
}

/** 4-connected components of a mask, largest first. */
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
      for (const u of nb) {
        if (u >= 0 && m[u] && !seen[u]) { seen[u] = 1; stack.push(u); }
      }
    }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length);
}

function shoelace(p: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Douglas–Peucker on a closed ring. */
function dp(p: [number, number][], tol: number): [number, number][] {
  if (p.length <= 4) return p;
  const pts = [...p, p[0]];
  const keep = pts.map(() => false);
  const simplify = (s0: number, e0: number) => {
    const stack: [number, number][] = [[s0, e0]];
    while (stack.length) {
      const [s, e] = stack.pop()!;
      const [ax, ay] = pts[s], [bx, by] = pts[e];
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
      let md = -1, mi = -1;
      for (let i = s + 1; i < e; i++) {
        const [px, py] = pts[i];
        const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / L;
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

/** Boundary of a component as a simplified polygon. */
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

const cellHa = (g: Grid) => (g.s * g.s) / 10_000;

/** Components of `mask` as polygons of at least `minHa`, each with
 * holes preserved. */
function toPolys(g: Grid, mask: Uint8Array, minHa = 0.01): Poly[] {
  const ch = cellHa(g);
  return components(g, mask)
    .filter((c) => c.length * ch >= minHa)
    .map((c) => outline(g, c));
}

/* ------------------------------------------------ public geometry --- */

/** Cut `boundary` along a drawn line (corridor of `halfWidthM` metres,
 * default ~5). Returns the pieces as a Multi, or null when the line
 * does not split anything (it did not cross the boundary). */
export function splitByLine(boundary: Multi, line: LatLon[],
                            halfWidthM = 5): Multi | null {
  if (line.length < 2 || !boundary.length) return null;
  const g = makeGrid([...boundary.flat(), line]);
  const inside = fillUnion(g, boundary);
  const cut = burnLine(g, line, halfWidthM);
  const keep = new Uint8Array(inside.length);
  for (let c = 0; c < inside.length; c++) {
    keep[c] = inside[c] && !cut[c] ? 1 : 0;
  }
  const comps = components(g, keep).filter((c) => c.length * cellHa(g) >= 0.1);
  if (comps.length < 2) return null;
  return comps.map((c) => outline(g, c));
}

/** A band `widthM` metres wide along each ring of `poly` (the outline
 * as a filled polygon), used to render "outlined" zones: hotspots,
 * risk hexagons, dry parcels. */
export function outlineBand(poly: Poly, widthM: number): Poly[] {
  if (!poly.length) return [];
  const g = makeGrid(poly, 40_000, Math.max(1, widthM / 6));
  const inside = fillUnion(g, [poly]);
  // erode: a cell stays in the core when every neighbour within the
  // erosion radius is inside too; the band is inside-minus-core.
  const r = Math.max(1, Math.round(widthM / g.s));
  const core = new Uint8Array(inside.length);
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx; i++) {
      const c = j * g.nx + i;
      if (!inside[c]) continue;
      let ok = true;
      for (let dj = -r; ok && dj <= r; dj++) {
        for (let di = -r; ok && di <= r; di++) {
          if (di * di + dj * dj > r * r) continue;
          const jj = j + dj, ii = i + di;
          if (jj < 0 || jj >= g.ny || ii < 0 || ii >= g.nx ||
              !inside[jj * g.nx + ii]) ok = false;
        }
      }
      core[c] = ok ? 1 : 0;
    }
  }
  const band = new Uint8Array(inside.length);
  for (let c = 0; c < band.length; c++) band[c] = inside[c] && !core[c] ? 1 : 0;
  return toPolys(g, band, 0.001);
}

/** Diagonal stripes clipped to `poly`: a visible "hatched" pattern for
 * bare-soil zones. Spacing/width in metres. */
export function hatch(poly: Poly, spacingM = 180, widthM = 30,
                      angleDeg = 45): Poly[] {
  if (!poly.length) return [];
  const g = makeGrid(poly, 40_000, Math.max(1, widthM / 4));
  const inside = fillUnion(g, [poly]);
  const stripes = hatchMask(g, spacingM, widthM, (angleDeg * Math.PI) / 180);
  const m = new Uint8Array(inside.length);
  for (let c = 0; c < m.length; c++) m[c] = inside[c] && stripes[c] ? 1 : 0;
  return toPolys(g, m, 0.001);
}

/** Sparse dots inside `poly`: another readable pattern for bare soil
 * when the zone is small. Returns one tiny square per lattice point. */
export function dotGrid(poly: Poly, spacingM = 220, dotM = 26): Poly[] {
  if (!poly.length) return [];
  const ring = poly[0];
  const las = ring.map((p) => p[0]), los = ring.map((p) => p[1]);
  const lat0 = (Math.min(...las) + Math.max(...las)) / 2;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const toXY = ([la, lo]: LatLon): [number, number] =>
    [(lo - los[0]) * M * k, (la - las[0]) * M];
  const pts = ring.map(toXY);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const out: Poly[] = [];
  const dLa = dotM / M, dLo = dotM / (M * k);
  for (let y = Math.min(...ys); y <= Math.max(...ys); y += spacingM) {
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += spacingM) {
      const p: LatLon = [y / M + las[0], x / (M * k) + los[0]];
      if (!pointInRing(p, ring)) continue;
      out.push([[
        [p[0] - dLa / 2, p[1] - dLo / 2], [p[0] - dLa / 2, p[1] + dLo / 2],
        [p[0] + dLa / 2, p[1] + dLo / 2], [p[0] + dLa / 2, p[1] - dLo / 2],
      ]]);
    }
  }
  return out.slice(0, 120);
}

/* ------------------------------------------- segments and editing --- */

const toM = (lat0: number) => {
  const k = Math.cos((lat0 * Math.PI) / 180);
  return (p: LatLon): [number, number] => [p[1] * M * k, p[0] * M];
};

/** Distance (m) from `p` to segment a-b, and the projection point. */
function segDist(a: LatLon, b: LatLon, p: LatLon):
    { d: number; t: number } {
  const lat0 = (a[0] + b[0] + p[0]) / 3;
  const f = toM(lat0);
  const [ax, ay] = f(a), [bx, by] = f(b), [px, py] = f(p);
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1,
    ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  const ex = ax + t * dx - px, ey = ay + t * dy - py;
  return { d: Math.hypot(ex, ey), t };
}

/** Nearest edge of `ring` to `p`: edge index, projection point on the
 * edge (the place a new vertex lands), distance in metres. */
export function nearestEdge(ring: LatLon[], p: LatLon):
    { edge: number; at: LatLon; distM: number } | null {
  if (ring.length < 2) return null;
  let best: { edge: number; at: LatLon; distM: number } | null = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const { d, t } = segDist(a, b, p);
    if (!best || d < best.distM) {
      const lat0 = (a[0] + b[0]) / 2;
      const k = Math.cos((lat0 * Math.PI) / 180);
      const f = toM(lat0);
      const [ax, ay] = f(a), [bx, by] = f(b);
      // project back: the metre frame is absolute (lat0 ignored by toM),
      // so convert x/y straight to lat/lon offsets
      const at: LatLon = [
        (ay + t * (by - ay)) / M,
        (ax + t * (bx - ax)) / (M * k),
      ];
      best = { edge: i, at, distM: d };
    }
  }
  return best;
}

/** Nearest vertex of `ring` to `p` within `tolM` metres (index or -1). */
export function nearestVertex(ring: LatLon[], p: LatLon,
                              tolM: number): number {
  const f = toM(p[0]);
  const [px, py] = f(p);
  let best = -1, bd = tolM;
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = f(ring[i]);
    const d = Math.hypot(x - px, y - py);
    if (d <= bd) { bd = d; best = i; }
  }
  return best;
}

/** Do segments a1-a2 and b1-b2 properly cross (no shared endpoints)? */
function segCross(a1: LatLon, a2: LatLon, b1: LatLon, b2: LatLon) {
  const lat0 = (a1[0] + a2[0] + b1[0] + b2[0]) / 4;
  const f = toM(lat0);
  const [ax, ay] = f(a1), [bx, by] = f(a2), [cx, cy] = f(b1), [dx, dy] = f(b2);
  const cross = (ox: number, oy: number, px2: number, py2: number,
                 qx: number, qy: number) =>
    (px2 - ox) * (qy - oy) - (py2 - oy) * (qx - ox);
  const d1 = cross(cx, cy, dx, dy, ax, ay);
  const d2 = cross(cx, cy, dx, dy, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy);
  const d4 = cross(ax, ay, bx, by, dx, dy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True when any two non-adjacent edges of the ring cross. */
export function selfIntersects(ring: LatLon[]): boolean {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // adjacent edges share a vertex; also skip the wrap pair 0/n-1
      if (j === i || j === (i + 1) % n || i === (j + 1) % n) continue;
      if (segCross(ring[i], ring[(i + 1) % n],
                   ring[j], ring[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Insert a vertex on the nearest edge of a closed ring; refuses the
 * insert when the projection would leave the ring self-crossing. */
export function insertOnEdge(ring: LatLon[], p: LatLon):
    { ring: LatLon[]; index: number } | null {
  const e = nearestEdge(ring, p);
  if (!e) return null;
  const next = [...ring.slice(0, e.edge + 1), e.at, ...ring.slice(e.edge + 1)];
  return selfIntersects(next) ? null : { ring: next, index: e.edge + 1 };
}

/** Move a vertex; null when the move would self-cross the ring. */
export function moveVertex(ring: LatLon[], i: number, p: LatLon):
    LatLon[] | null {
  const next = ring.slice();
  next[i] = p;
  return selfIntersects(next) ? null : next;
}

/** Remove a vertex; null when fewer than 3 remain or it would cross. */
export function removeVertex(ring: LatLon[], i: number):
    LatLon[] | null {
  if (ring.length <= 3) return null;
  const next = ring.filter((_, k) => k !== i);
  return selfIntersects(next) ? null : next;
}

/* --------------------------------------------- screen projection ---- */

/** A lat/lon -> screen-px projector built from the map's center and
 * zoom (bearing and pitch are locked at 0, so Web-Mercator is exact).
 * `w`/`h` are the map's CSS pixels. */
export function mercatorProject(
    center: { lat: number; lon: number; zoom: number },
    w: number, h: number): (p: LatLon) => [number, number] {
  const tile = 256 * Math.pow(2, center.zoom);
  const wy = (lat: number) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  };
  const cx = (center.lon + 180) / 360, cy = wy(center.lat);
  const ox = w / 2 - cx * tile;
  const oy = h / 2 - cy * tile;
  return ([la, lo]) => [
    ox + ((lo + 180) / 360) * tile,
    oy + wy(la) * tile,
  ];
}

/** Centroid of a ring (simple average; badges and label anchors). */
export function ringCenter(ring: LatLon[]): LatLon {
  let la = 0, lo = 0;
  for (const p of ring) { la += p[0]; lo += p[1]; }
  return [la / ring.length, lo / ring.length];
}

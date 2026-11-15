/** parcelsGeo: nearest edge/vertex, self-intersection guard, line
 * splitting, outline bands, hatching and the screen projector. */
import { describe, it, expect } from "vitest";
import {
  selfIntersects, nearestEdge, insertOnEdge, moveVertex, removeVertex,
  splitByLine, outlineBand, hatch, mercatorProject, ringCenter,
} from "./parcelsGeo";
import { squareRing, polyHa } from "./selection";
import type { LatLon } from "./selection";

const sq = (): LatLon[] => squareRing(-33.9, -60.6, 400);
const mid = (a: LatLon, b: LatLon): LatLon =>
  [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

describe("selfIntersects", () => {
  it("accepts a plain square", () => {
    expect(selfIntersects(sq())).toBe(false);
  });
  it("catches a bowtie", () => {
    const r = sq();
    const bowtie = [r[0], r[2], r[1], r[3]]; // reorder -> crossed
    expect(selfIntersects(bowtie)).toBe(true);
  });
});

describe("nearestEdge / insertOnEdge", () => {
  it("projects the tap onto the closest edge", () => {
    const r = sq();
    const p: LatLon = [mid(r[0], r[1])[0] + 0.001, mid(r[0], r[1])[1]];
    const e = nearestEdge(r, p);
    expect(e).not.toBeNull();
    expect([0, r.length - 1]).toContain(e!.edge);
    // the projection sits on the edge (same latitude as the ring side)
    const side = r[0][0] === r[1][0] ? 0 : 1;
    expect(Math.abs(e!.at[side] - r[e!.edge][side])).toBeLessThan(1e-6);
  });
  it("inserts and keeps the vertex on the edge", () => {
    const r = sq();
    const p = mid(r[1], r[2]);
    const ins = insertOnEdge(r, p);
    expect(ins).not.toBeNull();
    expect(ins!.ring).toHaveLength(r.length + 1);
    expect(ins!.index).toBe(2);
    expect(selfIntersects(ins!.ring)).toBe(false);
  });
});

describe("moveVertex / removeVertex", () => {
  it("moves a vertex when the ring stays simple", () => {
    const r = sq();
    const to: LatLon = [r[0][0] + 0.002, r[0][1] + 0.002];
    const next = moveVertex(r, 0, to);
    expect(next).not.toBeNull();
    expect(next![0]).toEqual(to);
  });
  it("rejects a move that crosses the outline", () => {
    const r = sq();
    // drag SW (vertex 0) east past the square: the NW->v0' edge crosses
    // the SE->NE right edge
    const to: LatLon = [r[0][0], r[1][1] + 0.01];
    expect(moveVertex(r, 0, to)).toBeNull();
  });
  it("removes down to 3 vertices and no further", () => {
    const r = sq();
    const n1 = removeVertex(r, 1);
    expect(n1).toHaveLength(3);
    expect(removeVertex(n1!, 0)).toBeNull();
  });
});

describe("splitByLine", () => {
  it("cuts a square into two pieces", () => {
    const r = sq();
    const min = r.reduce((a, p) => [Math.min(a[0], p[0]),
      Math.min(a[1], p[1])]);
    const max = r.reduce((a, p) => [Math.max(a[0], p[0]),
      Math.max(a[1], p[1])]);
    const midLon = (min[1] + max[1]) / 2;
    const line: LatLon[] = [
      [min[0] - 0.001, midLon], [max[0] + 0.001, midLon]];
    const pieces = splitByLine([[r]], line, 10);
    expect(pieces).not.toBeNull();
    expect(pieces!.length).toBe(2);
    // pieces together cover the square minus the cut corridor
    const total = pieces!.reduce((a, p) => a + polyHa(p), 0);
    expect(total).toBeGreaterThan(polyHa([r]) * 0.85);
    expect(total).toBeLessThan(polyHa([r]));
  });
  it("returns null when the line does not split", () => {
    const r = sq();
    const far: LatLon[] = [[r[0][0] - 0.05, r[0][1] - 0.05],
                           [r[0][0] - 0.04, r[0][1] - 0.04]];
    expect(splitByLine([[r]], far, 10)).toBeNull();
  });
});

describe("outlineBand / hatch", () => {
  it("produces a band thinner than the polygon", () => {
    const r = sq();
    const band = outlineBand([r], 40);
    expect(band.length).toBeGreaterThan(0);
    const bandHa = band.reduce((a, p) => a + polyHa(p), 0);
    const full = polyHa([r]);
    expect(bandHa).toBeGreaterThan(0);
    expect(bandHa).toBeLessThan(full * 0.6);
  });
  it("produces stripes inside the polygon", () => {
    const r = squareRing(-33.9, -60.6, 1500);
    const stripes = hatch([r], 300, 40);
    expect(stripes.length).toBeGreaterThan(2);
    const ha = stripes.reduce((a, p) => a + polyHa(p), 0);
    expect(ha).toBeLessThan(polyHa([r]) * 0.5);
  });
});

describe("mercatorProject / ringCenter", () => {
  it("projects the map centre to the screen centre", () => {
    const p = mercatorProject({ lat: -33.9, lon: -60.6, zoom: 12 },
                              800, 600);
    const [x, y] = p([-33.9, -60.6]);
    expect(x).toBeCloseTo(400, 0);
    expect(y).toBeCloseTo(300, 0);
  });
  it("finds the middle of a ring", () => {
    const r = sq();
    const c = ringCenter(r);
    expect(c[0]).toBeCloseTo(-33.9, 3);
    expect(c[1]).toBeCloseTo(-60.6, 3);
  });
});

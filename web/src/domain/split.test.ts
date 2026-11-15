import { describe, it, expect } from "vitest";
import {
  splitSelection, clipZone, simplifyRing, freehandToRing,
} from "./split";
import {
  squareRing, ringAreaHa, polyHa, multiHa, pointInPoly, pointInMulti,
  type LatLon, type Multi,
} from "./selection";

const LAT = -33.96, LON = -60.69;
const M = 111_320;
const dLon = (m: number) => m / (M * Math.cos((LAT * Math.PI) / 180));
const dLat = (m: number) => m / M;

/** 2 km x 1 km rectangle (200 ha) centred on the test point. */
const wideRing: LatLon[] = [
  [LAT - dLat(500), LON - dLon(1000)], [LAT - dLat(500), LON + dLon(1000)],
  [LAT + dLat(500), LON + dLon(1000)], [LAT + dLat(500), LON - dLon(1000)],
];
const wide: Multi = [[wideRing]];
/** North-south road crossing the rectangle through its middle. */
const road = { cls: "tertiary",
  line: [[LAT - dLat(800), LON], [LAT + dLat(800), LON]] as LatLon[] };

describe("splitSelection", () => {
  it("splits a field crossed by a road into two pieces", () => {
    const r = splitSelection(wide, { roads: [road], landuse: [] });
    expect(r.pieces).toHaveLength(2);
    for (const p of r.pieces) expect(p.ha).toBeGreaterThan(90);
    expect(r.roadHa).toBeGreaterThan(0.5);
    expect(r.roadHa).toBeLessThan(5);
    const west = r.pieces.find((p) => pointInPoly([LAT, LON - dLon(500)], p.geom));
    const east = r.pieces.find((p) => pointInPoly([LAT, LON + dLon(500)], p.geom));
    expect(west).toBeTruthy();
    expect(east).toBeTruthy();
    expect(west).not.toBe(east);
  });

  it("keeps one piece when there is nothing to cut", () => {
    const r = splitSelection(wide, { roads: [], landuse: [] });
    expect(r.pieces).toHaveLength(1);
    expect(r.pieces[0].ha).toBeCloseTo(200, -1);
    expect(r.roadHa).toBe(0);
  });

  it("removes the urban part of the selection", () => {
    const town = { cls: "residential", rings: [[
      [LAT - dLat(800), LON + dLon(400)], [LAT - dLat(800), LON + dLon(2000)],
      [LAT + dLat(800), LON + dLon(2000)], [LAT + dLat(800), LON + dLon(400)],
    ] as LatLon[]] };
    const r = splitSelection(wide, { roads: [], landuse: [town] });
    expect(r.urbanHa).toBeGreaterThan(50);
    expect(r.pieces).toHaveLength(1);
    expect(r.pieces[0].ha).toBeCloseTo(140, -1);
    expect(r.excluded.length).toBeGreaterThan(0);
  });

  it("drops slivers below the minimum size", () => {
    const edge = { cls: "tertiary", line: [
      [LAT - dLat(800), LON - dLon(990)], [LAT + dLat(800), LON - dLon(990)],
    ] as LatLon[] };
    const r = splitSelection(wide, { roads: [edge], landuse: [] });
    expect(r.pieces).toHaveLength(1);
  });

  // regression (review #1): a fully urban selection used to come back as
  // one "usable" piece of the same size
  it("leaves no usable piece when the whole selection is urban", () => {
    const town = { cls: "residential", rings: [squareRing(LAT, LON, 3000)] };
    const r = splitSelection([[squareRing(LAT, LON, 350)]],
                             { roads: [], landuse: [town] });
    expect(r.pieces).toEqual([]);
    expect(r.urbanHa).toBeCloseTo(49, 0);
  });

  // regression (review #2): an urban island inside the field must stay a
  // hole in the piece, not reappear in its outline
  it("keeps an interior exclusion as a hole", () => {
    const field: Multi = [[squareRing(LAT, LON, 500)]];        // 100 ha
    const island = { cls: "residential",
                     rings: [squareRing(LAT, LON, 128)] };      // ~6.6 ha
    const r = splitSelection(field, { roads: [], landuse: [island] });
    expect(r.pieces).toHaveLength(1);
    const p = r.pieces[0];
    expect(p.geom.length).toBe(2);                    // outer + 1 hole
    expect(pointInPoly([LAT, LON], p.geom)).toBe(false);
    expect(pointInPoly([LAT + dLat(300), LON], p.geom)).toBe(true);
    expect(polyHa(p.geom)).toBeCloseTo(93.4, 0);
    expect(p.ha).toBeCloseTo(polyHa(p.geom), 5);       // one area everywhere
  });
});

describe("clipZone", () => {
  const field: Multi = [[squareRing(LAT, LON, 500)]]; // 100 ha
  it("keeps a zone inside the field", () => {
    const north: LatLon[] = [
      [LAT, LON - dLon(800)], [LAT, LON + dLon(800)],
      [LAT + dLat(800), LON + dLon(800)], [LAT + dLat(800), LON - dLon(800)],
    ];
    const z = clipZone([[north]], field, []);
    expect(z).not.toBeNull();
    expect(z!.ha).toBeCloseTo(50, -1);
    expect(pointInMulti([LAT + dLat(700), LON], z!.geom)).toBe(false);
  });
  it("does not overlap zones already drawn", () => {
    const half: LatLon[] = [
      [LAT, LON - dLon(600)], [LAT, LON + dLon(600)],
      [LAT + dLat(600), LON + dLon(600)], [LAT + dLat(600), LON - dLon(600)],
    ];
    const z = clipZone([[squareRing(LAT, LON, 900)]], field, [[[half]]]);
    expect(z!.ha).toBeCloseTo(50, -1);
    expect(pointInMulti([LAT + dLat(250), LON], z!.geom)).toBe(false);
  });
  // regression (review #2): a zone drawn around another one must leave
  // the inner zone out
  it("leaves an inner zone out of a zone drawn around it", () => {
    const inner: Multi = [[squareRing(LAT, LON, 150)]];          // 9 ha
    const z = clipZone([[squareRing(LAT, LON, 900)]], field, [inner]);
    expect(pointInMulti([LAT, LON], z!.geom)).toBe(false);
    expect(pointInMulti([LAT + dLat(400), LON], z!.geom)).toBe(true);
    expect(Math.abs(z!.ha - 91)).toBeLessThan(2);   // raster cells ~7 m
    expect(multiHa(z!.geom)).toBeCloseTo(z!.ha, 5);
  });
  it("keeps every piece of a zone that a road splits", () => {
    const split: Multi = [
      [[[LAT - dLat(500), LON - dLon(500)], [LAT - dLat(500), LON - dLon(20)],
        [LAT + dLat(500), LON - dLon(20)], [LAT + dLat(500), LON - dLon(500)]]],
      [[[LAT - dLat(500), LON + dLon(20)], [LAT - dLat(500), LON + dLon(500)],
        [LAT + dLat(500), LON + dLon(500)], [LAT + dLat(500), LON + dLon(20)]]],
    ];
    const z = clipZone([[squareRing(LAT, LON, 900)]], split, []);
    expect(z!.geom).toHaveLength(2);
    expect(Math.abs(z!.ha - 96)).toBeLessThan(2);
  });
  it("returns null for a zone outside the field", () => {
    expect(clipZone([[squareRing(LAT + 0.05, LON, 300)]], field, [])).toBeNull();
  });
});

describe("tile duplicates", () => {
  it("treats repeated copies of an urban polygon as one area", () => {
    const town: LatLon[] = [
      [LAT - dLat(800), LON + dLon(400)], [LAT - dLat(800), LON + dLon(2000)],
      [LAT + dLat(800), LON + dLon(2000)], [LAT + dLat(800), LON + dLon(400)],
    ];
    const r = splitSelection(wide, { roads: [],
      landuse: [{ cls: "residential", rings: [town, town] }] });
    expect(r.urbanHa).toBeGreaterThan(50);
  });
});

describe("simplifyRing / freehandToRing", () => {
  it("reduces a dense stroke to few vertices keeping the area", () => {
    const dense: LatLon[] = [];
    const sq = squareRing(LAT, LON, 500);
    for (let i = 0; i < 4; i++) {
      const [a, b] = [sq[i], sq[(i + 1) % 4]];
      for (let k = 0; k < 100; k++) {
        dense.push([a[0] + ((b[0] - a[0]) * k) / 100,
                    a[1] + ((b[1] - a[1]) * k) / 100]);
      }
    }
    const s = simplifyRing(dense, 5);
    expect(s.length).toBeLessThanOrEqual(8);
    expect(ringAreaHa(s)).toBeCloseTo(100, 0);
  });
  it("closes a freehand stroke and rejects scribbles too small", () => {
    const sq = squareRing(LAT, LON, 300);
    expect(freehandToRing(sq)!.length).toBeGreaterThanOrEqual(4);
    expect(freehandToRing([[LAT, LON], [LAT + 1e-6, LON]])).toBeNull();
  });
});

describe("urban enclaves", () => {
  // found in the walkthrough: a park inside Pergamino was left as the only
  // "usable" piece of a selection that is otherwise all town
  it("treats small pockets inside a mostly urban selection as urban", () => {
    const sel: Multi = [[squareRing(LAT, LON, 500)]];          // 100 ha
    // residential blocks all around a ~4 ha park in the middle
    const box = (s0: number, n0: number, w0: number, e0: number): LatLon[] => [
      [LAT + dLat(s0), LON + dLon(w0)], [LAT + dLat(s0), LON + dLon(e0)],
      [LAT + dLat(n0), LON + dLon(e0)], [LAT + dLat(n0), LON + dLon(w0)]];
    const blocks = [box(100, 900, -900, 900), box(-900, -100, -900, 900),
                    box(-100, 100, -900, -100), box(-100, 100, 100, 900)];
    const r = splitSelection(sel, { roads: [],
      landuse: [{ cls: "residential", rings: blocks }] });
    expect(r.pieces).toEqual([]);
    expect(r.urbanHa).toBeGreaterThan(99);
  });
  it("keeps real fields next to a town", () => {
    const sel: Multi = [[squareRing(LAT, LON, 500)]];
    const half: LatLon[] = [
      [LAT - dLat(800), LON], [LAT - dLat(800), LON + dLon(800)],
      [LAT + dLat(800), LON + dLon(800)], [LAT + dLat(800), LON]];
    const r = splitSelection(sel, { roads: [],
      landuse: [{ cls: "residential", rings: [half] }] });
    expect(r.pieces).toHaveLength(1);
    expect(r.pieces[0].ha).toBeCloseTo(50, -1);
  });
});

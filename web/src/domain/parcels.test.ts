import { describe, it, expect } from "vitest";
import { detectParcels } from "./split";
import {
  squareRing, polyHa, multiHa, pointInPoly, pointInMulti, M_PER_DEG,
  type LatLon, type Multi,
} from "./selection";

const LAT = -33.96, LON = -60.69;
const dLat = (m: number) => m / M_PER_DEG;
const dLon = (m: number) => m / (M_PER_DEG * Math.cos((LAT * Math.PI) / 180));
/** Rectangle in metres around the test point: south, north, west, east. */
const rect = (s: number, n: number, w: number, e: number): LatLon[] => [
  [LAT + dLat(s), LON + dLon(w)], [LAT + dLat(s), LON + dLon(e)],
  [LAT + dLat(n), LON + dLon(e)], [LAT + dLat(n), LON + dLon(w)]];

/** 3 km x 1 km field (300 ha). */
const field: Multi = [[rect(-500, 500, -1500, 1500)]];
/** Three plots side by side, each 900 m x 1 km (90 ha), leaving gaps. */
const ftw3: Multi[] = [
  [[rect(-500, 500, -1500, -600)]], [[rect(-500, 500, -450, 450)]],
  [[rect(-500, 500, 600, 1500)]]];

const near = (a: number, b: number, tol: number) =>
  expect(Math.abs(a - b)).toBeLessThan(tol);

describe("detectParcels", () => {
  it("finds three plots from field boundaries and leaves the rest for review", () => {
    const r = detectParcels(field, { fields: ftw3, roads: [], landuse: [] });
    expect(r.parcels).toHaveLength(3);
    for (const p of r.parcels) near(p.ha, 90, 2);
    expect(r.parcels.every((p) => p.source === "ftw")).toBe(true);
    // the two 150 m gaps between plots are "Límite por revisar"
    near(r.reviewHa, 30, 2);
    near(r.parcelHa + r.reviewHa + r.excludedHa, 300, 2);
    // named west to east
    const xs = r.parcels.map((p) => p.geom[0].reduce((a, q) => a + q[1], 0));
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it("clips a boundary that crosses the field outline", () => {
    const wide: Multi[] = [[[rect(-900, 900, -2500, -600)]]];
    const r = detectParcels(field, { fields: wide, roads: [], landuse: [] });
    expect(r.parcels).toHaveLength(1);
    near(r.parcels[0].ha, 90, 2);
    expect(pointInPoly([LAT + dLat(800), LON - dLon(1000)], r.parcels[0].geom))
      .toBe(false);
  });

  it("joins the pieces of one boundary cut by map tiles", () => {
    const cut: Multi[] = [[[rect(-500, 500, -1500, -1000)], [rect(-500, 500, -1000, -600)]]];
    const r = detectParcels(field, { fields: cut, roads: [], landuse: [] });
    expect(r.parcels).toHaveLength(1);
    near(r.parcels[0].ha, 90, 2);
  });

  it("never returns overlapping plots", () => {
    const overlap: Multi[] = [[[rect(-500, 500, -1500, 200)]], [[rect(-500, 500, -200, 1500)]]];
    const r = detectParcels(field, { fields: overlap, roads: [], landuse: [] });
    near(r.parcelHa, 300, 3);
    const mid: LatLon = [LAT, LON];
    expect(r.parcels.filter((p) => pointInPoly(mid, p.geom))).toHaveLength(1);
  });

  it("splits a plot crossed by a road", () => {
    const road = { cls: "tertiary",
      line: [[LAT - dLat(900), LON - dLon(1000)], [LAT + dLat(900), LON - dLon(1000)]] as LatLon[] };
    const r = detectParcels(field, { fields: [[[rect(-500, 500, -1500, -600)]]],
                                     roads: [road], landuse: [] });
    expect(r.parcels).toHaveLength(2);
    expect(r.excludedHa).toBeGreaterThan(0.5);
  });

  it("respects holes of the field outline", () => {
    const holed: Multi = [[rect(-500, 500, -1500, 1500), rect(-100, 100, -1100, -900)]];
    const r = detectParcels(holed, { fields: ftw3, roads: [], landuse: [] });
    const west = r.parcels.find((p) => pointInPoly([LAT, LON - dLon(1400)], p.geom))!;
    expect(pointInPoly([LAT, LON - dLon(1000)], west.geom)).toBe(false);
    near(west.ha, 86, 2);
  });

  it("leaves plots the producer drew untouched", () => {
    const mine: Multi = [[rect(-500, 500, -1500, -600)]];
    const r = detectParcels(field, { fields: ftw3, roads: [], landuse: [],
                                     taken: [mine] });
    expect(r.parcels).toHaveLength(2);
    near(r.parcelHa + r.reviewHa, 210, 3);
  });

  it("leaves everything for review when there are no boundaries", () => {
    const r = detectParcels(field, { fields: [], roads: [], landuse: [] });
    expect(r.parcels).toEqual([]);
    near(r.reviewHa, 300, 2);
    expect(r.review.length).toBeGreaterThan(0);
  });

  it("keeps plots inside the outline for a 12,000 ha field", () => {
    const big: Multi = [[squareRing(LAT, LON, 5500)]];   // 11 km side
    const plots: Multi[] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      plots.push([[rect(-5000 + i * 2500, -2700 + i * 2500,
                        -5000 + j * 2500, -2700 + j * 2500)]]);
    }
    const r = detectParcels(big, { fields: plots, roads: [], landuse: [] });
    expect(multiHa(big)).toBeGreaterThan(12_000);
    expect(r.parcels).toHaveLength(16);
    for (const p of r.parcels) {
      expect(pointInMulti(p.geom[0][0], [[squareRing(LAT, LON, 5600)]])).toBe(true);
      near(polyHa(p.geom), p.ha, 1e-6);
    }
  });
});

describe("detectParcels on large fields", () => {
  // found in the browser: on a 30,000 ha field the sliver threshold grew
  // with the field and dropped every real plot and most of the land
  it("keeps 10-60 ha plots of a large field and accounts for all land", () => {
    const big: Multi = [[squareRing(LAT, LON, 6000)]];          // 14,400 ha
    const plots: Multi[] = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      plots.push([[rect(-6000 + i * 2000, -5500 + i * 2000,
                        -6000 + j * 2000, -5500 + j * 2000)]]);   // 25 ha each
    }
    const r = detectParcels(big, { fields: plots, roads: [], landuse: [] }, 1);
    expect(r.parcels).toHaveLength(36);
    near(r.parcelHa + r.reviewHa + r.excludedHa, multiHa(big), multiHa(big) * 0.01);
  });
});

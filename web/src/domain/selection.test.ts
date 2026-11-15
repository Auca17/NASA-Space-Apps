import { describe, it, expect } from "vitest";
import {
  ringAreaHa, pointInRing, classifyUrban, parseLatLon, squareRing,
} from "./selection";

/** ~1 km x 1 km square (100 ha) around a Pampa point. */
const sq = (lat: number, lon: number, halfM = 500) => squareRing(lat, lon, halfM);

describe("ringAreaHa", () => {
  it("measures a 1 km square as ~100 ha", () => {
    expect(ringAreaHa(sq(-33.96, -60.69))).toBeCloseTo(100, 0);
  });
  it("is 0 for fewer than 3 points", () => {
    expect(ringAreaHa([[-33, -60], [-33.1, -60]])).toBe(0);
  });
});

describe("pointInRing", () => {
  const r = sq(-33.96, -60.69);
  it("detects inside and outside points", () => {
    expect(pointInRing([-33.96, -60.69], r)).toBe(true);
    expect(pointInRing([-33.90, -60.69], r)).toBe(false);
  });
});

describe("classifyUrban", () => {
  const sel = sq(-33.89, -60.57, 400);
  const town = { cls: "residential", rings: [sq(-33.89, -60.57, 2000)] };
  const farm = { cls: "farmland", rings: [sq(-33.89, -60.57, 2000)] };

  it("flags a selection inside a residential area as urban", () => {
    const r = classifyUrban([sel], [town], []);
    expect(r.urban).toBe(true);
    expect(r.urbanShare).toBeGreaterThan(0.9);
  });
  it("flags a selection full of buildings as urban", () => {
    const pts: [number, number][] = Array.from({ length: 40 }, (_, i) =>
      [-33.89 + (i % 8) * 0.0005 - 0.002, -60.57 + Math.floor(i / 8) * 0.0005 - 0.001]);
    expect(classifyUrban([sel], [farm], pts)).toMatchObject(
      { urban: true, buildings: 40 });
  });
  it("keeps farmland with a few farm buildings as not urban", () => {
    const r = classifyUrban([sel], [farm], [[-33.89, -60.57], [-33.891, -60.571]]);
    expect(r.urban).toBe(false);
    expect(r.buildings).toBe(2);
  });
  it("ignores urban areas that do not reach the selection", () => {
    const far = { cls: "residential", rings: [sq(-33.80, -60.57, 1000)] };
    expect(classifyUrban([sel], [far], []).urban).toBe(false);
  });
});

describe("parseLatLon", () => {
  it("reads pasted coordinates in several formats", () => {
    expect(parseLatLon("-33.9600, -60.6900")).toEqual([-33.96, -60.69]);
    expect(parseLatLon("-33.96 -60.69")).toEqual([-33.96, -60.69]);
    expect(parseLatLon(" -33,96 ; -60,69 ")).toEqual([-33.96, -60.69]);
  });
  it("rejects place names and out-of-range values", () => {
    expect(parseLatLon("Chacabuco, Buenos Aires")).toBeNull();
    expect(parseLatLon("95, 10")).toBeNull();
    expect(parseLatLon("10, 200")).toBeNull();
  });
});

describe("plotBody", () => {
  it("sends one polygon with its holes, closed and in [lon, lat]", async () => {
    const { plotBody } = await import("./selection");
    const outer = squareRing(-33.96, -60.69, 500);
    const hole = squareRing(-33.96, -60.69, 100);
    const b = plotBody([[outer, hole]]);
    expect(b.polygon.type).toBe("Polygon");
    const rings = b.polygon.coordinates as number[][][];
    expect(rings).toHaveLength(2);
    expect(rings[0][0]).toEqual([outer[0][1], outer[0][0]]);
    expect(rings[0].at(-1)).toEqual(rings[0][0]);
    expect(rings[1].at(-1)).toEqual(rings[1][0]);
  });
  it("sends several pieces as a MultiPolygon", async () => {
    const { plotBody } = await import("./selection");
    const a = squareRing(-33.96, -60.70, 300), c = squareRing(-33.96, -60.68, 300);
    const b = plotBody([[a], [c]]);
    expect(b.polygon.type).toBe("MultiPolygon");
    expect((b.polygon.coordinates as number[][][][]).length).toBe(2);
  });
});

// the map, Mis campos and the diagnosis must show the same hectares:
// same spherical formula as back/app/services/geodesy.py ring_area_ha
describe("ringAreaHa matches the backend", () => {
  it("gives the backend's value for a 1 km square at -33.96", () => {
    // value computed by geodesy.ring_area_ha for this ring (lon/lat order)
    const r = squareRing(-33.96, -60.69, 500);
    const back = (() => {
      const R = 6_371_008.8; let t = 0;
      for (let i = 0; i < r.length; i++) {
        const [la0, lo0] = r[i], [la1, lo1] = r[(i + 1) % r.length];
        const rad = Math.PI / 180;
        t += (lo1 - lo0) * rad * (2 + Math.sin(la0 * rad) + Math.sin(la1 * rad));
      }
      return Math.abs(t) * R * R / 2 / 10_000;
    })();
    expect(ringAreaHa(r)).toBeCloseTo(back, 6);
  });
});

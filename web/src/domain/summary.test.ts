import { describe, it, expect } from "vitest";
import { weightedSummary, summaryUnits, runLimited } from "./summary";
import { squareRing, type Multi } from "./selection";
import type { DiagnoseResponse, Card } from "../api/types";

const card = (id: string, value: number | string | null, unit = ""): Card =>
  ({ id, value, unit, text: "", source: "", confidence: "high" } as Card);
const diag = (cards: Card[]): DiagnoseResponse =>
  ({ cards } as unknown as DiagnoseResponse);

describe("weightedSummary", () => {
  it("weights each value by plot area and reports land without data", () => {
    const s = weightedSummary([
      { ha: 300, diag: diag([card("rain", 1000, "mm/año"), card("slope", 1, "%")]) },
      { ha: 100, diag: diag([card("rain", 800, "mm/año"), card("slope", null)]) },
      { ha: 50, diag: null },                      // failed request
    ]);
    const rain = s.rows.find((r) => r.id === "rain")!;
    expect(rain.value).toBeCloseTo(950, 6);        // (300*1000 + 100*800) / 400
    expect(rain.coveredHa).toBe(400);
    const slope = s.rows.find((r) => r.id === "slope")!;
    expect(slope.value).toBe(1);
    expect(slope.coveredHa).toBe(300);
    expect(s.totalHa).toBe(450);
    expect(s.noDataHa).toBe(50);
  });
  it("counts categories (fire risk) by hectares instead of averaging", () => {
    const s = weightedSummary([
      { ha: 300, diag: diag([card("fire", "bajo")]) },
      { ha: 100, diag: diag([card("fire", "alto")]) }]);
    expect(s.categories.fire).toEqual({ bajo: 300, alto: 100 });
  });
});

describe("summaryUnits", () => {
  const p = (lat: number, half: number): Multi => [[squareRing(lat, -60.69, half)]];
  it("uses each confirmed plot and adds the land still to review", () => {
    const u = summaryUnits(
      [{ id: "a", name: "Parcela 1", geom: p(-33.9, 500) },
       { id: "b", name: "Parcela 2", geom: p(-33.95, 500) }],
      p(-34.0, 300), p(-33.95, 3000));
    expect(u.map((x) => x.kind)).toEqual(["parcel", "parcel", "review"]);
    expect(u[2].geom).toEqual(p(-34.0, 300));
  });
  it("falls back to the whole outline when there are no plots", () => {
    const whole = p(-33.95, 5500);
    expect(summaryUnits([], [], whole)).toEqual([
      expect.objectContaining({ kind: "field", geom: whole })]);
  });
});

describe("runLimited", () => {
  it("never runs more than N jobs at once and keeps every result", async () => {
    let running = 0, peak = 0;
    const jobs = Array.from({ length: 7 }, (_, i) => async () => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      if (i === 3) throw new Error("x");
      return i;
    });
    const out = await runLimited(jobs, 2);
    expect(peak).toBe(2);
    expect(out.map((o) => (o.ok ? o.value : "err"))).toEqual([0, 1, 2, "err", 4, 5, 6]);
  });
});

describe("summaryUnits for hundreds of plots", () => {
  // found in the browser: 490 plots meant 490 requests (~15 minutes); plots
  // are now grouped into a few requests, each a MultiPolygon of whole plots
  it("groups neighbouring plots into bounded requests that keep every plot", () => {
    const plots = Array.from({ length: 490 }, (_, i) => ({
      id: `z${i}`, name: `Parcela ${i + 1}`,
      geom: [[squareRing(-33.9 - (i % 22) * 0.004, -60.7 + Math.floor(i / 22) * 0.004, 70)]] as Multi }));
    const u = summaryUnits(plots, [], [[squareRing(-33.95, -60.69, 5500)]]);
    expect(u.length).toBeLessThan(40);
    expect(u.some((x) => x.kind === "group")).toBe(true);
    expect(u.flatMap((x) => x.members ?? [x.id]).sort())
      .toEqual(plots.map((p) => p.id).sort());
    for (const x of u) {
      expect(x.ha).toBeLessThanOrEqual(2_500);
      expect(x.geom.flat(2).length).toBeLessThanOrEqual(1_800);
    }
    expect(u[0].name).toBe("Parcela 1–Parcela " + u[0].members!.length);
  });
  it("keeps one request per plot when there are few plots", () => {
    const plots = [0, 1, 2].map((i) => ({ id: `z${i}`, name: `P${i}`,
      geom: [[squareRing(-33.9, -60.7 + i * 0.02, 400)]] as Multi }));
    expect(summaryUnits(plots, [], []).map((x) => x.kind))
      .toEqual(["parcel", "parcel", "parcel"]);
  });
});

describe("summaryUnits: land to review", () => {
  // found in the browser: 657 ha of review land in one request exceeded
  // the 2,000-vertex limit and stayed without data
  it("splits the land to review into requests within the vertex limit", () => {
    const review: Multi = Array.from({ length: 600 }, (_, i) =>
      [squareRing(-33.9 - (i % 20) * 0.003, -60.7 + Math.floor(i / 20) * 0.003, 40)]);
    const plots = [{ id: "a", name: "P1", geom: [[squareRing(-33.8, -60.7, 300)]] as Multi }];
    const u = summaryUnits(plots, review, []).filter((x) => x.kind === "review");
    expect(u.length).toBeGreaterThan(1);
    for (const x of u) expect(x.geom.flat(2).length).toBeLessThanOrEqual(1_800);
    expect(u.reduce((a, x) => a + x.geom.length, 0)).toBe(600);
  });
});

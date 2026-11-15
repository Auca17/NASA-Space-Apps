import { describe, it, expect } from "vitest";
import {
  biasKey, hasOrinData, isSynthetic, qualityRatio, takeaway,
  varLabelKey,
} from "./orin";
import type { OrinVariable } from "../api/types";

const v = (q: "good" | "fair" | "poor", id = "temp_max",
           over = {}): OrinVariable => ({
  id, quality: q, n: 10, rmse: 1, bias: 0, r: 0.9, unit: "°C",
  satellite: { dataset: "d", resolution: "9 km", period: "p" },
  field: { source: "s", n_sites: 3 },
  ...over,
});

describe("isSynthetic", () => {
  it("flags top-level synthetic and feature-level synthetic", () => {
    expect(isSynthetic({ synthetic: true })).toBe(true);
    expect(isSynthetic({ synthetic: false })).toBe(false);
    expect(isSynthetic({})).toBe(false);
    expect(isSynthetic(null)).toBe(false);
    expect(isSynthetic("x")).toBe(false);
    expect(isSynthetic({ features: [
      { properties: { synthetic: true } }] })).toBe(true);
    expect(isSynthetic({ features: [
      { properties: { synthetic: false } },
      { synthetic: true }] })).toBe(true);
    expect(isSynthetic({ features: [
      { properties: {} }] })).toBe(false);
  });
});

describe("bias wording", () => {
  it("satellite lower than station -> 'menos'", () => {
    expect(biasKey(-1.1, "°C", "1,1")!.key).toBe("orin.bias.less");
  });
  it("satellite higher -> 'más'; zero -> none; NaN -> null", () => {
    expect(biasKey(1.6, "°C", "1,6")!.key).toBe("orin.bias.more");
    expect(biasKey(0, "°C", "0")!.key).toBe("orin.bias.none");
    expect(biasKey(NaN, "°C", "-")).toBeNull();
  });
});

describe("quality + takeaway", () => {
  it("maps quality to a bar ratio", () => {
    expect(qualityRatio("good")).toBe(1);
    expect(qualityRatio("fair")).toBeCloseTo(0.66);
    expect(qualityRatio("poor")).toBeCloseTo(0.33);
    expect(qualityRatio("other")).toBeCloseTo(0.33);
  });
  it("takeaway pairs the best-good var with each weak var", () => {
    const parts = takeaway(
      [v("good", "temp_max"), v("poor", "soil_moisture"),
       v("fair", "temp_min")],
      (id) => `label:${id}`);
    expect(parts.map((p) => p.key)).toEqual([
      "orin.take.good", "orin.take.fair", "orin.take.poor"]);
    expect(parts.at(-1)!.vars.res).toBe("9 km");
  });
  it("falls back to the first variables when none is good", () => {
    const parts = takeaway([v("fair", "a"), v("poor", "b")],
                           (id) => id);
    expect(parts).toHaveLength(2);
  });
  it("variable labels resolve to i18n keys", () => {
    expect(varLabelKey("ndvi")).toBe("orin.var.ndvi");
  });
});

describe("hasOrinData", () => {
  it("hides the card on missing file or empty variables", () => {
    expect(hasOrinData(null)).toBe(false);
    expect(hasOrinData({ version: "v1", variables: [] })).toBe(false);
    expect(hasOrinData({ version: "v1", variables: [v("good")] }))
      .toBe(true);
  });
});

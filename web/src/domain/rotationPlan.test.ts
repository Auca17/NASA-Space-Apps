import { describe, expect, it } from "vitest";
import { rotationPlan, rotationTech } from "./rotationPlan";

const info = (id: string, role: "grain" | "cover" | "pasture", extra = {}) => ({
  id, name: { es: id }, family: "F", role, n_fixation: false, residue_t_ha: 3,
  root_depth_cm: 100, water_mm_cycle: 500, ph_min: null, ph_max: null, ...extra,
});

describe("rotationPlan", () => {
  it("lays a one-year sequence out with its fallow periods and the restart", () => {
    const plan = rotationPlan([
      { crop: "centeno", start: "04-15", end: "09-30", cover: true },
      { crop: "soja", start: "11-01", end: "04-10", cover: true },
    ], [info("centeno", "cover"), info("soja", "grain", { n_fixation: true })]);
    expect(plan.years).toBe(1);
    expect(plan.entries.map((e) => [e.kind, e.year, e.crop ?? "", e.start, e.end])).toEqual([
      ["cover", 1, "centeno", "04-15", "09-30"],
      ["fallow", 1, "", "10-01", "10-31"],
      ["grain", 1, "soja", "11-01", "04-10"],
    ]);
    expect(plan.restart).toBe("centeno");
    expect(plan.entries[1].days).toBe(31);
  });

  it("counts years for multi-year pastures and marks double crops", () => {
    const plan = rotationPlan([
      { crop: "alfalfa", start: "03-15", end: "03-14" },
      { crop: "alfalfa", start: "03-15", end: "03-14" },
      { crop: "maiz", start: "09-25", end: "03-15" },
      { crop: "trigo", start: "06-01", end: "12-10" },
      { crop: "soja", start: "12-15", end: "04-30" },
    ], [info("alfalfa", "pasture"), info("maiz", "grain"), info("trigo", "grain"), info("soja", "grain")]);
    const kinds = plan.entries.map((e) => [e.kind, e.year, e.crop ?? ""]);
    expect(kinds).toEqual([
      ["pasture", 1, "alfalfa"], ["pasture", 2, "alfalfa"],
      ["fallow", 3, ""], ["grain", 3, "maiz"], ["fallow", 4, ""], ["grain", 4, "trigo"],
      ["second", 4, "soja"],
    ]);
    expect(plan.years).toBe(4);
  });

  it("flags the crops whose pH range the soil misses", () => {
    const plan = rotationPlan([{ crop: "alfalfa", start: "03-15", end: "03-14" }],
      [info("alfalfa", "pasture", { ph_min: 6.3, ph_max: 7.5 })], 5.9);
    expect(plan.entries[0].ph).toBe("low");
  });
});

describe("rotationTech", () => {
  it("turns the indicators into technical lines with their data", () => {
    const lines = rotationTech({
      water_balance_mm: -185, bare_soil_days: 35, erosion_risk: "bajo", infiltration: "alta",
      residue_t_ha_yr: 8.3, families: 2, pest_break: 0, nitrogen: 1,
    }, [info("centeno", "cover"), info("soja", "grain", { ph_min: 5.5, ph_max: 7, n_fixation: true })], 6.0,
    (n) => String(n));
    expect(lines.map((l) => l.key)).toEqual([
      "rot.tech.waterShort", "rot.tech.bare", "rot.tech.residue", "rot.tech.families",
      "rot.tech.nitrogen", "rot.tech.phOk"]);
    expect(lines[0].vars).toEqual({ mm: "185" });
    expect(lines[1].vars).toEqual({ days: "35", erosion: "bajo", infiltration: "alta" });
  });

  it("names the crops outside the soil pH range", () => {
    const lines = rotationTech({}, [info("alfalfa", "pasture", { ph_min: 6.3, ph_max: 7.5 }),
      info("soja", "grain", { ph_min: 5.5, ph_max: 7 })], 5.9, (n) => String(n));
    expect(lines).toEqual([{ key: "rot.tech.phOut", vars: { ph: "5.9", crops: "alfalfa (6.3–7.5)" } }]);
  });
});

describe("fallowAdvice", () => {
  const crops = [info("maiz", "grain", { ph_min: 5.8, ph_max: 7 }), info("soja", "grain")];
  it("says what to do in each period without a crop", async () => {
    const { fallowAdvice } = await import("./rotationPlan");
    const plan = rotationPlan([
      { crop: "soja", start: "11-01", end: "04-15" },
      { crop: "maiz", start: "09-25", end: "03-15" },
    ], crops);
    const tips = fallowAdvice(plan, crops, 5.5);
    expect(tips.map((f) => [f.start, f.end, f.after, f.before])).toEqual([
      ["04-16", "09-24", "soja", "maiz"], ["03-16", "10-31", "maiz", "soja"]]);
    expect(tips[0].tips).toEqual(["weeds", "residue", "coverForMaize", "soilTest", "lime", "sowPrep"]);
  });

  it("keeps short turnarounds to weeds and sowing", async () => {
    const { fallowAdvice } = await import("./rotationPlan");
    const plan = rotationPlan([
      { crop: "centeno", start: "04-15", end: "09-30" },
      { crop: "soja", start: "11-01", end: "04-10" },
    ], [info("centeno", "cover"), info("soja", "grain")]);
    const tips = fallowAdvice(plan, [], null);
    expect(tips).toHaveLength(1);
    expect(tips[0].tips).toEqual(["weeds", "residue", "sowPrep"]);
  });
});

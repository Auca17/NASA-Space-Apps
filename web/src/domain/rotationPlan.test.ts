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
  it("gives a dated to-do list with a cover crop in a long autumn-winter gap", async () => {
    const { fallowAdvice } = await import("./rotationPlan");
    const plan = rotationPlan([
      { crop: "soja", start: "11-01", end: "04-15" },
      { crop: "maiz", start: "09-25", end: "03-15" },
    ], crops);
    const [beforeMaize, beforeSoy] = fallowAdvice(plan, crops, 5.5);
    expect([beforeMaize.start, beforeMaize.end, beforeMaize.after, beforeMaize.before])
      .toEqual(["04-16", "09-24", "soja", "maiz"]);
    expect(beforeMaize.steps.map((step) => [step.key, step.from, step.to ?? ""])).toEqual([
      ["harvest", "04-16", ""], ["lime", "04-17", "04-26"], ["coverSowVicia", "04-17", "04-26"],
      ["coverGrow", "04-27", "08-25"], ["soilTest", "08-26", ""], ["coverEnd", "09-04", ""],
      ["sowPrep", "09-18", "09-24"], ["sow", "09-25", ""]]);
    expect(beforeSoy.steps.find((step) => step.key === "coverSow")).toBeDefined();
  });

  it("keeps a short turnaround to weed control and sowing", async () => {
    const { fallowAdvice } = await import("./rotationPlan");
    const plan = rotationPlan([
      { crop: "centeno", start: "04-15", end: "09-30" },
      { crop: "soja", start: "11-01", end: "04-10" },
    ], [info("centeno", "cover"), info("soja", "grain")]);
    const tips = fallowAdvice(plan, [], null);
    expect(tips).toHaveLength(1);
    expect(tips[0].steps.map((step) => step.key)).toEqual(["harvest", "weeds", "chemFallow", "sowPrep", "sow"]);
    expect(tips[0].steps.at(-1)).toEqual({ from: "11-01", key: "sow", vars: { before: "soja" } });
  });
});

describe("rowRuns", () => {
  const seq = [
    { crop: "maiz", start: "09-25", end: "03-15" },
    { crop: "vicia", start: "04-01", end: "10-15" },
    { crop: "soja", start: "11-01", end: "04-15" },
  ];
  it("names what really follows each crop over the years", async () => {
    const { rowRuns } = await import("./rotationPlan");
    const text = (i: number) => rowRuns(seq, i).map((r) => `${r.from}-${r.to}:${r.who}`);
    // maize Sep-Mar, then vetch Apr-Aug
    expect(text(0)).toEqual(["0-2:own", "3-7:vicia", "8-11:own"]);
    // vetch Apr-Oct, then soy Nov-Mar
    expect(text(1)).toEqual(["0-2:soja", "3-9:own", "10-11:soja"]);
    // soy Nov-Apr, then fallow until maize (sown 25 Sep, so it shows from October)
    expect(text(2)).toEqual(["0-3:own", "4-8:fallow", "9-9:maiz", "10-11:own"]);
  });
});

describe("coverSpans / withCover", () => {
  it("paints the cover crop of the fallow plan on the calendar", async () => {
    const { fallowAdvice, coverSpans, withCover, rowRuns } = await import("./rotationPlan");
    const seq = [{ crop: "soja", start: "11-01", end: "04-15" }];
    const plan = rotationPlan(seq, [info("soja", "grain")]);
    const covers = coverSpans(fallowAdvice(plan, [info("soja", "grain")]));
    expect(covers.map((c) => [c.crop, c.from, c.to])).toEqual([["centeno", "04-17", "10-11"]]);
    expect(withCover(rowRuns(seq, 0), covers).map((r) => `${r.from}-${r.to}:${r.who}`))
      .toEqual(["0-3:own", "4-9:cover:centeno", "10-11:own"]);
  });
});

describe("whyEachCrop", () => {
  it("explains the role of every crop of the rotation with its data", async () => {
    const { whyEachCrop } = await import("./rotationPlan");
    const seq = [
      { crop: "maiz", start: "09-25", end: "03-15" },
      { crop: "vicia", start: "04-01", end: "10-15" },
      { crop: "soja", start: "11-01", end: "04-15" },
    ];
    const crops = [
      info("maiz", "grain", { family: "Poaceae", residue_t_ha: 6.5, root_depth_cm: 130, water_mm_cycle: 650 }),
      info("vicia", "cover", { family: "Fabaceae", n_fixation: true, residue_t_ha: 3.5, water_mm_cycle: 175 }),
      info("soja", "grain", { family: "Fabaceae", n_fixation: true, residue_t_ha: 3.3, ph_min: 5.5, ph_max: 7,
                              water_mm_cycle: 575 }),
    ];
    const why = whyEachCrop(seq, crops, 6.8, (n) => String(n));
    expect(why.map((w) => w.crop)).toEqual(["maiz", "vicia", "soja"]);
    expect(why[0].lines.map((l) => l.key)).toEqual([
      "rot.why.grain", "rot.why.family", "rot.why.residueHigh", "rot.why.roots", "rot.why.water"]);
    expect(why[0].lines[1].vars).toEqual({ prev: "soja", fam: "Poaceae", famPrev: "Fabaceae" });
    expect(why[1].lines.map((l) => l.key)).toEqual([
      "rot.why.cover", "rot.why.legume", "rot.why.family", "rot.why.residueLow", "rot.why.water"]);
    expect(why[1].lines[1].vars).toEqual({ next: "soja" });
    expect(why[2].lines.map((l) => l.key)).toContain("rot.why.sameFamily");
    expect(why[2].lines.at(-1)).toEqual({ key: "rot.why.phOk", vars: { ph: "6.8", range: "5.5–7" } });
  });
});

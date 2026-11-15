import { describe, expect, it } from "vitest";
import { detailSections } from "./cropDetail";

const fmt = (n: number) => String(n);
const land = {
  texture: "Franco-arcilloso", carbon_g_kg: 19.5, infiltration: 40, infiltration_class: "media" as const,
  slope_pct: 3.8, heavy_rain_days: 2, root_moisture_pct: 46, rain_30d_mm: 50.9, rain_30d_normal_mm: 106,
  rain_30d_pct: 48, bare_soil_days: 122, heat_days: 20,
};
const soja = {
  rain_mm: 620, water_demand_mm: 500, balance_mm: 120, rain_wet_mm: 520, rain_expected_mm: 516,
  balance_expected_mm: 16, cover_days: 150, bare_days: 215, fits_frost: true, different_family: true,
  same_family: false, rain_period: "cycle" as const, erosion: 16, erosion_level: "baja" as const,
  drought_tolerance: "medium" as const, heat_tolerance: "medium" as const, frost_tolerance: "low" as const,
  root_depth_cm: 120, residue_t_ha: 2.5, n_fixation: true, conditional: false,
};
const nina = { phase: "la_nina" as const, oni: -0.8, oni_period: "SON 2026", season: "2026-27",
  rain_effect_pct: -20, effects: { el_nino: 15, la_nina: -20 } };
const keys = (s: ReturnType<typeof detailSections>, id: string) =>
  s.find((x) => x.id === id)?.lines.map((l) => l.key) ?? [];

describe("detailSections", () => {
  it("orders the explanation: decision, land, water, expected climate, risks", () => {
    const s = detailSections(soja, land, nina, fmt);
    expect(s.map((x) => x.id)).toEqual(["decision", "land", "water", "climate", "risks"]);
  });

  it("reads the land state and how this crop treats it", () => {
    const s = detailSections(soja, land, nina, fmt);
    expect(keys(s, "land")).toEqual([
      "recs.detail.soil", "recs.detail.infil.media", "recs.detail.erosion.baja",
      "recs.detail.residue.low", "recs.detail.nitrogen", "recs.detail.coverToday"]);
    const soil = s[1].lines[0];
    expect(soil.vars).toEqual({ texture: "Franco-arcilloso", carbon: "19.5", infil: "40" });
    expect(s[1].lines[2].vars).toEqual({ slope: "3.8", heavy: "2", bare: "215" });
  });

  it("starts the water section with today's moisture and recent rain", () => {
    const s = detailSections(soja, land, nina, fmt);
    expect(keys(s, "water")).toEqual([
      "recs.detail.start.dry", "recs.tech.balance", "recs.detail.roots.deep", "recs.detail.drought.medium"]);
    expect(s[2].lines[0].vars).toEqual({ moisture: "46", rain: "50.9", normal: "106", pct: "48" });
  });

  it("turns the ENSO scenario into a consequence for this crop and this soil", () => {
    const tight = detailSections({ ...soja, balance_expected_mm: -40, rain_expected_mm: 460 }, land, nina, fmt);
    expect(keys(tight, "climate")).toEqual(["recs.tech.season.la_nina", "recs.detail.climate.deficit"]);
    expect(tight.find((x) => x.id === "climate")?.lines[1].vars).toEqual({ gap: "40" });
    const ok = detailSections(soja, land, nina, fmt);
    expect(keys(ok, "climate")[1]).toBe("recs.detail.climate.drierOk");
    const wet = detailSections(soja, { ...land, infiltration_class: "baja" },
      { ...nina, phase: "el_nino", rain_effect_pct: 17 }, fmt);
    expect(keys(wet, "climate")[1]).toBe("recs.detail.climate.wetterRunoff");
  });

  it("summarises strengths and limits in the decision section", () => {
    const s = detailSections({ ...soja, balance_expected_mm: -40, fits_frost: false, conditional: true },
      land, nina, fmt);
    expect(s[0].lines.map((l) => [l.key, l.tone])).toEqual([
      ["recs.detail.verdict.conditional", undefined],
      ["recs.detail.plus.erosion", "plus"], ["recs.detail.plus.family", "plus"],
      ["recs.detail.minus.water", "minus"], ["recs.detail.minus.frost", "minus"]]);
  });

  it("skips every line whose data is missing", () => {
    const s = detailSections({ ...soja, rain_mm: null, balance_mm: undefined, erosion_level: null,
      root_depth_cm: null }, {}, null, fmt);
    expect(keys(s, "land")).toEqual(["recs.detail.residue.low", "recs.detail.nitrogen", "recs.detail.cover"]);
    expect(keys(s, "water")).toEqual(["recs.detail.drought.medium"]);
    expect(s.find((x) => x.id === "climate")).toBeUndefined();
  });
});

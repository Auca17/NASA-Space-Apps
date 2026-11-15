import { describe, expect, it } from "vitest";
import { outlookLine, technicalReasons } from "./cropReasons";

const fmt = (n: number) => String(n);
const soja = {
  rain_mm: 620, water_demand_mm: 500, balance_mm: 120, rain_wet_mm: 520,
  rain_expected_mm: 516, balance_expected_mm: 16, cover_days: 150,
  fits_frost: true, different_family: true, same_family: false, rain_period: "cycle" as const,
};
const nina = { phase: "la_nina" as const, oni: -0.8, oni_period: "SON 2026", season: "2026-27", rain_effect_pct: -20,
  effects: { el_nino: 15, la_nina: -20 } };

describe("technicalReasons", () => {
  it("explains the cycle water balance and the season under the ENSO phase", () => {
    const reasons = technicalReasons(soja, nina, fmt);
    expect(reasons[0]).toEqual({ key: "recs.tech.balance", vars: {
      rain: "620", need: "500", balance: "+120", pct: "124" } });
    expect(reasons[1]).toEqual({ key: "recs.tech.season.la_nina", vars: {
      oni: "-0.8", period: "SON 2026", season: "2026-27", effect: "-20", wet: "520", expected: "516",
      balance: "+16" } });
    expect(reasons.map((r) => r.key)).toEqual([
      "recs.tech.balance", "recs.tech.season.la_nina", "recs.tech.frostOk",
      "recs.tech.cover", "recs.tech.different"]);
  });

  it("flags deficits, frost exposure and the same family", () => {
    const reasons = technicalReasons({ ...soja, rain_mm: 216, water_demand_mm: 650, balance_mm: -434,
      rain_expected_mm: undefined, balance_expected_mm: undefined, fits_frost: false,
      different_family: false, same_family: true }, null, fmt);
    expect(reasons[0].vars).toMatchObject({ balance: "-434", pct: "33" });
    expect(reasons.map((r) => r.key)).toEqual([
      "recs.tech.balance", "recs.tech.frostRisk", "recs.tech.cover", "recs.tech.same"]);
  });

  it("uses the annual balance for perennials and the neutral wording", () => {
    const reasons = technicalReasons({ ...soja, rain_period: "year", rain_expected_mm: 620,
      balance_expected_mm: 120 }, { ...nina, phase: "neutral", oni: 0.2, rain_effect_pct: 0 }, fmt);
    expect(reasons[0].key).toBe("recs.tech.balanceYear");
    expect(reasons[1].key).toBe("recs.tech.season.neutral");
  });

  it("says nothing about water when the rain is unknown", () => {
    const reasons = technicalReasons({ ...soja, rain_mm: null, balance_mm: undefined }, nina, fmt);
    expect(reasons.map((r) => r.key)).not.toContain("recs.tech.balance");
    expect(reasons.map((r) => r.key)).not.toContain("recs.tech.season.la_nina");
  });
});

it("says when the cycle falls outside the season the phase speaks for", () => {
  const reasons = technicalReasons({ ...soja, rain_wet_mm: 0, rain_expected_mm: 620, balance_expected_mm: 120 },
    nina, fmt);
  expect(reasons[1]).toEqual({ key: "recs.tech.season.outside", vars: { season: "2026-27" } });
});

describe("outlookLine", () => {
  it("summarises the phase and the local historical effect", () => {
    expect(outlookLine(nina, fmt)).toEqual({ key: "recs.outlook.la_nina", vars: {
      oni: "-0.8", period: "SON 2026", season: "2026-27", nino: "+15", nina: "-20" } });
  });
  it("falls back when the index or the local history is missing", () => {
    expect(outlookLine(null, fmt)).toEqual({ key: "recs.outlook.none", vars: {} });
    expect(outlookLine({ ...nina, effects: null, rain_effect_pct: null }, fmt).key)
      .toBe("recs.outlook.noHistory");
  });
});

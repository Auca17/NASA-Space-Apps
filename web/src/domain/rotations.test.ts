import { describe, it, expect } from "vitest";
import type { Strategy } from "../api/types";
import {
  groupVariants, indicatorLabelKey, irrigationNeedMm,
  prioWeights, groupedCards, cardValueText, verdictDelta,
  compareDeltas, seqSegments, strategyOrder, orderNote, rankNote,
  deltaText,
} from "./rotations";

function strat(id: string, crops: string[], extra = {}): Strategy {
  return {
    id, name: id, is_current: false, score: 0.5, confidence: "high",
    indicators: {}, why: "", evidence: [], benefits: {}, gaps: [],
    risks: [], sequence: crops.map((crop) => (
      { crop, start: "01-01", end: "06-01" })),
    ...extra,
  } as Strategy;
}

describe("groupVariants", () => {
  it("folds a single trigo<->cebada swap into the primary card", () => {
    const a = strat("trigo-soja2-maiz", ["trigo", "soja", "maiz"]);
    const b = strat("cebada-soja2-maiz", ["cebada", "soja", "maiz"]);
    const c = strat("maiz-soja", ["maiz", "soja"]);
    const g = groupVariants([a, b, c]);
    expect(g).toHaveLength(2);
    expect(g[0].variants.map((v) => v.id)).toEqual(["cebada-soja2-maiz"]);
    expect(g[1].primary.id).toBe("maiz-soja");
  });

  it("does not fold multi-swap or different-length sequences", () => {
    const a = strat("a", ["trigo", "soja"]);
    const two = strat("b", ["cebada", "cebada"]);
    const diff = strat("c", ["trigo", "soja", "maiz"]);
    const g = groupVariants([a, two, diff]);
    expect(g).toHaveLength(3);
  });

  it("keeps the current strategy as its own group", () => {
    const cur = strat("cur", ["soja"], { is_current: true });
    const alt = strat("alt", ["cebada"]);
    const g = groupVariants([cur, alt]);
    expect(g[0].primary.is_current).toBe(true);
    expect(g[0].variants).toHaveLength(0);
  });
});

describe("indicatorLabelKey", () => {
  it("hides the deprecated carbon alias and maps renames", () => {
    expect(indicatorLabelKey("carbon")).toBeNull();
    expect(indicatorLabelKey("residue_t_ha_yr")).toBe("ind.residue");
    expect(indicatorLabelKey("bare_soil_days")).toBe("ind.bareSoil");
    expect(indicatorLabelKey("water_balance")).toBe("ind.waterBalance");
  });
});

describe("irrigationNeedMm", () => {
  it("returns the supplemental mm only under 'con riego'", () => {
    const s = strat("x", ["soja"], {
      indicators: { water_balance: "con riego",
                    irrigation_need_mm: 54 } });
    expect(irrigationNeedMm(s)).toBe(54);
    const dry = strat("y", ["soja"],
      { indicators: { water_balance: 120 } });
    expect(irrigationNeedMm(dry)).toBeNull();
  });
});

describe("prioWeights", () => {
  it("ranks picks 5/4/3, unselected 0; empty = equal weights", () => {
    expect(prioWeights(["water", "soil", "erosion"]))
      .toMatchObject({ water: 5, soil: 4, erosion: 3, income: 0 });
    expect(prioWeights([]))
      .toMatchObject({ water: 3, soil: 3, pests: 3 });
    expect(Object.keys(prioWeights([]))).toHaveLength(8);
  });
});

describe("groupedCards", () => {
  it("orders the 13 cards under the four groups", () => {
    const ids = ["rain","heavy_rain","soil_moisture","water_trend",
      "crop_water","recent_weather","frost","heat","soil",
      "vigor_bare_soil","slope","fire","fire_weather"];
    const cards = [...ids].reverse().map((id) => (
      { id, value: 1, text: "", source: "s",
        confidence: "high" as const }));
    const g = groupedCards(cards);
    expect(g.map((x) => x.group)).toEqual(
      ["water", "temp", "soil", "fire"]);
    expect(g[0].cards.map((c) => c.id)).toEqual(
      ["rain","heavy_rain","soil_moisture","water_trend",
       "crop_water","recent_weather"]);
  });
});

describe("cardValueText", () => {
  const fmt = new Intl.NumberFormat("es", { maximumFractionDigits: 1 });
  it("renders value with unit, null when missing", () => {
    expect(cardValueText(
      { id: "rain", value: 1087, unit: "mm/año", text: "", source: "s",
        confidence: "high" }, fmt)).toBe("1087 mm/año");
    expect(cardValueText(
      { id: "x", value: null, text: "", source: "s",
        confidence: "low" }, fmt)).toBeNull();
  });
});

describe("verdictDelta", () => {
  it("picks the strongest good deltas vs current", () => {
    const cur = strat("cur", ["soja"], { is_current: true,
      indicators: { residue_t_ha_yr: 1, bare_soil_days: 200,
                    erosion_risk: 3, water_balance: -50,
                    burns_avoided: 0 } });
    const alt = strat("alt", ["trigo"], {
      indicators: { residue_t_ha_yr: 3, bare_soil_days: 100,
                    erosion_risk: 3, water_balance: -50,
                    burns_avoided: 1 } });
    const v = verdictDelta(alt, cur);
    expect(v.key).toBe("rot.verdict.parts");
    expect(v.parts).toEqual(
      ["rot.verdict.residue", "rot.verdict.bare"]);
    expect(verdictDelta(cur, cur).key).toBe("rot.verdict.current");
    const same = strat("same", ["maiz"], { indicators: cur.indicators });
    expect(verdictDelta(same, cur).key).toBe("rot.verdict.balanced");
  });
});

describe("compareDeltas", () => {
  it("reports direction + delta on the four indicators", () => {
    const cur = strat("cur", ["soja"], { is_current: true,
      indicators: { water_balance: -50, bare_soil_days: 200,
                    erosion_risk: 3, burns_avoided: 0 } });
    const alt = strat("alt", ["trigo"], {
      indicators: { water_balance: -30, bare_soil_days: 200,
                    erosion_risk: 2, burns_avoided: "con riego" } });
    const d = compareDeltas(alt, cur);
    expect(d[0]).toEqual({ id: "water_balance", dir: "up", delta: 20 });
    expect(d[1]).toEqual({ id: "bare_soil_days", dir: "same", delta: null });
    expect(d[2]).toEqual({ id: "erosion_risk", dir: "down", delta: -1 });
    expect(d[3].dir).toBe("same");
  });
});

describe("seqSegments", () => {
  it("splits wrap-around windows into two segments", () => {
    expect(seqSegments("11-01", "04-15"))
      .toEqual([{ from: 10, to: 11 }, { from: 0, to: 3 }]);
    expect(seqSegments("03-01", "06-30")).toEqual([{ from: 2, to: 5 }]);
  });
});

/* ---------------------------------------------------- task 17 scenario --- */

describe("scenario helpers", () => {
  const rots = {
    strategies: [
      { id: "a", name: "A", score: 0.7 },
      { id: "b", name: "B", score: 0.5 },
    ],
    baseline_order: ["b", "a"],
  };

  it("strategyOrder sorts by score desc", () => {
    expect(strategyOrder(rots)).toEqual(["a", "b"]);
  });

  it("orderNote same order", () => {
    expect(orderNote({
      strategies: rots.strategies,
      baseline_order: ["a", "b"],
    })?.key).toBe("scen.order.same");
  });

  it("orderNote change names both strategies", () => {
    const n = orderNote(rots);
    expect(n?.key).toBe("scen.order.change");
    expect(n?.vars).toEqual({ a: "B", b: "A" });
  });

  it("rankNote up/down/new", () => {
    expect(rankNote("a", rots)).toEqual({ key: "scen.rank.up", n: 1 });
    expect(rankNote("b", rots)).toEqual({ key: "scen.rank.down", n: 2 });
    expect(rankNote("z", rots)).toEqual({ key: "scen.rank.new" });
  });

  it("deltaText formats sign and unit", () => {
    const fmt = new Intl.NumberFormat("es");
    expect(deltaText({ delta: -196, unit: "mm/año" }, fmt))
      .toBe("−196 mm/año");
    expect(deltaText({ delta: 14, unit: "días" }, fmt)).toBe("+14 días");
    expect(deltaText({ delta: 0 }, fmt)).toBeNull();
  });
});

// regression (review #6): water and stubble showed twice with one value
describe("benefitRows", () => {
  it("shows each indicator once, as a signed change", async () => {
    const { benefitRows } = await import("./rotations");
    const rows = benefitRows({ water_balance: -35, water_balance_mm: -35,
      residue_t_ha_yr: 2.1, carbon: 2.1, bare_soil_days: 0,
      erosion_risk: "bajo" });
    expect(rows.map((r) => r.key)).toEqual([
      "ind.waterBalance", "ind.residue", "ind.bareSoil", "ind.erosion"]);
    expect(rows.map((r) => r.value)).toEqual(["−35", "+2.1", "=", "bajo"]);
  });
  it("hides the mm twin of the water indicator", () => {
    expect(indicatorLabelKey("water_balance_mm")).toBeNull();
  });
});

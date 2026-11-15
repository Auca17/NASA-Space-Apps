import { describe, it, expect } from "vitest";
import es from "./es.json";
import en from "./en.json";

const CARD_IDS = [
  "rain", "heavy_rain", "soil_moisture", "frost", "heat",
  "crop_water", "vigor_bare_soil", "slope", "soil", "water_trend",
  "fire", "fire_weather", "recent_weather",
];
const IND_KEYS = [
  "ind.residue", "ind.bareSoil", "ind.waterBalance", "ind.nitrogen",
  "ind.erosion", "ind.pestBreak", "ind.income", "ind.forage",
  "ind.burnsAvoided", "ind.irrigationNeed",
];
const UI_KEYS = [
  "ui.close", "ui.panel", "ui.and",
  "calendar.aria",
  "rot.affinity", "rot.affinityTip", "prio.choose", "prio.hint",
  "rot.verdict.current", "rot.verdict.balanced", "rot.verdict.parts",
  "rot.cmp.title", "rot.cmp.up", "rot.cmp.down", "rot.cmp.same",
  "rot.carousel",
  "field.source", "field.group.water", "field.group.temp",
  "field.group.soil", "field.group.fire", "field.group.other",
  "field.sum.l1z", "field.sum.l1",
];

describe("i18n completeness (P1-1)", () => {
  it("every diagnosis card id has es+en text", () => {
    for (const id of CARD_IDS) {
      expect(es[`card.${id}` as keyof typeof es]).toBeTruthy();
      expect(en[`card.${id}` as keyof typeof en]).toBeTruthy();
    }
  });
  it("every indicator has es+en text", () => {
    for (const k of IND_KEYS) {
      expect(es[k as keyof typeof es]).toBeTruthy();
      expect(en[k as keyof typeof en]).toBeTruthy();
    }
  });
  it("every new UI string exists in both languages", () => {
    for (const k of UI_KEYS) {
      expect(es[k as keyof typeof es]).toBeTruthy();
      expect(en[k as keyof typeof en]).toBeTruthy();
    }
  });
  it("es and en carry the same key set", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });
});

describe("confidence labels", () => {
  it("are word-first Spanish words, not API ids", () => {
    expect(es["field.confidence.low"]).toBe("baja");
    expect(es["field.confidence.medium"]).toBe("media");
    expect(es["field.confidence.high"]).toBe("alta");
    expect(en["field.confidence.low"]).toBe("low");
  });
});

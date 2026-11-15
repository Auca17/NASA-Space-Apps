import { describe, it, expect } from "vitest";
import type { DiagnoseResponse, Card } from "../api/types";
import {
  plainSummary, referenceText, drawStatus, localizeDiag,
} from "./clarity";

const card = (id: string, value: Card["value"], extra = {}): Card =>
  ({ id, value, unit: null, text: "", source: "", confidence: "high",
     ...extra } as Card);

const diag = (cards: Card[]): DiagnoseResponse => ({
  diagnosis_id: "d", area_ha: 50, centroid: [-33.89, -60.57],
  zone: "pampa_humeda", province: "Buenos Aires", country: "AR",
  h3_r5: [], h3_r6: [], cards,
  calendar: { months: [], rows: [] },
});

describe("plainSummary", () => {
  it("builds climate, soil and fire lines from cards with data", () => {
    const s = plainSummary(diag([
      card("rain", 1087, { unit: "mm/año" }),
      card("frost", 294, { unit: "días" }),
      card("heat", 20, { unit: "días/año" }),
      card("soil", 19.5, { text: "Franco-arcilloso; MO 19.5 g/kg" }),
      card("slope", 4.1, { unit: "%" }),
      card("fire", "bajo",
        { text: "Temporada de quemas: oct–dic; riesgo 7 días: bajo" }),
    ]));
    expect(s.map((g) => g.group)).toEqual(["climate", "soil", "fire"]);
    const climate = s[0].facts;
    expect(climate[0]).toEqual(
      { key: "field.plain.rain", vars: { v: "1087" } });
    expect(climate.map((f) => f.key)).toEqual(
      ["field.plain.rain", "field.plain.frost", "field.plain.heat"]);
    expect(s[1].facts).toEqual([
      { key: "field.plain.soil", vars: { v: "Franco-arcilloso" } },
      { key: "field.plain.slope", vars: { v: "4,1" } },
    ]);
    expect(s[2].facts).toEqual([
      { key: "field.plain.fireRisk", vars: { cat: "risk.cat.bajo" } },
      { key: "field.plain.burnSeason", vars: { v: "oct–dic" } },
    ]);
  });

  it("omits groups whose cards have no data (shows only backed facts)", () => {
    const s = plainSummary(diag([
      card("rain", null),
      card("soil", null, { text: "" }),
      card("fire", "alto", { text: "riesgo 7 días: alto" }),
    ]));
    expect(s).toEqual([{ group: "fire", facts: [
      { key: "field.plain.fireRisk", vars: { cat: "risk.cat.alto" } }] }]);
  });

  it("ignores unknown fire categories instead of inventing a label", () => {
    expect(plainSummary(diag([card("fire", "???")]))).toEqual([]);
  });
});

describe("referenceText", () => {
  it("relabels the backend's 'current' wording when it is a reference", () => {
    expect(referenceText(
      "Maíz: x. Cambios frente a la actual: Rastrojo +2.", true))
      .toBe("Maíz: x. Cambios frente al escenario de referencia: Rastrojo +2.");
  });
  it("keeps the text as is when the user chose their rotation", () => {
    const s = "Cambios frente a la actual: nada";
    expect(referenceText(s, false)).toBe(s);
  });
});

describe("drawStatus", () => {
  it("says how many points are missing before finishing", () => {
    expect(drawStatus(0)).toEqual({ canFinish: false, missing: 3 });
    expect(drawStatus(2)).toEqual({ canFinish: false, missing: 1 });
  });
  it("allows finishing from 3 points", () => {
    expect(drawStatus(3)).toEqual({ canFinish: true, missing: 0 });
    expect(drawStatus(7)).toEqual({ canFinish: true, missing: 0 });
  });
});

describe("localizeDiag", () => {
  const d: DiagnoseResponse = {
    ...diag([
      card("rain", 1087, { unit: "mm/año", text: "1087 mm/año; x",
                           text_en: "1087 mm/yr; x" }),
      card("fire_weather", "bajo", { text: "HR", text_en: "RH",
        stop_detail: { a: "hay" }, stop_detail_en: { a: "there is" } }),
      card("slope", 4, { unit: "%", text: "Pendiente" }),
    ]),
    calendar: { months: ["ene", "feb"], rows: [
      { id: "frost", label: "Heladas", levels: [0, 1] }] },
    measures: [{ id: "m", name: "No quemar", name_en: "Don't burn",
                 why: "porque", why_en: "because" }],
  };

  it("returns English texts, units, months and measures for en", () => {
    const en = localizeDiag(d, "en");
    expect(en.cards[0]).toMatchObject(
      { text: "1087 mm/yr; x", unit: "mm/yr" });
    expect(en.cards[1].stop_detail).toEqual({ a: "there is" });
    expect(en.calendar.months).toEqual(["Jan", "Feb"]);
    expect(en.measures?.[0]).toMatchObject(
      { name: "Don't burn", why: "because" });
  });

  it("falls back to the Spanish text when no English one exists", () => {
    expect(localizeDiag(d, "en").cards[2].text).toBe("Pendiente");
  });

  it("leaves the diagnosis untouched in Spanish", () => {
    expect(localizeDiag(d, "es")).toBe(d);
  });

  it("reads the English burning season in the plain summary", () => {
    const s = plainSummary(diag([card("fire", "alto",
      { text: "Temporada de quemas: oct–dic; riesgo 7 días: alto",
        text_en: "Burning season: Oct–Dec; 7-day risk: high" })]), "en");
    expect(s[0].facts[1]).toEqual(
      { key: "field.plain.burnSeason", vars: { v: "Oct–Dec" } });
  });
});

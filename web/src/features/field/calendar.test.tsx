import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nProvider } from "../../i18n";
import {
  Calendar, calendarCrops, cropMonths, cropRisks,
  type CatalogCrop, type CalCrop,
} from "./Calendar";
import type { CalendarRow } from "../../api/types";

const MONTHS = ["ene","feb","mar","abr","may","jun",
                "jul","ago","sep","oct","nov","dic"];

const rows = (o: Partial<Record<string, (number | null)[]>>): CalendarRow[] =>
  ["bare_soil", "frost", "water_stress", "heat", "burn_season"].map((id) => ({
    id, label: id, levels: o[id] ?? Array(12).fill(0) }));

describe("cropMonths", () => {
  it("marks a same-year window", () => {
    const m = cropMonths("01-15", "06-30");
    expect(m[0]).toBe(true); expect(m[5]).toBe(true);
    expect(m[6]).toBe(false); expect(m[11]).toBe(false);
  });
  it("wraps the year for a summer crop (nov -> apr)", () => {
    const m = cropMonths("11-01", "04-15");
    expect(m.filter(Boolean).length).toBe(6);
    expect(m[10]).toBe(true); expect(m[3]).toBe(true);
    expect(m[4]).toBe(false); expect(m[9]).toBe(false);
  });
  it("returns no months on malformed input", () => {
    expect(cropMonths("xx", "04-15").every((v) => !v)).toBe(true);
  });
});

const catalog: CatalogCrop[] = [
  { id: "trigo", name: { es: "Trigo", en: "Wheat" },
    sowing: { pampa_humeda: ["06-01", "08-01"], noa: ["05-15", "07-15"] },
    harvest: { pampa_humeda: ["11-15", "01-10"], noa: ["11-01", "12-20"] } },
  { id: "soja", name: { es: "Soja", en: "Soybean" },
    sowing: { pampa_humeda: ["10-15", "01-10"] },
    harvest: { pampa_humeda: ["03-20", "05-31"] } },
];

describe("calendarCrops", () => {
  it("prefers the rotation sequence and dedupes crops", () => {
    const crops = calendarCrops({
      sequence: [{ crop: "trigo", start: "06-01", end: "01-10" },
                 { crop: "trigo", start: "06-01", end: "01-10" },
                 { crop: "soja", start: "01-15", end: "05-31" }],
      parcelCrops: ["maiz"], catalog, zone: "pampa_humeda",
      lang: "es" });
    expect(crops.map((c) => c.id)).toEqual(["trigo", "soja"]);
    expect(crops[0].label).toBe("Trigo");
    expect(crops[0]).toMatchObject({ start: "06-01", end: "01-10" });
  });
  it("falls back to parcel crops resolved by zone windows", () => {
    const crops = calendarCrops({
      parcelCrops: ["trigo", "otro", "trigo"], catalog,
      zone: "noa", lang: "es" });
    expect(crops).toEqual([
      { id: "trigo", label: "Trigo", start: "05-15", end: "12-20" }]);
  });
  it("drops unknown crops and copes without catalog", () => {
    expect(calendarCrops({ parcelCrops: ["otro"], catalog,
      zone: "nea", lang: "es" })).toEqual([]);
    expect(calendarCrops({ parcelCrops: ["trigo"], catalog: null,
      zone: "nea", lang: "es" })).toEqual([]);
  });
  it("uses the english catalog name in en", () => {
    const [c] = calendarCrops({ parcelCrops: ["trigo"], catalog,
      zone: "nea", lang: "en" });
    expect(c.label).toBe("Wheat");
  });
});

describe("cropRisks", () => {
  const trigo: CalCrop = { id: "trigo", label: "Trigo",
                           start: "06-01", end: "01-10" };
  it("flags months where the crop coincides with level>=2 rows", () => {
    const cal = rows({
      frost: [0,0,0,0,0,0,3,3,0,0,0,0],           // jul, ago
      water_stress: [0,0,0,0,0,0,0,0,0,0,0,2],  // dic
    });
    const [r] = cropRisks([trigo], cal);
    expect(r.frost).toEqual([6, 7]);
    expect(r.water).toEqual([11]);
  });
  it("ignores coincidences below the risk level and off-window", () => {
    const cal = rows({
      frost: [0,0,3,0,0,0,1,1,0,0,0,0],          // mar high, jul-ago low
    });
    const [r] = cropRisks([trigo], cal);
    expect(r.frost).toEqual([]);   // march is outside jun-jan window
  });
});

describe("Calendar", () => {
  const wrap = (ui: ReactElement) =>
    render(<I18nProvider>{ui}</I18nProvider>);
  const trigo: CalCrop = { id: "trigo", label: "Trigo",
                           start: "06-01", end: "01-10" };

  it("renders a scoped table with the crop row overlaid", () => {
    wrap(<Calendar months={MONTHS} rows={rows({})} crops={[trigo]} />);
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /Trigo/ }))
      .toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").length).toBe(13);
    const cropCells = document.querySelectorAll(".cal-croprow td.cal-on");
    expect(cropCells.length).toBe(8);   // jun..jan
  });

  it("marks risky months in red and names them in a sentence", () => {
    const cal = rows({ frost: [0,0,0,0,0,0,3,3,0,0,0,0] });
    wrap(<Calendar months={MONTHS} rows={cal} crops={[trigo]} />);
    expect(document.querySelectorAll("td.cal-risk").length).toBe(2);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Riesgo: el Trigo coincide con heladas en julio, agosto");
  });

  it("says which data are missing instead of rendering dead rows", () => {
    const cal = rows({ bare_soil: Array(12).fill(null) });
    wrap(<Calendar months={MONTHS} rows={cal} crops={[trigo]} />);
    expect(screen.getByText(/Sin datos:/)).toHaveTextContent(
      "Sin datos: Suelo desnudo");
  });

  it("notes when there is no crop to overlay", () => {
    wrap(<Calendar months={MONTHS} rows={rows({})} crops={[]} />);
    expect(screen.getByText(/Sin cultivo definido/)).toBeInTheDocument();
  });

  it("puts a glossary ? in the climate row headers", () => {
    wrap(<Calendar months={MONTHS} rows={rows({})} crops={[]} />);
    const head = screen.getByRole("rowheader", { name: /Heladas/ });
    expect(head.querySelector(".glossary-btn")).toBeTruthy();
  });
});

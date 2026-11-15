import { describe, it, expect, beforeEach } from "vitest";
import {
  loadFields, saveField, renameField, deleteField, addZone, removeZone,
  updateZone, fieldHa, zoneHa, type Field,
} from "./fields";
import { squareRing, type Multi } from "./selection";

const ring = squareRing(-33.96, -60.69, 500);
const one: Multi = [[ring]];
/** 100 ha with a 9 ha hole */
const holed: Multi = [[ring, squareRing(-33.96, -60.69, 150)]];

beforeEach(() => localStorage.clear());

describe("fields store", () => {
  it("saves fields in the browser and reads them back", () => {
    saveField({ name: "Campo Los Álamos", geom: one });
    saveField({ name: "La Esperanza", geom: [[ring], [ring]] });
    const all = loadFields();
    expect(all.map((f) => f.name)).toEqual(["Campo Los Álamos", "La Esperanza"]);
    expect(all[0].id).not.toBe(all[1].id);
    expect(fieldHa(all[1])).toBeCloseTo(200, 0);
  });

  it("keeps holes when saving and reading (area without them)", () => {
    saveField({ name: "Con hueco", geom: holed });
    const f = loadFields()[0];
    expect(f.geom[0]).toHaveLength(2);
    expect(fieldHa(f)).toBeCloseTo(91, 0);
  });

  it("renames a field and keeps an empty name from being saved", () => {
    const f = saveField({ name: "A", geom: one });
    renameField(f.id, "  Lote norte ");
    expect(loadFields()[0].name).toBe("Lote norte");
    renameField(f.id, "   ");
    expect(loadFields()[0].name).toBe("Lote norte");
  });

  it("adds, edits and removes crop zones; name and crop are optional", () => {
    const f = saveField({ name: "A", geom: one });
    addZone(f.id, { name: "Norte", crop: "maíz", geom: one });
    addZone(f.id, { name: "", crop: "", geom: holed });
    let g = loadFields()[0] as Field;
    expect(g.zones.map((z) => `${z.name}-${z.crop}`)).toEqual(["Norte-maíz", "-"]);
    expect(zoneHa(g.zones[1])).toBeCloseTo(91, 0);
    updateZone(f.id, g.zones[1].id, { name: "Sur", crop: "soja" });
    removeZone(f.id, g.zones[0].id);
    g = loadFields()[0];
    expect(g.zones.map((z) => `${z.name}-${z.crop}`)).toEqual(["Sur-soja"]);
  });

  it("deletes a field", () => {
    const f = saveField({ name: "A", geom: one });
    deleteField(f.id);
    expect(loadFields()).toEqual([]);
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("fs_fields_v1", "{not json");
    expect(loadFields()).toEqual([]);
  });

  // fields saved before holes were supported: { parts: ring[], zones:
  // [{ ring }] } must keep opening
  it("reads fields saved in the previous format", () => {
    localStorage.setItem("fs_fields_v1", JSON.stringify([{
      id: "old", name: "Viejo", parts: [ring, ring], createdAt: "x",
      zones: [{ id: "z", name: "Norte", crop: "maíz", ring }],
    }]));
    const [f] = loadFields();
    expect(f.geom).toEqual([[ring], [ring]]);
    expect(f.zones[0].geom).toEqual([[ring]]);
    expect(fieldHa(f)).toBeCloseTo(200, 0);
    renameField("old", "Renombrado");
    expect(loadFields()[0].name).toBe("Renombrado");
  });
});

describe("analysisOptions", () => {
  it("offers the whole field, each piece and each zone", async () => {
    const { analysisOptions } = await import("./fields");
    const f = saveField({ name: "Campo", geom: [[ring], holed[0]] });
    addZone(f.id, { name: "Norte", crop: "maíz", geom: one });
    addZone(f.id, { name: "", crop: "", geom: holed });
    const opts = analysisOptions(loadFields()[0]);
    expect(opts.map((o) => `${o.kind}:${o.label}`)).toEqual(
      ["all:", "piece:1", "piece:2", "zone:Norte", "zone:2"]);
    expect(opts[0].ha).toBeCloseTo(191, 0);       // 100 + (100 - 9)
    expect(opts[2].ha).toBeCloseTo(91, 0);        // hole respected
    expect(opts[0].geom).toHaveLength(2);
  });
  it("does not list pieces separately when the field is one piece", async () => {
    const { analysisOptions } = await import("./fields");
    saveField({ name: "Uno", geom: one });
    expect(analysisOptions(loadFields()[0]).map((o) => o.kind)).toEqual(["all"]);
  });
});

describe("detected parcels in a single field", () => {
  const big: Multi = [[squareRing(-33.96, -60.69, 5500)]];   // ~12,100 ha
  const a: Multi = [[squareRing(-33.95, -60.70, 1000)]];
  const b: Multi = [[squareRing(-33.97, -60.68, 1000)]];

  it("saves a field above 5,000 ha under one name", () => {
    saveField({ name: "Estancia grande", geom: big });
    const [f] = loadFields();
    expect(f.name).toBe("Estancia grande");
    expect(fieldHa(f)).toBeGreaterThan(12_000);
  });

  it("accepts a detection: plots, review area and where it came from", async () => {
    const { acceptDetection } = await import("./fields");
    const f = saveField({ name: "Campo", geom: big });
    addZone(f.id, { name: "Mía", crop: "trigo", geom: [[squareRing(-33.99, -60.69, 300)]] });
    acceptDetection(f.id, [
      { name: "Parcela 1", geom: a, source: "ftw" },
      { name: "Parcela 2", geom: b, source: "ftw" }],
      [[squareRing(-33.93, -60.66, 400)]],
      { at: "2026-11-15", sources: ["ftw", "osm"], parcelHa: 800, reviewHa: 64 });
    const g = loadFields()[0];
    expect(g.zones.map((z) => `${z.name}:${z.source ?? "manual"}`))
      .toEqual(["Mía:manual", "Parcela 1:ftw", "Parcela 2:ftw"]);
    expect(g.review).toHaveLength(1);
    expect(g.detection?.sources).toEqual(["ftw", "osm"]);
    // a new detection replaces detected plots, never the hand-drawn ones
    acceptDetection(f.id, [{ name: "Parcela 1", geom: b, source: "ftw" }], [],
                    { at: "2026-11-16", sources: ["ftw"], parcelHa: 400, reviewHa: 0 });
    expect(loadFields()[0].zones.map((z) => z.name)).toEqual(["Mía", "Parcela 1"]);
  });

  it("discarding a plot sends its land to «Límite por revisar»", async () => {
    const { acceptDetection, discardParcel } = await import("./fields");
    const f = saveField({ name: "Campo", geom: big });
    acceptDetection(f.id, [{ name: "Parcela 1", geom: a, source: "ftw" }], [],
                    { at: "x", sources: ["ftw"], parcelHa: 400, reviewHa: 0 });
    const z = loadFields()[0].zones[0];
    discardParcel(f.id, z.id);
    const g = loadFields()[0];
    expect(g.zones).toEqual([]);
    expect(g.review).toEqual(a);
  });

  it("corrected borders replace the plot and leave the rest for review", async () => {
    const { acceptDetection, replaceParcel } = await import("./fields");
    const f = saveField({ name: "Campo", geom: big });
    acceptDetection(f.id, [{ name: "Parcela 1", geom: a, source: "ftw" }], [],
                    { at: "x", sources: ["ftw"], parcelHa: 400, reviewHa: 0 });
    const z = loadFields()[0].zones[0];
    const smaller: Multi = [[squareRing(-33.95, -60.70, 500)]];
    replaceParcel(f.id, z.id, smaller, [[squareRing(-33.95, -60.71, 200)]]);
    const g = loadFields()[0];
    expect(g.zones[0].geom).toEqual(smaller);
    expect(g.zones[0].source).toBe("manual");
    expect(g.zones[0].name).toBe("Parcela 1");
    expect(g.review).toHaveLength(1);
  });

  it("opens fields saved before plots existed (no review, no detection)", () => {
    localStorage.setItem("fs_fields_v1", JSON.stringify([{ id: "v1",
      name: "Viejo", geom: one, zones: [{ id: "z", name: "Norte", crop: "maíz",
      geom: one }], createdAt: "" }]));
    const [f] = loadFields();
    expect(f.review ?? []).toEqual([]);
    expect(f.zones[0].source ?? "manual").toBe("manual");
  });
});

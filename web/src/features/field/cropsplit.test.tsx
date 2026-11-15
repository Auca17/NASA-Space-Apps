import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, renderHook, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { FieldDetail } from "./FieldsPanel";
import { DetectedCrop } from "./DetectedCrop";
import { useAutoCropSplit } from "./autoCropSplit";
import { squareRing } from "../../domain/selection";
import { addZones, geoJsonToMulti, loadFields, saveField, setFieldCrop,
         type Field } from "../../domain/fields";

const ring = squareRing(-33.96, -60.69, 500);
const wrap = (el: React.ReactElement) => render(<I18nProvider>{el}</I18nProvider>);
const fns = () => ({ onChoose: vi.fn(), onAnalyze: vi.fn(), onDrawZone: vi.fn(),
  onSaveZone: vi.fn(), onDiscardZone: vi.fn(), onUpdateZone: vi.fn(),
  onRemoveZone: vi.fn(), onBack: vi.fn(), onAddZones: vi.fn(),
  onSetCrop: vi.fn(), onCropSplit: vi.fn() });
const json = (body: unknown) => new Response(JSON.stringify(body));
const square = [[-60.70, -33.97], [-60.68, -33.97], [-60.68, -33.95],
                [-60.70, -33.95], [-60.70, -33.97]];

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("crop zones store", () => {
  it("turns GeoJSON [lon, lat] closed rings into [lat, lon] open rings", () => {
    const m = geoJsonToMulti({ type: "Polygon", coordinates: [square] });
    expect(m).toHaveLength(1);
    expect(m[0][0]).toHaveLength(4);
    expect(m[0][0][0]).toEqual([-33.97, -60.70]);
    expect(geoJsonToMulti({ type: "MultiPolygon",
                            coordinates: [[square], [square]] })).toHaveLength(2);
  });
  it("adds several zones at once and keeps the field's own crop", () => {
    const f = saveField({ name: "A", geom: [[ring]] });
    addZones(f.id, [{ name: "Soja", crop: "Soja", geom: [[ring]] },
                    { name: "Maíz", crop: "Maíz", geom: [[ring]] }]);
    setFieldCrop(f.id, "girasol");
    const back = loadFields()[0];
    expect(back.zones.map((z) => z.crop)).toEqual(["Soja", "Maíz"]);
    expect(back.crop).toBe("girasol");
  });
});

describe("split by crop", () => {
  const field: Field = { id: "a", name: "A", geom: [[ring]], zones: [], createdAt: "" };

  it("shows that it is looking for crops while the automatic split runs", () => {
    vi.stubGlobal("fetch", vi.fn(async (u: unknown) => { void u; return json({ seasons: [] }); }));
    wrap(<FieldDetail field={field} choice="all" pending={null} {...fns()} />);
    expect(screen.getByText(/buscando los cultivos/i)).toBeInTheDocument();
  });

  it("explains when the map found no crops", () => {
    vi.stubGlobal("fetch", vi.fn(async (u: unknown) => { void u; return json({ seasons: [] }); }));
    wrap(<FieldDetail field={{ ...field, cropSplit: "none" }} choice="all"
                      pending={null} {...fns()} />);
    expect(screen.getByText(/no encontró cultivos/i)).toBeInTheDocument();
  });

  it("does not split again once it was tried (the user may have removed zones)", async () => {
    const fetch = vi.fn(async (u: unknown) => { void u; return json({ seasons: [] }); });
    vi.stubGlobal("fetch", fetch);
    wrap(<FieldDetail field={{ ...field, cropSplit: "done" }} choice="all"
                      pending={null} {...fns()} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetch.mock.calls.some(([u]) => String(u).includes("crop-zones"))).toBe(false);
    expect(screen.getByRole("button", { name: /volver a dividir/i })).toBeInTheDocument();
  });
});

describe("useAutoCropSplit", () => {
  const zonesReply = json({ status: "available", campaign: "2024-2025", season: "summer",
    source: "", source_url: "", resolution_m: 30,
    zones: [{ crop: { id: "soy", es: "Soja", en: "Soybean" }, ha: 60,
              geometry: { type: "Polygon", coordinates: [square] } }] });
  const f = (id: string, extra: Partial<Field> = {}): Field =>
    ({ id, name: id, geom: [[ring]], zones: [], createdAt: "", ...extra });

  it("splits every saved field with no zones, without opening it", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: unknown) => { void u; return zonesReply.clone(); }));
    const apply = vi.fn();
    renderHook(() => useAutoCropSplit([f("a"), f("b", { cropSplit: "none" })],
                                      "es", apply));
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    const [id, zones, result] = apply.mock.calls[0];
    expect(id).toBe("a");
    expect(result).toBe("done");
    expect(zones[0]).toMatchObject({ name: "Soja", crop: "Soja" });
  });

  it("asks only once per field even if the list re-renders", async () => {
    const fetch = vi.fn(async (u: unknown) => { void u; return zonesReply.clone(); });
    vi.stubGlobal("fetch", fetch);
    const apply = vi.fn();
    const fields = [f("c")];
    const { rerender } = renderHook(({ fs }) => useAutoCropSplit(fs, "es", apply),
                                    { initialProps: { fs: fields } });
    rerender({ fs: [...fields] });
    await vi.waitFor(() => expect(apply).toHaveBeenCalled());
    expect(fetch.mock.calls.filter(([u]) => String(u).includes("crop-zones")))
      .toHaveLength(1);
  });

  it("does not mark the field when INTA is down, so it retries later", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const apply = vi.fn();
    renderHook(() => useAutoCropSplit([f("d")], "es", apply));
    await new Promise((r) => setTimeout(r, 20));
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("manual crop when unidentified", () => {
  it("lets the user type the crop when the map has none", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ source: "INTA", source_url: "",
      resolution_m: 30, seasons: [{ season: "summer", campaign: "2024-2025",
        status: "no_coverage", crop: null, share: null, coverage: null }] })));
    const onDeclare = vi.fn();
    wrap(<DetectedCrop geom={[[squareRing(-20, -50, 300)]]} onDeclare={onDeclare} />);
    const box = await screen.findByRole("combobox", { name: /cultivo/i });
    fireEvent.change(box, { target: { value: "trigo" } });
    fireEvent.blur(box);
    expect(onDeclare).toHaveBeenCalledWith("trigo");
  });
  it("shows what the user declared", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    wrap(<DetectedCrop geom={[[squareRing(-21, -50, 300)]]} declared="trigo"
                       onDeclare={vi.fn()} />);
    expect(await screen.findByDisplayValue("trigo")).toBeInTheDocument();
    expect(screen.getByText(/declarado por vos/i)).toBeInTheDocument();
  });
});

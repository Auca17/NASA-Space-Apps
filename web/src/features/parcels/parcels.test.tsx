/** Parcels flow: needs form payload, result panel (alerts, rows,
 * basis, nearby), zone shapes, the wizard's list+legend, and the
 * FieldPanel integration (needs first, results, "Ver más"). */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import es from "../../i18n/es.json";
import { squareRing } from "../../domain/selection";
import type { ParcelsResponse, ParcelInput } from "../../domain/parcels";
import { parcelsBody } from "../../domain/parcels";
import { zoneShapes } from "./zoneShapes";
import { NeedsForm } from "./NeedsForm";
import { ParcelsWizard } from "./ParcelsWizard";
import { FieldPanel, ParcelsResult } from "../field/FieldLens";
import type { GlobeHandle } from "../globe/GlobeView";
import fixture from "./__fixtures__/parcels_example.json";

const res = fixture as ParcelsResponse;
const wrap = (el: React.ReactElement) =>
  render(<I18nProvider>{el}</I18nProvider>);

const parcelsIn: ParcelInput[] = [
  { id: "p1", name: "Lote norte", crop: "soja", geom: [squareRing(-33.89, -60.60, 300)] },
  { id: "p2", name: "Media", crop: "maiz", geom: [squareRing(-33.90, -60.60, 300)] },
  { id: "p3", name: "Sur", crop: "sin_cultivo", geom: [squareRing(-33.91, -60.60, 300)] },
];

const fieldGeom = [[squareRing(-33.9, -60.6, 700)]];
const fmt = new Intl.NumberFormat("es", { maximumFractionDigits: 1 });
const t = (k: string) => (es as Record<string, string>)[k] ?? k;

/* ------------------------------------------------------- domain ---- */

describe("parcelsBody", () => {
  it("matches the API contract", () => {
    const b = parcelsBody(fieldGeom, parcelsIn, {
      water_access: "well", emergency_distance_km: 9.4,
      concerns: ["fire", "water"], notes: "nota",
    }, "es");
    expect(b.boundary.type).toBe("Polygon");
    // GeoJSON [lon, lat], closed ring
    const r0 = b.boundary.coordinates[0];
    expect(r0[0]).toEqual(r0[r0.length - 1]);
    expect(Math.abs(r0[0][0])).toBeGreaterThan(Math.abs(r0[0][1]));
    expect(b.parcels).toHaveLength(3);
    expect(b.parcels[0].polygon.type).toBe("Polygon");
    expect(b.needs.water_access).toBe("well");
    expect(b.needs.emergency_distance_km).toBe(9.4);
    expect(b.needs.concerns).toEqual(["fire", "water"]);
    expect(b.lang).toBe("es");
  });

  it("fills skipped needs with unknown", () => {
    const b = parcelsBody(fieldGeom, parcelsIn, null, "es");
    expect(b.needs.water_access).toBe("unknown");
    expect(b.needs.concerns).toEqual([]);
    expect(b.needs).not.toHaveProperty("emergency_distance_km");
  });
});

/* ------------------------------------------------------- zones ----- */

describe("zoneShapes", () => {
  const zone = (kind: string) => ({
    kind,
    geometry: { type: "Polygon",
      coordinates: [[[-60.62, -33.91], [-60.60, -33.91],
                     [-60.60, -33.89], [-60.62, -33.89],
                     [-60.62, -33.91]]] },
    center: [-60.61, -33.9] as [number, number],
    radius_m: null, pct: 40, label: "", source: "", date: "",
  });
  it("draws every kind as geometry (never colour alone)", () => {
    for (const kind of ["hotspot", "fire_risk", "dry", "bare_soil"]) {
      const shapes = zoneShapes(zone(kind));
      expect(shapes.length, kind).toBeGreaterThan(0);
      for (const s of shapes) expect(s.geom[0].length).toBeGreaterThan(2);
    }
  });
  it("bare soil uses more than one stripe", () => {
    const z = zone("bare_soil");
    z.geometry.coordinates = [[[-60.65, -33.93], [-60.57, -33.93],
                               [-60.57, -33.87], [-60.65, -33.87],
                               [-60.65, -33.93]]];
    expect(zoneShapes(z).length).toBeGreaterThan(2);
  });
});

/* ------------------------------------------------------- needs ----- */

describe("NeedsForm", () => {
  it("collects water access, distance, concerns and note", () => {
    const onDone = vi.fn(), onSkip = vi.fn();
    wrap(<NeedsForm onDone={onDone} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button",
      { name: es["parcels.needs.water.well"] }));
    fireEvent.change(screen.getByLabelText(es["parcels.needs.emergencyDist"]),
      { target: { value: "12,5" } });
    fireEvent.click(screen.getByRole("button",
      { name: es["parcels.needs.concern.fire"] }));
    fireEvent.change(screen.getByPlaceholderText(es["parcels.needs.notePh"]),
      { target: { value: "alambre roto" } });
    fireEvent.click(screen.getByRole("button",
      { name: es["parcels.needs.continue"] }));
    expect(onDone).toHaveBeenCalledWith({
      water_access: "well", emergency_distance_km: 12.5,
      concerns: ["fire"], notes: "alambre roto",
    });
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("is skippable", () => {
    const onDone = vi.fn(), onSkip = vi.fn();
    wrap(<NeedsForm onDone={onDone} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button",
      { name: es["parcels.needs.skip"] }));
    expect(onSkip).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric distance", () => {
    const onDone = vi.fn();
    wrap(<NeedsForm onDone={onDone} onSkip={() => {}} />);
    fireEvent.change(screen.getByLabelText(es["parcels.needs.emergencyDist"]),
      { target: { value: "abc" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",
      { name: es["parcels.needs.continue"] }));
    expect(onDone).not.toHaveBeenCalled();
  });
});

/* --------------------------------------------------- result panel -- */

describe("ParcelsResult", () => {
  it("leads with the summary, rows and nearby services", () => {
    wrap(<ParcelsResult res={res} parcels={parcelsIn} t={t} fmt={fmt} />);
    // headline
    expect(screen.getByRole("heading",
      { name: /foco de fuego/ })).toBeInTheDocument();
    // one row per parcel with name + fire/water figures
    expect(screen.getByText("Lote norte")).toBeInTheDocument();
    expect(screen.getByText("Media")).toBeInTheDocument();
    expect(screen.getAllByText("34%").length).toBeGreaterThan(0);
    // nearby services
    expect(screen.getByText("Bomberos Voluntarios de Pergamino"))
      .toBeInTheDocument();
    expect(screen.getByText("Arroyo Pergamino")).toBeInTheDocument();
  });

  it("shows a prominent role=alert for high-severity fire", () => {
    wrap(<ParcelsResult res={res} parcels={parcelsIn} t={t} fmt={fmt}
                        onEmergency={vi.fn()} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("parcel-alert", "fire");
    expect(alert).toHaveTextContent("foco satelital");
    // the dry alert exists but with lower prominence (status, no alert)
    expect(screen.getAllByText(/más seco que lo normal/).length)
      .toBeGreaterThan(0);
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
  });

  it("keeps every number's basis one tap away", () => {
    wrap(<ParcelsResult res={res} parcels={parcelsIn} t={t} fmt={fmt} />);
    const info = screen.getAllByRole("button",
      { name: es["parcels.basis.fire"] });
    expect(info.length).toBeGreaterThan(0);
    fireEvent.click(info[0]);
    expect(screen.getByRole("tooltip"))
      .toHaveTextContent("Probabilidad de fuego");
  });
});

/* ------------------------------------------------------- wizard ---- */

const globeMock = (): GlobeHandle => ({
  setShapes: vi.fn(), setDraft: vi.fn(),
  unproject: (x: number, y: number) =>
    [-33.9 + (y - 100) * 0.00005, -60.6 + (x - 100) * 0.00005] as
      [number, number],
  onMove: () => () => {},
  center: () => ({ lat: -33.9, lon: -60.6, zoom: 14 }),
  fitRing: vi.fn(), flyTo: vi.fn(), setCells: vi.fn(),
  setOutline: vi.fn(), setMarker: vi.fn(), readLandUse: vi.fn(),
  setFieldBasemap: vi.fn(), zoomBy: vi.fn(), onClick: vi.fn(),
  bounds: () => [-1, -1, 1, 1], destroy: vi.fn(),
} as unknown as GlobeHandle);

const crops = [
  { id: "soja", name: { es: "Soja", en: "Soybean" } },
  { id: "maiz", name: { es: "Maíz", en: "Maize" } },
];

describe("ParcelsWizard", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("crops.json")) {
        return new Response(JSON.stringify(crops), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("draws a parcel, names it, picks a crop and shows the legend",
      async () => {
    const g = globeMock();
    const onDone = vi.fn();
    wrap(<ParcelsWizard geom={fieldGeom} globe={g}
                        onDone={onDone} onCancel={() => {}} />);
    fireEvent.click(await screen.findByRole("button",
      { name: es["parcels.addParcel"] }));
    const layer = document.querySelector(".freehand-layer")!;
    // jsdom has no PointerEvent ctor: dispatch MouseEvents under the
    // pointer event names so clientX/clientY reach the handlers
    const tap = (x: number, y: number) => {
      fireEvent(layer, new MouseEvent("pointerdown",
        { clientX: x, clientY: y, button: 0, bubbles: true }));
      fireEvent(layer, new MouseEvent("pointerup",
        { clientX: x, clientY: y, button: 0, bubbles: true }));
    };
    tap(40, 40); tap(160, 40); tap(160, 160); tap(40, 160);
    fireEvent.click(screen.getByRole("button",
      { name: es["field.finish"] }));
    // clipped + waiting for name/crop
    const nameInput = await screen.findByLabelText(es["parcels.name"]);
    fireEvent.change(nameInput, { target: { value: "Norte" } });
    // wait for the fetched crop options to be in the select
    await screen.findByRole("option", { name: "Soja" });
    fireEvent.change(screen.getByRole("combobox"),
      { target: { value: "soja" } });
    fireEvent.click(screen.getByRole("button",
      { name: es["parcels.save"] }));
    // row + legend with the chosen crop
    expect(await screen.findByText("Norte")).toBeInTheDocument();
    const legend = screen.getByRole("list",
      { name: es["parcels.legend"] });
    expect(legend).toHaveTextContent("Soja");
    // only crops present are listed
    expect(legend).not.toHaveTextContent("Maíz");
  });

  it("skips to needs and calls onDone with the parcels", async () => {
    const g = globeMock();
    const onDone = vi.fn();
    wrap(<ParcelsWizard geom={fieldGeom} globe={g}
                        onDone={onDone} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button",
      { name: es["parcels.continue"] }));
    fireEvent.click(await screen.findByRole("button",
      { name: es["parcels.needs.skip"] }));
    expect(onDone).toHaveBeenCalledWith([], null);
  });
});

/* ------------------------------------------------ FieldPanel ------- */

describe("FieldPanel parcels flow", () => {
  const realFetch = globalThis.fetch;
  const parcelsFetch = () => {
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init) => {
      const u = String(url);
      if (u.includes("/api/field/parcels") && init?.method === "POST") {
        return new Response(JSON.stringify(res), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
  };
  afterEach(() => { globalThis.fetch = realFetch; });

  it("asks needs first, then shows parcels results", async () => {
    parcelsFetch();
    wrap(<FieldPanel
      target={{ geom: fieldGeom, areaLabel: "Campo Sur",
                parcels: parcelsIn }}
      open onClose={() => {}} onChangePlot={() => {}} />);
    // needs step blocks the analysis
    expect(screen.getByText(es["parcels.needs.title"]))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",
      { name: es["parcels.needs.skip"] }));
    // fire alert lands on top, prominent
    expect(await screen.findByRole("alert"))
      .toHaveClass("parcel-alert", "fire");
    expect(screen.getByText(/foco de fuego detectado/))
      .toBeInTheDocument();
    expect(screen.getByText("Lote norte")).toBeInTheDocument();
  });

  it("sends the whole field as one parcel when there are none",
      async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify(res), { status: 200 }));
    globalThis.fetch = spy as unknown as typeof fetch;
    wrap(<FieldPanel
      target={{ geom: fieldGeom, areaLabel: "Campo Sur", needs: null }}
      open onClose={() => {}} onChangePlot={() => {}} />);
    await screen.findByRole("alert");
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.parcels).toHaveLength(1);
    expect(body.parcels[0].name).toBe("Campo Sur");
    expect(body.parcels[0].crop).toBe("otro");
  });

  it("keeps the detailed diagnosis behind Ver más", async () => {
    parcelsFetch();
    wrap(<FieldPanel
      target={{ geom: fieldGeom, areaLabel: "Campo Sur",
                parcels: parcelsIn, needs: null }}
      open onClose={() => {}} onChangePlot={() => {}} />);
    await screen.findByRole("alert");
    // diagnosis cards hidden until the disclosure opens
    expect(screen.queryByText(es["field.plain.title"]))
      .not.toBeInTheDocument();
    const det = screen.getByText(es["parcels.verMas"]).closest("details")!;
    det.open = true;
    fireEvent(det, new Event("toggle"));
    // the lazy diagnose call fired and failed (404) -> retry card
    await waitFor(() =>
      expect(screen.getByText(es["field.diagnosis.failed"]))
        .toBeInTheDocument());
  });
});

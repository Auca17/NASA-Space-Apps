/** Guided demo (tasks 40/42): the #demo / #demo-mendoza hashes, both
 * farm fixtures (simple rings, parcels inside the boundary, no
 * overlaps, real crop ids, coherent profile/economics/cached
 * responses), the tour (steps, navigation, dismissal, persistence)
 * and the cached-fallback path in the result panel. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { I18nProvider } from "../../i18n";
import es from "../../i18n/es.json";
import {
  pointInRing, ringAreaHa, type LatLon,
} from "../../domain/selection";
import { selfIntersects, ringCenter } from "../../domain/parcelsGeo";
import { CONCERNS } from "../../domain/parcels";
import { HAZARDS } from "../../domain/parcelsProfile";
import { FieldPanel } from "../field/FieldLens";
import mendozaCached from "./mendozaCached.json";
import pergaminoCached from "./pergaminoCached.json";
import {
  MENDOZA_BOUNDARY, MENDOZA_CACHED, MENDOZA_ECON,
  MENDOZA_NEEDS, MENDOZA_PARCELS, MENDOZA_PROFILE,
} from "./mendozaFarm";
import {
  PERGAMINO_BOUNDARY, PERGAMINO_CACHED, PERGAMINO_ECON,
  PERGAMINO_NEEDS, PERGAMINO_PARCELS, PERGAMINO_PROFILE,
} from "./pergaminoFarm";
import { DEMO_FARMS, demoForHash } from "./demoFarms";
import { GuidedTour } from "./GuidedTour";
import { TOUR_KEY, TOUR_STEPS, tourSeen } from "./demoTour";

const wrap = (el: React.ReactElement) =>
  render(<I18nProvider>{el}</I18nProvider>);
const t = (k: string) => (es as Record<string, string>)[k] ?? k;

/* ------------------------------------------------------- hash ------ */

describe("demo hash", () => {
  it("#demo is Pergamino, #demo-mendoza the secondary farm", () => {
    expect(demoForHash("#demo")).toBe("pergamino");
    expect(demoForHash("#demo-mendoza")).toBe("mendoza");
    expect(demoForHash("#-33.74,-69.12")).toBeNull();
    expect(demoForHash("")).toBeNull();
    expect(demoForHash("#Demo")).toBeNull();
  });

  it("registry is coherent with the farm modules", () => {
    expect(DEMO_FARMS.pergamino.parcels).toBe(PERGAMINO_PARCELS);
    expect(DEMO_FARMS.mendoza.parcels).toBe(MENDOZA_PARCELS);
    expect(DEMO_FARMS.pergamino.rotationsNoteKey).toBeUndefined();
    expect(DEMO_FARMS.mendoza.rotationsNoteKey).toBeTruthy();
    expect(DEMO_FARMS.pergamino.other.hash).toBe("#demo-mendoza");
    expect(DEMO_FARMS.mendoza.other.hash).toBe("#demo");
  });
});

/* ------------------------------------------------------- fixture --- */

/** Strict segment crossing (shared edges / touches don't count). */
const segCross = (a: LatLon, b: LatLon, c: LatLon, d: LatLon) => {
  const o = (p: LatLon, q: LatLon, r: LatLon) =>
    (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
};

const edges = (r: LatLon[]) =>
  r.map((p, i) => [p, r[(i + 1) % r.length]] as const);

const cropsCatalog = () => new Set(
  (JSON.parse(readFileSync(
    resolve(process.cwd(), "../back/knowledge/crops.json"),
    "utf-8")) as { crops: { id: string }[] }).crops.map((c) => c.id));

function describeFarm(farm: {
    boundary: typeof PERGAMINO_BOUNDARY;
    parcels: typeof PERGAMINO_PARCELS;
    needs: typeof PERGAMINO_NEEDS;
    profile: typeof PERGAMINO_PROFILE;
    econ: typeof PERGAMINO_ECON;
    cached: { date: string; res: { parcels: { id: string }[] } };
    cachedFile: { captured_at: string;
                  response: { parcels: { id: string }[] };
                  rotations?: unknown } }, opts: {
    minHa: number; maxHa: number; minParcels: number; maxParcels: number;
    headOrder: string[] }) {
  const boundary = farm.boundary[0][0];

  it("draws a simple boundary and simple parcel rings", () => {
    expect(boundary.length).toBeGreaterThanOrEqual(3);
    expect(selfIntersects(boundary)).toBe(false);
    for (const p of farm.parcels) {
      expect(p.geom[0].length, p.id).toBeGreaterThanOrEqual(3);
      expect(selfIntersects(p.geom[0]), p.id).toBe(false);
    }
  });

  it("keeps every parcel inside the boundary, with no overlaps", () => {
    for (const p of farm.parcels) {
      for (const v of p.geom[0]) {
        expect(pointInRing(v, boundary), `${p.id} vertex ${v}`)
          .toBe(true);
      }
    }
    for (let i = 0; i < farm.parcels.length; i++) {
      for (let j = i + 1; j < farm.parcels.length; j++) {
        const a = farm.parcels[i].geom[0];
        const b = farm.parcels[j].geom[0];
        const id = `${farm.parcels[i].id}×${farm.parcels[j].id}`;
        expect(pointInRing(ringCenter(a), b), id).toBe(false);
        expect(pointInRing(ringCenter(b), a), id).toBe(false);
        const cross = edges(a).some(([a1, a2]) =>
          edges(b).some(([b1, b2]) => segCross(a1, a2, b1, b2)));
        expect(cross, id).toBe(false);
      }
    }
  });

  it(`is ${opts.minHa}–${opts.maxHa} ha in ${opts.minParcels}–` +
     `${opts.maxParcels} parcels`, () => {
    const ha = ringAreaHa(boundary);
    expect(ha).toBeGreaterThanOrEqual(opts.minHa);
    expect(ha).toBeLessThanOrEqual(opts.maxHa);
    expect(farm.parcels.length).toBeGreaterThanOrEqual(opts.minParcels);
    expect(farm.parcels.length).toBeLessThanOrEqual(opts.maxParcels);
    expect(new Set(farm.parcels.map((p) => p.id)).size)
      .toBe(farm.parcels.length);
  });

  it("uses real crop ids from the catalog", () => {
    const known = cropsCatalog();
    for (const p of farm.parcels) {
      expect(known.has(p.crop), `${p.id} crop ${p.crop}`).toBe(true);
      expect(p.crop).not.toBe("otro");
    }
  });

  it("has a coherent producer profile, needs and economics", () => {
    expect(farm.profile.order.slice(0, 3)).toEqual(opts.headOrder);
    expect(new Set(farm.profile.order)).toEqual(new Set(HAZARDS));
    for (const h of farm.profile.hidden) expect(HAZARDS).toContain(h);
    expect(farm.needs.emergency_distance_km).toBeGreaterThan(0);
    for (const c of farm.needs.concerns) expect(CONCERNS).toContain(c);
    for (const id of Object.keys(farm.econ.parcels)) {
      expect(farm.parcels.map((p) => p.id)).toContain(id);
      const e = farm.econ.parcels[id];
      expect(e.cost_per_ha).toBeGreaterThan(0);
      expect(e.price_per_t).toBeGreaterThan(0);
      expect(e.expected_yield_t_ha).toBeGreaterThan(0);
    }
  });

  it("cached file is a real capture: same parcel ids, capture date", () => {
    const cf = farm.cachedFile;
    expect(cf.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Date.parse(cf.captured_at)).not.toBeNaN();
    expect(cf.response.parcels.map((p) => p.id).sort())
      .toEqual(farm.parcels.map((p) => p.id).sort());
    expect(farm.cached.res).toEqual(cf.response);
    expect(farm.cached.date).toBe(cf.captured_at);
    // rotations captured too (task 42), when the zone has them
    expect("rotations" in cf).toBe(true);
  });
}

describe("Pergamino fixture", () => {
  describeFarm({
    boundary: PERGAMINO_BOUNDARY, parcels: PERGAMINO_PARCELS,
    needs: PERGAMINO_NEEDS, profile: PERGAMINO_PROFILE,
    econ: PERGAMINO_ECON, cached: PERGAMINO_CACHED,
    cachedFile: pergaminoCached,
  }, { minHa: 150, maxHa: 250, minParcels: 3, maxParcels: 4,
       headOrder: ["drought", "fire", "flood"] });

  it("plants annual rotation crops only", () => {
    expect(PERGAMINO_PARCELS.map((p) => p.crop).sort())
      .toEqual(["alfalfa", "maiz", "soja", "trigo"]);
  });
});

describe("Mendoza fixture", () => {
  describeFarm({
    boundary: MENDOZA_BOUNDARY, parcels: MENDOZA_PARCELS,
    needs: MENDOZA_NEEDS, profile: MENDOZA_PROFILE,
    econ: MENDOZA_ECON, cached: MENDOZA_CACHED,
    cachedFile: mendozaCached,
  }, { minHa: 120, maxHa: 250, minParcels: 4, maxParcels: 5,
       headOrder: ["frost", "drought", "fire"] });
});

/* ------------------------------------------------------- tour ------ */

describe("GuidedTour", () => {
  beforeEach(() => localStorage.removeItem(TOUR_KEY));

  it("defines six anchored steps ending at the rotations", () => {
    expect(TOUR_STEPS).toHaveLength(6);
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(
      ["parcels", "badges", "alerts", "rotaciones", "rotcard", "more"]);
    for (const s of TOUR_STEPS) {
      expect(s.sel).toBeTruthy();
      expect(t(`${s.key}.title`)).not.toBe(`${s.key}.title`);
      expect(t(`${s.key}.body`)).not.toBe(`${s.key}.body`);
    }
  });

  it("walks forward and back, firing onStep, then marks seen", () => {
    const onClose = vi.fn();
    const onStep = vi.fn();
    wrap(<GuidedTour onClose={onClose} onStep={onStep} />);
    const dlg = screen.getByRole("dialog");
    expect(dlg).toHaveTextContent(t("demo.tour.parcels.title"));
    expect(onStep).toHaveBeenLastCalledWith("parcels");
    fireEvent.click(screen.getByRole("button",
      { name: t("demo.tour.next") }));
    expect(dlg).toHaveTextContent(t("demo.tour.badges.title"));
    expect(onStep).toHaveBeenLastCalledWith("badges");
    fireEvent.click(screen.getByRole("button",
      { name: t("demo.tour.back") }));
    expect(dlg).toHaveTextContent(t("demo.tour.parcels.title"));
    for (let k = 0; k < 5; k++) {
      fireEvent.click(screen.getByRole("button",
        { name: t("demo.tour.next") }));
    }
    expect(onStep).toHaveBeenLastCalledWith("more");
    fireEvent.click(screen.getByRole("button",
      { name: t("demo.tour.done") }));
    expect(onClose).toHaveBeenCalled();
    expect(localStorage.getItem(TOUR_KEY)).toBe("1");
  });

  it("closes on Escape and on the close button, once and for good",
      () => {
    const onClose = vi.fn();
    const { unmount } = wrap(<GuidedTour onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(tourSeen()).toBe(true);
    unmount();
    wrap(<GuidedTour onClose={onClose} />);
    fireEvent.click(screen.getByRole("button",
      { name: t("demo.tour.close") }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

/* --------------------------------------------------- fallback ------ */

const demoTarget = {
  geom: MENDOZA_BOUNDARY,
  areaLabel: "Toda la finca",
  fieldName: "Finca Los Álamos",
  parcels: MENDOZA_PARCELS,
  needs: MENDOZA_NEEDS,
  profile: MENDOZA_PROFILE,
  econ: MENDOZA_ECON,
  demo: { cached: MENDOZA_CACHED.res, cachedDate: MENDOZA_CACHED.date,
          cachedRotations: MENDOZA_CACHED.rotations,
          rotationsNoteKey: "demo.rot.perennials" },
};

describe("demo fallback", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      new Response("{}", { status: 500 })) as typeof fetch;
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("shows the cached result with its date when the API fails",
      async () => {
    wrap(<FieldPanel target={demoTarget} open
                     onClose={() => {}} onChangePlot={() => {}} />);
    expect(await screen.findByText(/resultado guardado del 2026-11-15/i))
      .toBeInTheDocument();
    expect(screen.getByText("La Vid")).toBeInTheDocument();
    expect(screen.getAllByText(/Finca Los Álamos/).length)
      .toBeGreaterThan(0);
    // and the fictional-producer disclaimer is visible
    expect(screen.getByText(/inventados para la demo/))
      .toBeInTheDocument();
  });

  it("offers a Rotaciones tab right after Resumen", async () => {
    wrap(<FieldPanel target={demoTarget} open
                     onClose={() => {}} onChangePlot={() => {}} />);
    const rot = await screen.findByRole("tab", { name: "Rotaciones" });
    const tabs = screen.getAllByRole("tab").map((x) => x.id);
    expect(tabs).toEqual(
      ["tab-resumen", "tab-rotaciones", "tab-prioridades", "tab-mas"]);
    fireEvent.click(rot);
    // perennials note for the Mendoza demo
    expect(await screen.findByText(/cultivos anuales/i))
      .toBeInTheDocument();
    // the manual form stays available under the cards
    expect(screen.getByRole("button", { name: /comparar/i }))
      .toBeInTheDocument();
  });
});

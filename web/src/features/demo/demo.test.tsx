/** Guided demo (task 40): the #demo hash, the Mendoza fixture
 * (simple rings, parcels inside the boundary, no overlaps, real crop
 * ids, coherent profile/economics/cached response), the tour
 * (steps, navigation, dismissal, persistence) and the cached-fallback
 * path in the result panel. */
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
import cachedFile from "./mendozaCached.json";
import {
  isDemoHash, MENDOZA_BOUNDARY, MENDOZA_CACHED, MENDOZA_ECON,
  MENDOZA_NEEDS, MENDOZA_PARCELS, MENDOZA_PROFILE,
} from "./mendozaFarm";
import { GuidedTour } from "./GuidedTour";
import { TOUR_KEY, TOUR_STEPS, tourSeen } from "./demoTour";

const wrap = (el: React.ReactElement) =>
  render(<I18nProvider>{el}</I18nProvider>);
const t = (k: string) => (es as Record<string, string>)[k] ?? k;

/* ------------------------------------------------------- hash ------ */

describe("demo hash", () => {
  it("only #demo matches", () => {
    expect(isDemoHash("#demo")).toBe(true);
    expect(isDemoHash("#-33.74,-69.12")).toBe(false);
    expect(isDemoHash("")).toBe(false);
    expect(isDemoHash("#Demo")).toBe(false);
  });
});

/* ------------------------------------------------------- fixture --- */

const boundary = MENDOZA_BOUNDARY[0][0];

/** Strict segment crossing (shared edges / touches don't count). */
const segCross = (a: LatLon, b: LatLon, c: LatLon, d: LatLon) => {
  const o = (p: LatLon, q: LatLon, r: LatLon) =>
    (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
};

const edges = (r: LatLon[]) =>
  r.map((p, i) => [p, r[(i + 1) % r.length]] as const);

describe("Mendoza fixture", () => {
  it("draws a simple boundary and simple parcel rings", () => {
    expect(boundary.length).toBeGreaterThanOrEqual(3);
    expect(selfIntersects(boundary)).toBe(false);
    for (const p of MENDOZA_PARCELS) {
      expect(p.geom[0].length, p.id).toBeGreaterThanOrEqual(3);
      expect(selfIntersects(p.geom[0]), p.id).toBe(false);
    }
  });

  it("keeps every parcel inside the boundary, with no overlaps", () => {
    for (const p of MENDOZA_PARCELS) {
      for (const v of p.geom[0]) {
        expect(pointInRing(v, boundary),
               `${p.id} vertex ${v}`).toBe(true);
      }
    }
    for (let i = 0; i < MENDOZA_PARCELS.length; i++) {
      for (let j = i + 1; j < MENDOZA_PARCELS.length; j++) {
        const a = MENDOZA_PARCELS[i].geom[0];
        const b = MENDOZA_PARCELS[j].geom[0];
        const id = `${MENDOZA_PARCELS[i].id}×${MENDOZA_PARCELS[j].id}`;
        // parcels may share borders; a strict interior point inside
        // the other ring, or an edge crossing, is a real overlap
        expect(pointInRing(ringCenter(a), b), id).toBe(false);
        expect(pointInRing(ringCenter(b), a), id).toBe(false);
        const cross = edges(a).some(([a1, a2]) =>
          edges(b).some(([b1, b2]) => segCross(a1, a2, b1, b2)));
        expect(cross, id).toBe(false);
      }
    }
  });

  it("is a 120–250 ha farm split into 4–5 parcels", () => {
    const ha = ringAreaHa(boundary);
    expect(ha).toBeGreaterThanOrEqual(120);
    expect(ha).toBeLessThanOrEqual(250);
    expect(MENDOZA_PARCELS.length).toBeGreaterThanOrEqual(4);
    expect(MENDOZA_PARCELS.length).toBeLessThanOrEqual(5);
    const ids = new Set(MENDOZA_PARCELS.map((p) => p.id));
    expect(ids.size).toBe(MENDOZA_PARCELS.length);
  });

  it("uses real crop ids from the catalog", () => {
    const catalog = JSON.parse(readFileSync(
      resolve(process.cwd(), "../back/knowledge/crops.json"),
      "utf-8")) as { crops: { id: string }[] };
    const known = new Set(catalog.crops.map((c) => c.id));
    for (const p of MENDOZA_PARCELS) {
      expect(known.has(p.crop), `${p.id} crop ${p.crop}`).toBe(true);
      expect(p.crop).not.toBe("otro");
    }
  });

  it("has a coherent producer profile, needs and economics", () => {
    // frost, drought and fire lead the priorities
    expect(MENDOZA_PROFILE.order.slice(0, 3))
      .toEqual(["frost", "drought", "fire"]);
    expect(new Set(MENDOZA_PROFILE.order)).toEqual(new Set(HAZARDS));
    for (const h of MENDOZA_PROFILE.hidden) {
      expect(HAZARDS).toContain(h);
    }
    expect(MENDOZA_NEEDS.water_access).toBe("well");
    expect(MENDOZA_NEEDS.emergency_distance_km).toBeGreaterThan(0);
    for (const c of MENDOZA_NEEDS.concerns) expect(CONCERNS).toContain(c);
    for (const id of Object.keys(MENDOZA_ECON.parcels)) {
      expect(MENDOZA_PARCELS.map((p) => p.id)).toContain(id);
      const e = MENDOZA_ECON.parcels[id];
      expect(e.cost_per_ha).toBeGreaterThan(0);
      expect(e.price_per_t).toBeGreaterThan(0);
      expect(e.expected_yield_t_ha).toBeGreaterThan(0);
    }
  });

  it("ships a dated cached response that matches the parcels", () => {
    const { res, date } = MENDOZA_CACHED;
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.parcels.map((p) => p.id).sort())
      .toEqual(MENDOZA_PARCELS.map((p) => p.id).sort());
    for (const p of res.parcels) {
      expect(p.crop).toBe(
        MENDOZA_PARCELS.find((x) => x.id === p.id)!.crop);
      expect(p.indicators.fire).toBeTruthy();
      expect(p.indicators.water).toBeTruthy();
      expect(p.area_ha).toBeGreaterThan(0);
    }
    expect(res.zones.length).toBeGreaterThan(0);
    expect(res.nearby.source).toBeTruthy();
    expect(res.summary.headline).toBeTruthy();
    // at least one alert exists so the tour's alert step anchors
    expect(res.parcels.some((p) => p.alerts.length > 0)).toBe(true);
  });

  it("cached file is a real capture: same parcel ids, capture date", () => {
    // mendozaCached.json is written verbatim by
    // scripts/capture-demo.mjs from the live API — never hand-edited.
    expect(cachedFile.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Date.parse(cachedFile.captured_at)).not.toBeNaN();
    const ids = cachedFile.response.parcels.map((p) => p.id).sort();
    expect(ids).toEqual(MENDOZA_PARCELS.map((p) => p.id).sort());
    // the export exposes the capture verbatim
    expect(MENDOZA_CACHED.res).toEqual(cachedFile.response);
    expect(MENDOZA_CACHED.date).toBe(cachedFile.captured_at);
  });
});

/* ------------------------------------------------------- tour ------ */

describe("GuidedTour", () => {
  beforeEach(() => localStorage.removeItem(TOUR_KEY));

  it("defines six anchored steps, rotations first", () => {
    expect(TOUR_STEPS).toHaveLength(6);
    expect(TOUR_STEPS[0].key).toBe("demo.tour.rotations");
    expect(TOUR_STEPS[0].tab).toBe("recommendations");
    for (const s of TOUR_STEPS) {
      expect(s.sel).toBeTruthy();
      expect(t(`${s.key}.title`)).not.toBe(`${s.key}.title`);
      expect(t(`${s.key}.body`)).not.toBe(`${s.key}.body`);
    }
  });

  it("walks forward and back, then marks itself seen", () => {
    const onClose = vi.fn();
    wrap(<GuidedTour onClose={onClose} />);
    const dlg = screen.getByRole("dialog");
    expect(dlg).toHaveTextContent(t("demo.tour.rotations.title"));
    expect(screen.getByRole("button", { name: t("demo.tour.back") }))
      .toBeDisabled();
    fireEvent.click(screen.getByRole("button",
      { name: t("demo.tour.next") }));
    expect(dlg).toHaveTextContent(t("demo.tour.land.title"));
    fireEvent.click(screen.getByRole("button",
      { name: t("demo.tour.back") }));
    expect(dlg).toHaveTextContent(t("demo.tour.rotations.title"));
    // last step: the primary button finishes the tour
    for (let k = 0; k < 5; k++) {
      fireEvent.click(screen.getByRole("button",
        { name: t("demo.tour.next") }));
    }
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
    // a second mount still dismisses via the button
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
  demo: { cached: MENDOZA_CACHED.res, cachedDate: MENDOZA_CACHED.date },
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
});

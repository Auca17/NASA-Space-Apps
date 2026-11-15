/** Guided demo (tasks 40 + 52): the demo hash routing, the two farm
 * fixtures (three parcels each, inside the boundary, no overlaps,
 * real crop ids, coherent profile/economics), the saved real captures
 * (parcels + diagnose + rotations + explain), the hazard->priority
 * mapping and rotation inference, and the guided tour (per-farm step
 * lists, session-only dismissal). */
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
import {
  deriveRotPriorities, inferCurrentRotation,
} from "../../domain/rotations";
import { FieldPanel } from "../field/FieldLens";
import pampaFile from "./pampaCached.json";
import mendozaFile from "./mendozaCached.json";
import {
  PAMPA_BOUNDARY, PAMPA_CACHED, PAMPA_ECON,
  PAMPA_NEEDS, PAMPA_PARCELS, PAMPA_PROFILE,
} from "./pampaFarm";
import {
  MENDOZA_BOUNDARY, MENDOZA_CACHED, MENDOZA_ECON,
  MENDOZA_NEEDS, MENDOZA_PARCELS, MENDOZA_PROFILE,
} from "./mendozaFarm";
import {
  demoForHash, isDemoHash, type DemoId,
} from "./demoFarms";
import { GuidedTour } from "./GuidedTour";
import { TOUR_KEY, tourSeen, tourSteps } from "./demoTour";

const wrap = (el: React.ReactElement) =>
  render(<I18nProvider>{el}</I18nProvider>);
const t = (k: string) => (es as Record<string, string>)[k] ?? k;

/* --------------------------------------------------- hash routing -- */

describe("demo hash routing", () => {
  it("maps #demo and #demo-pampa to the pampa farm", () => {
    expect(demoForHash("#demo")).toEqual(
      { farm: "pampa", live: false, notour: false });
    expect(demoForHash("#demo-pampa")).toEqual(
      { farm: "pampa", live: false, notour: false });
    expect(isDemoHash("#demo")).toBe(true);
    expect(isDemoHash("#demo-pampa")).toBe(true);
  });

  it("maps #demo-mendoza to the mendoza farm", () => {
    expect(demoForHash("#demo-mendoza")?.farm).toBe("mendoza");
  });

  it("falls back to pampa for unknown demo hashes", () => {
    expect(demoForHash("#demo-otro")?.farm).toBe("pampa");
    expect(demoForHash("#demoxyz")?.farm).toBe("pampa");
  });

  it("ignores non-demo hashes", () => {
    expect(demoForHash("#-34.69,-60.53")).toBeNull();
    expect(demoForHash("")).toBeNull();
    expect(demoForHash("#Demo")).toBeNull();
    expect(isDemoHash("#other")).toBe(false);
  });

  it("reads &live and &notour flags", () => {
    expect(demoForHash("#demo-pampa&live")).toEqual(
      { farm: "pampa", live: true, notour: false });
    expect(demoForHash("#demo-pampa&notour")).toEqual(
      { farm: "pampa", live: false, notour: true });
    expect(demoForHash("#demo-mendoza&live&notour")).toEqual(
      { farm: "mendoza", live: true, notour: true });
  });
});

/* ------------------------------------------------------- fixtures -- */

/** Strict segment crossing (shared edges / touches don't count). */
const segCross = (a: LatLon, b: LatLon, c: LatLon, d: LatLon) => {
  const o = (p: LatLon, q: LatLon, r: LatLon) =>
    (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
};

const edges = (r: LatLon[]) =>
  r.map((p, i) => [p, r[(i + 1) % r.length]] as const);

const catalogIds = (() => {
  const catalog = JSON.parse(readFileSync(
    resolve(process.cwd(), "../back/knowledge/crops.json"),
    "utf-8")) as { crops: { id: string }[] };
  return new Set(catalog.crops.map((c) => c.id));
})();

const FARMS: {
  id: DemoId;
  boundary: LatLon[];
  parcels: typeof PAMPA_PARCELS;
  haMin: number; haMax: number;
}[] = [
  { id: "pampa", boundary: PAMPA_BOUNDARY[0][0],
    parcels: PAMPA_PARCELS, haMin: 120, haMax: 200 },
  { id: "mendoza", boundary: MENDOZA_BOUNDARY[0][0],
    parcels: MENDOZA_PARCELS, haMin: 80, haMax: 150 },
];

for (const farm of FARMS) describe(`${farm.id} fixture`, () => {
  it("has exactly three parcels inside a simple boundary", () => {
    expect(farm.parcels).toHaveLength(3);
    expect(selfIntersects(farm.boundary)).toBe(false);
    for (const p of farm.parcels) {
      expect(p.geom[0].length, p.id).toBeGreaterThanOrEqual(3);
      expect(selfIntersects(p.geom[0]), p.id).toBe(false);
    }
  });

  it("keeps every parcel inside the boundary, with no overlaps", () => {
    for (const p of farm.parcels) {
      for (const v of p.geom[0]) {
        expect(pointInRing(v, farm.boundary),
               `${p.id} vertex ${v}`).toBe(true);
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

  it(`is a ${farm.haMin}–${farm.haMax} ha farm`, () => {
    const ha = ringAreaHa(farm.boundary);
    expect(ha).toBeGreaterThanOrEqual(farm.haMin);
    expect(ha).toBeLessThanOrEqual(farm.haMax);
    const ids = new Set(farm.parcels.map((p) => p.id));
    expect(ids.size).toBe(farm.parcels.length);
  });

  it("uses real crop ids from the catalog", () => {
    for (const p of farm.parcels) {
      expect(catalogIds.has(p.crop), `${p.id} crop ${p.crop}`).toBe(true);
      expect(p.crop).not.toBe("otro");
    }
  });
});

describe("pampa fixture", () => {
  it("is soja + maiz + trigo — the clean rotation case", () => {
    expect(PAMPA_PARCELS.map((p) => p.crop).sort())
      .toEqual(["maiz", "soja", "trigo"]);
  });

  it("has a coherent producer profile, needs and economics", () => {
    expect(new Set(PAMPA_PROFILE.order)).toEqual(new Set(HAZARDS));
    for (const h of PAMPA_PROFILE.hidden) expect(HAZARDS).toContain(h);
    expect(PAMPA_NEEDS.emergency_distance_km).toBeGreaterThan(0);
    for (const c of PAMPA_NEEDS.concerns) expect(CONCERNS).toContain(c);
    for (const id of Object.keys(PAMPA_ECON.parcels)) {
      expect(PAMPA_PARCELS.map((p) => p.id)).toContain(id);
      const e = PAMPA_ECON.parcels[id];
      expect(e.cost_per_ha).toBeGreaterThan(0);
      expect(e.price_per_t).toBeGreaterThan(0);
      expect(e.expected_yield_t_ha).toBeGreaterThan(0);
    }
  });
});

describe("mendoza fixture", () => {
  it("is vid + olivo + ajo", () => {
    expect(MENDOZA_PARCELS.map((p) => p.crop).sort())
      .toEqual(["ajo", "olivo", "vid"]);
  });

  it("has a coherent producer profile, needs and economics", () => {
    expect(MENDOZA_PROFILE.order.slice(0, 3))
      .toEqual(["frost", "drought", "fire"]);
    expect(new Set(MENDOZA_PROFILE.order)).toEqual(new Set(HAZARDS));
    expect(MENDOZA_NEEDS.water_access).toBe("well");
    for (const id of Object.keys(MENDOZA_ECON.parcels)) {
      expect(MENDOZA_PARCELS.map((p) => p.id)).toContain(id);
    }
  });
});

/* ------------------------------------------------- saved captures -- */

const FILES = {
  pampa: { file: pampaFile, cached: PAMPA_CACHED,
           parcels: PAMPA_PARCELS },
  mendoza: { file: mendozaFile, cached: MENDOZA_CACHED,
             parcels: MENDOZA_PARCELS },
} as const;

for (const [id, f] of Object.entries(FILES)) {
  describe(`${id} saved capture`, () => {
    it("is a dated real capture with matching parcel ids", () => {
      expect(f.file.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Date.parse(f.file.captured_at)).not.toBeNaN();
      expect(f.file.response.parcels.map((p) => p.id).sort())
        .toEqual(f.parcels.map((p) => p.id).sort());
      expect(f.cached.res).toEqual(f.file.response);
      expect(f.cached.date).toBe(f.file.captured_at);
      for (const p of f.cached.res.parcels) {
        expect(p.indicators.fire).toBeTruthy();
        expect(p.indicators.water).toBeTruthy();
        expect(p.area_ha).toBeGreaterThan(0);
      }
      // at least one alert so the tour's alert step can anchor
      expect(f.cached.res.parcels.some((p) => p.alerts.length > 0))
        .toBe(true);
    });

    it("carries the diagnosis the tabs need", () => {
      expect(f.cached.diag).toBeTruthy();
      expect(f.cached.diag!.cards?.length).toBeGreaterThan(0);
      expect(f.cached.diag!.calendar).toBeTruthy();
    });
  });
}

describe("pampa saved capture", () => {
  it("ships the inferred current rotation and four strategy cards", () => {
    expect(PAMPA_CACHED.inferred).toBeTruthy();
    const strategies = PAMPA_CACHED.rotations?.strategies ?? [];
    expect(strategies).toHaveLength(4);
    expect(strategies.filter((s) => s.is_current)).toHaveLength(1);
    // every card carries the five sections the tab shows
    for (const s of strategies) {
      expect(s.why, `${s.id} why`).toBeTruthy();
      expect(s.evidence?.length ?? 0, `${s.id} evidence`)
        .toBeGreaterThan(0);
      expect(s.gaps, `${s.id} gaps`).toBeDefined();
      expect(s.risks, `${s.id} risks`).toBeDefined();
      expect(s.benefits !== undefined, `${s.id} benefits`).toBe(true);
    }
    // explanations captured for every card
    for (const s of strategies) {
      expect(PAMPA_CACHED.explain[s.id], `explain ${s.id}`).toBeTruthy();
    }
    // the derived priorities came from the farm's hazard ranking
    expect(PAMPA_CACHED.derived.sel).toContain("water");
    expect(PAMPA_CACHED.derived.sel).toContain("avoid_burning");
  });
});

/* ------------------------------------- priorities + inference ------ */

describe("deriveRotPriorities", () => {
  it("maps hazards to rotation priorities in order", () => {
    const d = deriveRotPriorities(
      ["drought", "enso", "fire", "frost", "flood"], false);
    expect(d.sel).toEqual(["water", "avoid_burning", "erosion"]);
    expect(d.warn).toEqual(["frost"]);
  });

  it("fills the third slot with income when economics exist", () => {
    const d = deriveRotPriorities(["drought", "fire"], true);
    expect(d.sel).toEqual(["water", "avoid_burning", "income"]);
    // without economics there is no invented income
    expect(deriveRotPriorities(["drought", "fire"], false).sel)
      .not.toContain("income");
  });

  it("lists snow/hail as unmapped and frost/heat as constraints", () => {
    const d = deriveRotPriorities(["frost", "heat", "snow", "hail"], false);
    expect(d.warn).toEqual(["frost", "heat"]);
    expect(d.unmapped).toEqual(["snow", "hail"]);
    expect(d.sel).toEqual([]);
  });

  it("skips hidden hazards — they are declared non-worries", () => {
    const d = deriveRotPriorities(
      ["drought", "fire", "flood"], true, ["flood"]);
    expect(d.sel).toEqual(["water", "avoid_burning", "income"]);
    expect(d.sel).not.toContain("erosion");
  });
});

describe("inferCurrentRotation", () => {
  const catalog = [
    { id: "soja-maiz", name: {}, years: 2,
      sequence: [{ crop: "soja", start: "", end: "" },
                 { crop: "maiz", start: "", end: "" }] },
    { id: "trigo-soja2-maiz", name: {}, years: 2,
      sequence: [{ crop: "trigo", start: "", end: "" },
                 { crop: "soja", start: "", end: "" },
                 { crop: "maiz", start: "", end: "" }] },
  ];

  it("picks the rotation covering the parcel crops", () => {
    const r = inferCurrentRotation(["soja", "maiz", "trigo"], catalog);
    expect(r?.id).toBe("trigo-soja2-maiz");
    expect(r?.matched).toBe(true);
  });

  it("returns null when no rotation covers the crops (perennials)", () => {
    expect(inferCurrentRotation(["vid", "olivo", "ajo"], catalog))
      .toBeNull();
  });
});

/* ------------------------------------------------------- tour ------ */

describe("guided tour", () => {
  beforeEach(() => sessionStorage.removeItem(TOUR_KEY));

  it("has seven pampa steps and five mendoza steps", () => {
    expect(tourSteps("pampa")).toHaveLength(7);
    expect(tourSteps("mendoza")).toHaveLength(5);
    for (const s of [...tourSteps("pampa"), ...tourSteps("mendoza")]) {
      expect(s.sel).toBeTruthy();
      expect(t(`${s.key}.title`)).not.toBe(`${s.key}.title`);
      expect(t(`${s.key}.body`)).not.toBe(`${s.key}.body`);
    }
  });

  it("pampa reaches the calendar, rotations and más-info anchors", () => {
    const steps = tourSteps("pampa");
    expect(steps.map((s) => s.tab))
      .toEqual(["resumen", undefined, undefined, "prioridades",
                "mas", "rotaciones", "mas"]);
    expect(steps[4].sel).toBe('[data-tour="calendar"]');
    expect(steps[5].sel).toBe('[data-tour="rotaciones"]');
  });

  it("walks forward and back, then marks itself seen (session)", () => {
    const onClose = vi.fn();
    wrap(<GuidedTour steps={tourSteps("mendoza")} onClose={onClose} />);
    const dlg = screen.getByRole("dialog");
    expect(dlg).toHaveTextContent(t("demo.tour.parcels.title"));
    fireEvent.click(screen.getByRole("button",
      { name: t("demo.tour.next") }));
    expect(dlg).toHaveTextContent(t("demo.tour.badges.title"));
    fireEvent.click(screen.getByRole("button",
      { name: t("demo.tour.back") }));
    expect(dlg).toHaveTextContent(t("demo.tour.parcels.title"));
    for (let k = 0; k < 4; k++) {
      fireEvent.click(screen.getByRole("button",
        { name: t("demo.tour.next") }));
    }
    fireEvent.click(screen.getByRole("button",
      { name: t("demo.tour.done") }));
    expect(onClose).toHaveBeenCalled();
    // session-only: the flag lives in sessionStorage, not localStorage
    expect(sessionStorage.getItem(TOUR_KEY)).toBe("1");
    expect(localStorage.getItem(TOUR_KEY)).toBeNull();
    expect(tourSeen()).toBe(true);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    wrap(<GuidedTour steps={tourSteps("pampa")} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(tourSeen()).toBe(true);
  });

  it("fires onStep for each visited step", () => {
    const onStep = vi.fn();
    wrap(<GuidedTour steps={tourSteps("mendoza")}
                     onStep={onStep} onClose={() => {}} />);
    expect(onStep).toHaveBeenCalledWith(
      expect.objectContaining({ tab: "resumen" }));
    fireEvent.click(screen.getByRole("button",
      { name: t("demo.tour.next") }));
    expect(onStep).toHaveBeenLastCalledWith(
      expect.objectContaining({ sel: '[data-tour="badges"]' }));
  });
});

/* ------------------------------------------------- saved render ---- */

const pampaTarget = {
  geom: PAMPA_BOUNDARY,
  areaLabel: "Todo el campo",
  fieldName: "Estancia La Aurora",
  parcels: PAMPA_PARCELS,
  needs: PAMPA_NEEDS,
  profile: PAMPA_PROFILE,
  econ: PAMPA_ECON,
  demo: {
    farm: "pampa",
    cached: PAMPA_CACHED.res,
    cachedDate: PAMPA_CACHED.date,
    cachedDiag: PAMPA_CACHED.diag,
    cachedRotations: PAMPA_CACHED.rotations,
    cachedExplain: PAMPA_CACHED.explain,
    inferred: PAMPA_CACHED.inferred,
    derived: PAMPA_CACHED.derived,
    producerKey: "demo.pampa.producer",
    storyKey: "demo.pampa.story",
  },
};

describe("saved capture render", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    // the saved demo must not hit the network: any fetch is a failure
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network hit in saved demo");
    }) as typeof fetch;
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("renders the saved pampa result with its date, no API call",
      async () => {
    wrap(<FieldPanel target={pampaTarget} open
                     onClose={() => {}} onChangePlot={() => {}} />);
    expect(await screen.findByText(/resultado guardado del/i))
      .toBeInTheDocument();
    expect(screen.getByText("Lote Soja")).toBeInTheDocument();
    expect(screen.getAllByText(/Estancia La Aurora/).length)
      .toBeGreaterThan(0);
    expect(screen.getByText(/inventados para la demo/))
      .toBeInTheDocument();
    // the Rotaciones tab exists right after Resumen
    expect(screen.getByRole("tab", { name: t("parcels.tab.rotations") }))
      .toBeInTheDocument();
  });

  it("looks identical with polluted localStorage", async () => {
    localStorage.setItem("fs_parcel_profile", JSON.stringify({
      order: ["snow", "flood", "heat", "hail", "fire",
              "drought", "frost", "enso"],
      hidden: ["fire"] }));
    localStorage.setItem("fs_parcel_econ", JSON.stringify({
      currency: "ARS",
      parcels: { soja: { cost_per_ha: 1, price_per_t: 1,
                         expected_yield_t_ha: 1 } } }));
    wrap(<FieldPanel target={pampaTarget} open
                     onClose={() => {}} onChangePlot={() => {}} />);
    expect(await screen.findByText(/resultado guardado del/i))
      .toBeInTheDocument();
    expect(screen.getByText("Lote Soja")).toBeInTheDocument();
    // the fictional profile wins, not the polluted stored one
    const prioTab = screen.getByRole("tab",
      { name: t("parcels.tab.priorities") });
    fireEvent.click(prioTab);
    expect(await screen.findByText(/Sequía/)).toBeInTheDocument();
    localStorage.clear();
  });
});

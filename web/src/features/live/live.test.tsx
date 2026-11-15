import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import {
  liveViewBoxes, mergeLiveCells, pointInBoxes, summarizeLive,
  WORLD_BBOX,
} from "../../domain/live";
import type { GlobeHandle } from "../globe/GlobeView";

const apiLiveResult = vi.fn();
vi.mock("../../api", () => ({ apiLiveResult: (...a: unknown[]) => apiLiveResult(...a) }));
const { LiveControls } = await import("./LiveMode");

/** Globe stub: records drawn cells and lets the test fire "moveend". */
function fakeGlobe(zoom = 1) {
  const moves = new Set<() => void>();
  const drawn: Map<string, number>[] = [];
  const g = {
    bounds: vi.fn(() => [-61, -34, -60, -33] as [number, number, number, number]),
    center: vi.fn(() => ({ lat: -33.5, lon: -60.5, zoom })),
    setCells: vi.fn((c: Map<string, number>) => { drawn.push(c); }),
    onMove: vi.fn((cb: () => void) => { moves.add(cb); return () => moves.delete(cb); }),
  };
  return { globe: g as unknown as GlobeHandle, drawn,
           move: () => moves.forEach((cb) => cb()) };
}

const ok = (body: object) => ({ ok: true, data: { updated_at: "2026-11-15T03:00:00Z",
  window_h: 24, sources: ["VIIRS_SNPP_NRT"], ...body } });
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => { resolve = r; });
  return { p, resolve };
};
const renderLive = (globe: GlobeHandle) => render(
  <I18nProvider><LiveControls globe={globe} country="AR" /></I18nProvider>);

beforeEach(() => { apiLiveResult.mockReset(); });

describe("summarizeLive", () => {
  it("reads points as detections and the backend's [h3, n, frp] cells", () => {
    expect(summarizeLive({ mode: "points", points: [
      { lat: -33.5, lon: -60.5 }, { lat: -33.5, lon: -60.5 }] })).toMatchObject(
      { unit: "detections", count: 2 });
    const c = summarizeLive({ mode: "cells",
      cells: [["85c2e8bbfffffff", 4, 12.5], ["85c2e8b3fffffff", 1, 3]] });
    expect(c).toMatchObject({ unit: "cells", count: 2, detections: 5 });
    expect(c.cells.get("85c2e8bbfffffff")).toBe(4);
  });
  // found in the walkthrough: the backend sends points as
  // [lat, lon, frp, satellite, time] arrays
  it("reads the backend point arrays", () => {
    const r = summarizeLive({ mode: "points", points: [
      [-33.5, -60.5, 1.2, "N20", "2026-11-11T05:12Z"],
      [-33.6, -60.4, 0.9, "N20", "2026-11-11T05:12Z"]] });
    expect(r).toMatchObject({ unit: "detections", count: 2 });
    expect([...r.cells.values()].reduce((a, n) => a + n, 0)).toBe(2);
  });
  it("counts only points inside the visible map", () => {
    const r = summarizeLive({ mode: "points", points: [
      [-33.5, -60.5, 1, "N20", ""], [-30.2, -61.0, 1, "N20", ""]] },
      [-61, -34, -60, -33]);
    expect(r.count).toBe(1);
  });
  it("flags partial results when a source failed", () => {
    expect(summarizeLive({ mode: "points", points: [],
      sources_failed: ["MODIS_NRT"] }).failed).toEqual(["MODIS_NRT"]);
  });
});

describe("liveViewBoxes (task 33.4b)", () => {
  it("passes a normal view through unchanged", () => {
    expect(liveViewBoxes([-61, -34, -60, -33]))
      .toEqual([[-61, -34, -60, -33]]);
  });
  it("clamps a world-zoomed view to the API range instead of 400ing", () => {
    const boxes = liveViewBoxes([-320, -100, 40, 100]);
    expect(boxes).toEqual([[-180, -85, 180, 85]]);
  });
  it("splits a view that crosses the antimeridian", () => {
    const boxes = liveViewBoxes([170, -40, -160, -20]);
    expect(boxes).toEqual([[170, -40, 180, -20], [-180, -40, -160, -20]]);
    expect(pointInBoxes(-30, 175, boxes)).toBe(true);
    expect(pointInBoxes(-30, -170, boxes)).toBe(true);
    expect(pointInBoxes(-30, 0, boxes)).toBe(false);
  });
  it("a span of 360° or more is the whole world", () => {
    expect(liveViewBoxes([-200, -60, 200, 60]))
      .toEqual([[-180, -60, 180, 60]]);
  });
  it("drops degenerate views", () => {
    expect(liveViewBoxes([-10, 90, 10, 95])).toEqual([]);
  });
});

describe("mergeLiveCells", () => {
  it("keeps world cells outside the view and local cells inside", () => {
    // world res-3 cell inside the view + one far away
    const world = { unit: "cells" as const, count: 0, detections: 0,
      failed: [], cells: new Map([["83c2ecfffffffff", 9],
                                ["83599afffffffff", 4]]) };
    const local = { unit: "detections" as const, count: 0, detections: 0,
      failed: [], cells: new Map([["85c2e8c3fffffff", 2]]) };
    // view centred on the first world cell
    const merged = mergeLiveCells(world, local, [-62, -36, -58, -32]);
    expect(merged.has("83599afffffffff")).toBe(true); // far cell kept
    expect(merged.has("85c2e8c3fffffff")).toBe(true); // local cell in
    expect(merged.has("83c2ecfffffffff")).toBe(false); // view cell replaced
  });
});

describe("LiveControls states", () => {
  it("shows loading, then the count of detections and the query time", async () => {
    const d = deferred<unknown>();
    apiLiveResult.mockReturnValueOnce(d.p);
    const { globe } = fakeGlobe();
    renderLive(globe);
    expect(screen.getByRole("status")).toHaveTextContent(/consultando/i);
    await act(async () => d.resolve(ok({ mode: "points",
      points: [{ lat: -33.5, lon: -60.5 }, { lat: -33.6, lon: -60.4 }] })));
    expect(screen.getByRole("status")).toHaveTextContent(/2 detecciones/i);
    expect(screen.getByRole("status")).toHaveTextContent(/consultado a las/i);
  });

  it("tells an empty successful query apart from an error", async () => {
    apiLiveResult.mockResolvedValueOnce(ok({ mode: "points", points: [] }));
    const { globe } = fakeGlobe();
    renderLive(globe);
    expect(await screen.findByText(/sin detecciones en la vista actual/i))
      .toBeInTheDocument();
    apiLiveResult.mockResolvedValueOnce({ ok: false, status: 502 });
    fireEvent.click(screen.getByRole("button", { name: "48h" }));
    expect(await screen.findByText(/no se pudo consultar/i)).toBeInTheDocument();
    expect(screen.queryByText(/sin detecciones/i)).toBeNull();
  });

  it("marks a partial result and labels cells as cells", async () => {
    apiLiveResult.mockResolvedValueOnce(ok({ mode: "cells",
      cells: [["85c2e8bbfffffff", 3, 9]], sources_failed: ["MODIS_NRT"] }));
    const { globe } = fakeGlobe();
    renderLive(globe);
    expect(await screen.findByText(/resultado parcial/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/1 celda/i);
  });

  it("fetches the world once per window; moving repaints without "
     + "a new world query", async () => {
    apiLiveResult.mockResolvedValue(ok({ mode: "cells",
      cells: [["85c2e8bbfffffff", 3, 9]] }));
    const f = fakeGlobe();
    renderLive(f.globe);
    await screen.findByText(/celda/i);
    // world-wide first query, clamped to the API range
    expect(apiLiveResult.mock.calls[0]).toEqual(["24h", WORLD_BBOX]);
    const before = apiLiveResult.mock.calls.length;
    await act(async () => { f.move(); });
    // zoomed out: no viewport refinement, no refetch at all
    expect(apiLiveResult.mock.calls.length).toBe(before);
    fireEvent.click(screen.getByRole("button", { name: "7d" }));
    await screen.findByText(/celda/i);
    expect(apiLiveResult.mock.calls.map((c) => c[0]))
      .toEqual(["24h", "7d"]);
    expect(apiLiveResult.mock.calls[1][1]).toEqual(WORLD_BBOX);
  });

  it("refines with a viewport query only when zoomed in", async () => {
    apiLiveResult.mockResolvedValue(ok({ mode: "points", points: [
      [-33.5, -60.5, 1, "N20", "2026-11-11T05:12Z"]] }));
    const f = fakeGlobe(6); // zoom >= POINTS_MIN_ZOOM
    renderLive(f.globe);
    await screen.findByText(/detecciones|celda/i);
    await act(async () => { f.move(); });
    await act(async () => { await Promise.resolve(); });
    // world query + one viewport query per move
    const bboxes = apiLiveResult.mock.calls.map((c) => c[1]);
    expect(bboxes[0]).toEqual(WORLD_BBOX);
    expect(bboxes.at(-1)).toEqual([-61, -34, -60, -33]);
  });

  it("ignores a slow old response that arrives after a newer one", async () => {
    const slow = deferred<unknown>(), fast = deferred<unknown>();
    apiLiveResult.mockReturnValueOnce(slow.p).mockReturnValueOnce(fast.p);
    const f = fakeGlobe();
    renderLive(f.globe);
    fireEvent.click(screen.getByRole("button", { name: "48h" }));
    await act(async () => fast.resolve(ok({ mode: "points", points: [] })));
    await act(async () => slow.resolve(ok({ mode: "points",
      points: [{ lat: -33.5, lon: -60.5 }] })));
    expect(screen.getByRole("status")).toHaveTextContent(/sin detecciones/i);
    const last = f.drawn.at(-1)!;
    expect(last.size).toBe(0);
  });
});

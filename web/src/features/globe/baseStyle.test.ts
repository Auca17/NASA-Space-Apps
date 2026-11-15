/** Task 30: the base style always has a painted background plus a
 * neutral land/water fallback, and the tile-health tracker flips the
 * fallback on only after repeated raster errors. */
import { describe, expect, it } from "vitest";
import {
  BASE_STYLE, FALLBACK_LAYERS, MAX_TILE_ERRORS, RASTER_LAYERS,
  RASTER_TILES, needsFallback, newTileHealth, recordTileError,
  recordTileOk, retryDelayMs,
} from "./baseStyle";

describe("base style", () => {
  it("paints a background layer so the canvas is never blank", () => {
    const bg = BASE_STYLE.layers.find((l) => l.id === "bg");
    expect(bg?.type).toBe("background");
  });
  it("has hidden fallback layers under the rasters, fed by the vector source", () => {
    const ids = BASE_STYLE.layers.map((l) => l.id);
    for (const f of FALLBACK_LAYERS) {
      const layer = BASE_STYLE.layers.find((l) => l.id === f);
      expect(layer, f).toBeTruthy();
      expect((layer as { layout?: { visibility?: string } }).layout?.visibility)
        .toBe("none");
      expect((layer as { source?: string }).source).toBe("omt");
      // fallback sits under every raster layer
      expect(ids.indexOf(f)).toBeLessThan(ids.indexOf("marble"));
    }
    expect(BASE_STYLE.sources.omt).toBeTruthy();
  });
  it("every fallback layer id is covered by FALLBACK_LAYERS", () => {
    const rasterIds = ["marble", "osm", "field-satellite"];
    const under = BASE_STYLE.layers.filter(
      (l) => (l as { source?: string }).source === "omt" &&
             (l.layout as { visibility?: string })?.visibility === "none");
    for (const l of under) expect(FALLBACK_LAYERS).toContain(l.id);
    for (const r of rasterIds) expect(RASTER_TILES[r]).toBeTruthy();
  });
  it("maps every raster source to its real style layers", () => {
    const styleLayerIds = new Set(BASE_STYLE.layers.map((l) => l.id));
    for (const [src, layers] of Object.entries(RASTER_LAYERS)) {
      expect(RASTER_TILES[src], src).toBeTruthy();
      for (const l of layers) expect(styleLayerIds).toContain(l);
    }
    // every raster-typed style layer is claimed by some source's list
    const claimed = new Set(Object.values(RASTER_LAYERS).flat());
    for (const l of BASE_STYLE.layers) {
      if (l.type === "raster") expect(claimed).toContain(l.id);
    }
  });
});

describe("tile health", () => {
  it("ignores a couple of errors, engages fallback at the threshold", () => {
    const h = newTileHealth();
    for (let i = 0; i < MAX_TILE_ERRORS - 1; i++) {
      expect(recordTileError(h, "marble")).toBe(false);
      expect(needsFallback(h)).toBe(false);
    }
    expect(recordTileError(h, "marble")).toBe(true);
    expect(needsFallback(h)).toBe(true);
  });
  it("unknown sources are ignored", () => {
    const h = newTileHealth();
    for (let i = 0; i < MAX_TILE_ERRORS + 2; i++) {
      recordTileError(h, "cells");
    }
    expect(needsFallback(h)).toBe(false);
  });
  it("a successful tile clears the source and drops the fallback", () => {
    const h = newTileHealth();
    for (let i = 0; i < MAX_TILE_ERRORS; i++) recordTileError(h, "osm");
    expect(needsFallback(h)).toBe(true);
    recordTileOk(h, "osm");
    expect(needsFallback(h)).toBe(false);
  });
  it("backoff grows and is capped", () => {
    expect(retryDelayMs(0)).toBe(5_000);
    expect(retryDelayMs(1)).toBe(10_000);
    expect(retryDelayMs(99)).toBe(120_000);
  });
});

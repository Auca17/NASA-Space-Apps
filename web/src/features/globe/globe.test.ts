import { describe, it, expect } from "vitest";
import { BASE_STYLE } from "./baseStyle";

describe("base map", () => {
  it("adds OpenStreetMap streets for close zooms, with attribution", () => {
    const osm = BASE_STYLE.sources.osm as { tiles: string[];
      maxzoom: number; attribution: string };
    expect(osm.tiles[0]).toContain("tile.openstreetmap.org");
    expect(osm.maxzoom).toBeGreaterThanOrEqual(16);
    expect(osm.attribution).toMatch(/OpenStreetMap/);
  });
  it("keeps Blue Marble below and OSM on top, fading in after zoom 8", () => {
    const ids = BASE_STYLE.layers.map((l) => l.id);
    expect(ids.indexOf("osm")).toBeGreaterThan(ids.indexOf("marble"));
    const osm = BASE_STYLE.layers.find((l) => l.id === "osm")!;
    expect(osm.minzoom).toBeLessThan(8);
  });

  it("provides detailed, attributed satellite imagery above the street fallback", () => {
    const satellite = BASE_STYLE.sources["field-satellite"];
    expect(satellite).toMatchObject({ type: "raster", tileSize: 256, maxzoom: 14 });
    expect(satellite).toHaveProperty("attribution", expect.stringContaining("Copernicus"));
    const ids = BASE_STYLE.layers.map((layer) => layer.id);
    expect(ids.indexOf("field-satellite")).toBeGreaterThan(ids.indexOf("osm"));
  });

  it("leaves the satellite layer hidden until the field journey enables it", () => {
    expect(BASE_STYLE.layers.find(({ id }) => id === "field-satellite"))
      .toMatchObject({ layout: { visibility: "none" } });
  });
});

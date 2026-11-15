import { describe, it, expect } from "vitest";
import { tilesFor, tileOf } from "./ftw";

describe("tilesFor", () => {
  it("reads a small field at zoom 13", () => {
    const { z, tiles } = tilesFor([-60.70, -33.97, -60.68, -33.95]);
    expect(z).toBe(13);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles).toContainEqual(tileOf(-33.96, -60.69, 13));
  });
  it("drops the zoom so a 12,000 ha field stays within 64 tiles", () => {
    const { z, tiles } = tilesFor([-60.75, -34.01, -60.63, -33.91]);
    expect(tiles.length).toBeLessThanOrEqual(64);
    expect(z).toBeLessThanOrEqual(13);
    expect(z).toBeGreaterThanOrEqual(11);
  });
});

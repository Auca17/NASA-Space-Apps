import type { MoistureKind, MoistureZone } from "../api/types";
import type { Multi } from "./selection";

export const MOISTURE_COLORS: Record<MoistureKind, string> = {
  dry: "#ca843d", middle: "#8eaa62", wet: "#4aa6e0", missing: "#8c9297",
};

export function moistureGeometry(geometry: MoistureZone["geometry"]): Multi {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polys.map((poly) => poly.map((ring) => ring.map(([x, y]) => [y, x])));
}

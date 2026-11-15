export const APP_NAME = "Ashfield";

export const DATA_BASE_URL: string =
  (import.meta.env.VITE_DATA_BASE_URL as string | undefined) ??
  "/data/v1/";

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

/** Demo plot (D19): public plot near INTA Pergamino, ~50 ha. */
export const DEMO_PLOT = { lat: -33.89, lon: -60.57, ha: 50 };

export const DEFAULT_VIEW = { lat: -38.4, lon: -63.6, zoom: 3.2 };
export const WORLD_VIEW = { lat: 10, lon: 0, zoom: 0.5 };

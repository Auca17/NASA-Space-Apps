/** Base map style (kept apart from GlobeView so it is testable without
 * loading MapLibre). */
import type { StyleSpecification, VectorSourceSpecification }
  from "maplibre-gl";

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" +
  "BlueMarble_NextGeneration/default/2004-08/GoogleMapsCompatible_Level8" +
  "/{z}/{y}/{x}.jpeg";

/** OpenStreetMap street tiles: Blue Marble stops at zoom 8, so close up
 * (where a producer finds and draws a field) OSM fades in with roads,
 * towns and rural paths. */
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const SENTINEL = "https://tiles.maps.eox.at/wmts/1.0.0/" +
  "s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg";

/** Tile URL templates per raster source — used by the health tracker to
 * force a reload after a backoff pause. */
export const RASTER_TILES: Record<string, string[]> = {
  marble: [GIBS],
  osm: [OSM],
  "field-satellite": [SENTINEL],
};

/** OpenFreeMap vector tiles (OpenMapTiles schema, OpenStreetMap data):
 * read, not drawn, to tell whether a selection is built-up land. The
 * same source paints the neutral land/water fallback below. */
export const LANDUSE_SOURCE: VectorSourceSpecification = {
  type: "vector", url: "https://tiles.openfreemap.org/planet",
  attribution: "© OpenMapTiles © OpenStreetMap contributors",
};

export const FIELD_GUIDE_SOURCE: VectorSourceSpecification = {
  type: "vector",
  url: "pmtiles://https://data.source.coop/ftw/global-data-2e/vector/2025/fields-2025.pmtiles",
  attribution: '<a href="https://source.coop/ftw/global-data-2e">Fields of The World 2025</a> (CC BY 4.0)',
};

export const BASE_STYLE: StyleSpecification = {
  version: 8,
  projection: { type: "mercator" },
  sources: {
    omt: LANDUSE_SOURCE,
    marble: { type: "raster", tiles: [GIBS], tileSize: 256, maxzoom: 8,
      attribution: "NASA GIBS / Blue Marble" },
    osm: { type: "raster", tiles: [OSM], tileSize: 256, maxzoom: 19,
      attribution: "© OpenStreetMap contributors" },
    "field-satellite": { type: "raster", tiles: [SENTINEL], tileSize: 256,
      maxzoom: 14,
      attribution: '<a href="https://cloudless.eox.at">EOxCloudless</a> by ' +
        "EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)" },
  },
  layers: [
    // Land tone — always renders, so the canvas is never blank even if
    // every remote tile service is down.
    { id: "bg", type: "background", paint: { "background-color": "#0a0d0b" } },
    // Neutral fallback base (task 30): land + water + country borders
    // from the vector source, hidden until a raster source dies. Kept
    // under the rasters so a healthy raster still wins.
    { id: "base-water", type: "fill", source: "omt", "source-layer": "water",
      layout: { visibility: "none" },
      paint: { "fill-color": "#16242e" } },
    { id: "base-boundary", type: "line", source: "omt",
      "source-layer": "boundary",
      filter: ["<=", ["get", "admin_level"], 2],
      layout: { visibility: "none" },
      paint: { "line-color": "#3a4a42", "line-width": 0.8,
        "line-opacity": 0.8 } },
    // Rasters are dimmed slightly so the glass panels and labels read on
    // top (docs/ui-style.md, section 5); street tiles get the most because
    // they are the brightest.
    { id: "marble", type: "raster", source: "marble",
      paint: { "raster-brightness-max": 0.9, "raster-saturation": -0.1 } },
    { id: "field-overview", type: "raster", source: "osm",
      maxzoom: 9.5, layout: { visibility: "none" },
      paint: { "raster-brightness-max": 0.8, "raster-saturation": -0.35 } },
    { id: "osm", type: "raster", source: "osm", minzoom: 7.5,
      paint: { "raster-opacity":
        ["interpolate", ["linear"], ["zoom"], 7.5, 0, 9.5, 1],
        "raster-brightness-max": 0.8, "raster-saturation": -0.35 } },
    { id: "field-satellite", type: "raster", source: "field-satellite",
      minzoom: 8, layout: { visibility: "none" },
      paint: { "raster-brightness-max": 0.88, "raster-saturation": -0.1,
        "raster-contrast": 0.08 } },
  ],
};

/** Layers the fallback toggle turns on when a raster source is dead. */
export const FALLBACK_LAYERS = ["base-water", "base-boundary"] as const;

/** Layers fed by each raster source. A dead source's layers are hidden
 * (and restored on recovery) so half-loaded/aborted tiles never paint. */
export const RASTER_LAYERS: Record<string, string[]> = {
  marble: ["marble"],
  osm: ["field-overview", "osm"],
  "field-satellite": ["field-satellite"],
};

// --------------------------------------------------- tile health ----

/** Errors before a raster source counts as dead. Tile 404s and network
 * resets are common on rural 4G — one hiccup is not an outage. */
export const MAX_TILE_ERRORS = 3;

/** Backoff before forcing a dead source to reload (5s, 10s, 20s, …,
 * capped at 2 min). */
export function retryDelayMs(attempt: number): number {
  return Math.min(120_000, 5_000 * 2 ** attempt);
}

export interface TileHealth {
  /** consecutive load errors per raster source */
  errors: Record<string, number>;
  /** how many forced retries have run since the last success */
  retries: number;
}

export function newTileHealth(): TileHealth {
  return { errors: {}, retries: 0 };
}

/** A tile/source error happened; returns true when the source just
 * crossed the dead threshold. */
export function recordTileError(h: TileHealth, sourceId: string): boolean {
  if (!(sourceId in RASTER_TILES)) return false;
  const n = (h.errors[sourceId] ?? 0) + 1;
  h.errors[sourceId] = n;
  return n === MAX_TILE_ERRORS;
}

/** A tile for the source arrived: the source is healthy again. */
export function recordTileOk(h: TileHealth, sourceId: string): boolean {
  if (!(sourceId in RASTER_TILES)) return false;
  const had = (h.errors[sourceId] ?? 0) > 0;
  h.errors[sourceId] = 0;
  if (had) h.retries = 0;
  return had;
}

/** The fallback base should paint while any raster source is dead. */
export function needsFallback(h: TileHealth): boolean {
  return Object.keys(RASTER_TILES).some(
    (id) => (h.errors[id] ?? 0) >= MAX_TILE_ERRORS);
}

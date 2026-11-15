/** Base map style (kept apart from GlobeView so it is testable without
 * loading MapLibre). */
import type { StyleSpecification, VectorSourceSpecification }
  from "maplibre-gl";

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" +
  "BlueMarble_NextGeneration/default//GoogleMapsCompatible_Level8" +
  "/{z}/{y}/{x}.jpeg";

/** OpenStreetMap street tiles: Blue Marble stops at zoom 8, so close up
 * (where a producer finds and draws a field) OSM fades in with roads,
 * towns and rural paths. */
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const SENTINEL = "https://tiles.maps.eox.at/wmts/1.0.0/" +
  "s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg";

export const BASE_STYLE: StyleSpecification = {
  version: 8,
  projection: { type: "mercator" },
  sources: {
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
    { id: "bg", type: "background", paint: { "background-color": "#0a0f1c" } },
    { id: "marble", type: "raster", source: "marble" },
    { id: "field-overview", type: "raster", source: "osm",
      maxzoom: 9.5, layout: { visibility: "none" } },
    { id: "osm", type: "raster", source: "osm", minzoom: 7.5,
      paint: { "raster-opacity":
        ["interpolate", ["linear"], ["zoom"], 7.5, 0, 9.5, 1] } },
    { id: "field-satellite", type: "raster", source: "field-satellite",
      minzoom: 8, layout: { visibility: "none" } },
  ],
};

/** OpenFreeMap vector tiles (OpenMapTiles schema, OpenStreetMap data):
 * read, not drawn, to tell whether a selection is built-up land. */
export const LANDUSE_SOURCE: VectorSourceSpecification = {
  type: "vector", url: "https://tiles.openfreemap.org/planet",
  attribution: "© OpenMapTiles © OpenStreetMap contributors",
};

export const FIELD_GUIDE_SOURCE: VectorSourceSpecification = {
  type: "vector",
  url: "pmtiles://https://data.source.coop/ftw/global-data-2e/vector/2025/fields-2025.pmtiles",
  attribution: '<a href="https://source.coop/ftw/global-data-2e">Fields of The World 2025</a> (CC BY 4.0)',
};

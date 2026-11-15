/** MapLibre globe: Blue Marble base, res-3 globe cells, res-5 on zoom,
 * center reticle, debounced panel updates, reduced-motion aware. */
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cellToBoundary, latLngToCell } from "h3-js";
import { DEFAULT_VIEW } from "../../config";

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" +
  "BlueMarble_NextGeneration/default/2004-08/" +
  "GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";

const BASE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    marble: { type: "raster", tiles: [GIBS], tileSize: 256, maxzoom: 8,
      attribution: "NASA GIBS / Blue Marble" },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0a0f1c" } },
    { id: "marble", type: "raster", source: "marble" },
  ],
};

export function hexGeoJSON(cells: Map<string, number>): GeoJSON.FeatureCollection {
  const feats: GeoJSON.Feature[] = [];
  for (const [h, v] of cells) {
    try {
      const ring = cellToBoundary(h).map(([la, lo]) => [lo, la]);
      // skip cells that wrap the antimeridian/poles: flat GeoJSON
      // renders them as artifacts (bands, stray hexagons)
      const lons = ring.map((p) => p[0]);
      if (Math.max(...lons) - Math.min(...lons) > 180) continue;
      feats.push({
        type: "Feature",
        properties: { h3: h, n: v },
        geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] },
      });
    } catch { /* skip malformed cell */ }
  }
  return { type: "FeatureCollection", features: feats };
}

export interface GlobeHandle {
  flyTo(lat: number, lon: number, zoom?: number, padBottom?: number): void;
  setCells(cells: Map<string, number>, colorExpr: unknown): void;
  setOutline(cells: string[], color?: string): void;
  setDraft(ring: [number, number][] | null): void;
  onClick(cb: ((lat: number, lon: number) => void) | null): void;
  onMove(cb: (lat: number, lon: number, zoom: number,
              bbox: [number, number, number, number]) => void): void;
  center(): { lat: number; lon: number; zoom: number };
  bounds(): [number, number, number, number];
  spin(enabled: boolean): void;
  destroy(): void;
}

export function useGlobe(
    ref: React.RefObject<HTMLDivElement | null>,
    onReady: (h: GlobeHandle) => void) {
  const handleRef = useRef<GlobeHandle | null>(null);
  useEffect(() => {
    if (!ref.current || handleRef.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: BASE_STYLE,
        center: [DEFAULT_VIEW.lon, DEFAULT_VIEW.lat],
        zoom: DEFAULT_VIEW.zoom,
        // @ts-expect-error maplibre v5 globe projection
        projection: { type: "globe" },
        attributionControl: { compact: true },
      });
    } catch {
      return; // WebGL unavailable
    }
    map.on("load", () => {
      map.addSource("cells", { type: "geojson",
        data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "cells-fill", type: "fill", source: "cells",
        paint: { "fill-color": "#e0532a", "fill-opacity": 0.55 },
      });
      map.addLayer({
        id: "cells-line", type: "line", source: "cells",
        paint: { "line-color": "#e0532a", "line-opacity": 0.8,
          "line-width": 0.6 },
      });
      map.addSource("outline", { type: "geojson",
        data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "outline-line", type: "line", source: "outline",
        paint: { "line-color": "#ffffff", "line-width": 1.4,
          "line-opacity": 0.9 },
      });
      map.addSource("draft", { type: "geojson",
        data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "draft-fill", type: "fill", source: "draft",
        paint: { "fill-color": "#1a56db", "fill-opacity": 0.2 },
      });
      map.addLayer({
        id: "draft-line", type: "line", source: "draft",
        paint: { "line-color": "#1a56db", "line-width": 2 },
      });
    });

    let clickCb: ((lat: number, lon: number) => void) | null = null;
    map.on("click", (e) => {
      clickCb?.(e.lngLat.lat, e.lngLat.lng);
    });

    let moveCb: ((lat: number, lon: number, zoom: number,
                  bbox: [number, number, number, number]) => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    map.on("moveend", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!moveCb) return;
        const c = map.getCenter();
        const b = map.getBounds();
        moveCb(c.lat, c.lng, map.getZoom(),
          [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      }, 300);
    });

    let spinning: ReturnType<typeof setInterval> | null = null;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const h: GlobeHandle = {
      flyTo(lat, lon, zoom = 6, padBottom = 0) {
        // padBottom keeps the target above a bottom sheet on mobile
        map.flyTo({ center: [lon, lat], zoom, duration: 1600,
                    padding: { bottom: padBottom } });
      },
      setCells(cells, colorExpr) {
        const src = map.getSource("cells") as maplibregl.GeoJSONSource | undefined;
        src?.setData(hexGeoJSON(cells));
        if (map.getLayer("cells-fill") && colorExpr) {
          map.setPaintProperty("cells-fill", "fill-color", colorExpr);
          map.setPaintProperty("cells-line", "line-color", colorExpr);
        }
      },
      setOutline(cells, color = "#ffffff") {
        const src = map.getSource("outline") as maplibregl.GeoJSONSource | undefined;
        src?.setData(hexGeoJSON(new Map(cells.map((c) => [c, 1]))));
        if (map.getLayer("outline-line"))
          map.setPaintProperty("outline-line", "line-color", color);
      },
      setDraft(ring) {
        const src = map.getSource("draft") as maplibregl.GeoJSONSource | undefined;
        if (!src) return;
        src.setData(!ring || ring.length < 3
          ? { type: "FeatureCollection", features: [] }
          : {
              type: "FeatureCollection",
              features: [{
                type: "Feature", properties: {},
                geometry: { type: "Polygon",
                  coordinates: [[...ring.map(([la, lo]) => [lo, la]),
                    [ring[0][1], ring[0][0]]]] },
              }],
            });
      },
      onClick(cb) { clickCb = cb; },
      onMove(cb) { moveCb = cb; },
      center() {
        const c = map.getCenter();
        return { lat: c.lat, lon: c.lng, zoom: map.getZoom() };
      },
      bounds() {
        const b = map.getBounds();
        return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      },
      spin(enabled) {
        if (spinning) { clearInterval(spinning); spinning = null; }
        if (!enabled || reduce) return;
        spinning = setInterval(() => {
          map.setCenter([map.getCenter().lng + 0.15, map.getCenter().lat]);
        }, 50);
      },
      destroy() { map.remove(); handleRef.current = null; },
    };
    handleRef.current = h;
    onReady(h);

    // keyboard: arrows rotate, +/- zoom
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") map.panBy([-60, 0]);
      else if (e.key === "ArrowRight") map.panBy([60, 0]);
      else if (e.key === "ArrowUp") map.panBy([0, -60]);
      else if (e.key === "ArrowDown") map.panBy([0, 60]);
      else if (e.key === "+") map.zoomIn();
      else if (e.key === "-") map.zoomOut();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      map.remove();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return handleRef;
}

export { latLngToCell };

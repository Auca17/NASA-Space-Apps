/** MapLibre map: Blue Marble base, res-3 overview cells, res-5 on zoom,
 * center reticle, debounced panel updates, reduced-motion aware. */
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { cellToBoundary, latLngToCell } from "h3-js";
import { DEFAULT_VIEW } from "../../config";
import {
  BASE_STYLE, FALLBACK_LAYERS, FIELD_GUIDE_SOURCE, MAX_TILE_ERRORS,
  RASTER_LAYERS, RASTER_TILES,
  needsFallback, newTileHealth, recordTileError, recordTileOk,
  retryDelayMs,
} from "./baseStyle";
import type { Landuse, LatLon, Poly } from "../../domain/selection";
import type { Road } from "../../domain/split";
import { edgeMidpoints } from "../../domain/parcelsGeo";
import { makeFillOverlay, type FillOverlay } from "./fillOverlay";

/** Land use read from the map's vector tiles around a selection. */
export type LandUseRead = { landuse: Landuse[]; buildings: LatLon[];
                            roads: Road[]; zoom: number;
                            /** visible map bounds [w, s, e, n] */
                            bounds: [number, number, number, number] };

/** Shapes drawn over the map during selection review and in Mis campos. */
export type ShapeKind = "piece-on" | "piece-off" | "excluded" | "original"
  | "field" | "zone" | "moisture" | "moisture-selected" | "moisture-missing" | "analysis-mask"
  | "contour" | "parcel" | "parcel-selected" | "parcel-off" | "review";
/** `label`: text drawn on the shape (plot names). */
export type Shape = { geom: Poly; kind: ShapeKind; color?: string;
                      label?: string };


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
  /** `bottomPx`: height covered by a bottom panel; the point is centred
   * in the visible part of the map. */
  flyTo(lat: number, lon: number, zoom?: number, bottomPx?: number): void;
  setCells(cells: Map<string, number>, colorExpr: unknown): void;
  setOutline(cells: string[], color?: string): void;
  setDraft(ring: LatLon[] | null, showVertices?: boolean,
           showMidpoints?: boolean): void;
  /** Location reference (search hit, GPS, coordinates); null clears it. */
  setMarker(p: [number, number] | null): void;
  /** Zoom so the whole ring is visible. */
  fitRing(ring: [number, number][], bottomPx?: number): void;
  /** OpenStreetMap land use + buildings from the vector tiles in view;
   * null when the tiles could not be read in time. */
  readLandUse(timeoutMs?: number, minZoom?: number): Promise<LandUseRead | null>;
  /** Replace the review/field shapes; [] clears them. */
  setShapes(shapes: Shape[]): void;
  setFieldBasemap(active: boolean, satellite: boolean, guide: boolean): void;
  /** Per-mode zoom limits (world views shallow, field view deep). */
  setZoomRange(min: number, max: number): void;
  zoomBy(delta: number, bottomPx?: number): void;
  /** Screen pixel (relative to the map) -> [lat, lon]. */
  unproject(x: number, y: number): [number, number];
  /** Pan off while a vertex is dragged on the open field outline;
   * always call with `true` again when the gesture ends. */
  setPanEnabled(on: boolean): void;
  onClick(cb: ((lat: number, lon: number) => void) | null): void;
  /** Adds a listener for the end of each map move; returns its removal. */
  onMove(cb: (lat: number, lon: number, zoom: number,
              bbox: [number, number, number, number]) => void): () => void;
  center(): { lat: number; lon: number; zoom: number };
  bounds(): [number, number, number, number];
  destroy(): void;
}

export function useGlobe(
    ref: React.RefObject<HTMLDivElement | null>,
    onReady: (h: GlobeHandle) => void,
    onUnavailable?: () => void) {
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
        bearing: 0,
        pitch: 0,
        maxPitch: 0,
        dragRotate: false,
        touchPitch: false,
        pitchWithRotate: false,
        // one Earth only, bounded near the poles so panning never
        // shows a wrapped world or empty band beyond the imagery
        renderWorldCopies: false,
        maxBounds: [[-179.9, -75], [179.9, 85]],
        minZoom: 1.5,
        maxZoom: 9,
        attributionControl: { compact: true },
      });
    } catch {
      onUnavailable?.();
      return;
    }
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();

    let fieldActive = false;
    let fieldSatellite = true;
    let guideEnabled = false;
    let ready = false;
    let pendingShapes: Shape[] = [];
    let protocol: Protocol | undefined;
    const shapesFill = makeFillOverlay("shapes-fill");
    const draftFill = makeFillOverlay("draft-fill");
    /** Fields of The World source for the optional dashed visual guide
     * (plot detection reads the archive directly, see domain/ftw.ts). */
    const ensureGuide = () => {
      if (map.getSource("field-guide")) return;
      protocol = new Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
      map.addSource("field-guide", FIELD_GUIDE_SOURCE);
      map.addLayer({
        id: "field-guide-line", type: "line", source: "field-guide",
        "source-layer": "fields", minzoom: 13,
        layout: { visibility: "none" },
        paint: { "line-color": "#43edd5", "line-width": 2,
          "line-opacity": 0.9, "line-dasharray": [2, 1] },
      }, "shapes-fill");
    };
    const updateFieldBasemap = () => {
      if (!ready) return;
      if (map.getLayer("field-overview")) {
        map.setLayoutProperty("field-overview", "visibility", fieldActive ? "visible" : "none");
      }
      const visibility = fieldActive && fieldSatellite ? "visible" : "none";
      for (const layer of ["field-satellite", "field-roads", "field-road-labels"]) {
        if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", visibility);
      }
      const showGuide = fieldActive && guideEnabled;
      if (showGuide) ensureGuide();
      if (map.getLayer("field-guide-line")) {
        map.setLayoutProperty("field-guide-line", "visibility", showGuide ? "visible" : "none");
      }
    };
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
      // invisible OpenMapTiles layers: they make MapLibre load the
      // landuse/building tiles that the urban check reads. The `omt`
      // source itself lives in BASE_STYLE so the fallback base can use
      // it from the first frame.
      map.addLayer({ id: "omt-landuse", type: "fill", source: "omt",
        "source-layer": "landuse", minzoom: 11,
        paint: { "fill-opacity": 0 } });
      map.addLayer({ id: "omt-roads", type: "line", source: "omt",
        "source-layer": "transportation", minzoom: 11,
        paint: { "line-opacity": 0 } });
      map.addLayer({ id: "field-roads", type: "line", source: "omt",
        "source-layer": "transportation", minzoom: 12,
        layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        filter: ["in", ["get", "class"], ["literal",
          ["motorway", "trunk", "primary", "secondary", "tertiary",
            "minor", "service", "track"]]],
        paint: { "line-color": "#fff3d2", "line-opacity": 0.72,
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.7, 17, 1.8] } });
      map.addLayer({ id: "field-road-labels", type: "symbol", source: "omt",
        "source-layer": "transportation_name", minzoom: 13,
        layout: { visibility: "none", "symbol-placement": "line",
          "text-field": ["coalesce", ["get", "name"], ["get", "ref"], ""],
          "text-font": ["Noto Sans Regular"], "text-size": 11 },
        paint: { "text-color": "#fff7e8", "text-halo-color": "#222",
          "text-halo-width": 1.5 } });
      map.addLayer({ id: "omt-building", type: "fill", source: "omt",
        "source-layer": "building", minzoom: 13,
        paint: { "fill-opacity": 0 } });
      map.addSource("marker", { type: "geojson",
        data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "marker-halo", type: "circle", source: "marker",
        paint: { "circle-radius": 14, "circle-color": "#1a56db",
          "circle-opacity": 0.2 },
      });
      map.addLayer({
        id: "marker-dot", type: "circle", source: "marker",
        paint: { "circle-radius": 6, "circle-color": "#1a56db",
          "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
      });
      map.addSource("shapes", { type: "geojson",
        data: { type: "FeatureCollection", features: [] } });
      /* Fills do NOT go through the GeoJSON pipeline: geojson-vt clips
       * polygons per tile and its polygon clip is broken at high zoom
       * (rectangular tile blocks instead of the outline). The custom
       * overlay layers triangulate and draw the fills directly; the
       * vector layers below only carry lines/points. Exception: the
       * moisture-missing hatch below is a pure decoration over the
       * already-correct flat fill, so a broken tile clip there only
       * distorts the pattern, never hides or invents data. */
      map.addLayer(shapesFill);
      const stripes = new Uint8Array(8 * 8 * 4);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if ((x + y) % 8 < 2) stripes.set([235, 239, 242, 190], (y * 8 + x) * 4);
        }
      }
      map.addImage("unobserved-hatch", { width: 8, height: 8, data: stripes });
      map.addLayer({ id: "shapes-missing", type: "fill", source: "shapes",
        filter: ["==", ["get", "kind"], "moisture-missing"],
        paint: { "fill-pattern": "unobserved-hatch" } });
      map.addLayer({ id: "shapes-line", type: "line", source: "shapes",
        paint: { "line-color": ["get", "line"], "line-width": ["get", "w"] } });
      map.addLayer({ id: "shapes-label", type: "symbol", source: "shapes",
        filter: ["has", "label"],
        layout: { "text-field": ["get", "label"], "text-size": 13,
                  "text-font": ["Noto Sans Bold"], "text-allow-overlap": false },
        paint: { "text-color": "#ffffff", "text-halo-color": "#0a0d0b",
                 "text-halo-width": 1.6 } });
      map.addSource("draft", { type: "geojson",
        data: { type: "FeatureCollection", features: [] } });
      map.addLayer(draftFill);
      map.addLayer({
        id: "draft-line", type: "line", source: "draft",
        paint: { "line-color": "#b7e6ff", "line-width": 3 },
      });
      map.addLayer({
        id: "draft-corners", type: "circle", source: "draft",
        filter: ["==", ["geometry-type"], "Point"],
        // vertices solid, midpoint handles smaller and lighter
        paint: { "circle-color": "#1a56db",
          "circle-radius": ["case", ["==", ["get", "k"], "mid"], 3.5, 5],
          "circle-opacity": ["case", ["==", ["get", "k"], "mid"], 0.55, 1],
          "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" },
      });
      ready = true;
      updateFieldBasemap();
      handleRef.current?.setShapes(pendingShapes);
    });

    // Task 30 — tile health: raster sources die quietly on rural 4G.
    // After MAX_TILE_ERRORS a source counts as dead; the neutral
    // land/water fallback paints under the rasters and the dead source
    // is asked to reload with exponential backoff. The `bg` background
    // plus this fallback mean the canvas is never left blank.
    const health = newTileHealth();
    let fallbackOn = false;
    let removed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const hiddenByFallback = new Set<string>();
    const applyFallback = () => {
      if (removed) return;
      const want = needsFallback(health);
      try {
        if (want !== fallbackOn) {
          fallbackOn = want;
          for (const id of FALLBACK_LAYERS) {
            if (map.getLayer(id)) {
              map.setLayoutProperty(id, "visibility",
                want ? "visible" : "none");
            }
          }
        }
        /* Hide the dead source's own layers too: an aborted tile can
         * leave the painter binding a texture that never loaded, which
         * crashes maplibre's render loop. Restore on recovery. */
        for (const [src, layers] of Object.entries(RASTER_LAYERS)) {
          const dead = (health.errors[src] ?? 0) >= MAX_TILE_ERRORS;
          for (const l of layers) {
            if (dead) {
              if (map.getLayer(l) && !hiddenByFallback.has(l) &&
                  map.getLayoutProperty(l, "visibility") !== "none") {
                hiddenByFallback.add(l);
                map.setLayoutProperty(l, "visibility", "none");
              }
            } else if (hiddenByFallback.delete(l)) {
              if (map.getLayer(l)) {
                map.setLayoutProperty(l, "visibility", "visible");
              }
            }
          }
        }
      } catch { /* style mid-mutation or map gone */ }
    };
    /* `error` fires while maplibre is mid-render; mutating the style
     * synchronously there can race the painter, so the visibility
     * toggle is deferred to the next frame. */
    const queueFallback = () => {
      requestAnimationFrame(() => applyFallback());
    };
    const scheduleRetry = () => {
      if (retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        for (const [id, tiles] of Object.entries(RASTER_TILES)) {
          if ((health.errors[id] ?? 0) === 0) continue;
          try {
            (map.getSource(id) as
              { setTiles?: (t: string[]) => void } | undefined)
              ?.setTiles?.(tiles);
          } catch { /* source removed or already reloading */ }
        }
        health.retries += 1;
        if (needsFallback(health)) scheduleRetry();
      }, retryDelayMs(health.retries));
    };
    map.on("error", (e) => {
      const id = (e as { sourceId?: string }).sourceId;
      if (id && recordTileError(health, id)) queueFallback();
      if (id && (id in RASTER_TILES)) scheduleRetry();
    });
    map.on("sourcedata", (e) => {
      const ev = e as { sourceId?: string; sourceDataType?: string };
      if (ev.sourceId && ev.sourceDataType === "content" &&
          recordTileOk(health, ev.sourceId)) {
        queueFallback();
      }
    });

    let clickCb: ((lat: number, lon: number) => void) | null = null;
    map.on("click", (e) => {
      clickCb?.(e.lngLat.lat, e.lngLat.lng);
    });

    const moveCbs = new Set<(lat: number, lon: number, zoom: number,
                  bbox: [number, number, number, number]) => void>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    map.on("moveend", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const c = map.getCenter();
        const b = map.getBounds();
        for (const cb of moveCbs) {
          cb(c.lat, c.lng, map.getZoom(),
             [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
        }
      }, 300);
    });

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const h: GlobeHandle = {
      flyTo(lat, lon, zoom = 6, bottomPx = 0) {
        map.flyTo({ center: [lon, lat], zoom, duration: 1600,
                    offset: [0, -bottomPx / 2] });
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
      setDraft(ring, showVertices = true, showMidpoints = true) {
        const src = map.getSource("draft") as maplibregl.GeoJSONSource | undefined;
        if (!src) return;
        const coordinates = (ring ?? []).map(([lat, lon]) => [lon, lat]);
        const features: GeoJSON.Feature[] = [];
        let fill: Parameters<FillOverlay["setPolys"]>[0] = [];
        if (coordinates.length >= 3 && showVertices) {
          features.push({ type: "Feature", properties: {},
            geometry: { type: "Polygon", coordinates: [[...coordinates, coordinates[0]]] } });
          fill = [{ rings: [ring!], fill: "#1a56db", op: 0.2 }];
        } else if (coordinates.length >= 2) {
          features.push({ type: "Feature", properties: {},
            geometry: { type: "LineString", coordinates } });
        }
        draftFill.setPolys(fill);
        if (showVertices && coordinates.length) {
          features.push({ type: "Feature", properties: { k: "vert" },
            geometry: { type: "MultiPoint", coordinates } });
          // midpoint handles on every drawn edge (the closing edge is
          // drawn only when the preview is a polygon)
          const mids = showMidpoints
            ? edgeMidpoints(ring ?? [], coordinates.length >= 3)
                .map((m) => [m.at[1], m.at[0]])
            : [];
          if (mids.length) {
            features.push({ type: "Feature", properties: { k: "mid" },
              geometry: { type: "MultiPoint", coordinates: mids } });
          }
        }
        src.setData({ type: "FeatureCollection", features });
      },
      setMarker(p) {
        const src = map.getSource("marker") as maplibregl.GeoJSONSource | undefined;
        src?.setData({ type: "FeatureCollection", features: p ? [{
          type: "Feature", properties: {},
          geometry: { type: "Point", coordinates: [p[1], p[0]] } }] : [] });
      },
      fitRing(ring, bottomPx = 0) {
        if (ring.length < 2) return;
        map.resize();
        const la = ring.map((p) => p[0]), lo = ring.map((p) => p[1]);
        map.fitBounds([[Math.min(...lo), Math.min(...la)],
                       [Math.max(...lo), Math.max(...la)]],
          { padding: { top: 60, left: 40, right: 40, bottom: 40 + bottomPx },
            maxZoom: 16, duration: reduce ? 0 : 800 });
      },
      async readLandUse(timeoutMs = 8000, minZoom = 13) {
        const t0 = Date.now();
        // wait until the camera settled and the landuse tiles loaded
        while (Date.now() - t0 < timeoutMs) {
          if (!map.isMoving() && map.getSource("omt") &&
              map.isSourceLoaded("omt")) break;
          await new Promise((r) => setTimeout(r, 200));
        }
        if (!map.getSource("omt") || !map.isSourceLoaded("omt") ||
            map.getZoom() < minZoom) return null;
        const toRings = (g: GeoJSON.Geometry): LatLon[][] =>
          g.type === "Polygon"
            ? [g.coordinates[0].map(([x, y]) => [y, x] as LatLon)]
            : g.type === "MultiPolygon"
              ? g.coordinates.map((p) => p[0].map(([x, y]) => [y, x] as LatLon))
              : [];
        const toLines = (g: GeoJSON.Geometry): LatLon[][] =>
          g.type === "LineString"
            ? [g.coordinates.map(([x, y]) => [y, x] as LatLon)]
            : g.type === "MultiLineString"
              ? g.coordinates.map((l) => l.map(([x, y]) => [y, x] as LatLon))
              : [];
        try {
          const tr = map.querySourceFeatures("omt",
            { sourceLayer: "transportation" });
          const b = map.getBounds();
          const roads: Road[] = tr.flatMap((f) => toLines(f.geometry).map(
            (line) => ({ cls: String(f.properties?.class ?? ""), line })));
          const lu = map.querySourceFeatures("omt", { sourceLayer: "landuse" });
          const bd = map.querySourceFeatures("omt", { sourceLayer: "building" });
          return {
            roads, zoom: map.getZoom(),
            bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
            landuse: lu.map((f) => ({ cls: String(f.properties?.class ?? ""),
                                      rings: toRings(f.geometry) })),
            buildings: bd.flatMap((f) => toRings(f.geometry).slice(0, 1))
              .map((r) => [r.reduce((a, p) => a + p[0], 0) / r.length,
                           r.reduce((a, p) => a + p[1], 0) / r.length] as LatLon),
          };
        } catch { return null; }
      },
      setShapes(shapes) {
        pendingShapes = shapes;
        if (!ready) return;
        const st: Record<ShapeKind, { fill: string; op: number;
                                       line: string; w: number }> = {
          "piece-on": { fill: "#2e7d32", op: 0.35, line: "#1b5e20", w: 2 },
          "piece-off": { fill: "#9e9e9e", op: 0.25, line: "#616161", w: 1 },
          excluded: { fill: "#c62828", op: 0.45, line: "#c62828", w: 0.5 },
          original: { fill: "#000000", op: 0, line: "#1a56db", w: 1.5 },
          field: { fill: "#1a56db", op: 0.12, line: "#1a56db", w: 2 },
          zone: { fill: "#f9a825", op: 0.35, line: "#e65100", w: 1.5 },
          moisture: { fill: "#8eaa62", op: 0.55, line: "#faf4e8", w: 0.5 },
          "moisture-selected": { fill: "#8eaa62", op: 0.75, line: "#fff", w: 2.5 },
          "moisture-missing": { fill: "#8c9297", op: 0.25, line: "#e1e5e7", w: 0.6 },
          "analysis-mask": { fill: "#10150f", op: 1, line: "#10150f", w: 0 },
          contour: { fill: "#000000", op: 0, line: "#ffffff", w: 2.5 },
          parcel: { fill: "#43edd5", op: 0.18, line: "#f4fffd", w: 2 },
          "parcel-selected": { fill: "#ffd54f", op: 0.35, line: "#ffd54f", w: 3.5 },
          "parcel-off": { fill: "#9e9e9e", op: 0.12, line: "#bdbdbd", w: 1 },
          review: { fill: "#ff9800", op: 0.22, line: "#ffb74d", w: 1.2 },
        };
        const src = map.getSource("shapes") as maplibregl.GeoJSONSource | undefined;
        const good = shapes.filter(
          (sh) => sh.geom.length && sh.geom[0].length >= 3);
        src?.setData({ type: "FeatureCollection", features: good
          .map((sh) => ({ type: "Feature",
            properties: { ...st[sh.kind], kind: sh.kind,
                          ...(sh.color ? { fill: sh.color } : {}),
                          ...(sh.label ? { label: sh.label } : {}) },
            // outer ring + holes, each closed, [lon, lat]
            geometry: { type: "Polygon", coordinates: sh.geom
              .filter((ring) => ring.length >= 3)
              .map((ring) => [...ring.map(([la, lo]) => [lo, la]),
                              [ring[0][1], ring[0][0]]]) } })) });
        shapesFill.setPolys(good.map((sh) => ({
          rings: sh.geom,
          fill: sh.color ?? st[sh.kind].fill, op: st[sh.kind].op })));
      },
      setFieldBasemap(active, satellite, guide) {
        fieldActive = active;
        fieldSatellite = satellite;
        guideEnabled = guide;
        updateFieldBasemap();
      },
      setZoomRange(min, max) {
        map.setMinZoom(min); map.setMaxZoom(max);
      },
      zoomBy(delta, bottomPx = 0) {
        const { clientWidth, clientHeight } = map.getContainer();
        const around = map.unproject([clientWidth / 2, (clientHeight - bottomPx) / 2]);
        map.easeTo({ zoom: map.getZoom() + delta, around, duration: reduce ? 0 : 250 });
      },
      unproject(x, y) {
        const p = map.unproject([x, y]);
        return [p.lat, p.lng];
      },
      setPanEnabled(on) {
        if (on) map.dragPan.enable(); else map.dragPan.disable();
      },
      onClick(cb) { clickCb = cb; },
      onMove(cb) { moveCbs.add(cb); return () => { moveCbs.delete(cb); }; },
      center() {
        const c = map.getCenter();
        return { lat: c.lat, lon: c.lng, zoom: map.getZoom() };
      },
      bounds() {
        const b = map.getBounds();
        return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      },
      destroy() {
        removed = true;
        if (retryTimer) clearTimeout(retryTimer);
        map.remove(); handleRef.current = null;
      },
    };
    handleRef.current = h;
    onReady(h);

    return () => {
      removed = true;
      if (timer) clearTimeout(timer);
      map.remove();
      if (protocol) maplibregl.removeProtocol("pmtiles");
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return handleRef;
}

export { latLngToCell };

export function MapLoader({ container, onReady, onUnavailable }: {
  container: React.RefObject<HTMLDivElement | null>;
  onReady: (map: GlobeHandle) => void;
  onUnavailable: () => void;
}) {
  useGlobe(container, onReady, onUnavailable);
  return null;
}

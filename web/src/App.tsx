import { Suspense, lazy, useRef, useState, useCallback, useEffect } from "react";
import { DrawSession, activateDrawSession, deactivateDrawSession }
  from "./features/field/drawEdit";
import { useT } from "./i18n";
import { APP_NAME, DEFAULT_VIEW, WORLD_VIEW } from "./config";
import { WindLogo } from "./components/WindLogo";
import { Welcome } from "./features/welcome/Welcome";
import { MethodsDrawer } from "./features/methods/MethodsDrawer";
import { EmergencyBlock } from "./features/emergency/EmergencyBlock";
import { BottomSheet } from "./components/ui";
import type { GlobeHandle, Shape } from "./features/globe/GlobeView";
import { moistureGeometry, MOISTURE_COLORS } from "./domain/moisture";
import { cellsInCircle, circleRing } from "./domain/h3area";
import { apiRisk, orinLots } from "./api";
import type { OrinLots, MoistureZone } from "./api/types";
import { drawStatus } from "./domain/clarity";
import { FieldPicker, type DrawMode } from "./features/field/FieldPicker";
import { SelectionReview, AdjustPanel, type LandCheck, type Adjust }
  from "./features/field/SelectionReview";
import { FieldsList } from "./features/field/FieldsPanel";
import { useAutoCropSplit, cropZonesFor } from "./features/field/autoCropSplit";
import { ParcelPanel, type Proposal } from "./features/field/ParcelPanel";
import { FieldSummary } from "./features/field/FieldSummary";
import { summaryUnits, type SummaryUnit } from "./domain/summary";
import { readFtw } from "./domain/ftw";
import { useAreaLabel } from "./features/field/areaLabel";
import { FreehandLayer } from "./features/field/FreehandLayer";
import type { AnalysisTarget } from "./features/field/FieldLens";
import type { ParcelInput, ParcelsResponse } from "./domain/parcels";
import {
  classifyUrban, multiPoints, pointInMulti, type LatLon, type Multi,
} from "./domain/selection";
import { splitSelection, clipZone, detectParcels, ROAD_HALF_WIDTH } from "./domain/split";
import { nearestMidpoint, nearestVertex } from "./domain/parcelsGeo";
import {
  isDemoHash, MENDOZA_BOUNDARY, MENDOZA_CACHED, MENDOZA_ECON,
  MENDOZA_NEEDS, MENDOZA_PARCELS, MENDOZA_PROFILE,
} from "./features/demo/mendozaFarm";
import { GuidedTour } from "./features/demo/GuidedTour";
import { tourSeen } from "./features/demo/demoTour";
import {
  loadFields, saveField, renameField, deleteField, addZone, updateZone,
  addZones, setFieldCrop, markCropSplit,
  fieldHa, acceptDetection, discardParcel, replaceParcel, zoneHa,
  type Field, type Zone,
} from "./domain/fields";

/** Field marked on the map, waiting for the user's confirmation.
 * `checked`: land use already verified (pieces from Ajustar selección). */
type Selection = { geom: Multi; approx: boolean; original: LatLon[];
                   checked?: boolean };
/** What a finished drawing is for: the field itself or a crop zone. */
type Target = { kind: "selection" } | { kind: "zone"; fieldId: string }
  | { kind: "fix"; fieldId: string; zoneId: string };
type FieldsView = null | "list" | { id: string };

/** Zoom from which single plots can be told apart on the street map. */
const DRAW_ZOOM = 14;
const ARGENTINA_FRAME: LatLon[] = [[-55.2, -73.7], [-21.7, -53.5]];

function UnavailableMap({ onUnavailable }: { onUnavailable: () => void }) {
  useEffect(onUnavailable, [onUnavailable]);
  return null;
}

const MapLoader = lazy(() => import("./features/globe/GlobeView")
  .then((m) => ({ default: m.MapLoader }))
  .catch(() => ({ default: UnavailableMap })));
const HistoricControls = lazy(() => import("./features/fire/HistoricControls")
  .then((m) => ({ default: m.HistoricControls })));
const AreaPanel = lazy(() =>
  import("./features/fire/AreaPanel").then((m) => ({ default: m.AreaPanel })));
const LiveControls = lazy(() =>
  import("./features/live/LiveMode").then((m) => ({ default: m.LiveControls })));
const FieldPanel = lazy(() =>
  import("./features/field/FieldLens").then((m) => ({ default: m.FieldPanel })));
const ParcelsWizard = lazy(() =>
  import("./features/parcels/ParcelsWizard")
    .then((m) => ({ default: m.ParcelsWizard })));
const ParcelsMapLayer = lazy(() =>
  import("./features/parcels/ParcelsMapLayer")
    .then((m) => ({ default: m.ParcelsMapLayer })));

type Mode = "welcome" | "fire" | "live" | "field";

function analysisMask(geom: Multi): Shape[] {
  const oriented = (ring: LatLon[], positive: boolean) => {
    const sign = ring.reduce((area, [lat, lon], index) => {
      const [y, x] = ring[(index + 1) % ring.length];
      return area + lon * y - x * lat;
    }, 0);
    return (sign > 0) === positive ? ring : [...ring].reverse();
  };
  const world: LatLon[] = [[-85, -179.99], [-85, 179.99],
    [85, 179.99], [85, -179.99]];
  return [
    { kind: "analysis-mask", geom: [world, ...geom.map((p) => oriented(p[0], false))] },
    ...geom.flatMap((p) => p.slice(1).map((hole): Shape =>
      ({ kind: "analysis-mask", geom: [oriented(hole, true)] }))),
  ];
}

export default function App() {
  const { t, lang, setLang } = useT();
  const areaLabel = useAreaLabel();
  const [mode, setModeState] = useState<Mode>("field");
  // the map callbacks are registered once: they read the mode from a ref
  const modeRef = useRef<Mode>("field");
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const onMapUnavailable = useCallback(() => setMapUnavailable(true), []);
  const [locationAccuracy, setLocationAccuracy] = useState<{
    lat: number; lon: number; metres: number;
  } | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [locationState, setLocationState] = useState<"idle" | "loading" | "denied">("idle");
  const locationRequest = useRef(0);
  const pendingFieldLocation = useRef<{ lat: number; lon: number } | null>(null);
  const [recommendationArea, setRecommendationArea] = useState<Multi | null>(null);
  const [nearbyLandUse, setNearbyLandUse] = useState<{
    geom: Multi; status: "urban" | "checked" | "unavailable";
  } | null>(null);
  const [moistureZones, setMoistureZones] = useState<MoistureZone[]>([]);
  const [selectedMoisture, selectMoisture] = useState<number | null>(null);
  const zoneClick = useRef<(point: LatLon) => void>(() => {});
  const showMoisture = useCallback((zones: MoistureZone[]) => {
    setMoistureZones(zones);
    selectMoisture(null);
  }, []);
  const setMode = (m: Mode) => {
    if (modeRef.current !== m) {
      locationRequest.current++;
      setLocationState("idle");
    }
    modeRef.current = m;
    setModeState(m);
    setStorageError(false);
  };
  const [globe, setGlobe] = useState<GlobeHandle | null>(null);
  const [area, setArea] = useState<{ lat: number; lon: number; cells: string[] } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_VIEW.zoom);
  const [satellite, setSatellite] = useState(true);
  const [fieldGuide, setFieldGuide] = useState(false);
  const [draw, setDrawState] = useState<DrawMode>("none");
  const [movingMap, setMovingMapState] = useState(false);
  const [draft, setDraftState] = useState<[number, number][]>([]);
  // Map clicks read these refs: state updaters with side effects run
  // twice under StrictMode, which added every tapped point twice.
  const drawRef = useRef<DrawMode>("none");
  const movingMapRef = useRef(false);
  const draftRef = useRef<[number, number][]>([]);
  const setMovingMap = (moving: boolean) => {
    movingMapRef.current = moving;
    setMovingMapState(moving);
  };
  const setDraw = (d: DrawMode) => {
    drawRef.current = d;
    setDrawState(d);
    setMovingMap(false);
  };
  /** One session owns the main field outline: every mutation updates
   * the React draft AND the map preview from the same simple ring, so
   * the fill can never diverge from the outline. */
  const [fieldSession] = useState(() => new DrawSession());
  const setDraft = (pts: [number, number][]) => {
    fieldSession.seed(pts, false);
  };
  /** The exact area sent to the diagnosis (also drawn on the map). */
  const [target, setTarget] = useState<AnalysisTarget | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [landCheck, setLandCheck] = useState<LandCheck>("checking");
  const [adjust, setAdjust] = useState<Adjust | null>(null);
  const [fields, setFields] = useState<Field[]>(() => loadFields());
  const [fieldsView, setFieldsView] = useState<FieldsView>("list");
  const [shownField, setShownField] = useState<string | null>(null);
  /** plot highlighted on the map: a confirmed plot id or "p<i>" for a
   * proposed one */
  const [selectedParcel, setSelectedParcel] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [summaryFor, setSummaryFor] = useState<string | null>(null);
  const [pendingZone, setPendingZone] =
    useState<{ geom: Multi; ha: number } | null>(null);
  const [freeError, setFreeError] = useState(false);
  const targetRef = useRef<Target>({ kind: "selection" });
  const [fieldOpen, setFieldOpen] = useState(false);
  /** The confirmed selection is being divided into parcels. */
  const [parcelsWizard, setParcelsWizard] = useState(false);
  /** Last parcels analysis: zones + per-parcel badges on the map. */
  const [parcelRes, setParcelRes] = useState<{
    res: ParcelsResponse; parcels: ParcelInput[] } | null>(null);
  /** Guided demo tour: opens once the demo result is on the screen. */
  const [demoTour, setDemoTour] = useState(false);
  /** #demo can fire before the map exists: the farm frame is queued
   * here and applied once the globe reports ready. */
  const demoFitPending = useRef(false);
  const [lots, setLots] = useState<OrinLots["features"]>([]);
  const [playingMonth, setPlayingMonth] = useState<string | null>(null);
  const [methodsOpen, setMethodsOpen] = useState(false);
  const [emergOpen, setEmergOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emergencyCountry, setEmergencyCountry] = useState<string | null>(null);
  const [view, setView] = useState<{ lat: number; lon: number; zoom: number;
    bbox: [number, number, number, number] } | null>(null);
  const initialLocation = useRef<LatLon | null>(null);
  useEffect(() => {
    if (!emergOpen) return;
    let active = true;
    setEmergencyCountry(null);
    const center = view ?? globe?.center() ?? DEFAULT_VIEW;
    apiRisk(center.lat, center.lon).then((risk) => {
      if (active) setEmergencyCountry(risk?.country ?? null);
    });
    return () => { active = false; };
  }, [emergOpen, globe, view]);
  const globeRef = useRef<GlobeHandle | null>(null);
  const mapDiv = useRef<HTMLDivElement>(null);
  /** vertex-drag gesture on the open field outline (see the effect
   * below `onGlobeReady`); a real drag swallows the trailing click. */
  const dragRef = useRef({ dragging: false, moved: false,
                         panWasOff: false,
                         downAt: [0, 0] as [number, number],
                         downLL: null as LatLon | null });
  const swallowClick = useRef(false);
  const frameArgentinaOnOpen = useRef(true);

  const fireArea = (lat: number, lon: number) =>
    setArea({ lat, lon, cells: cellsInCircle(lat, lon, 50) });

  const onGlobeReady = useCallback((h: GlobeHandle) => {
    globeRef.current = h;
    setGlobe(h);
    const fieldLoc = pendingFieldLocation.current;
    if (fieldLoc) {
      pendingFieldLocation.current = null;
      h.flyTo(fieldLoc.lat, fieldLoc.lon, DRAW_ZOOM + 1);
      h.setMarker([fieldLoc.lat, fieldLoc.lon]);
    }
    if (initialLocation.current && modeRef.current === "fire") {
      const [lat, lon] = initialLocation.current;
      h.flyTo(lat, lon, 7);
      initialLocation.current = null;
    }
    h.onMove((lat, lon, zoom, bbox) => {
      setZoom(zoom);
      setView({ lat, lon, zoom, bbox });
      if (modeRef.current === "fire") fireArea(lat, lon);
    });
    h.onClick((lat, lon) => {
      if (modeRef.current !== "field" || movingMapRef.current) return;
      const d = drawRef.current;
      if (d === "draw") {
        // a vertex/midpoint drag ends with a map click at the drop
        // point: swallow it so it doesn't add a stray vertex
        if (swallowClick.current) { swallowClick.current = false; return; }
        // same DrawSession as the parcel wizard: the tap lands where
        // the ring stays simple (never a bow tie)
        fieldSession.click([lat, lon], draftTolM());
      } else if (d === "point") {
        onShapeRef.current(circleApprox(lat, lon), true);
      } else if (d === "none") zoneClick.current([lat, lon]);
    });
  }, [fieldSession]);

  // 50 ha square-ish ring (circle approximation gives right area)
  const circleApprox = (lat: number, lon: number): [number, number][] => {
    const rM = Math.sqrt(500_000 / Math.PI); // 50 ha radius ~399 m
    const pts: [number, number][] = [];
    for (let i = 0; i < 24; i++) {
      const b = (i / 24) * 2 * Math.PI;
      const dLa = (rM / 111_320) * Math.cos(b);
      const dLo = (rM / (111_320 * Math.cos(lat * Math.PI / 180))) * Math.sin(b);
      pts.push([lat + dLa, lon + dLo]);
    }
    return pts;
  };

  /** Grab radius (~14 px) in metres for tap-near-vertex handling. */
  const draftTolM = (): number => {
    const el = mapDiv.current, g = globeRef.current;
    if (!el || !g) return 20;
    const r = el.getBoundingClientRect();
    const [la1, lo1] = g.unproject(r.width / 2, r.height / 2);
    const [la2, lo2] = g.unproject(r.width / 2 + 14, r.height / 2);
    return Math.max(5, Math.hypot((la2 - la1) * 111_000,
      (lo2 - lo1) * 111_000 * Math.cos((la1 * Math.PI) / 180)));
  };

  zoneClick.current = (point) => {
    if (!fieldOpen && fieldsView && fieldsView !== "list" && openField) {
      if (proposal?.status === "ready") {
        const i = proposal.detection.parcels.findIndex((p) => pointInMulti(point, [p.geom]));
        if (i !== -1) setSelectedParcel(`p${i}`);
        return;
      }
      const z = openField.zones.find((x) => pointInMulti(point, x.geom));
      setSelectedParcel(z ? z.id : null);
      return;
    }
    if (!fieldOpen) return;
    const hit = moistureZones.findIndex((z) => pointInMulti(point, moistureGeometry(z.geometry)));
    if (hit !== -1) selectMoisture(hit);
  };

  const analysisScreen = mode === "field" && fieldOpen && target !== null;
  const nearbyGeometry = target?.nearby ? recommendationArea ?? target.geom : null;
  useEffect(() => {
    if (!globe || !analysisScreen || !target) return;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => globe.fitRing(multiPoints(target.geom)));
    };
    const observer = new ResizeObserver(fit);
    if (mapDiv.current) observer.observe(mapDiv.current);
    fit();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [globe, analysisScreen, target]);

  useEffect(() => {
    if (!analysisScreen || !nearbyGeometry || !globe || !view || view.zoom < 12) return;
    const [w, s, e, n] = view.bbox;
    if (!multiPoints(nearbyGeometry).every(([y, x]) => x >= w && x <= e && y >= s && y <= n))
      return;
    let active = true;
    globe.readLandUse(8000, 12).then((data) => {
      if (!active) return;
      const status = !data ? "unavailable" : nearbyGeometry.some((p) =>
        classifyUrban(p, data.landuse, data.buildings).urban) ? "urban" : "checked";
      setNearbyLandUse({ geom: nearbyGeometry, status });
    });
    return () => { active = false; };
  }, [analysisScreen, nearbyGeometry, globe, view]);

  // The session is the single source of truth for the outline: React
  // state and the map preview both render its ring.
  useEffect(() => fieldSession.subscribe(() => {
    const r = fieldSession.state.ring;
    draftRef.current = r;
    setDraftState(r);
    globeRef.current?.setDraft(r.length ? r : null);
  }), [fieldSession]);

  // While marking, the picker panel edits through the shared session
  // (remove-vertex button, refusal notices).
  useEffect(() => {
    if (draw === "none") return;
    activateDrawSession(fieldSession);
    return () => deactivateDrawSession(fieldSession);
  }, [draw, fieldSession]);

  // Point-by-point drawing lets every placed vertex be dragged into
  // place, open or closed — mouse and touch alike. Pointer down on a
  // vertex (or a midpoint handle, which inserts and drags in one
  // gesture) turns map panning off until the gesture ends; a move that
  // would cross the outline is refused by the session. The map click
  // right after a real drag is swallowed so the drop doesn't add a
  // stray vertex.
  useEffect(() => {
    const el = mapDiv.current;
    if (!el || mode !== "field" || draw !== "draw" || movingMap) return;
    const st = dragRef.current;
    const ll = (e: PointerEvent): LatLon => {
      const r = el.getBoundingClientRect();
      return globeRef.current?.unproject(e.clientX - r.left,
        e.clientY - r.top) ?? [0, 0];
    };
    const stopPan = (off: boolean) => {
      globeRef.current?.setPanEnabled(!off);
      st.panWasOff = off;
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const p = ll(e);
      const t = draftTolM();
      const ring = fieldSession.state.ring;
      const i = nearestVertex(ring, p, t);
      const m = i < 0 ? nearestMidpoint(ring,
        fieldSession.state.closed, p, t) : null;
      const started = i >= 0 ? fieldSession.startDrag(i)
        : m ? fieldSession.startMidDrag(m.index) : false;
      if (!started) return;
      st.dragging = true; st.moved = false;
      st.downAt = [e.clientX, e.clientY]; st.downLL = p;
      stopPan(true);
      e.preventDefault();
      e.stopPropagation();
    };
    const onMove = (e: PointerEvent) => {
      if (!st.dragging) return;
      if (!st.moved) {
        if (Math.hypot(e.clientX - st.downAt[0],
                       e.clientY - st.downAt[1]) <= 4) return;
        st.moved = true;
      }
      fieldSession.dragTo(ll(e));
    };
    const onUp = () => {
      if (!st.dragging) return;
      st.dragging = false;
      stopPan(false);
      if (st.moved) { fieldSession.endDrag(); swallowClick.current = true; }
      else {
        // a tap that never moved is still a click on the handle's spot
        // (pointerdown was stopped, so the map never saw the gesture)
        fieldSession.cancelDrag();
        if (st.downLL) fieldSession.click(st.downLL, draftTolM());
      }
      st.downLL = null;
    };
    el.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (st.dragging) { st.dragging = false; fieldSession.cancelDrag(); }
      if (st.panWasOff) stopPan(false);
    };
  }, [mode, draw, movingMap, fieldSession]);

  useEffect(() => {
    globe?.setFieldBasemap(mode === "field", satellite, !fieldOpen && fieldGuide);
  }, [globe, mode, satellite, fieldGuide, fieldOpen]);

  // World views cap the zoom low enough that nobody reaches featureless
  // pixels; the field view keeps its deeper max for drawing plots.
  useEffect(() => {
    globe?.setZoomRange(1.5, mode === "field" ? 16.5 : 9);
  }, [globe, mode]);

  /** A finished outline (points, freehand or tap): to review as a
   * selection, or clipped into the open field as a new crop zone. */
  const onShape = (r: LatLon[], approx: boolean) => {
    const g = globeRef.current;
    setDraw("none"); setDraft([]); g?.setDraft(null);
    const tg = targetRef.current;
    if (tg.kind === "fix") {
      targetRef.current = { kind: "selection" };
      const f = fields.find((x) => x.id === tg.fieldId);
      const old = f?.zones.find((z) => z.id === tg.zoneId);
      if (!f || !old) return;
      const others = f.zones.filter((z) => z.id !== old.id).map((z) => z.geom);
      const fixed = clipZone([[r]], f.geom, others);
      if (fixed) {
        // land the plot no longer covers goes to «Límite por revisar»
        const leftover = clipZone(old.geom, old.geom, [fixed.geom])?.geom ?? [];
        storeChange(() => replaceParcel(f.id, old.id, fixed.geom, leftover));
      }
      setSelectedParcel(old.id);
      setFieldsView({ id: f.id });
      return;
    }
    if (tg.kind === "zone") {
      const f = fields.find((x) => x.id === tg.fieldId);
      if (!f) return;
      setPendingZone(clipZone([[r]], f.geom, f.zones.map((z) => z.geom)));
      setFieldsView({ id: f.id });
      return;
    }
    setAdjust(null);
    setSelection({ geom: [[r]], approx, original: r });
  };
  const onShapeRef = useRef(onShape);
  onShapeRef.current = onShape;

  const refreshFields = () => setFields(loadFields());
  const storeChange = (write: () => void) => {
    try { write(); }
    catch { setStorageError(true); return false; }
    setStorageError(false);
    refreshFields();
    return true;
  };
  // Saved fields with no zones are split by crop on their own (INTA map).
  useAutoCropSplit(fields, lang, (id, zones, result) => {
    storeChange(() => {
      const now = loadFields().find((f) => f.id === id);
      if (!now || now.zones.length || now.cropSplit) return;  // user got there first
      if (zones.length) addZones(id, zones, "crop");
      markCropSplit(id, result);
    });
  });

  /** Map height hidden by the bottom panel on narrow screens (0 when
   * the panel sits beside the map). */
  const coveredBottom = () => {
    const el = document.querySelector(".map-wrap .controls");
    const map = mapDiv.current;
    if (!el || !map || innerWidth > 900 ||
        el.getClientRects().length === 0) return 0;
    return Math.max(0, map.getBoundingClientRect().bottom -
      el.getBoundingClientRect().top);
  };

  useEffect(() => {
    if (!globe || mode !== "field" || !frameArgentinaOnOpen.current) return;
    frameArgentinaOnOpen.current = false;
    // keep the zoom and place the producer chose; only the world view
    // is framed on Argentina
    if (globe.center().zoom < 4) globe.fitRing(ARGENTINA_FRAME, coveredBottom());
  }, [globe, mode]);

  // #demo fired before the map was ready: frame the farm once it is.
  useEffect(() => {
    if (!globe || !demoFitPending.current || !target) return;
    demoFitPending.current = false;
    globe.fitRing(multiPoints(target.geom), coveredBottom());
  }, [globe, target]);

  // Review step: frame the selection and read OpenStreetMap land use
  // from the vector tiles. Unknown land use never blocks confirming;
  // pieces that come from Ajustar selección were already checked.
  useEffect(() => {
    if (!selection) return;
    let live = true;
    const g = globeRef.current;
    g?.fitRing(multiPoints(selection.geom), coveredBottom());
    if (selection.checked) { setLandCheck("ok"); return; }
    setLandCheck("checking");
    (async () => {
      const read = g ? await g.readLandUse() : null;
      if (!live) return;
      if (!read) { setLandCheck("unknown"); return; }
      const urban = selection.geom.some((p) =>
        classifyUrban(p, read.landuse, read.buildings).urban);
      setLandCheck(urban ? "urban" : "ok");
    })();
    return () => { live = false; };
  }, [selection]);

  const openField = fields.find((x) => x.id ===
    (fieldsView && fieldsView !== "list" ? fieldsView.id : shownField));

  // What the map shows for the current step (pieces, field, zones). The
  // shapes of the field journey are cleared in every other mode.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const sh: Shape[] = [];
    // the parcels wizard and the result layer own the map shapes
    if (mode === "field" && !parcelsWizard && !parcelRes) {
      if (locationAccuracy && !fieldOpen) {
        const { lat, lon, metres } = locationAccuracy;
        sh.push({ kind: "field", geom: [circleRing(lat, lon, metres / 1_000)] });
      }
      if (fieldOpen && target) {
        const outline = analysisMask(target.geom);
        sh.push(...outline);
        recommendationArea?.forEach((geom) => sh.push({ geom, kind: "parcel-selected" }));
        moistureZones.forEach((zone, i) => moistureGeometry(zone.geometry)
          .forEach((geom) => sh.push({ geom, color: MOISTURE_COLORS[zone.kind],
            kind: zone.kind === "missing" ? "moisture-missing" :
              selectedMoisture === i ? "moisture-selected" : "moisture" })));
        target.geom.forEach((p) => sh.push({ geom: p, kind: "original" }));
      } else if (adjust?.status === "ready" && adjust.result && selection) {
        sh.push({ geom: [selection.original], kind: "original" });
        adjust.result.excluded.forEach((p) => sh.push({ geom: p, kind: "excluded" }));
        adjust.result.pieces.forEach((p, i) =>
          sh.push({ geom: p.geom, kind: adjust.on[i] ? "piece-on" : "piece-off" }));
      } else if (selection) {
        selection.geom.forEach((p) => sh.push({ geom: p, kind: "field" }));
      } else if (openField) {
        // overall outline, then plots (proposed or confirmed) and the land
        // still to review, each as its own layer
        openField.geom.forEach((p) => sh.push({ geom: p, kind: "contour" }));
        if (proposal?.status === "ready") {
          const d = proposal.detection;
          d.excluded.forEach((p) => sh.push({ geom: p, kind: "excluded" }));
          d.review.forEach((p) => sh.push({ geom: p.geom, kind: "review" }));
          d.parcels.forEach((p, i) => sh.push({ geom: p.geom,
            label: proposal.names[i],
            kind: !proposal.keep[i] ? "parcel-off"
              : selectedParcel === `p${i}` ? "parcel-selected" : "parcel" }));
        } else {
          (openField.review ?? []).forEach((p) => sh.push({ geom: p, kind: "review" }));
          openField.zones.forEach((z, i) => z.geom.forEach((p) => sh.push({
            geom: p, label: z.name || t("parcel.defaultName", { n: i + 1 }),
            kind: selectedParcel === z.id ? "parcel-selected" : "parcel" })));
        }
        pendingZone?.geom.forEach((p) => sh.push({ geom: p, kind: "piece-on" }));
      }
    }
    if (!parcelsWizard && !parcelRes) g.setShapes(sh);
    if (mode !== "field") {
      g.setDraft(null); g.setMarker(null);
      if (parcelRes) setParcelRes(null);
      if (parcelsWizard) setParcelsWizard(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, adjust, fields, fieldsView, shownField, pendingZone,
      fieldOpen, target, mode, selectedParcel, proposal, parcelsWizard, parcelRes, globe, moistureZones,
      selectedMoisture,
      locationAccuracy, recommendationArea]);

  // clear fire hexagons when leaving fire mode (else the layer lingers)
  useEffect(() => {
    if (mode !== "fire") globeRef.current?.setCells(new Map(), null);
  }, [mode]);

  // deep-link: #lat,lon jumps straight to a location (dev + sharing),
  // #demo opens the guided Mendoza example
  useEffect(() => {
    if (isDemoHash(location.hash)) { startDemo(); return; }
    const m = location.hash.match(/^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    if (m) locate(Number(m[1]), Number(m[2]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // /app/#demo typed (or tapped from the landing) while the app runs
  useEffect(() => {
    const on = () => { if (isDemoHash(location.hash)) startDemo(); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locate = (lat: number, lon: number) => {
    setMode("fire");
    setPanelOpen(true);
    if (!globeRef.current) initialLocation.current = [lat, lon];
    setTimeout(() => {
      globeRef.current?.flyTo(lat, lon, 7);
      fireArea(lat, lon);
    }, 100);
  };

  /** Fire tab: the area panel starts from the current map centre and
   * follows the map from then on. */
  const openFire = () => {
    setMode("fire"); setPanelOpen(true);
    const c = globeRef.current?.center() ?? DEFAULT_VIEW;
    fireArea(c.lat, c.lon);
  };

  const startField = (dm: DrawMode) => {
    if (modeRef.current !== "field") frameArgentinaOnOpen.current = true;
    setMode("field");
    setDraw(dm); setFreeError(false);
    setDraft([]); setTarget(null); setFieldOpen(false);
    setParcelRes(null); setParcelsWizard(false);
    setSelection(null); setAdjust(null);
    setFieldsView(null); setShownField(null);
    targetRef.current = { kind: "selection" };
    globeRef.current?.setDraft(null);
  };

  const finishDraw = () => {
    if (!drawStatus(draft.length).canFinish) return;
    onShape(draft, false);
  };

  /** Back to marking: a drawn outline keeps its points to adjust; an
   * approximate point selection asks for a new point. */
  const editSelection = () => {
    if (!selection) return;
    editRing(selection.approx ? null :
      selection.geom.length === 1 ? selection.geom[0][0] : selection.original);
  };

  /** Back to point-by-point drawing with `r` as the starting outline
   * (null: tap a new point for an approximate selection). */
  const editRing = (r: LatLon[] | null) => {
    targetRef.current = { kind: "selection" };
    if (!r) {
      setDraft([]); globeRef.current?.setDraft(null);
      setDraw("point");
    } else {
      setDraft(r); globeRef.current?.setDraft(r);
      setDraw("draw");
    }
    setSelection(null); setAdjust(null);
  };

  const cancelSelection = () => {
    setSelection(null); setAdjust(null); setDraw("none"); setDraft([]);
    globeRef.current?.setDraft(null);
  };

  /** Only a confirmed area reaches the diagnosis API, and it is exactly
   * the geometry on the map: every piece, holes left out. */
  const analyze = (tg: AnalysisTarget) => {
    setTarget(tg); setFieldOpen(true);
    setParcelRes(null); setParcelsWizard(false);
    setSelection(null); setAdjust(null); setFieldsView(null);
    globeRef.current?.setDraft(null);
    setRecommendationArea(null);
  };

  const confirmSelection = () => {
    if (!selection) return;
    analyze({ geom: selection.geom, areaLabel: t(selection.approx
      ? "analyze.selectionApprox" : "analyze.selection") });
  };

  const analyzeParcel = (f: Field, z: Zone, i: number) =>
    analyze({ geom: z.geom, areaLabel: z.name || t("parcel.defaultName", { n: i + 1 }),
              fieldName: f.name, fieldHa: fieldHa(f),
              declaredCrop: z.cropDeclared || z.source !== "crop" ? z.crop : undefined,
              parcel: { crop: z.crop || null, source: z.source ?? "manual" } });

  const analysisSections = (zones: Zone[]) => zones.map((z, i) => ({
    name: z.name || t("parcel.defaultName", { n: i + 1 }),
    geom: z.geom, crop: z.cropDeclared || z.source !== "crop" ? z.crop : undefined,
  }));

  const analyzeSavedField = (field: Field) => analyze({
    geom: field.geom, fieldName: field.name, declaredCrop: field.crop,
    areaLabel: areaLabel({ kind: "all", label: "" }),
    sections: analysisSections(field.zones),
  });

  const analyzeUnit = (f: Field, u: SummaryUnit) => {
    setSummaryFor(null);
    const i = f.zones.findIndex((z) => z.id === u.id);
    if (i !== -1) analyzeParcel(f, f.zones[i], i);
    else analyze({ geom: u.geom,
                   areaLabel: u.kind === "group" ? u.name
                     : areaLabel({ kind: "all", label: "" }),
                   fieldName: f.name, fieldHa: fieldHa(f), declaredCrop: f.crop,
                   sections: analysisSections(f.zones.filter((z) =>
                     u.kind === "field" || u.members?.includes(z.id))) });
  };

  /** «Detectar parcelas»: frame the outline, read Fields of The World
   * boundaries and OpenStreetMap roads/built-up land, and propose plots
   * inside the outline. Nothing is saved until the producer accepts. */
  const detect = async (f: Field) => {
    const g = globeRef.current;
    setSelectedParcel(null);
    setProposal({ status: "loading" });
    g?.fitRing(multiPoints(f.geom), coveredBottom());
    const pts = multiPoints(f.geom);
    const bbox: [number, number, number, number] = [
      Math.min(...pts.map((q) => q[1])), Math.min(...pts.map((q) => q[0])),
      Math.max(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0]))];
    // boundaries come straight from the archive for the whole outline;
    // roads and built-up land from what the map loaded
    const [ftw, osm] = await Promise.all([
      readFtw(bbox).catch(() => null),
      g ? g.readLandUse(8000, 11) : Promise.resolve(null)]);
    const notes: string[] = [];
    if (!ftw || (ftw.failed && !ftw.fields.length)) notes.push("parcel.cov.ftwFail");
    else if (ftw.failed) notes.push("parcel.cov.ftwSomeFailed");
    else if (!ftw.fields.length) notes.push("parcel.cov.ftwNone");
    if (!osm) notes.push("parcel.cov.osmFail");
    else if (osm.zoom < DRAW_ZOOM) notes.push("parcel.cov.tracks");
    const view = osm?.bounds;
    if (view && multiPoints(f.geom).some(([la, lo]) =>
        la < view[1] || la > view[3] || lo < view[0] || lo > view[2])) {
      notes.push("parcel.cov.outside");
    }
    const taken = f.zones.filter((z) => (z.source ?? "manual") === "manual")
      .map((z) => z.geom);
    const detection = detectParcels(f.geom, {
      fields: ftw && !(ftw.failed && !ftw.fields.length) ? ftw.fields : [],
      roads: (osm?.roads ?? []).filter((r) => ROAD_HALF_WIDTH[r.cls]),
      landuse: osm?.landuse ?? [], taken },
      // slivers (< 1 ha) along a hand-drawn outline are not plots: they
      // stay to review
      1);
    if (detection.parcels.length && detection.reviewHa >= 0.5 &&
        !notes.includes("parcel.cov.ftwNone")) notes.push("parcel.cov.ftwPartial");
    notes.push("parcel.cov.image");
    const start = taken.length;
    setProposal({ status: "ready", detection, notes,
      keep: detection.parcels.map(() => true),
      names: detection.parcels.map((_, i) =>
        t("parcel.defaultName", { n: start + i + 1 })) });
  };

  const acceptProposal = (f: Field) => {
    if (proposal?.status !== "ready") return;
    const d = proposal.detection;
    const kept = d.parcels.flatMap((p, i) => proposal.keep[i]
      ? [{ name: proposal.names[i], geom: [p.geom], source: p.source }] : []);
    // dropped proposals join the land to review
    const review = [...d.review.map((p) => p.geom),
                    ...d.parcels.filter((_, i) => !proposal.keep[i]).map((p) => p.geom)];
    if (storeChange(() => acceptDetection(f.id, kept, review, {
      at: new Date().toISOString(), sources: ["ftw", "osm"],
      parcelHa: kept.reduce((a, p) => a + zoneHa(p), 0),
      reviewHa: d.reviewHa }))) {
      setProposal(null); setSelectedParcel(null);
    }
  };

  const saveSelection = (name: string) => {
    if (!selection) return;
    storeChange(() => {
      const f = saveField({ name, geom: selection.geom });
      setSelection(null); setAdjust(null);
      setShownField(f.id); setFieldsView("list");
    });
  };

  /** "Ajustar selección": read roads, tracks and built-up land from the
   * OpenStreetMap vector tiles and cut the original outline into pieces.
   * When nothing usable is left, nothing is offered in its place. */
  const startAdjust = async () => {
    if (!selection) return;
    const g = globeRef.current;
    setAdjust({ status: "loading", on: [], unverified: [] });
    g?.fitRing(selection.original, coveredBottom());
    const read = g ? await g.readLandUse() : null;
    const unverified: string[] = [];
    let roads = read?.roads ?? [];
    if (!read) {
      unverified.push("adjust.cov.none");
    } else {
      if (read.zoom < DRAW_ZOOM) unverified.push("adjust.cov.tracks");
      const [w, so, e, n] = read.bounds;
      if (selection.original.some(([la, lo]) =>
          la < so || la > n || lo < w || lo > e)) {
        unverified.push("adjust.cov.outside");
      }
      roads = roads.filter((r) => ROAD_HALF_WIDTH[r.cls]);
    }
    unverified.push("adjust.cov.osm");
    const result = splitSelection([[selection.original]],
      { roads, landuse: read?.landuse ?? [] });
    setAdjust({ status: "ready", result,
                on: result.pieces.map(() => true), unverified });
  };

  const applyAdjust = () => {
    if (!adjust?.result || !selection) return;
    const geom = adjust.result.pieces.filter((_, i) => adjust.on[i])
      .map((p) => p.geom);
    if (!geom.length) return;
    setAdjust(null);
    // a cut point selection is still approximate; land use was just read
    setSelection({ ...selection, geom, checked: true });
  };

  /** Mis campos */
  const openFields = () => {
    setDraw("none"); setSelection(null); setAdjust(null);
    refreshFields(); setFieldsView("list");
  };
  const showField = (f: Field) => {
    setShownField(f.id);
    globeRef.current?.fitRing(multiPoints(f.geom), coveredBottom());
  };
  const openDetail = (f: Field) => {
    showField(f); setPendingZone(null); setSelectedParcel(null);
    setProposal(null); setFieldsView({ id: f.id });
  };
  const fixParcel = (f: Field, z: Zone) => {
    targetRef.current = { kind: "fix", fieldId: f.id, zoneId: z.id };
    setSelectedParcel(z.id); setFreeError(false);
    setDraft([]); setDraw("free");
  };
  const drawZone = (fieldId: string, m: "free" | "draw") => {
    targetRef.current = { kind: "zone", fieldId };
    setPendingZone(null); setFreeError(false);
    setDraft([]); setDraw(m);
  };

  const goTo = (lat: number, lon: number, precise = false, accuracy?: number) => {
    if (mapUnavailable) {
      const ring = circleApprox(lat, lon);
      onShape(ring, true);
      return;
    }
    setLocationAccuracy(accuracy ? { lat, lon, metres: accuracy } : null);
    globeRef.current?.flyTo(lat, lon, precise ? DRAW_ZOOM + 1 : DRAW_ZOOM,
                          coveredBottom());
    globeRef.current?.setMarker([lat, lon]);
  };

  const analyzeNearby = (lat: number, lon: number) => {
    const ring = circleApprox(lat, lon);
    analyze({ geom: [[ring]], areaLabel: t("fields.nearby"), nearby: true });
  };

  const useLocationFor = (action: "add" | "nearby") => {
    const revision = ++locationRequest.current;
    setLocationState("loading");
    const denied = () => {
      if (revision !== locationRequest.current) return;
      setLocationState("denied");
      if (action === "add") setFieldsView(null);
    };
    if (!navigator.geolocation) { denied(); return; }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (revision !== locationRequest.current) return;
      setLocationState("idle");
      if (action === "nearby") {
        analyzeNearby(coords.latitude, coords.longitude);
        return;
      }
      setFieldsView(null);
      if (mapUnavailable) { onShape(circleApprox(coords.latitude, coords.longitude), true); return; }
      if (!globeRef.current) pendingFieldLocation.current = {
        lat: coords.latitude, lon: coords.longitude,
      };
      goTo(coords.latitude, coords.longitude, true, coords.accuracy);
    }, denied, { timeout: 8000 });
  };

  /** Jump straight to field detail, keeping the visible part centred. */
  const zoomToDraw = () => {
    if (!globe) return;
    const delta = DRAW_ZOOM - globe.center().zoom;
    if (delta > 0) globe.zoomBy(delta, coveredBottom());
  };

  const focusMoisture = (index: number | null) => {
    selectMoisture(index);
    const zone = index == null ? null : moistureZones[index];
    const geometry = zone ? moistureGeometry(zone.geometry) : target?.geom;
    if (geometry) globeRef.current?.fitRing(multiPoints(geometry), coveredBottom());
  };

  const showArgentina = () => {
    setLocationAccuracy(null);
    globeRef.current?.setMarker(null);
    globeRef.current?.fitRing(ARGENTINA_FRAME, coveredBottom());
  };

  const showWorld = () => {
    setLocationAccuracy(null);
    globeRef.current?.setMarker(null);
    globeRef.current?.flyTo(WORLD_VIEW.lat, WORLD_VIEW.lon, WORLD_VIEW.zoom, coveredBottom());
  };

  const undoPoint = () => {
    fieldSession.undo();
  };

  const cancelDraw = () => {
    setDraw("none"); setDraft([]);
    globeRef.current?.setDraft(null);
    if (targetRef.current.kind !== "selection") {
      setFieldsView({ id: targetRef.current.fieldId });
      targetRef.current = { kind: "selection" };
    }
  };

  /** Back to the method chooser with no plot selected. */
  const changePlot = () => {
    setFieldOpen(false); setTarget(null); setSelection(null); setAdjust(null);
    startField("none");
    setFieldsView("list");
  };

  /** One-tap guided demo (task 40): a fictional Mendoza farm on a real
   * Valle de Uco location — parcels, producer profile and a cached
   * fallback all come from features/demo/mendozaFarm. The analysis
   * itself is the live /api/field/parcels call. */
  const startDemo = () => {
    setMode("field"); setDraw("none"); setSelection(null); setAdjust(null);
    setFieldsView(null); setShownField(null); setPendingZone(null);
    setParcelRes(null); setParcelsWizard(false);
    demoFitPending.current = true;
    setEmergencyCountry("AR");
    analyze({
      geom: MENDOZA_BOUNDARY,
      areaLabel: t("demo.farmArea"),
      fieldName: t("demo.farmName"),
      parcels: MENDOZA_PARCELS,
      needs: MENDOZA_NEEDS,
      profile: MENDOZA_PROFILE,
      econ: MENDOZA_ECON,
      demo: { cached: MENDOZA_CACHED.res,
              cachedDate: MENDOZA_CACHED.date },
    });
  };

  const zoneField = targetRef.current.kind === "zone"
    ? fields.find((x) => targetRef.current.kind === "zone" &&
                         x.id === targetRef.current.fieldId)
    : undefined;

  const orinLot = (feature: OrinLots["features"][number]) => {
    const geom: Multi = [feature.geometry.coordinates.map((ring) =>
      ring.slice(0, -1).map(([lon, lat]): LatLon => [lat, lon]))];
    if ((geom[0][0]?.length ?? 0) < 3) return;
    const { name, crop_label, synthetic } = feature.properties;
    setMode("field");
    setDraw("none");
    analyze({
      geom,
      areaLabel: [name, crop_label].filter(Boolean).join(" · "),
      demoLot: { name, crop_label, synthetic },
    });
  };

  useEffect(() => {
    orinLots().then((data) => setLots((data?.features ?? []).map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        synthetic: data?.synthetic || feature.properties.synthetic,
      },
    }))));
  }, []);

  // A right-side .panel is open: the map's top-right controls step
  // left of it so nothing sits on the panel (task 33.2).
  const sidePanel = (mode === "fire" && panelOpen) ||
    (mode === "field" && fieldOpen) || emergOpen;

  return (
    <div className={`app${analysisScreen ? " analysis-screen" : ""}${sidePanel ? " has-side-panel" : ""}`}>
      <header className="topbar">
        <h1>
          <button type="button" className="topbar-home"
                  aria-label={t("shell.home")}
                  onClick={() => {
                    if (modeRef.current === "field") changePlot();
                    setMode("welcome");
                  }}>
            <span aria-hidden="true"><WindLogo size={30} title={APP_NAME} /></span>
            <span className="topbar-name">{APP_NAME}</span>
          </button>
        </h1>
        <nav aria-label={t("nav.modes")}>
          <button aria-pressed={mode === "field"}
                  onClick={() => {
                    if (modeRef.current !== "field") { startField("none"); setFieldsView("list"); }
                  }}>
            <svg className="nav-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21v-8m0 0c-4.5-.5-6.5-3-7-7 4.5.5 6.5 3 7 7Zm0 0c4.5-.5
                6.5-3 7-7-4.5.5-6.5 3-7 7Z"/></svg>
            <span className="nav-text">{t("nav.field")}</span></button>
          <button aria-pressed={mode === "fire"} onClick={openFire}>
            <svg className="nav-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21c-4 0-7-2.8-7-6.5C5 9 9.5 6 11 2c.6 2.4 2.6 3.8
                3.4 6.2.4-1 .6-2.1.4-3.2 2.6 1.7 4.2 4.6 4.2 8 0 4.4-3 8-7 8Z"/></svg>
            <span className="nav-text">{t("nav.fire")}</span></button>
          <button aria-pressed={mode === "live"}
                  onClick={() => setMode("live")}>
            <svg className="nav-ico" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3.4"/>
              <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"
                    fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>
            <span className="nav-text">{t("nav.live")}</span></button>
        </nav>
        <div className="spacer" />
        <button className="emerg-link" aria-label={t("emerg.nav")}
                onClick={() => setEmergOpen(true)}>
          <svg className="emerg-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6.6 3.2c.8-.2 1.6.3 1.9 1.1l1 2.6c.2.6.1 1.3-.4 1.7L7.4
              10a12.6 12.6 0 0 0 6.6 6.6l1.4-1.7c.4-.5 1.1-.6 1.7-.4l2.6
              1c.8.3 1.3 1.1 1.1 1.9l-.6 2.3c-.2.9-1.1 1.5-2 1.3C10.4 19.7
              4.3 13.6 3 5.8c-.2-.9.4-1.8 1.3-2l2.3-.6Z"/></svg>
          <span className="emerg-text">{t("emerg.nav")}</span></button>
        <button className="meth-link"
                onClick={() => setMethodsOpen(true)}>
          <span className="ml-long">{t("meth.link")}</span>
          <span className="ml-short">{t("meth.short")}</span></button>
        <button className="lang-btn"
                onClick={() => setLang(lang === "es" ? "en" : "es")}
                aria-label={t("nav.langLabel")}>{t("nav.lang")}</button>
        <button type="button" className="menu-btn"
                aria-expanded={menuOpen} aria-controls="topbar-menu"
                aria-label={t("shell.menu")}
                onClick={() => setMenuOpen(!menuOpen)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" fill="none"
                  strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </header>
      {menuOpen && (
        <>
          <button type="button" className="menu-backdrop" tabIndex={-1}
                  aria-hidden="true" onClick={() => setMenuOpen(false)} />
          <div className="topbar-menu" id="topbar-menu">
            <button type="button" onClick={() => {
              setEmergOpen(true); setMenuOpen(false); }}>{t("emerg.nav")}</button>
            <button type="button" onClick={() => {
              setMethodsOpen(true); setMenuOpen(false); }}>{t("meth.link")}</button>
            <button type="button" onClick={() =>
              setLang(lang === "es" ? "en" : "es")}>
              {t("nav.langLabel")} · {t("nav.lang")}</button>
          </div>
        </>)}

      <div className={`map-wrap${mode === "field" && draw !== "none" && !movingMap ? " marking" : ""}`}>
        {mode === "field" && draw === "free" && !movingMap && !mapUnavailable && (
          <FreehandLayer
            unproject={(x, y) => globeRef.current?.unproject(x, y) ?? [0, 0]}
            onStroke={(pts) => globeRef.current?.setDraft(pts, false)}
            onDone={(r) => {
              if (r) { setFreeError(false); onShape(r, false); }
              else { setFreeError(true); globeRef.current?.setDraft(null); }
            }} />)}
        <div ref={mapDiv} className="map" role="application"
             aria-label={t("map.label")} />
        <Suspense fallback={null}>
          <MapLoader container={mapDiv} onReady={onGlobeReady}
                     onUnavailable={onMapUnavailable} />
        </Suspense>
        {mapUnavailable && mode !== "welcome" && <p className="map-warning" role="status">
          {t(mode === "field" ? "field.map.unavailable" : "field.map.unavailableOther")}
        </p>}
        {storageError && <p className="storage-warning" role="alert">{t("fields.storageFailure")}</p>}
        {(mode === "fire" || mode === "live") && (
          /* marks the map centre — the exact point the fire risk is
           * queried at and the reference live distances are measured
           * from (B2/B4) */
          <div className="reticle" aria-hidden="true" />)}
        {mode === "fire" && area && !panelOpen && (
          <button type="button" className="fire-reopen"
                  onClick={() => setPanelOpen(true)}>
            {t("panel.reopen")}</button>)}
        {mode === "field" && fieldsView !== "list" && !fieldOpen && locationState === "denied" &&
          <p className="map-warning" role="status">{t("fields.locationDenied")}</p>}
        {mode === "field" && !fieldOpen && (
          <>
            {draw === "none" && !selection && !fieldsView && (
              <>
                <div className="field-extents" role="group" aria-label={t("field.map.extent")}>
                  <button type="button" onClick={showArgentina}>Argentina</button>
                  <button type="button" onClick={showWorld}>{t("field.map.world")}</button>
                </div>
                {/* phones: the two extents collapse into one "Encuadre"
                    popover so nothing floats in the middle of the map */}
                <details className="field-frame">
                  <summary>{t("map.frame")}</summary>
                  <div className="frame-list">
                    <button type="button" onClick={showArgentina}>Argentina</button>
                    <button type="button" onClick={showWorld}>{t("field.map.world")}</button>
                  </div>
                </details>
              </>)}
            <div className="field-map-tools">
              {zoom >= 8 && <div className="field-basemap" role="group" aria-label={t("field.map.style")}>
                <button type="button" aria-pressed={satellite}
                        onClick={() => setSatellite(true)}>{t("field.map.satellite")}</button>
                <button type="button" aria-pressed={!satellite}
                        onClick={() => setSatellite(false)}>{t("field.map.streets")}</button>
              </div>}
              <div className="field-zoom" role="group" aria-label={t("field.map.zoom")}>
                <button type="button" aria-label={t("field.map.zoomIn")}
                        onClick={() => globe?.zoomBy(1, coveredBottom())}>+</button>
                <button type="button" aria-label={t("field.map.zoomOut")}
                        onClick={() => globe?.zoomBy(-1, coveredBottom())}>−</button>
              </div>
              {zoom >= DRAW_ZOOM - 0.5 && (
                <div className="field-guide">
                  <button type="button" aria-pressed={fieldGuide}
                          onClick={() => setFieldGuide(!fieldGuide)}>
                    {t("field.map.guide")}</button>
                  {fieldGuide && <small>{t("field.map.guideNote")}</small>}
                </div>)}
            </div>
          </>
        )}

        {mode === "welcome" && (
          <div className="welcome-overlay">
            <Welcome onAnalyze={() => startField("none")} onDemo={startDemo}
                     onLocate={locate}
                     onExplore={openFire}
                     onLive={() => setMode("live")} />
          </div>)}

        {mode === "fire" && <Suspense fallback={null}>
          <HistoricControls globe={globe} onMonth={setPlayingMonth} view={view} />
        </Suspense>}

        {mode === "live" && (
          <Suspense fallback={null}>
            <LiveControls globe={globe} country={null} />
          </Suspense>)}

        {mode === "field" && !fieldOpen && selection && adjust && (
          <AdjustPanel adjust={adjust}
            onToggle={(i) => setAdjust({ ...adjust,
              on: adjust.on.map((v, k) => (k === i ? !v : v)) })}
            onApply={applyAdjust}
            onEditPiece={(i) => editRing(adjust.result!.pieces[i].geom[0])}
            onOriginal={() => {
              setAdjust(null);
              setSelection({ ...selection, geom: [[selection.original]],
                             checked: false });
            }}
            onRedraw={() => editRing(selection.approx ? null : selection.original)} />)}
        {mode === "field" && !fieldOpen && selection && !adjust &&
          !parcelsWizard && (
          <SelectionReview geom={selection.geom} approx={selection.approx}
                           check={landCheck} onEdit={editSelection}
                           onCancel={cancelSelection}
                           onConfirm={confirmSelection}
                           onAdjust={startAdjust} onSave={saveSelection}
                           onParcels={() => setParcelsWizard(true)} />)}
        {mode === "field" && !fieldOpen && parcelsWizard && selection &&
          globe && (
          <Suspense fallback={null}>
            <ParcelsWizard geom={selection.geom} globe={globe}
              onDone={(parcels, needs) => analyze({
                geom: selection.geom, parcels, needs,
                areaLabel: t(selection.approx
                  ? "analyze.selectionApprox" : "analyze.selection") })}
              onCancel={() => setParcelsWizard(false)} />
          </Suspense>)}
        {mode === "field" && !fieldOpen && !selection && draw === "none" &&
          fieldsView === "list" && (
          <FieldsList fields={fields} actions={<div className="field-entry-actions">
            <details onToggle={(event) => {
              if (event.currentTarget.open) useLocationFor("add");
            }}>
              <summary>{t("fields.addNew")}</summary>
              <button type="button" onClick={() => {
                locationRequest.current++;
                setLocationState("idle");
                setFieldsView(null);
              }}>{t("place.search")}</button>
            </details>
            <button type="button" disabled={locationState === "loading"}
                    onClick={() => useLocationFor("nearby")}>{t("fields.nearby")}</button>
            {locationState === "loading" && <p role="status">{t("place.locating")}</p>}
            {locationState === "denied" && <p role="status">{t("fields.locationDenied")}{" "}
              {globe && <button onClick={() => {
                const p = globe.center();
                setLocationState("idle");
                analyzeNearby(p.lat, p.lon);
              }}>{t("fields.analyzeVisible")}</button>}
            </p>}
          </div>}
            onOpen={showField}
            onZones={openDetail}
            onAnalyze={analyzeSavedField}
            onRename={(f, n) => { storeChange(() => renameField(f.id, n)); }}
            onDelete={(f) => { if (storeChange(() => deleteField(f.id)) && shownField === f.id)
                               setShownField(null); }}
            onClose={() => { setFieldsView(null); setShownField(null); }} />)}
        {mode === "field" && !fieldOpen && !selection && draw === "none" &&
          fieldsView && fieldsView !== "list" && openField && (
          <ParcelPanel key={openField.id} field={openField}
            selected={selectedParcel} onSelect={(id) => {
              setSelectedParcel(id);
              const z = openField.zones.find((x) => x.id === id);
              const p = proposal?.status === "ready" && id?.startsWith("p")
                ? proposal.detection.parcels[Number(id.slice(1))] : null;
              const geom = z?.geom ?? (p ? [p.geom] : null);
              if (geom) globeRef.current?.fitRing(multiPoints(geom), coveredBottom());
            }}
            proposal={proposal}
            onDetect={() => detect(openField)}
            onProposalToggle={(i) => proposal?.status === "ready" && setProposal({
              ...proposal, keep: proposal.keep.map((v, k) => (k === i ? !v : v)) })}
            onProposalName={(i, n) => proposal?.status === "ready" && setProposal({
              ...proposal, names: proposal.names.map((v, k) => (k === i ? n : v)) })}
            onAccept={() => acceptProposal(openField)}
            onReject={() => { setProposal(null); setSelectedParcel(null); }}
            onRename={(z, n) => { storeChange(() => updateZone(openField.id, z.id, { name: n.trim() })); }}
            onCrop={(z, c) => { storeChange(() => updateZone(openField.id, z.id, { crop: c.trim() })); }}
            onDiscard={(z) => { storeChange(() => discardParcel(openField.id, z.id));
                                setSelectedParcel(null); }}
            onFix={(z) => fixParcel(openField, z)}
            onAnalyze={(z) => analyzeParcel(openField, z,
              openField.zones.findIndex((x) => x.id === z.id))}
            onSummary={() => setSummaryFor(openField.id)}
            pending={pendingZone}
            onDrawParcel={(m) => drawZone(openField.id, m)}
            onSavePending={(name) => {
              if (pendingZone && storeChange(() =>
                addZone(openField.id, { name, crop: "", geom: pendingZone.geom })))
                setPendingZone(null);
            }}
            onDiscardPending={() => setPendingZone(null)}
            onSetFieldCrop={(c) => { storeChange(() => setFieldCrop(openField.id, c)); }}
            onSplitByCrop={async () => {
              const r = await cropZonesFor(openField.geom, lang);
              if (!r) return "unavailable";
              storeChange(() => {
                if (r.zones.length) addZones(openField.id, r.zones, "crop");
                markCropSplit(openField.id, r.result);
              });
              return r.result;
            }}
            onBack={() => { setPendingZone(null); setProposal(null);
                            setSelectedParcel(null); setFieldsView("list"); }} />)}
        {mode === "field" && parcelRes && globe && (
          <Suspense fallback={null}>
            <ParcelsMapLayer globe={globe} parcels={parcelRes.parcels}
                             res={parcelRes.res} />
          </Suspense>)}
        {demoTour && parcelRes && (
          <GuidedTour onClose={() => setDemoTour(false)} />)}
        {mode === "field" && !fieldOpen && !selection &&
          (draw !== "none" || !fieldsView) && (
          <FieldPicker draw={mapUnavailable ? "none" : draw} points={draft.length}
                       onPick={startField} onDemo={startDemo}
                       demoLots={lots.map((feature) => ({
                         id: feature.properties.id,
                         label: feature.properties.crop_label || feature.properties.name,
                         onOpen: () => orinLot(feature),
                       }))}
                       onFinish={finishDraw} onUndo={undoPoint}
                       onCancel={cancelDraw} onGo={goTo}
                       onFields={openFields} fieldsCount={fields.length}
                       freeError={freeError}
                       movingMap={movingMap}
                       onToggleMove={() => {
                         if (draw === "free") globeRef.current?.setDraft(null);
                         setMovingMap(!movingMap);
                       }}
                       mapUnavailable={mapUnavailable}
                       zoomLow={zoom < DRAW_ZOOM - 0.5} onZoomIn={zoomToDraw}
                       onPointCoords={(la, lo) => {
                         if (!mapUnavailable) goTo(la, lo, true);
                         onShape(circleApprox(la, lo), true);
                       }}
                       context={zoneField
                         ? t("zones.drawingFor", { name: zoneField.name })
                         : undefined} />)}
      </div>

      {mode === "fire" && area && (
        <Suspense fallback={null}>
          <AreaPanel lat={area.lat} lon={area.lon} cells={area.cells}
                     open={panelOpen} onClose={() => setPanelOpen(false)}
                     country={null} month={playingMonth} />
        </Suspense>)}
      {mode === "field" && (
        <Suspense fallback={null}>
          <FieldPanel target={target} open={fieldOpen}
                      onMethods={() => setMethodsOpen(true)}
                      onClose={changePlot} onChangePlot={changePlot}
                      onResult={(res, parcels) => {
                        setParcelRes({ res, parcels });
                        if (target?.demo && !tourSeen()) setDemoTour(true);
                      }}
                      onEmergency={() => setEmergOpen(true)}
                      moistureSelection={selectedMoisture} onMoistureZones={showMoisture}
                      onMoistureSelect={focusMoisture}
                      nearbyUse={nearbyLandUse?.geom === nearbyGeometry ? nearbyLandUse.status
                        : mapUnavailable ? "unavailable" : undefined}
                      onRecommendationArea={setRecommendationArea} />
        </Suspense>)}
      {mode === "field" && !fieldOpen && (() => {
        const f = fields.find((x) => x.id === summaryFor);
        return (
          <BottomSheet open={!!f}>
            {f && <FieldSummary fieldName={f.name}
              units={summaryUnits(f.zones.map((z, i) => ({ id: z.id,
                name: z.name || t("parcel.defaultName", { n: i + 1 }), geom: z.geom })),
                f.review ?? [], f.geom)}
              onAnalyze={(u) => analyzeUnit(f, u)}
              onClose={() => setSummaryFor(null)} />}
          </BottomSheet>);
      })()}
      <MethodsDrawer open={methodsOpen}
                     onClose={() => setMethodsOpen(false)} />
      <BottomSheet open={emergOpen}>
        <div className="panel-head">
          <h3>{t("emerg.title")}</h3>
          <button onClick={() => setEmergOpen(false)}
                  aria-label={t("ui.close")}>✕</button>
        </div>
        <EmergencyBlock country={emergencyCountry}
                        mapCenter={globe
                          ? { lat: globe.center().lat,
                              lon: globe.center().lon }
                          : null}
                        lead={t("emerg.lead")} />
      </BottomSheet>
    </div>
  );
}

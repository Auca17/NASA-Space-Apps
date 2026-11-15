import { Suspense, lazy, useRef, useState, useCallback, useEffect } from "react";
import { DrawSession, activateDrawSession, deactivateDrawSession }
  from "./features/field/drawEdit";
import { useT } from "./i18n";
import { APP_NAME, DEFAULT_VIEW, DEMO_PLOT, WORLD_VIEW } from "./config";
import { WindLogo } from "./components/WindLogo";
import { Welcome } from "./features/welcome/Welcome";
import { MethodsDrawer } from "./features/methods/MethodsDrawer";
import { EmergencyBlock } from "./features/emergency/EmergencyBlock";
import { BottomSheet } from "./components/ui";
import { useGlobe, type GlobeHandle, type Shape } from "./features/globe/GlobeView";
import { HistoricControls } from "./features/fire/HistoricControls";
import { cellsInCircle } from "./domain/h3area";
import { orinLots } from "./api";
import type { OrinLots } from "./api/types";
import { drawStatus } from "./domain/clarity";
import { FieldPicker, type DrawMode } from "./features/field/FieldPicker";
import { SelectionReview, AdjustPanel, type LandCheck, type Adjust }
  from "./features/field/SelectionReview";
import { FieldsList, FieldDetail } from "./features/field/FieldsPanel";
import { useAreaLabel } from "./features/field/areaLabel";
import { FreehandLayer } from "./features/field/FreehandLayer";
import type { AnalysisTarget } from "./features/field/FieldLens";
import type { ParcelInput, ParcelsResponse } from "./domain/parcels";
import {
  classifyUrban, multiPoints, type LatLon, type Multi,
} from "./domain/selection";
import { splitSelection, clipZone, ROAD_HALF_WIDTH } from "./domain/split";
import { nearestMidpoint, nearestVertex } from "./domain/parcelsGeo";
import {
  loadFields, saveField, renameField, deleteField, addZone, updateZone,
  removeZone, fieldHa, analysisOptions, ZONE_COLORS, type Field,
  type AreaOption,
} from "./domain/fields";

/** Field marked on the map, waiting for the user's confirmation.
 * `checked`: land use already verified (pieces from Ajustar selección). */
type Selection = { geom: Multi; approx: boolean; original: LatLon[];
                   checked?: boolean };
/** What a finished drawing is for: the field itself or a crop zone. */
type Target = { kind: "selection" } | { kind: "zone"; fieldId: string };
type FieldsView = null | "list" | { id: string };

/** Zoom from which single plots can be told apart on the street map. */
const DRAW_ZOOM = 14;
const ARGENTINA_FRAME: LatLon[] = [[-55.2, -73.7], [-21.7, -53.5]];

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

export default function App() {
  const { t, lang, setLang } = useT();
  const areaLabel = useAreaLabel();
  const [mode, setModeState] = useState<Mode>("welcome");
  // the map callbacks are registered once: they read the mode from a ref
  const modeRef = useRef<Mode>("welcome");
  const setMode = (m: Mode) => { modeRef.current = m; setModeState(m); };
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
  const [fieldsView, setFieldsView] = useState<FieldsView>(null);
  const [shownField, setShownField] = useState<string | null>(null);
  const [areaChoice, setAreaChoice] = useState("all");
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
  const [lots, setLots] = useState<OrinLots["features"]>([]);
  const [playingMonth, setPlayingMonth] = useState<string | null>(null);
  const [methodsOpen, setMethodsOpen] = useState(false);
  const [emergOpen, setEmergOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<{ lat: number; lon: number; zoom: number;
    bbox: [number, number, number, number] } | null>(null);
  const country = useRef<string | null>(null);
  const globeRef = useRef<GlobeHandle | null>(null);
  const mapDiv = useRef<HTMLDivElement>(null);
  /** vertex-drag gesture on the open field outline (see the effect
   * below `onGlobeReady`); a real drag swallows the trailing click. */
  const dragRef = useRef({ dragging: false, moved: false,
                         panWasOff: false,
                         downAt: [0, 0] as [number, number],
                         downLL: null as LatLon | null });
  const swallowClick = useRef(false);
  const frameArgentinaOnOpen = useRef(false);

  const fireArea = (lat: number, lon: number) =>
    setArea({ lat, lon, cells: cellsInCircle(lat, lon, 50) });

  const onGlobeReady = useCallback((h: GlobeHandle) => {
    globeRef.current = h;
    setGlobe(h);
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
      }
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

  useGlobe(mapDiv, onGlobeReady);

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

  /** Map height hidden by the bottom panel on narrow screens (0 when
   * the panel sits beside the map). */
  const coveredBottom = () => {
    const el = document.querySelector(".map-wrap .controls");
    const map = mapDiv.current;
    if (!el || !map || innerWidth > 560) return 0;
    return Math.max(0, map.getBoundingClientRect().bottom -
      el.getBoundingClientRect().top);
  };

  useEffect(() => {
    if (!globe || mode !== "field" || !frameArgentinaOnOpen.current) return;
    frameArgentinaOnOpen.current = false;
    globe.fitRing(ARGENTINA_FRAME, coveredBottom());
  }, [globe, mode]);

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
      if (fieldOpen && target) {
        target.geom.forEach((p) => sh.push({ geom: p, kind: "field" }));
      } else if (adjust?.status === "ready" && adjust.result && selection) {
        sh.push({ geom: [selection.original], kind: "original" });
        adjust.result.excluded.forEach((p) => sh.push({ geom: p, kind: "excluded" }));
        adjust.result.pieces.forEach((p, i) =>
          sh.push({ geom: p.geom, kind: adjust.on[i] ? "piece-on" : "piece-off" }));
      } else if (selection) {
        selection.geom.forEach((p) => sh.push({ geom: p, kind: "field" }));
      } else if (openField) {
        openField.geom.forEach((p) => sh.push({ geom: p, kind: "field" }));
        openField.zones.forEach((z, i) => z.geom.forEach((p) => sh.push({
          geom: p, kind: "zone", color: ZONE_COLORS[i % ZONE_COLORS.length] })));
        if (pendingZone) {
          pendingZone.geom.forEach((p) => sh.push({ geom: p, kind: "piece-on" }));
        } else if (fieldsView && fieldsView !== "list" && areaChoice !== "all") {
          // highlight the area chosen for the analysis
          analysisOptions(openField).find((o) => o.id === areaChoice)
            ?.geom.forEach((p) => sh.push({ geom: p, kind: "piece-on" }));
        }
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
      fieldOpen, target, mode, areaChoice, parcelsWizard, parcelRes]);

  // clear fire hexagons when leaving fire mode (else the layer lingers)
  useEffect(() => {
    if (mode !== "fire") globeRef.current?.setCells(new Map(), null);
  }, [mode]);

  // deep-link: #lat,lon jumps straight to a location (dev + sharing)
  useEffect(() => {
    const m = location.hash.match(/^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    if (m) locate(Number(m[1]), Number(m[2]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locate = (lat: number, lon: number) => {
    setMode("fire");
    setPanelOpen(true);
    country.current = lat > -55 && lat < -21 && lon > -74 && lon < -53
      ? "AR" : null;
    setTimeout(() => {
      globeRef.current?.flyTo(lat, lon, 7);
      fireArea(lat, lon);
    }, 100);
  };

  /** Fire tab: the area panel starts from the current map centre and
   * follows the map from then on. */
  const openFire = () => {
    setMode("fire"); setPanelOpen(true);
    const c = globeRef.current?.center();
    if (c) fireArea(c.lat, c.lon);
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
    globeRef.current?.fitRing(multiPoints(tg.geom), coveredBottom());
  };

  const confirmSelection = () => {
    if (!selection) return;
    analyze({ geom: selection.geom, areaLabel: t(selection.approx
      ? "analyze.selectionApprox" : "analyze.selection") });
  };

  const analyzeOption = (f: Field, o: AreaOption) =>
    analyze({ geom: o.geom, areaLabel: areaLabel(o), fieldName: f.name,
              fieldHa: fieldHa(f) });

  const saveSelection = (name: string) => {
    if (!selection) return;
    const f = saveField({ name, geom: selection.geom });
    refreshFields();
    setSelection(null); setAdjust(null);
    setShownField(f.id); setFieldsView("list");
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
    showField(f); setPendingZone(null); setAreaChoice("all");
    setFieldsView({ id: f.id });
  };
  const drawZone = (fieldId: string, m: "free" | "draw") => {
    targetRef.current = { kind: "zone", fieldId };
    setPendingZone(null); setFreeError(false);
    setDraft([]); setDraw(m);
  };

  const goTo = (lat: number, lon: number, precise = false) => {
    globeRef.current?.flyTo(lat, lon, precise ? DRAW_ZOOM + 1 : DRAW_ZOOM - 1,
                          coveredBottom());
    globeRef.current?.setMarker([lat, lon]);
  };

  /** Jump straight to field detail, keeping the visible part centred. */
  const zoomToDraw = () => {
    if (!globe) return;
    const delta = DRAW_ZOOM - globe.center().zoom;
    if (delta > 0) globe.zoomBy(delta, coveredBottom());
  };

  const showArgentina = () => {
    globeRef.current?.setMarker(null);
    globeRef.current?.fitRing(ARGENTINA_FRAME, coveredBottom());
  };

  const showWorld = () => {
    globeRef.current?.setMarker(null);
    globeRef.current?.flyTo(WORLD_VIEW.lat, WORLD_VIEW.lon, WORLD_VIEW.zoom, coveredBottom());
  };

  const undoPoint = () => {
    fieldSession.undo();
  };

  const cancelDraw = () => {
    setDraw("none"); setDraft([]);
    globeRef.current?.setDraft(null);
    if (targetRef.current.kind === "zone") {
      setFieldsView({ id: targetRef.current.fieldId });
      targetRef.current = { kind: "selection" };
    }
  };

  /** Back to the method chooser with no plot selected. */
  const changePlot = () => {
    setFieldOpen(false); setTarget(null); setSelection(null); setAdjust(null);
    startField("none");
  };

  const demoPlot = () => {
    const r = circleApprox(DEMO_PLOT.lat, DEMO_PLOT.lon);
    setMode("field"); setDraw("none"); setSelection(null); setAdjust(null);
    setFieldsView(null);
    setTarget({ geom: [[r]], areaLabel: t("analyze.demo") });
    setParcelRes(null); setParcelsWizard(false);
    setFieldOpen(true);
    globeRef.current?.flyTo(DEMO_PLOT.lat, DEMO_PLOT.lon, 11);
    country.current = "AR";
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
    country.current = "AR";
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
    <div className={`app${sidePanel ? " has-side-panel" : ""}`}>
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
                    if (modeRef.current !== "field") startField("none");
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
        {mode === "field" && draw === "free" && !movingMap && (
          <FreehandLayer
            unproject={(x, y) => globeRef.current?.unproject(x, y) ?? [0, 0]}
            onStroke={(pts) => globeRef.current?.setDraft(pts, false)}
            onDone={(r) => {
              if (r) { setFreeError(false); onShape(r, false); }
              else { setFreeError(true); globeRef.current?.setDraft(null); }
            }} />)}
        <div ref={mapDiv} className="map" role="application"
             aria-label={t("map.label")} />
        {(mode === "fire" || mode === "live") && (
          /* marks the map centre — the exact point the fire risk is
           * queried at and the reference live distances are measured
           * from (B2/B4) */
          <div className="reticle" aria-hidden="true" />)}
        {mode === "fire" && area && !panelOpen && (
          <button type="button" className="fire-reopen"
                  onClick={() => setPanelOpen(true)}>
            {t("panel.reopen")}</button>)}
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
            <Welcome onAnalyze={() => startField("none")} onDemo={demoPlot}
                     onLocate={locate}
                     onExplore={openFire}
                     onLive={() => setMode("live")} />
          </div>)}

        {mode === "fire" &&
          <HistoricControls globe={globe} onMonth={setPlayingMonth}
                            view={view} />}

        {mode === "live" && (
          <Suspense fallback={null}>
            <LiveControls globe={globe} country={country.current} />
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
          <FieldsList fields={fields}
            onOpen={showField}
            onZones={openDetail}
            onAnalyze={openDetail}
            onRename={(f, n) => { renameField(f.id, n); refreshFields(); }}
            onDelete={(f) => { deleteField(f.id); refreshFields();
                               if (shownField === f.id) setShownField(null); }}
            onClose={() => { setFieldsView(null); setShownField(null); }} />)}
        {mode === "field" && !fieldOpen && !selection && draw === "none" &&
          fieldsView && fieldsView !== "list" && openField && (
          <FieldDetail key={openField.id} field={openField} pending={pendingZone}
            choice={areaChoice} onChoose={setAreaChoice}
            onAnalyze={(o) => analyzeOption(openField, o)}
            onDrawZone={(m) => drawZone(openField.id, m)}
            onSaveZone={(name, crop) => {
              if (pendingZone) addZone(openField.id, { name, crop, geom: pendingZone.geom });
              setPendingZone(null); refreshFields();
            }}
            onDiscardZone={() => setPendingZone(null)}
            onUpdateZone={(id, p) => { updateZone(openField.id, id, p); refreshFields(); }}
            onRemoveZone={(id) => { removeZone(openField.id, id); refreshFields(); }}
            onBack={() => { setPendingZone(null); setAreaChoice("all");
                            setFieldsView("list"); }} />)}
        {mode === "field" && parcelRes && globe && (
          <Suspense fallback={null}>
            <ParcelsMapLayer globe={globe} parcels={parcelRes.parcels}
                             res={parcelRes.res} />
          </Suspense>)}
        {mode === "field" && !fieldOpen && !selection &&
          (draw !== "none" || !fieldsView) && (
          <FieldPicker draw={draw} points={draft.length}
                       onPick={startField} onDemo={demoPlot}
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
                       zoomLow={zoom < DRAW_ZOOM - 0.5} onZoomIn={zoomToDraw}
                       onPointCoords={(la, lo) => {
                         goTo(la, lo, true);
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
                     country={country.current} month={playingMonth} />
        </Suspense>)}
      {mode === "field" && (
        <Suspense fallback={null}>
          <FieldPanel target={target} open={fieldOpen}
                      onMethods={() => setMethodsOpen(true)}
                      onClose={changePlot} onChangePlot={changePlot}
                      onResult={(res, parcels) =>
                        setParcelRes({ res, parcels })}
                      onEmergency={() => setEmergOpen(true)} />
        </Suspense>)}
      <MethodsDrawer open={methodsOpen}
                     onClose={() => setMethodsOpen(false)} />
      <BottomSheet open={emergOpen}>
        <div className="panel-head">
          <h3>{t("emerg.title")}</h3>
          <button onClick={() => setEmergOpen(false)}
                  aria-label={t("ui.close")}>✕</button>
        </div>
        <EmergencyBlock country={country.current}
                        mapCenter={globe
                          ? { lat: globe.center().lat,
                              lon: globe.center().lon }
                          : null}
                        lead={t("emerg.lead")} />
      </BottomSheet>
    </div>
  );
}

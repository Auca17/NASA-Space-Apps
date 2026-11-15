import { Suspense, lazy, useRef, useState, useCallback, useEffect } from "react";
import { useT } from "./i18n";
import { APP_NAME, DEFAULT_VIEW, DEMO_PLOT, WORLD_VIEW } from "./config";
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
import { FieldsList, FieldDetail } from "./features/field/FieldsPanel";
import { useAutoCropSplit } from "./features/field/autoCropSplit";
import { useAreaLabel } from "./features/field/areaLabel";
import { FreehandLayer } from "./features/field/FreehandLayer";
import type { AnalysisTarget } from "./features/field/FieldLens";
import {
  classifyUrban, multiPoints, pointInMulti, type LatLon, type Multi,
} from "./domain/selection";
import { splitSelection, clipZone, ROAD_HALF_WIDTH } from "./domain/split";
import {
  loadFields, saveField, renameField, deleteField, addZone, updateZone,
  addZones, setFieldCrop, markCropSplit,
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

const MapLoader = lazy(() => import("./features/globe/GlobeView")
  .then((m) => ({ default: m.MapLoader })));
const HistoricControls = lazy(() => import("./features/fire/HistoricControls")
  .then((m) => ({ default: m.HistoricControls })));
const AreaPanel = lazy(() =>
  import("./features/fire/AreaPanel").then((m) => ({ default: m.AreaPanel })));
const LiveControls = lazy(() =>
  import("./features/live/LiveMode").then((m) => ({ default: m.LiveControls })));
const FieldPanel = lazy(() =>
  import("./features/field/FieldLens").then((m) => ({ default: m.FieldPanel })));

type Mode = "welcome" | "fire" | "live" | "field";

export default function App() {
  const { t, lang, setLang } = useT();
  const areaLabel = useAreaLabel();
  const [mode, setModeState] = useState<Mode>("welcome");
  // the map callbacks are registered once: they read the mode from a ref
  const modeRef = useRef<Mode>("welcome");
  const [mapRequested, setMapRequested] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<{
    lat: number; lon: number; metres: number;
  } | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [moistureZones, setMoistureZones] = useState<MoistureZone[]>([]);
  const [selectedMoisture, selectMoisture] = useState<number | null>(null);
  const zoneClick = useRef<(point: LatLon) => void>(() => {});
  const showMoisture = useCallback((zones: MoistureZone[]) => {
    setMoistureZones(zones);
    selectMoisture(null);
  }, []);
  const setMode = (m: Mode) => {
    modeRef.current = m;
    setModeState(m);
    if (m !== "welcome") setMapRequested(true);
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
  const setDraft = (pts: [number, number][]) => {
    draftRef.current = pts; setDraftState(pts);
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
  const [lots, setLots] = useState<OrinLots["features"]>([]);
  const [playingMonth, setPlayingMonth] = useState<string | null>(null);
  const [methodsOpen, setMethodsOpen] = useState(false);
  const [emergOpen, setEmergOpen] = useState(false);
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
  const frameArgentinaOnOpen = useRef(false);

  const fireArea = (lat: number, lon: number) =>
    setArea({ lat, lon, cells: cellsInCircle(lat, lon, 50) });

  const onGlobeReady = useCallback((h: GlobeHandle) => {
    globeRef.current = h;
    setGlobe(h);
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
        const n = [...draftRef.current, [lat, lon] as [number, number]];
        setDraft(n); h.setDraft(n);
      } else if (d === "point") {
        onShapeRef.current(circleApprox(lat, lon), true);
      } else if (d === "none") zoneClick.current([lat, lon]);
    });
  }, []);

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

  zoneClick.current = (point) => {
    if (!fieldOpen) return;
    const hit = moistureZones.findIndex((z) => pointInMulti(point, moistureGeometry(z.geometry)));
    if (hit !== -1) selectMoisture(hit);
  };

  useEffect(() => {
    if (globe && target) globe.fitRing(multiPoints(target.geom), coveredBottom());
    // Only the first map initialization may race with the analysis target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globe]);

  useEffect(() => {
    globe?.setFieldBasemap(mode === "field", satellite, !fieldOpen && fieldGuide);
  }, [globe, mode, satellite, fieldGuide, fieldOpen]);

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
      if (zones.length) addZones(id, zones);
      markCropSplit(id, result);
    });
  });

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
    if (mode === "field") {
      if (locationAccuracy && !fieldOpen) {
        const { lat, lon, metres } = locationAccuracy;
        sh.push({ kind: "field", geom: [circleRing(lat, lon, metres / 1_000)] });
      }
      if (fieldOpen && target) {
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
    g.setShapes(sh);
    if (mode !== "field") { g.setDraft(null); g.setMarker(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, adjust, fields, fieldsView, shownField, pendingZone,
      fieldOpen, target, mode, areaChoice, globe, moistureZones, selectedMoisture,
      locationAccuracy]);

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
    showField(f); setPendingZone(null); setAreaChoice("all");
    setFieldsView({ id: f.id });
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
    const n = draftRef.current.slice(0, -1);
    setDraft(n);
    globeRef.current?.setDraft(n.length ? n : null);
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
    setFieldOpen(true);
    globeRef.current?.flyTo(DEMO_PLOT.lat, DEMO_PLOT.lon, 11);
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

  return (
    <div className="app">
      <header className="topbar">
        <h1><WindLogo size={30} title={APP_NAME} />
          <span className="topbar-name">{APP_NAME}</span></h1>
        <button type="button" className="home-button"
                onClick={() => {
                  if (modeRef.current === "field") changePlot();
                  setMode("welcome");
                }}>
          {t("nav.home")}</button>
        <nav>
          <button aria-pressed={mode === "field"}
                  onClick={() => {
                    if (modeRef.current !== "field") startField("none");
                  }}>{t("nav.field")}</button>
          <button aria-pressed={mode === "fire"} onClick={openFire}>
            {t("nav.fire")}</button>
          <button aria-pressed={mode === "live"}
                  onClick={() => setMode("live")}>{t("nav.live")}</button>
        </nav>
        <div className="spacer" />
        <button className="emerg-link"
                onClick={() => setEmergOpen(true)}>
          {t("emerg.nav")}</button>
        <button className="meth-link"
                onClick={() => setMethodsOpen(true)}>
          <span className="ml-long">{t("meth.link")}</span>
          <span className="ml-short">{t("meth.short")}</span></button>
        <button className="lang-btn"
                onClick={() => setLang(lang === "es" ? "en" : "es")}
                aria-label={t("nav.langLabel")}>{t("nav.lang")}</button>
      </header>

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
             aria-label={t("field.map.label")} />
        {mapRequested && <Suspense fallback={null}>
          <MapLoader container={mapDiv} onReady={onGlobeReady}
                     onUnavailable={() => setMapUnavailable(true)} />
        </Suspense>}
        {mapUnavailable && mode !== "welcome" && <p className="map-warning" role="status">
          {t(mode === "field" ? "field.map.unavailable" : "field.map.unavailableOther")}
        </p>}
        {storageError && <p className="storage-warning" role="alert">{t("fields.storageFailure")}</p>}
        {mode === "fire" && <div className="reticle" aria-hidden="true" />}
        {mode === "field" && !fieldOpen && (
          <>
            {draw === "none" && !selection && !fieldsView && (
              <div className="field-extents" role="group" aria-label={t("field.map.extent")}>
                <button type="button" onClick={showArgentina}>Argentina</button>
                <button type="button" onClick={showWorld}>{t("field.map.world")}</button>
              </div>)}
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
        {mode === "field" && !fieldOpen && selection && !adjust && (
          <SelectionReview geom={selection.geom} approx={selection.approx}
                           check={landCheck} onEdit={editSelection}
                           onCancel={cancelSelection}
                           onConfirm={confirmSelection}
                           onAdjust={startAdjust} onSave={saveSelection} />)}
        {mode === "field" && !fieldOpen && !selection && draw === "none" &&
          fieldsView === "list" && (
          <FieldsList fields={fields}
            onOpen={showField}
            onZones={openDetail}
            onAnalyze={openDetail}
            onRename={(f, n) => { storeChange(() => renameField(f.id, n)); }}
            onDelete={(f) => { if (storeChange(() => deleteField(f.id)) && shownField === f.id)
                               setShownField(null); }}
            onClose={() => { setFieldsView(null); setShownField(null); }} />)}
        {mode === "field" && !fieldOpen && !selection && draw === "none" &&
          fieldsView && fieldsView !== "list" && openField && (
          <FieldDetail key={openField.id} field={openField} pending={pendingZone}
            choice={areaChoice} onChoose={setAreaChoice}
            onAnalyze={(o) => analyzeOption(openField, o)}
            onDrawZone={(m) => drawZone(openField.id, m)}
            onSaveZone={(name, crop) => {
              if (pendingZone && storeChange(() =>
                addZone(openField.id, { name, crop, geom: pendingZone.geom })))
                setPendingZone(null);
            }}
            onDiscardZone={() => setPendingZone(null)}
            onUpdateZone={(id, p) => { storeChange(() => updateZone(openField.id, id, p)); }}
            onRemoveZone={(id) => { storeChange(() => removeZone(openField.id, id)); }}
            onAddZones={(zs) => { storeChange(() => addZones(openField.id, zs)); }}
            onSetCrop={(c) => { storeChange(() => setFieldCrop(openField.id, c)); }}
            onCropSplit={(v) => { storeChange(() => markCropSplit(openField.id, v)); }}
            onBack={() => { setPendingZone(null); setAreaChoice("all");
                            setFieldsView("list"); }} />)}
        {mode === "field" && !fieldOpen && !selection &&
          (draw !== "none" || !fieldsView) && (
          <FieldPicker draw={mapUnavailable ? "none" : draw} points={draft.length}
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
                      moistureSelection={selectedMoisture} onMoistureZones={showMoisture}
                      onMoistureSelect={focusMoisture}
                      onClose={changePlot} onChangePlot={changePlot} />
        </Suspense>)}
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

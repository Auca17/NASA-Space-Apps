import { Suspense, lazy, useRef, useState, useCallback, useEffect } from "react";
import { useT } from "./i18n";
import { APP_NAME, DEMO_PLOT } from "./config";
import { WindLogo } from "./components/WindLogo";
import { Welcome } from "./features/welcome/Welcome";
import { useGlobe, type GlobeHandle } from "./features/globe/GlobeView";
import { HistoricControls } from "./features/fire/HistoricControls";
import { cellsInCircle } from "./domain/h3area";
import { orinLots } from "./api";
import type { OrinLots } from "./api/types";
import type { DemoLot } from "./features/field/FieldLens";

const AreaPanel = lazy(() =>
  import("./features/fire/AreaPanel").then((m) => ({ default: m.AreaPanel })));
const LiveControls = lazy(() =>
  import("./features/live/LiveMode").then((m) => ({ default: m.LiveControls })));
const FieldPanel = lazy(() =>
  import("./features/field/FieldLens").then((m) => ({ default: m.FieldPanel })));

type Mode = "welcome" | "fire" | "live" | "field";
type DrawMode = "none" | "draw" | "point";

export default function App() {
  const { t, lang, setLang } = useT();
  const [mode, setMode] = useState<Mode>("welcome");
  const [globe, setGlobe] = useState<GlobeHandle | null>(null);
  const [area, setArea] = useState<{ lat: number; lon: number; cells: string[] } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [draw, setDraw] = useState<DrawMode>("none");
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [ring, setRing] = useState<[number, number][] | null>(null);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [lot, setLot] = useState<DemoLot | null>(null);
  const [lots, setLots] = useState<OrinLots["features"]>([]);
  const [playingMonth, setPlayingMonth] = useState<string | null>(null);
  const country = useRef<string | null>(null);
  const globeRef = useRef<GlobeHandle | null>(null);
  const mapDiv = useRef<HTMLDivElement>(null);

  const onGlobeReady = useCallback((h: GlobeHandle) => {
    globeRef.current = h;
    setGlobe(h);
    h.onMove((lat, lon) => {
      if (mode !== "fire") return;
      setArea({ lat, lon, cells: cellsInCircle(lat, lon, 50) });
    });
    h.onClick((lat, lon) => {
      setDraw((d) => {
        if (d === "draw") {
          setDraft((pts) => { const n = [...pts, [lat, lon] as [number, number]];
            h.setDraft(n); return n; });
        } else if (d === "point") {
          const r = circleApprox(lat, lon);
          setRing(r); setFieldOpen(true); h.setDraft(r);
          return "none";
        }
        return d;
      });
    });
  }, [mode]);

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

  useGlobe(mapDiv, onGlobeReady);

  // clear fire hexagons when leaving fire mode (else the layer lingers)
  useEffect(() => {
    if (mode !== "fire") globeRef.current?.setCells(new Map(), null);
  }, [mode]);

  // deep-link: #lat,lon jumps straight to a location (dev + sharing)
  useEffect(() => {
    const m = location.hash.match(/^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    if (m) locate(Number(m[1]), Number(m[2]));
  }, []);

  const locate = (lat: number, lon: number) => {
    setMode("fire");
    setPanelOpen(true);
    country.current = lat > -55 && lat < -21 && lon > -74 && lon < -53
      ? "AR" : null;
    setTimeout(() => {
      globeRef.current?.flyTo(lat, lon, 7);
      setArea({ lat, lon, cells: cellsInCircle(lat, lon, 50) });
    }, 100);
  };

  const startField = (dm: DrawMode) => {
    setMode("field");
    setDraw(dm);
    setDraft([]); setRing(null); setFieldOpen(false);
    globeRef.current?.setDraft(null);
  };

  const finishDraw = () => {
    if (draft.length >= 3) {
      setRing(draft); setFieldOpen(true);
    }
    setDraw("none");
  };

  const demoPlot = () => {
    const r = circleApprox(DEMO_PLOT.lat, DEMO_PLOT.lon);
    setMode("field"); setDraw("none"); setLot(null);
    setRing(r); setFieldOpen(true);
    globeRef.current?.flyTo(DEMO_PLOT.lat, DEMO_PLOT.lon, 11);
    globeRef.current?.setDraft(r);
    country.current = "AR";
  };

  // Orin demo lots (contract 2.9): ring straight from the geojson
  // polygon; the panel knows rotations don't cover these crops
  const orinLot = (f: OrinLots["features"][number]) => {
    const ring = (f.geometry.coordinates[0] ?? [])
      .slice(0, -1)
      .map(([lo, la]) => [la, lo] as [number, number]);
    if (ring.length < 3) return;
    const clat = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const clon = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    setMode("field"); setDraw("none");
    setLot({ name: f.properties.name,
             crop_label: f.properties.crop_label,
             synthetic: f.properties.synthetic });
    setRing(ring); setFieldOpen(true);
    globeRef.current?.flyTo(clat, clon, 13);
    globeRef.current?.setDraft(ring);
    country.current = "AR";
  };

  useEffect(() => {
    orinLots().then((d) => setLots(d?.features ?? []));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <h1><WindLogo size={30} title={APP_NAME} /><span className="topbar-name">{APP_NAME}</span></h1>
        <nav>
          <button aria-pressed={mode === "fire"}
                  onClick={() => { setMode("fire"); setPanelOpen(true); }}>
            {t("nav.fire")}</button>
          <button aria-pressed={mode === "live"}
                  onClick={() => setMode("live")}>{t("nav.live")}</button>
          <button aria-pressed={mode === "field"}
                  onClick={() => setMode("field")}>{t("nav.field")}</button>
        </nav>
        <div className="spacer" />
        <button onClick={() => setLang(lang === "es" ? "en" : "es")}
                aria-label="language">{t("nav.lang")}</button>
      </header>

      <div className="map-wrap">
        <div ref={mapDiv} className="map" role="application"
             aria-label="mapa" />
        {mode !== "welcome" && <div className="reticle" aria-hidden="true" />}

        {mode === "welcome" && (
          <div className="welcome" style={{ position: "absolute", inset: 0,
            display: "flex", background: "var(--bg)" }}>
            <div style={{ margin: "auto" }}>
              <Welcome onLocate={locate} onExplore={() => setMode("fire")} />
            </div>
          </div>)}

        {mode === "fire" &&
          <HistoricControls globe={globe} onMonth={setPlayingMonth} />}

        {mode === "live" && (
          <Suspense fallback={null}>
            <LiveControls globe={globe} country={country.current} />
          </Suspense>)}

        {mode === "field" && !fieldOpen && (
          <div className="controls">
            <div className="row">
              <strong>{t("field.cta")}</strong>
            </div>
            <p className="muted" style={{ margin: 0 }}>{t("field.how")}</p>
            <div className="row">
              <button onClick={() => startField("draw")}>{t("field.draw")}</button>
              <button onClick={() => startField("point")}>{t("field.point")}</button>
              <button onClick={demoPlot}>{t("field.demo")}</button>
              {lots.map((f) => (
                <button key={f.properties.id}
                        onClick={() => orinLot(f)}>
                  {f.properties.crop_label}</button>))}
            </div>
            {draw === "draw" && (
              <div className="row">
                <span className="muted">{draft.length} pts</span>
                <button className="primary" onClick={finishDraw}
                        disabled={draft.length < 3}>{t("field.finish")}</button>
              </div>)}
            <p className="muted" style={{ margin: 0 }}>{t("field.savedLocal")}</p>
          </div>)}
        {mode === "field" && draw !== "none" &&
          <div className="draw-hint">{t("field.how")}</div>}
      </div>

      {mode === "fire" && area && (
        <Suspense fallback={null}>
          <AreaPanel lat={area.lat} lon={area.lon} cells={area.cells}
                     open={panelOpen} onClose={() => setPanelOpen(false)}
                     country={country.current} month={playingMonth} />
        </Suspense>)}
      {mode === "field" && (
        <Suspense fallback={null}>
          <FieldPanel ring={ring} open={fieldOpen} lot={lot}
                      onClose={() => { setFieldOpen(false); setRing(null);
                        setLot(null);
                        globeRef.current?.setDraft(null); }} />
        </Suspense>)}
    </div>
  );
}

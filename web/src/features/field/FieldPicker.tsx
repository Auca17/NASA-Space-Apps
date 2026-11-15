/** Step-by-step guide to mark a field: choose a method, then follow
 * the instructions for drawing an outline (point by point or freehand)
 * or tapping a point. Also used to draw crop zones inside a field. */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useT } from "../../i18n";
import { drawStatus } from "../../domain/clarity";
import { PlaceFinder } from "./PlaceFinder";
import {
  activeDrawState, removeActiveVertex, subscribeDrawSession,
} from "./drawEdit";

export type DrawMode = "none" | "draw" | "point" | "free";

export function FieldPicker({ draw, points, onPick, onDemo, onFinish,
                              onUndo, onCancel, onGo, onFields = () => {},
                              fieldsCount = 0, context, freeError = false,
                              zoomLow = false, onZoomIn = () => {},
                              demoLots = [], movingMap = false, onToggleMove,
                              onPointCoords }: {
  draw: DrawMode;
  points: number;
  onPick: (m: "draw" | "point" | "free") => void;
  onDemo: () => void;
  /** Keyboard path: a ~50 ha selection around entered coordinates. */
  onPointCoords?: (lat: number, lon: number) => void;
  demoLots?: { id: string; label: string; onOpen: () => void }[];
  onFinish: () => void;
  onUndo: () => void;
  onCancel: () => void;
  /** Center the map on a place (current location or search hit). */
  onGo: (lat: number, lon: number, precise?: boolean) => void;
  onFields?: () => void;
  fieldsCount?: number;
  /** Shown on top while drawing something else than a field (a zone). */
  context?: string;
  /** Last freehand stroke enclosed too little area. */
  freeError?: boolean;
  /** The map is still too far to tell plots apart. */
  zoomLow?: boolean;
  onZoomIn?: () => void;
  movingMap?: boolean;
  onToggleMove?: () => void;
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(true);
  /** On compact widths the chooser is a peekable bottom sheet where the
   * default state is the peek (only the main action visible): there
   * `expanded` means "peek", so the visible state is inverted and
   * aria-expanded must report what the user actually sees. */
  const [compact, setCompact] = useState(() =>
    typeof matchMedia !== "undefined" &&
    matchMedia("(max-width: 900px)").matches);
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia("(max-width: 900px)");
    const on = () => setCompact(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const shown = compact ? !expanded : expanded;
  // the draw layer's session: selected vertex + refusal notices
  const drawSt = useSyncExternalStore(subscribeDrawSession,
                                      activeDrawState);
  const ctx = context && <p className="picker-context">{context}</p>;
  const move = onToggleMove && (
    <button type="button" className={movingMap ? "primary" : undefined}
            onClick={onToggleMove}>
      {t(movingMap ? "field.map.resume" : "field.map.move")}
    </button>);
  const zoomDetail = zoomLow && (
    <button type="button" onClick={onZoomIn}>{t("field.zoomIn")}</button>);
  const finder = (
    <details className="place-more">
      <summary>{t("place.title")}</summary>
      <PlaceFinder onGo={onGo} />
    </details>);

  if (draw === "draw") {
    const st = drawStatus(points);
    return (
      <div className="controls picker" role="region"
           aria-label={t("field.drawing.title")}>
        {ctx}
        <strong className="picker-mode">{t("field.drawing.title")}</strong>
        <p className="picker-how" aria-live="polite">
          {t(movingMap ? "field.map.moving"
            : drawSt?.closed ? "field.drawing.howEdit"
            : "field.drawing.how")}</p>
        <p aria-live="polite" className="picker-status">
          <span className="picker-count">
            {t("field.drawing.count", { n: points })}</span>{" "}
          {st.canFinish ? t("field.drawing.ready")
            : t("field.drawing.missing", { k: st.missing })}
        </p>
        {drawSt?.notice && (
          <p className="notice" role="status">{t(drawSt.notice)}</p>)}
        <div className="row">
          <button className="primary" onClick={onFinish}
                  disabled={!st.canFinish}>{t("field.finish")}</button>
          <button onClick={onUndo} disabled={points === 0}>
            {t("field.drawing.undo")}</button>
          {drawSt?.closed && drawSt.selected != null && (
            <button onClick={removeActiveVertex}>
              {t("field.draw.removeVertex")}</button>)}
          {move}
          {zoomDetail}
          <button onClick={onCancel}>{t("field.cancel")}</button>
        </div>
        {!context && finder}
      </div>);
  }

  if (draw === "free") {
    return (
      <div className="controls picker" role="region"
           aria-label={t("field.free.title")}>
        {ctx}
        <strong className="picker-mode">{t("field.free.title")}</strong>
        <p className="picker-how" aria-live="polite">
          {t(movingMap ? "field.map.moving" : "field.free.how")}</p>
        {freeError && (
          <p className="notice" role="status">{t("field.free.tooSmall")}</p>)}
        <div className="row">
          {move}
          {zoomDetail}
          <button onClick={onCancel}>{t("field.cancel")}</button>
        </div>
      </div>);
  }

  if (draw === "point") {
    return (
      <div className="controls picker" role="region"
           aria-label={t("field.pointing.title")}>
        <strong className="picker-mode">{t("field.pointing.title")}</strong>
        <p className="picker-how" aria-live="polite">
          {t(movingMap ? "field.map.moving" : "field.pointing.how")}</p>
        <div className="row">
          {move}
          {zoomDetail}
          <button onClick={onCancel}>{t("field.cancel")}</button>
        </div>
        {finder}
      </div>);
  }

  return (
    <div className="controls picker field-chooser" role="region"
         aria-label={t("field.choose.title")}>
      <div className="picker-head">
        <button type="button" aria-expanded={shown}
                aria-controls="field-chooser-options"
                data-peek={expanded}
                onClick={() => setExpanded(!expanded)}>
          {t(shown ? "field.choose.hide" : "field.choose.show")}</button>
        <button type="button" onClick={onFields}>{t("fields.open", { n: fieldsCount })}</button>
      </div>
      <div id="field-chooser-options" hidden={!expanded}>
        {zoomLow ? <PlaceFinder onGo={onGo} /> : finder}
        <div className="row">
          <button className="primary" onClick={() => onPick("draw")}>{t("field.draw")}</button>
          {zoomDetail}
        </div>
        <p className="picker-how">{t("field.opt.drawText")}</p>
        <details className="field-examples">
          <summary>{t("field.moreWays")}</summary>
          <ul className="picker-options">
            <li>
              <button onClick={() => onPick("free")}>{t("field.free")}</button>
              <span className="muted">{t("field.opt.freeText")}</span>
            </li>
            <li>
              <button onClick={() => onPick("point")}>{t("field.point")}</button>
              <span className="muted">{t("field.opt.pointText")}</span>
            </li>
          </ul>
          {onPointCoords && <CoordForm onSubmit={onPointCoords} t={t} />}
        </details>
        <details className="field-examples">
          <summary>{t("field.examples")}</summary>
          <div className="row">
            <button onClick={onDemo}>{t("field.demo")}</button>
            {demoLots.map(({ id, label, onOpen }) => (
              <button key={id} onClick={onOpen}>{label}</button>))}
          </div>
        </details>
      </div>
    </div>);
}

/** Keyboard-only path to a ~50 ha selection: typed lat/lon instead of
 * a map tap. Lives inside "Otras formas de marcar". */
function CoordForm({ onSubmit, t }: {
    onSubmit: (lat: number, lon: number) => void;
    t: (k: string) => string }) {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [bad, setBad] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const la = Number(lat.replace(",", "."));
    const lo = Number(lon.replace(",", "."));
    if (!Number.isFinite(la) || !Number.isFinite(lo) ||
        Math.abs(la) > 90 || Math.abs(lo) > 180) {
      setBad(true); return;
    }
    setBad(false);
    onSubmit(la, lo);
  };
  return (
    <form className="coord-form" onSubmit={submit}>
      <p className="picker-how">{t("field.coords.how")}</p>
      <div className="coord-row">
        <label>{t("field.coords.lat")}
          <input inputMode="decimal" value={lat}
                 onChange={(e) => setLat(e.target.value)} /></label>
        <label>{t("field.coords.lon")}
          <input inputMode="decimal" value={lon}
                 onChange={(e) => setLon(e.target.value)} /></label>
        <button type="submit">{t("field.coords.go")}</button>
      </div>
      {bad && <p className="notice" role="alert">{t("field.coords.invalid")}</p>}
    </form>);
}

/** Step-by-step guide to mark a field: choose a method, then follow
 * the instructions for drawing an outline (point by point or freehand)
 * or tapping a point. Also used to draw crop zones inside a field. */
import { useState, useSyncExternalStore } from "react";
import { useT } from "../../i18n";
import { drawStatus } from "../../domain/clarity";
import { PlaceFinder } from "./PlaceFinder";
import {
  activeDrawState, removeActiveVertex, subscribeDrawSession,
} from "./drawEdit";

export type DrawMode = "none" | "draw" | "point" | "free";

export function FieldPicker({ draw, points, onFinish, onUndo, onCancel, onGo,
                              context, freeError = false, zoomLow = false,
                              onZoomIn = () => {}, movingMap = false, onToggleMove }: {
  draw: Exclude<DrawMode, "none">;
  points: number;
  onFinish: () => void;
  onUndo: () => void;
  onCancel: () => void;
  onGo: (lat: number, lon: number, precise?: boolean, accuracy?: number) => void;
  context?: string;
  freeError?: boolean;
  zoomLow?: boolean;
  onZoomIn?: () => void;
  movingMap?: boolean;
  onToggleMove?: () => void;
}) {
  const { t } = useT();
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

  return (
    <div className="controls picker" role="region" aria-label={t("field.pointing.title")}>
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

export function FieldCreationControls({ onPick, onGo, onPointCoords, mapUnavailable,
                                         zoomLow, onZoomIn }: {
  onPick: (mode: Exclude<DrawMode, "none">) => void;
  onGo: (lat: number, lon: number, precise?: boolean, accuracy?: number) => void;
  onPointCoords: (lat: number, lon: number) => void;
  mapUnavailable: boolean;
  zoomLow: boolean;
  onZoomIn: () => void;
}) {
  const { t } = useT();
  return <div className="field-creation">
    <PlaceFinder onGo={onGo} />
    {!mapUnavailable && <>
      <div className="row">
        <button type="button" className="primary" onClick={() => onPick("draw")}>
          {t("field.draw")}
        </button>
        {zoomLow && <button type="button" onClick={onZoomIn}>{t("field.zoomIn")}</button>}
      </div>
      <p className="picker-how">{t("field.opt.drawText")}</p>
      <details>
        <summary>{t("field.moreWays")}</summary>
        <ul className="picker-options">
          <li>
            <button type="button" onClick={() => onPick("free")}>{t("field.free")}</button>
            <span className="muted">{t("field.opt.freeText")}</span>
          </li>
          <li>
            <button type="button" onClick={() => onPick("point")}>{t("field.point")}</button>
            <span className="muted">{t("field.opt.pointText")}</span>
          </li>
        </ul>
        <CoordForm onSubmit={onPointCoords} t={t} />
      </details>
    </>}
    {mapUnavailable && <CoordForm onSubmit={onPointCoords} t={t} />}
  </div>;
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

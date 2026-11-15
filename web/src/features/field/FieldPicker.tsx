/** Step-by-step guide to mark a field: choose a method, then follow
 * the instructions for drawing an outline (point by point or freehand)
 * or tapping a point. Also used to draw crop zones inside a field. */
import { useState } from "react";
import { useT } from "../../i18n";
import { drawStatus } from "../../domain/clarity";
import { PlaceFinder } from "./PlaceFinder";

export type DrawMode = "none" | "draw" | "point" | "free";

export function FieldPicker({ draw, points, onPick, onDemo, onFinish,
                              onUndo, onCancel, onGo, onFields = () => {},
                              fieldsCount = 0, context, freeError = false,
                              zoomLow = false, onZoomIn = () => {},
                              demoLots = [], movingMap = false, onToggleMove,
                              mapUnavailable = false }: {
  draw: DrawMode;
  points: number;
  onPick: (m: "draw" | "point" | "free") => void;
  onDemo: () => void;
  demoLots?: { id: string; label: string; onOpen: () => void }[];
  onFinish: () => void;
  onUndo: () => void;
  onCancel: () => void;
  /** Center the map on a place (current location or search hit). */
  onGo: (lat: number, lon: number, precise?: boolean, accuracy?: number) => void;
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
  mapUnavailable?: boolean;
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(true);
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
          {t(movingMap ? "field.map.moving" : "field.drawing.how")}</p>
        <p aria-live="polite" className="picker-status">
          <span className="picker-count">
            {t("field.drawing.count", { n: points })}</span>{" "}
          {st.canFinish ? t("field.drawing.ready")
            : t("field.drawing.missing", { k: st.missing })}
        </p>
        <div className="row">
          <button className="primary" onClick={onFinish}
                  disabled={!st.canFinish}>{t("field.finish")}</button>
          <button onClick={onUndo} disabled={points === 0}>
            {t("field.drawing.undo")}</button>
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
        <button type="button" aria-expanded={expanded} aria-controls="field-chooser-options"
                onClick={() => setExpanded(!expanded)}>
          {t(expanded ? "field.choose.hide" : "field.choose.show")}</button>
        <button type="button" onClick={onFields}>{t("fields.open", { n: fieldsCount })}</button>
      </div>
      <div id="field-chooser-options" hidden={!expanded}>
        {zoomLow || mapUnavailable ? <PlaceFinder onGo={onGo} /> : finder}
        {!mapUnavailable && <><div className="row">
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
        </details></>}
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

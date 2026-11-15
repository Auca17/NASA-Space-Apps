/** Step-by-step guide to mark a field: choose a method, then follow
 * the instructions for drawing an outline (point by point or freehand)
 * or tapping a point. Also used to draw crop zones inside a field. */
import { useT } from "../../i18n";
import { drawStatus } from "../../domain/clarity";
import { PlaceFinder } from "./PlaceFinder";

export type DrawMode = "none" | "draw" | "point" | "free";

export function FieldPicker({ draw, points, onPick, onDemo, onFinish,
                              onUndo, onCancel, onGo, onFields = () => {},
                              fieldsCount = 0, context, freeError = false,
                              zoomLow = false, onZoomIn = () => {},
                              demoLots = [] }: {
  draw: DrawMode;
  points: number;
  onPick: (m: "draw" | "point" | "free") => void;
  onDemo: () => void;
  demoLots?: { id: string; label: string; onOpen: () => void }[];
  onFinish: () => void;
  onUndo: () => void;
  onCancel: () => void;
  /** Center the map on a place (current location or search hit). */
  onGo: (lat: number, lon: number) => void;
  onFields?: () => void;
  fieldsCount?: number;
  /** Shown on top while drawing something else than a field (a zone). */
  context?: string;
  /** Last freehand stroke enclosed too little area. */
  freeError?: boolean;
  /** The map is still too far to tell plots apart. */
  zoomLow?: boolean;
  onZoomIn?: () => void;
}) {
  const { t } = useT();
  const ctx = context && <p className="picker-context">{context}</p>;
  const zoomHint = zoomLow && (
    <p className="zoom-hint" role="status">
      <span>{t("field.zoomHint")}</span>
      <button type="button" onClick={onZoomIn}>{t("field.zoomIn")}</button>
    </p>);
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
        {zoomHint}
        <p className="picker-how">{t("field.drawing.how")}</p>
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
        {zoomHint}
        <p className="picker-how">{t("field.free.how")}</p>
        {freeError && (
          <p className="notice" role="status">{t("field.free.tooSmall")}</p>)}
        <div className="row">
          <button onClick={onCancel}>{t("field.cancel")}</button>
        </div>
      </div>);
  }

  if (draw === "point") {
    return (
      <div className="controls picker" role="region"
           aria-label={t("field.pointing.title")}>
        <strong className="picker-mode">{t("field.pointing.title")}</strong>
        {zoomHint}
        <p className="picker-how">{t("field.pointing.how")}</p>
        <div className="row">
          <button onClick={onCancel}>{t("field.cancel")}</button>
        </div>
        {finder}
      </div>);
  }

  return (
    <div className="controls picker" role="region"
         aria-label={t("field.choose.title")}>
      <PlaceFinder onGo={onGo} />
      <div className="picker-head">
        <strong>{t("field.choose.title")}</strong>
        <button onClick={onFields}>
          {t("fields.open", { n: fieldsCount })}</button>
      </div>
      {zoomHint}
      <ul className="picker-options">
        <li>
          <button onClick={() => onPick("free")}>{t("field.free")}</button>
          <span className="muted">{t("field.opt.freeText")}</span>
        </li>
        <li>
          <button onClick={() => onPick("draw")}>{t("field.draw")}</button>
          <span className="muted">{t("field.opt.drawText")}</span>
        </li>
        <li>
          <button onClick={() => onPick("point")}>{t("field.point")}</button>
          <span className="muted">{t("field.opt.pointText")}</span>
        </li>
        <li>
          <button onClick={onDemo}>{t("field.demo")}</button>
          <span className="muted">{t("field.opt.demoText")}</span>
        </li>
        {demoLots.map(({ id, label, onOpen }) => (
          <li key={id}>
            <button onClick={onOpen}>{label}</button>
          </li>))}
      </ul>
      <p className="muted" style={{ margin: 0 }}>
        {t("field.choose.zoom")} {t("field.osmNote")} {t("field.savedLocal")}</p>
    </div>);
}

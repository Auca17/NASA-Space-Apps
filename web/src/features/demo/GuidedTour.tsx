/** Guided demo tour (tasks 40/42): six small hints anchored to real
 * elements — the parcels, the fire/water badges, an alert, the
 * Rotaciones tab, a rotation card and "Más información". It never
 * blocks the map: only the hint card itself takes pointer events.
 * Escape or "Cerrar" dismiss it for good (localStorage). `onStep`
 * fires when a step activates so anchors hidden inside other tabs
 * can be revealed before the hint positions itself. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import { markTourSeen, TOUR_STEPS } from "./demoTour";

const MARGIN = 8;
const HINT_W = 280;

export function GuidedTour({ onClose, onStep }: {
    onClose: () => void;
    onStep?: (stepId: string) => void }) {
  const { t } = useT();
  const [i, setI] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const step = TOUR_STEPS[i];

  const close = useCallback(() => { markTourSeen(); onClose(); }, [onClose]);

  const place = useCallback((retried = false) => {
    const anchor = step ? document.querySelector(step.sel) : null;
    const hint = hintRef.current;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(HINT_W, vw - 2 * MARGIN);
    if (!anchor) {           // anchor missing: bottom-centre
      setPos({ left: (vw - w) / 2, top: vh * 0.6 });
      return;
    }
    const r = anchor.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) {
      if (retried) {         // still off-screen: bottom-centre
        setPos({ left: (vw - w) / 2, top: vh * 0.6 });
        return;
      }
      try { anchor.scrollIntoView({ block: "nearest", inline: "nearest" }); }
      catch { /* older doms */ }
      requestAnimationFrame(() => place(true));
      return;
    }
    const h = hint?.offsetHeight ?? 120;
    // prefer below the anchor; fall back above when there's no room
    let top = r.bottom + MARGIN;
    if (top + h > vh - MARGIN) top = Math.max(MARGIN, r.top - h - MARGIN);
    const left = Math.min(
      Math.max(MARGIN, r.left + r.width / 2 - w / 2), vw - w - MARGIN);
    setPos({ left, top });
  }, [step]);

  useEffect(() => {
    place();
    const onResize = () => place();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [place]);

  // Let the app reveal tab-bound anchors, then re-place once the
  // layout settled (tab switch renders new DOM nodes).
  useEffect(() => {
    if (!step || !onStep) return;
    onStep(step.id);
    const id = requestAnimationFrame(() => place());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, onStep]);

  // Escape closes; focus the hint so screen readers announce the step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
    };
    window.addEventListener("keydown", onKey);
    hintRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [close, i]);

  return (
    <div className="demo-tour">
      <div ref={hintRef} className="tour-hint" role="dialog"
           aria-label={t("demo.tour.title")} tabIndex={-1}
           style={pos ? { left: pos.left, top: pos.top } :
                       { left: MARGIN, top: MARGIN, visibility: "hidden" }}>
        <p className="tour-step muted">
          {t("demo.tour.step", { i: i + 1, n: TOUR_STEPS.length })}</p>
        <p className="tour-text">{t(`${step.key}.title`)}</p>
        <p className="tour-sub muted">{t(`${step.key}.body`)}</p>
        <div className="row tour-actions">
          <button type="button" onClick={() => setI(i - 1)}
                  disabled={i === 0}>{t("demo.tour.back")}</button>
          {i < TOUR_STEPS.length - 1 ? (
            <button type="button" className="primary"
                    onClick={() => setI(i + 1)}>
              {t("demo.tour.next")}</button>
          ) : (
            <button type="button" className="primary" onClick={close}>
              {t("demo.tour.done")}</button>)}
          <button type="button" className="tour-close" onClick={close}>
            {t("demo.tour.close")}</button>
        </div>
      </div>
    </div>);
}

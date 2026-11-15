/** Click-to-draw overlay: an invisible surface over the map that turns
 * pointer gestures into outline edits on a DrawSession.
 * - open path: each click appends a vertex; the path stays open and
 *   follows the clicks until the first vertex is tapped (closed)
 * - closed outline: click on a vertex selects it, click on an edge
 *   inserts a vertex there, drag moves vertices, right-click or a long
 *   press removes a vertex
 * The map is panned with the "mover mapa" toggle, like freehand mode. */
import { useEffect, useRef, useState } from "react";
import type { LatLon } from "../../domain/selection";
import { nearestVertex } from "../../domain/parcelsGeo";
import {
  DrawSession, activateDrawSession, deactivateDrawSession,
} from "./drawEdit";

const LONG_PRESS_MS = 550;
const CLICK_PX = 8;

type Props = {
  unproject: (x: number, y: number) => LatLon;
  /** live outline mirror for previews (ring, closed). */
  onSync?: (ring: LatLon[], closed: boolean) => void;
  /** reuse a session (the parcels wizard keeps its own); a fresh one
   * seeded from `initialRing`/`initialClosed` is created otherwise. */
  session?: DrawSession;
  initialRing?: LatLon[];
  initialClosed?: boolean;
};

export function DrawLayer({ unproject, onSync, session: given,
                            initialRing, initialClosed }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [session] = useState(() =>
    given ?? new DrawSession(initialRing ?? [], initialClosed ?? false));
  const st = useRef({ dragging: false, downAt: [0, 0] as [number, number],
                      downLL: null as LatLon | null, moved: false,
                      longPress: 0 as number | undefined });

  // metres for ~14 px: hit radius that follows the zoom level
  const tolM = (): number => {
    const r = ref.current!.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const [la1, lo1] = unproject(cx - r.left, cy - r.top);
    const [la2, lo2] = unproject(cx - r.left + 14, cy - r.top);
    const m = Math.hypot((la2 - la1) * 111_000,
      (lo2 - lo1) * 111_000 * Math.cos((la1 * Math.PI) / 180));
    return Math.max(5, m);
  };

  const ll = (e: React.PointerEvent): LatLon => {
    const r = ref.current!.getBoundingClientRect();
    return unproject(e.clientX - r.left, e.clientY - r.top);
  };

  useEffect(() => {
    activateDrawSession(session);
    const unsub = session.subscribe(() =>
      onSync?.(session.state.ring, session.state.closed));
    onSync?.(session.state.ring, session.state.closed);
    return () => { unsub(); deactivateDrawSession(session); };
  }, [session, onSync]);

  const clearLongPress = () => {
    if (st.current.longPress != null) {
      clearTimeout(st.current.longPress);
      st.current.longPress = undefined;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // jsdom's synthetic events carry no button; real right-clicks do
    if (e.button !== undefined && e.button > 0) return;
    const el = ref.current!;
    el.setPointerCapture?.(e.pointerId);
    const p = ll(e);
    st.current = { ...st.current, downAt: [e.clientX, e.clientY],
                     downLL: p, moved: false };
    if (session.state.closed) {
      const i = nearestVertex(session.state.ring, p, tolM());
      if (i >= 0 && session.startDrag(i)) {
        st.current.dragging = true;
        session.select(i);
        st.current.longPress = window.setTimeout(() => {
          session.cancelDrag();
          session.removeAt(i);
          st.current.dragging = false;
          st.current.longPress = undefined;
        }, LONG_PRESS_MS);
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const [x0, y0] = st.current.downAt;
    if (Math.hypot(e.clientX - x0, e.clientY - y0) > 4) {
      st.current.moved = true;
      clearLongPress();
    }
    if (st.current.dragging && st.current.moved) {
      session.dragTo(ll(e));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    clearLongPress();
    const [x0, y0] = st.current.downAt;
    const travel = Math.hypot(e.clientX - x0, e.clientY - y0);
    if (st.current.dragging) {
      st.current.dragging = false;
      if (st.current.moved) session.endDrag();
      return;
    }
    if (travel <= CLICK_PX && st.current.downLL) {
      session.click(st.current.downLL, tolM());
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!session.state.closed) return;
    const r = ref.current!.getBoundingClientRect();
    const p = unproject(e.clientX - r.left, e.clientY - r.top);
    const i = nearestVertex(session.state.ring, p, tolM());
    if (i >= 0) session.removeAt(i);
  };

  return (
    <div
      ref={ref}
      className="freehand-layer"
      style={{ touchAction: "none", cursor: "crosshair" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { clearLongPress(); session.cancelDrag();
                               st.current.dragging = false; }}
      onContextMenu={onContextMenu}
      aria-hidden="true"
    />
  );
}

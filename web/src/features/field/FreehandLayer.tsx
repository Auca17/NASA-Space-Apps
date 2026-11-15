/** Freehand drawing: while this layer covers the map, a mouse drag or a
 * finger stroke traces the field's edge instead of moving the map. On
 * release the stroke is closed and cleaned up. Removing the layer gives
 * the gestures back to the map. */
import { useRef } from "react";
import { freehandToRing } from "../../domain/split";
import type { LatLon } from "../../domain/selection";

/** Minimum pointer travel (px) between recorded points. */
const STEP_PX = 4;

export function FreehandLayer({ unproject, onStroke, onDone }: {
  unproject: (x: number, y: number) => LatLon;
  /** live preview of the stroke so far */
  onStroke: (pts: LatLon[]) => void;
  /** closed ring, or null when the stroke enclosed too little area */
  onDone: (ring: LatLon[] | null) => void;
}) {
  const pts = useRef<LatLon[]>([]);
  const last = useRef<[number, number] | null>(null);
  const active = useRef(false);

  const pos = (e: React.PointerEvent<HTMLDivElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  return (
    <div className="freehand-layer" aria-hidden="true"
      onPointerDown={(e) => {
        e.preventDefault();
        // keep receiving the stroke if the finger leaves the layer
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no capture */ }
        active.current = true;
        const p = pos(e);
        last.current = p;
        pts.current = [unproject(...p)];
      }}
      onPointerMove={(e) => {
        if (!active.current) return;
        const p = pos(e);
        const l = last.current!;
        if (Math.hypot(p[0] - l[0], p[1] - l[1]) < STEP_PX) return;
        last.current = p;
        pts.current.push(unproject(...p));
        onStroke(pts.current);
      }}
      onPointerUp={() => {
        if (!active.current) return;
        active.current = false;
        onDone(freehandToRing(pts.current));
        pts.current = [];
      }}
      onPointerCancel={() => {
        active.current = false;
        pts.current = [];
        onStroke([]);
      }} />);
}

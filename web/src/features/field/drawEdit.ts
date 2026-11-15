/** Drawing edit session: the outline the user is marking on the map.
 * While the path is open each click appends a vertex; once the outline
 * is closed (a finished field or zone being edited) a click inserts a
 * vertex on the nearest edge, vertices can be dragged or removed, and
 * every mutation that would self-cross the ring is refused with a
 * notice. A history stack makes every edit undoable. */
import {
  insertOnEdge, nearestVertex, removeVertex, selfIntersects,
} from "../../domain/parcelsGeo";
import type { LatLon } from "../../domain/selection";

export type DrawState = {
  ring: LatLon[];
  /** true once the outline is closed (editing a finished shape). */
  closed: boolean;
  /** index of the vertex selected by the last tap, or null. */
  selected: number | null;
  /** i18n key of the last refusal ("field.draw.crossed"), or null. */
  notice: string | null;
};

type Snapshot = { ring: LatLon[]; closed: boolean; selected: number | null };

const snap = (s: DrawState): Snapshot =>
  ({ ring: s.ring.map((p) => [...p] as LatLon),
     closed: s.closed, selected: s.selected });

export class DrawSession {
  state: DrawState;
  private history: Snapshot[] = [];
  private listeners = new Set<() => void>();
  private dragFrom: LatLon[] | null = null;
  private dragIndex: number | null = null;

  constructor(ring: LatLon[] = [], closed = false) {
    this.state = { ring: ring.map((p) => [...p] as LatLon),
                   closed, selected: null, notice: null };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const f of this.listeners) f();
  }

  snapshot(): DrawState { return { ...this.state, ring: [...this.state.ring] }; }

  /** Replace the session (editing an existing outline, or a fresh one). */
  seed(ring: LatLon[], closed: boolean) {
    this.state = { ring: ring.map((p) => [...p] as LatLon),
                   closed, selected: null, notice: null };
    this.history = [];
    this.dragFrom = null;
    this.notify();
  }

  private push() {
    this.history.push(snap(this.state));
    if (this.history.length > 100) this.history.shift();
  }

  private fail(notice: string) {
    this.state = { ...this.state, notice };
    this.notify();
  }

  /** A tap on the map. `tolM`: grab radius in metres (~14 px).
   * Open path: appends the point, or closes the outline when the tap
   * lands on the first vertex and 3+ points exist. Closed: taps on a
   * vertex select it; taps elsewhere insert on the nearest edge. */
  click(p: LatLon, tolM: number) {
    const { ring, closed } = this.state;
    if (!closed) {
      if (ring.length >= 3 && nearestVertex(ring, p, tolM) === 0) {
        this.push();
        this.state = { ...this.state, closed: true, notice: null };
      } else {
        this.push();
        this.state = { ...this.state,
          ring: [...ring, p], selected: null, notice: null };
      }
      this.notify();
      return;
    }
    const hit = nearestVertex(ring, p, tolM);
    if (hit >= 0) {
      this.state = { ...this.state,
        selected: this.state.selected === hit ? null : hit,
        notice: null };
      this.notify();
      return;
    }
    const ins = insertOnEdge(ring, p);
    if (!ins) { this.fail("field.draw.crossed"); return; }
    this.push();
    this.state = { ...this.state, ring: ins.ring,
                   selected: ins.index, notice: null };
    this.notify();
  }

  /** Start dragging vertex `i` (pointer down on it, closed mode). */
  startDrag(i: number): boolean {
    if (!this.state.closed || i < 0 || i >= this.state.ring.length) {
      return false;
    }
    this.dragFrom = this.state.ring.map((p) => [...p] as LatLon);
    this.dragIndex = i;
    return true;
  }

  /** Live move during a drag (no validity check yet). */
  dragTo(p: LatLon) {
    if (this.dragIndex == null) return;
    const ring = this.state.ring.slice();
    ring[this.dragIndex] = p;
    this.state = { ...this.state, ring };
    this.notify();
  }

  /** Drop the dragged vertex; refuses when the ring would cross. */
  endDrag() {
    if (this.dragIndex == null || this.dragFrom == null) return;
    const from = this.dragFrom, i = this.dragIndex;
    this.dragFrom = null; this.dragIndex = null;
    if (selfIntersects(this.state.ring)) {
      this.state = { ...this.state, ring: from,
                     notice: "field.draw.crossed" };
      this.notify();
      return;
    }
    this.push();
    this.history[this.history.length - 1] = { ring: from,
      closed: this.state.closed, selected: this.state.selected };
    this.state = { ...this.state, selected: i, notice: null };
    this.notify();
  }

  cancelDrag() {
    if (this.dragFrom) {
      this.state = { ...this.state, ring: this.dragFrom };
    }
    this.dragFrom = null; this.dragIndex = null;
    this.notify();
  }

  /** Remove a vertex (right-click, long-press or the panel button). */
  removeAt(i: number) {
    const next = removeVertex(this.state.ring, i);
    if (!next) { this.fail("field.draw.minPoints"); return; }
    this.push();
    this.state = { ...this.state, ring: next, selected: null, notice: null };
    this.notify();
  }

  removeSelected() {
    if (this.state.selected != null) this.removeAt(this.state.selected);
  }

  select(i: number | null) {
    this.state = { ...this.state, selected: i };
    this.notify();
  }

  /** Restore the state before the last edit; false when empty. */
  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.state = { ...prev, notice: null };
    this.notify();
    return true;
  }
}

/* ------------------------------------------- registry for panels ---- */
/* The map layer owns a session; the picker panel (a sibling) reads it
 * for the remove-vertex button and the refusal notices, and the app's
 * undo button replays through it. One active session at a time. */

let active: DrawSession | null = null;
const regListeners = new Set<() => void>();
let sessionUnsub: (() => void) | null = null;

const notifyReg = () => { for (const f of regListeners) f(); };

export function activateDrawSession(s: DrawSession) {
  sessionUnsub?.();
  active = s;
  sessionUnsub = s.subscribe(notifyReg);
  notifyReg();
}

export function deactivateDrawSession(s: DrawSession) {
  if (active === s) {
    sessionUnsub?.(); sessionUnsub = null;
    active = null;
    notifyReg();
  }
}

export function closeDrawSession() {
  if (active) {
    sessionUnsub?.(); sessionUnsub = null;
    active = null;
    notifyReg();
  }
}

export function subscribeDrawSession(fn: () => void): () => void {
  regListeners.add(fn);
  return () => { regListeners.delete(fn); };
}

export function activeDrawState(): DrawState | null {
  // state is replaced wholesale on every mutation, so the reference is
  // stable between notifies (useSyncExternalStore needs that)
  return active ? active.state : null;
}

/** Undo through the session; false when there is nothing to undo. */
export function undoActiveDraw(): boolean {
  return active ? active.undo() : false;
}

export function removeActiveVertex() {
  active?.removeSelected();
}

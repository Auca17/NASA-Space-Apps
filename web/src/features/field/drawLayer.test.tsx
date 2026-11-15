/** DrawLayer pointer gestures: vertex drags work while the outline is
 * open, a touch on a vertex drags it without any long press, and a tap
 * that never moves still behaves like a click (closing the outline on
 * the first vertex). jsdom has no PointerEvent constructor, so tests
 * dispatch MouseEvents under the pointer event names. */
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { DrawLayer } from "./DrawLayer";
import { DrawSession } from "./drawEdit";
import type { LatLon } from "../../domain/selection";

/** px -> lat/lon: origin at pixel (100,100) = (-33.9, -60.6). */
const unproject = (x: number, y: number): LatLon =>
  [-33.9 + (y - 100) * 0.00005, -60.6 + (x - 100) * 0.00005];

const ring3 = (): LatLon[] =>
  [unproject(80, 80), unproject(220, 80), unproject(220, 220)];

const ev = (type: string, x: number, y: number, pointerType = "mouse") => {
  const e = new MouseEvent(type, { clientX: x, clientY: y, button: 0,
    bubbles: true });
  Object.defineProperty(e, "pointerType", { value: pointerType });
  return e;
};

const layer = () => document.querySelector(".freehand-layer")!;

describe("DrawLayer drags", () => {
  it("drags a vertex while the outline is still open", () => {
    const s = new DrawSession(ring3(), false);
    render(<DrawLayer unproject={unproject} session={s} />);
    const el = layer();
    fireEvent(el, ev("pointerdown", 220, 80));
    fireEvent(el, ev("pointermove", 240, 120));
    fireEvent(el, ev("pointerup", 240, 120));
    expect(s.state.ring[1]).toEqual(unproject(240, 120));
    expect(s.state.closed).toBe(false);
    expect(s.state.notice).toBeNull();
  });

  it("a touch that starts on a vertex drags it, no long press", () => {
    const s = new DrawSession(ring3(), false);
    render(<DrawLayer unproject={unproject} session={s} />);
    const el = layer();
    fireEvent(el, ev("pointerdown", 80, 80, "touch"));
    fireEvent(el, ev("pointermove", 60, 100, "touch"));
    fireEvent(el, ev("pointerup", 60, 100, "touch"));
    expect(s.state.ring[0]).toEqual(unproject(60, 100));
  });

  it("a tap on the first vertex still closes the outline", () => {
    const s = new DrawSession(ring3(), false);
    render(<DrawLayer unproject={unproject} session={s} />);
    const el = layer();
    fireEvent(el, ev("pointerdown", 80, 80));
    fireEvent(el, ev("pointerup", 80, 80));
    expect(s.state.closed).toBe(true);
    expect(s.state.ring).toHaveLength(3);
  });

  it("dragging a midpoint inserts the vertex and keeps dragging", () => {
    const s = new DrawSession(ring3(), false);
    render(<DrawLayer unproject={unproject} session={s} />);
    const el = layer();
    // midpoint of edge v0-v1 sits at px (150, 80)
    fireEvent(el, ev("pointerdown", 150, 80));
    expect(s.state.ring).toHaveLength(4);
    fireEvent(el, ev("pointermove", 150, 140));
    fireEvent(el, ev("pointerup", 150, 140));
    expect(s.state.ring[1]).toEqual(unproject(150, 140));
    // one undo removes the whole insert+drag
    expect(s.undo()).toBe(true);
    expect(s.state.ring).toHaveLength(3);
  });
});

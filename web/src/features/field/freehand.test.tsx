import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { FreehandLayer } from "./FreehandLayer";

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = vi.fn();
  // jsdom has no PointerEvent: a MouseEvent carries clientX/Y the same way
  if (!("PointerEvent" in window)) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
});

/** 1 px = 1 m around (0, 0) is enough to check the gesture wiring. */
const unproject = (x: number, y: number): [number, number] =>
  [-y / 111_320, x / 111_320];

describe("FreehandLayer", () => {
  it("traces while pressed and closes the outline on release", () => {
    const onStroke = vi.fn(), onDone = vi.fn();
    const { container } = render(
      <FreehandLayer unproject={unproject} onStroke={onStroke} onDone={onDone} />);
    const el = container.firstChild as HTMLElement;
    fireEvent.pointerDown(el, { clientX: 0, clientY: 0, pointerId: 1 });
    const path = [[100, 0], [200, 0], [300, 0], [300, 100], [300, 200],
                  [300, 300], [200, 300], [100, 300], [0, 300], [0, 200], [0, 100]];
    for (const [x, y] of path) fireEvent.pointerMove(el, { clientX: x, clientY: y });
    expect(onStroke).toHaveBeenCalled();
    fireEvent.pointerUp(el);
    const ring = onDone.mock.calls[0][0];
    expect(ring.length).toBeGreaterThanOrEqual(4);
  });
  it("ignores moves without a press, and rejects a tiny scribble", () => {
    const onStroke = vi.fn(), onDone = vi.fn();
    const { container } = render(
      <FreehandLayer unproject={unproject} onStroke={onStroke} onDone={onDone} />);
    const el = container.firstChild as HTMLElement;
    fireEvent.pointerMove(el, { clientX: 50, clientY: 50 });
    expect(onStroke).not.toHaveBeenCalled();
    fireEvent.pointerDown(el, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: 5, clientY: 0 });
    fireEvent.pointerUp(el);
    expect(onDone).toHaveBeenCalledWith(null);
  });
});

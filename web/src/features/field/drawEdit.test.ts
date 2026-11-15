/** Draw session: open-path clicks, closing on the first vertex,
 * insert-on-nearest-edge, vertex drag/remove, undo and the
 * self-intersection guard. */
import { describe, it, expect } from "vitest";
import { DrawSession } from "./drawEdit";
import { selfIntersects } from "../../domain/parcelsGeo";
import { squareRing } from "../../domain/selection";
import type { LatLon } from "../../domain/selection";

const TOL = 30; // grab radius in metres for the tests

const sq = (): LatLon[] => squareRing(-33.9, -60.6, 400); // ~800 m sides

const mid = (a: LatLon, b: LatLon): LatLon =>
  [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

describe("DrawSession out-of-order clicks", () => {
  it("keeps a simple polygon when corners are clicked out of order", () => {
    const s = new DrawSession();
    const r = sq(); // corners in ring order
    // click diagonal corners first: an append-only path would be a bow tie
    s.click(r[0], TOL); s.click(r[2], TOL); s.click(r[1], TOL);
    s.click(r[3], TOL);
    expect(s.state.ring).toHaveLength(4);
    expect(selfIntersects(s.state.ring)).toBe(false);
  });
});

describe("DrawSession open path", () => {
  it("appends each click and closes on the first vertex", () => {
    const s = new DrawSession();
    const r = sq();
    s.click(r[0], TOL); s.click(r[1], TOL); s.click(r[2], TOL);
    expect(s.state.ring).toHaveLength(3);
    expect(s.state.closed).toBe(false);
    // tap the first vertex: the outline closes instead of appending
    s.click(r[0], TOL);
    expect(s.state.closed).toBe(true);
    expect(s.state.ring).toHaveLength(3);
  });

  it("drags a vertex while the outline is still open", () => {
    const s = new DrawSession();
    const r = sq();
    s.click(r[0], TOL); s.click(r[1], TOL); s.click(r[2], TOL);
    expect(s.state.closed).toBe(false);
    const to: LatLon = [r[1][0] + 0.002, r[1][1]]; // inward, stays simple
    expect(s.startDrag(1)).toBe(true);
    s.dragTo(to);
    expect(s.state.ring[1]).toEqual(to); // live update mid-drag
    s.endDrag();
    expect(s.state.ring[1]).toEqual(to);
    expect(s.state.notice).toBeNull();
    expect(s.state.closed).toBe(false); // stays open
  });

  it("refuses an open-path drag that would self-cross", () => {
    const s = new DrawSession();
    const r = sq();
    // 4 vertices: every shorter ring only has adjacent edges
    s.click(r[0], TOL); s.click(r[1], TOL); s.click(r[2], TOL);
    s.click(r[3], TOL);
    const before = s.state.ring.map((p) => [...p] as LatLon);
    // drag SE (vertex 1) far west of the left edge: the edge to NE
    // crosses the NW-SW side
    s.startDrag(1);
    s.dragTo([r[0][0], r[0][1] - 0.02]);
    s.endDrag();
    expect(s.state.notice).toBe("field.draw.crossed");
    expect(s.state.ring).toEqual(before);
  });

  it("undo rolls back one whole open-path drag", () => {
    const s = new DrawSession();
    const r = sq();
    s.click(r[0], TOL); s.click(r[1], TOL); s.click(r[2], TOL);
    const before = s.state.ring.map((p) => [...p] as LatLon);
    s.startDrag(1);
    s.dragTo([r[1][0] + 0.002, r[1][1]]);
    s.endDrag();
    expect(s.undo()).toBe(true);
    expect(s.state.ring).toEqual(before);
    expect(s.state.closed).toBe(false);
  });
});

describe("DrawSession midpoint handles", () => {
  const open = () => {
    const s = new DrawSession();
    const r = sq();
    s.click(r[0], TOL); s.click(r[1], TOL); s.click(r[2], TOL);
    return { s, r };
  };

  it("inserts a vertex on the edge and drags it in one gesture", () => {
    const { s, r } = open();
    // pull the south-edge midpoint toward the square centre
    const to: LatLon = [(r[0][0] + r[2][0]) / 2, (r[0][1] + r[2][1]) / 2];
    expect(s.startMidDrag(1)).toBe(true); // edge v0-v1 -> index 1
    expect(s.state.ring).toHaveLength(4);
    expect(s.state.ring[1]).toEqual(mid(r[0], r[1]));
    s.dragTo(to);
    s.endDrag();
    expect(s.state.ring).toHaveLength(4);
    expect(s.state.ring[1]).toEqual(to);
    expect(s.state.notice).toBeNull();
  });

  it("wraps the closing edge: index n appends after the last vertex", () => {
    const { s, r } = open();
    const n = s.state.ring.length;
    expect(s.startMidDrag(n)).toBe(true);
    expect(s.state.ring[n]).toEqual(mid(r[n - 1], r[0]));
    s.endDrag();
    expect(s.state.ring).toHaveLength(n + 1);
  });

  it("insert+drag is one undo step: the whole vertex disappears", () => {
    const { s } = open();
    const n = s.state.ring.length;
    s.startMidDrag(1);
    s.dragTo([s.state.ring[1][0] + 0.001, s.state.ring[1][1]]);
    s.endDrag();
    expect(s.state.ring).toHaveLength(n + 1);
    expect(s.undo()).toBe(true);
    expect(s.state.ring).toHaveLength(n);
  });
});

describe("DrawSession closed ring", () => {
  const closed = () => new DrawSession(sq(), true);

  it("inserts a vertex on the nearest edge", () => {
    const s = closed();
    const ring = s.state.ring;
    const p = mid(ring[0], ring[1]);
    s.click(p, TOL);
    expect(s.state.ring).toHaveLength(ring.length + 1);
    expect(s.state.ring[1]).toEqual(p);
    // the new vertex sits on the edge, it did not rewire first-last
    expect(s.state.ring[0]).toEqual(ring[0]);
    expect(s.state.ring[s.state.ring.length - 1])
      .toEqual(ring[ring.length - 1]);
  });

  it("selects a vertex instead of inserting when the tap hits one", () => {
    const s = closed();
    s.click(s.state.ring[2], TOL);
    expect(s.state.selected).toBe(2);
    expect(s.state.ring).toHaveLength(4);
  });

  it("moves a vertex by drag and keeps the ring valid", () => {
    const s = closed();
    const before = s.state.ring[1];
    const to: LatLon = [before[0] + 0.005, before[1]];
    expect(s.startDrag(1)).toBe(true);
    s.dragTo(to);
    s.endDrag();
    expect(s.state.ring[1]).toEqual(to);
    expect(s.state.notice).toBeNull();
  });

  it("refuses a drag that would cross the ring", () => {
    const s = closed();
    const r = s.state.ring;
    // dragging SE (vertex 1) west past the square: the edge v1'->v2
    // crosses the left edge
    const to: LatLon = [r[0][0], r[0][1] - 0.02];
    s.startDrag(1);
    s.dragTo(to);
    s.endDrag();
    expect(s.state.notice).toBe("field.draw.crossed");
    expect(s.state.ring[1]).toEqual(r[1]); // reverted
  });

  it("removes a vertex, never below 3", () => {
    const s = closed();
    // add one vertex first
    s.click(mid(s.state.ring[0], s.state.ring[1]), TOL);
    expect(s.state.ring).toHaveLength(5);
    s.removeAt(2);
    expect(s.state.ring).toHaveLength(4);
    s.removeAt(0);
    expect(s.state.ring).toHaveLength(3);
    s.removeAt(0); // would leave 2: refused
    expect(s.state.ring).toHaveLength(3);
    expect(s.state.notice).toBe("field.draw.minPoints");
  });

  it("undo restores the previous outline, step by step", () => {
    const s = new DrawSession();
    const r = sq();
    s.click(r[0], TOL); s.click(r[1], TOL); s.click(r[2], TOL);
    s.click(r[0], TOL); // close
    expect(s.state.closed).toBe(true);
    expect(s.undo()).toBe(true);
    expect(s.state.closed).toBe(false);
    expect(s.state.ring).toHaveLength(3);
    s.undo();
    expect(s.state.ring).toHaveLength(2);
    s.undo(); s.undo();
    expect(s.state.ring).toHaveLength(0);
    expect(s.undo()).toBe(false);
  });

  it("undoes a vertex insertion", () => {
    const s = closed();
    s.click(mid(s.state.ring[0], s.state.ring[1]), TOL);
    expect(s.state.ring).toHaveLength(5);
    s.undo();
    expect(s.state.ring).toHaveLength(4);
  });
});

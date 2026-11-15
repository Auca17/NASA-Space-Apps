/** fillOverlay: fills bypass geojson-vt tiling (maplibre-gl-js #4322),
 * so the layer must draw its own triangulation in mercator space using
 * the matrix MapLibre hands to custom layers
 * (`defaultProjectionData.mainMatrix`, mercator [0..1] -> clip) — not
 * `modelViewProjectionMatrix`, which expects pixel-scale world units. */
import { describe, expect, it } from "vitest";
import { makeFillOverlay } from "./fillOverlay";

type Call = { fn: string; args: unknown[] };

function mockGl() {
  const calls: Call[] = [];
  const rec = (fn: string) => (...args: unknown[]) => {
    calls.push({ fn, args });
    return {};
  };
  const gl = {
    VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30, LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893, STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406, TRIANGLES: 0x0004, UNSIGNED_SHORT: 0x1403,
    BLEND: 0x0be2, SRC_ALPHA: 0x0302, ONE_MINUS_SRC_ALPHA: 0x0303,
    DEPTH_TEST: 0x0b71, CULL_FACE: 0x0b44,
    createProgram: () => ({}), createShader: () => ({}),
    createBuffer: () => ({}),
    shaderSource: rec("shaderSource"), compileShader: rec("compileShader"),
    attachShader: rec("attachShader"), linkProgram: rec("linkProgram"),
    getProgramParameter: () => true,
    getAttribLocation: () => 0, getUniformLocation: () => ({}),
    useProgram: rec("useProgram"),
    enable: rec("enable"), disable: rec("disable"),
    blendFunc: rec("blendFunc"),
    bindBuffer: rec("bindBuffer"), bufferData: rec("bufferData"),
    enableVertexAttribArray: rec("enableVertexAttribArray"),
    vertexAttribPointer: rec("vertexAttribPointer"),
    uniformMatrix4fv: rec("uniformMatrix4fv"),
    uniform4fv: rec("uniform4fv"),
    drawElements: rec("drawElements"),
    getError: () => 0,
  };
  return { gl, calls };
}

const argsFor = (mainMatrix: number[]) => ({
  defaultProjectionData: { mainMatrix },
}) as never;

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe("fillOverlay", () => {
  it("draws earcut triangles from the custom-layer projection matrix", () => {
    const { gl, calls } = mockGl();
    const layer = makeFillOverlay("t");
    layer.onAdd?.({} as never, gl as never);
    layer.setPolys([{ rings: [[
      [-34, -60], [-34.001, -60], [-34.001, -60.001], [-34, -60.001],
    ]], fill: "#1a56db", op: 0.2 }]);
    layer.render(gl as never, argsFor(IDENTITY));
    const draw = calls.find((c) => c.fn === "drawElements");
    expect(draw).toBeTruthy();
    // a quad triangulates to 2 triangles = 6 u16 indices
    expect(draw?.args[1]).toBe(6);
    expect(draw?.args[2]).toBe(gl.UNSIGNED_SHORT);
  });

  it("folds the polygon origin into the matrix column in float64", () => {
    const { gl, calls } = mockGl();
    const layer = makeFillOverlay("t");
    layer.onAdd?.({} as never, gl as never);
    layer.setPolys([{ rings: [[
      [-34, -60], [-34.001, -60], [-34.001, -60.001],
    ]], fill: "#1a56db", op: 0.2 }]);
    layer.render(gl as never, argsFor(IDENTITY));
    const u = calls.find((c) => c.fn === "uniformMatrix4fv");
    const m = u?.args[2] as Float32Array;
    // identity matrix translated by the mercator origin: last column
    // becomes (ox, oy, 0, 1) so float32 vertex deltas stay precise
    expect(m[12]).toBeGreaterThan(0.3);
    expect(m[13]).toBeGreaterThan(0.5);
    expect(m[15]).toBe(1);
  });

  it("sends the fill color and opacity as the fragment uniform", () => {
    const { gl, calls } = mockGl();
    const layer = makeFillOverlay("t");
    layer.onAdd?.({} as never, gl as never);
    layer.setPolys([{ rings: [[
      [-34, -60], [-34.001, -60], [-34.001, -60.001],
    ]], fill: "#ff0000", op: 0.5 }]);
    layer.render(gl as never, argsFor(IDENTITY));
    const u = calls.find((c) => c.fn === "uniform4fv");
    const col = u?.args[1] as number[];
    expect(col[0]).toBeCloseTo(1);
    expect(col[3]).toBeCloseTo(0.5);
  });

  it("draws nothing for an empty polygon list", () => {
    const { gl, calls } = mockGl();
    const layer = makeFillOverlay("t");
    layer.onAdd?.({} as never, gl as never);
    layer.setPolys([]);
    layer.render(gl as never, argsFor(IDENTITY));
    expect(calls.find((c) => c.fn === "drawElements")).toBeUndefined();
  });
});

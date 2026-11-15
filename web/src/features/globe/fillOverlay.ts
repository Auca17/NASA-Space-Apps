/** Custom fill layer for the overlay polygons (draft outline, field
 * selection, zones).
 *
 * Why it exists: MapLibre ships GeoJSON fills through geojson-vt, which
 * clips each polygon per tile — and its polygon clipping is broken
 * (maplibre-gl-js #4322, unpatched upstream). A fill that spans more
 * than one tile renders as rectangular tile blocks with missing parts
 * and blocks sticking out beyond the outline, exactly what shows up
 * drawing a field at zoom >= 16. Line layers are unaffected (their
 * clip path is correct), so only the fills move here: the geometry is
 * triangulated once per update and drawn straight in mercator world
 * space — no tiles, no clipping, no seams.
 *
 * Precision: vertices are stored as float32 deltas from a per-polygon
 * origin kept in float64, and the origin is folded into the projection
 * matrix in float64 — stable to zoom ~22, well past field drawing.
 * The matrix comes from `defaultProjectionData.mainMatrix`, which
 * MapLibre builds for custom layers as mercator [0..1] -> clip space
 * (already rescaled by EXTENT — `modelViewProjectionMatrix` expects
 * pixel-scale world units instead). */
import type maplibregl from "maplibre-gl";
import earcut from "earcut";
import type { LatLon } from "../../domain/selection";

/** One fill to draw: `rings` = GeoJSON rings of ONE polygon in [lat,lon]
 * (first = outer, rest = holes), `fill`/`op` = color + opacity. */
export interface FillSpec {
  rings: LatLon[][];
  fill: string;
  op: number;
}

export interface FillOverlay extends maplibregl.CustomLayerInterface {
  setPolys(polys: FillSpec[]): void;
}

const VERT = `
attribute vec2 a_pos;
uniform mat4 u_matrix;
void main() { gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }`;

function hexRgb(s: string): [number, number, number] {
  const n = parseInt(s.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

type Cooked = {
  /** mercator origin (float64) folded into the matrix per frame. */
  ox: number; oy: number;
  verts: Float32Array;
  idx: Uint16Array;
  color: [number, number, number, number];
  vbo: WebGLBuffer | null;
  ibo: WebGLBuffer | null;
};

/** [lat,lon] -> mercator world [0..1] (same formula as
 * maplibregl.MercatorCoordinate.fromLngLat, inlined so this module
 * stays loadable without the map runtime). */
const merc = (p: LatLon): { x: number; y: number } => {
  const lat = Math.max(-85.051129, Math.min(85.051129, p[0])) * Math.PI / 180;
  return { x: (p[1] + 180) / 360,
           y: 0.5 - 0.25 * Math.log((1 + Math.sin(lat)) /
              (1 - Math.sin(lat))) / Math.PI };
};

/** mat4 column-major helper: mvp * translate(ox, oy, 0) in float64 —
 * only the translation column changes. */
function translated(m: ArrayLike<number>, ox: number, oy: number):
    Float32Array {
  const out = new Float32Array(16);
  for (let i = 0; i < 16; i++) out[i] = m[i];
  for (let r = 0; r < 4; r++) {
    out[12 + r] = m[r] * ox + m[4 + r] * oy + m[12 + r];
  }
  return out;
}

export function makeFillOverlay(id: string): FillOverlay {
  let prog: WebGLProgram | null = null;
  let aPos = -1;
  let uMat: WebGLUniformLocation | null = null;
  let uCol: WebGLUniformLocation | null = null;
  let polys: Cooked[] = [];

  const compile = (gl: WebGLRenderingContext | WebGL2RenderingContext,
                   type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src); gl.compileShader(sh);
    return sh;
  };

  return {
    id,
    type: "custom" as const,
    renderingMode: "2d" as const,

    onAdd(_map, gl) {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        prog = null;
        return;
      }
      aPos = gl.getAttribLocation(prog, "a_pos");
      uMat = gl.getUniformLocation(prog, "u_matrix");
      uCol = gl.getUniformLocation(prog, "u_color");
    },

    setPolys(list: FillSpec[]) {
      polys = list.map((f) => {
        // flatten rings to mercator coords; ring 0 is the outer ring,
        // the rest are holes (earcut takes hole start indices)
        const flat: number[] = [];
        const holes: number[] = [];
        let n = 0;
        for (const ring of f.rings) {
          if (ring !== f.rings[0]) holes.push(n);
          for (const p of ring) {
            const m = merc(p);
            flat.push(m.x, m.y); n++;
          }
        }
        const ox = flat[0], oy = flat[1];
        const verts = new Float32Array(flat.length);
        for (let i = 0; i < flat.length; i += 2) {
          verts[i] = flat[i] - ox; verts[i + 1] = flat[i + 1] - oy;
        }
        const idx = new Uint16Array(
          earcut(flat, holes.length ? holes : undefined));
        const [r, g, b] = hexRgb(f.fill);
        return { ox, oy, verts, idx, color: [r, g, b, f.op],
                 vbo: null, ibo: null };
      });
    },

    render(gl, args) {
      if (!prog || !polys.length) return;
      const mvp = args.defaultProjectionData.mainMatrix;
      gl.useProgram(prog);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      for (const p of polys) {
        if (!p.vbo) {
          p.vbo = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, p.vbo);
          gl.bufferData(gl.ARRAY_BUFFER, p.verts, gl.STATIC_DRAW);
          p.ibo = gl.createBuffer();
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, p.ibo);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.idx, gl.STATIC_DRAW);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, p.vbo);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, p.ibo);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        gl.uniformMatrix4fv(uMat, false, translated(mvp, p.ox, p.oy));
        gl.uniform4fv(uCol, p.color);
        gl.drawElements(gl.TRIANGLES, p.idx.length,
                        gl.UNSIGNED_SHORT, 0);
      }
    },
  };
}

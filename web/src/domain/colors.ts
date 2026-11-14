/** Color scales (viridis/inferno counts, RdBu anomalies) with numeric
 * companions — never color alone (PRD 12). */

type RGB = [number, number, number];

const VIRIDIS: RGB[] = [
  [68, 1, 84], [59, 82, 139], [33, 145, 140],
  [94, 201, 98], [253, 231, 37],
];
const INFERNO: RGB[] = [
  [0, 0, 4], [87, 16, 110], [188, 55, 84],
  [249, 142, 9], [252, 255, 164],
];
const RDBU: RGB[] = [
  [103, 0, 31], [214, 96, 77], [247, 247, 247],
  [67, 147, 195], [5, 48, 97],
];

function lerp(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t];
}

export function scale(stops: RGB[], t: number): RGB {
  const x = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.min(Math.floor(x), stops.length - 2);
  return lerp(stops[i], stops[i + 1], x - i);
}

export const css = (c: RGB) =>
  `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

export const viridis = (t: number) => scale(VIRIDIS, t);
export const inferno = (t: number) => scale(INFERNO, t);
/** t in [-1, 1]; 0 = neutral center. */
export const rdBu = (t: number) => scale(RDBU, (t + 1) / 2);

/** Normalize a value into [0,1] for the count scales (sqrt tames tails). */
export function countT(v: number, max: number): number {
  return max <= 0 ? 0 : Math.min(Math.sqrt(v / max), 1);
}

/* --- WCAG contrast helpers (cell text on colored fills) --- */

function chan(v: number): number {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** Relative luminance (WCAG 2.x) of an sRGB color. */
export function luminance(c: RGB): number {
  return 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2]);
}

/** Contrast ratio a:b (order-independent), 1..21. */
export function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const INK: RGB = [27, 27, 24];
export const PAPER: RGB = [255, 255, 255];

/** Legible text color (≥4.5:1) on a colored background. */
export function textOn(bg: RGB): RGB {
  return contrast(INK, bg) >= 4.5 ? INK : PAPER;
}

/** MapLibre fill-color expression for a set of cell->value colors. */
export function fillColorExpr(colors: Map<string, RGB>, fallback: RGB) {
  const match: unknown[] = ["match", ["get", "h3"]];
  for (const [h, c] of colors) match.push(h, css(c));
  match.push(css(fallback));
  return match;
}

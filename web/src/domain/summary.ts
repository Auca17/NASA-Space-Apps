/** Whole-field summary of a large field: one diagnosis per plot (and one
 * for the land still to review), combined by area. Plots are never
 * replaced by a single central point. */
import type { DiagnoseResponse } from "../api/types";
import { multiHa, type Multi } from "./selection";

/** Indicators averaged by area (numeric card values). */
export const SUMMARY_IDS = ["rain", "frost", "heat", "heavy_rain",
  "soil_moisture", "crop_water", "vigor_bare_soil", "slope", "soil"] as const;
/** Indicators reported as hectares per category. */
export const CATEGORY_IDS = ["fire", "fire_weather"] as const;

export type SummaryRow = { id: string; value: number; unit: string;
                           coveredHa: number };
export type Summary = {
  rows: SummaryRow[];
  categories: Record<string, Record<string, number>>;
  totalHa: number;
  /** hectares whose request failed or returned nothing */
  noDataHa: number;
};

export function weightedSummary(
    parts: { ha: number; diag: DiagnoseResponse | null }[]): Summary {
  const acc = new Map<string, { sum: number; ha: number; unit: string }>();
  const categories: Record<string, Record<string, number>> = {};
  let totalHa = 0, noDataHa = 0;
  for (const { ha, diag } of parts) {
    totalHa += ha;
    if (!diag) { noDataHa += ha; continue; }
    for (const c of diag.cards ?? []) {
      if ((SUMMARY_IDS as readonly string[]).includes(c.id) &&
          typeof c.value === "number") {
        const a = acc.get(c.id) ?? { sum: 0, ha: 0, unit: c.unit ?? "" };
        a.sum += c.value * ha; a.ha += ha;
        acc.set(c.id, a);
      } else if ((CATEGORY_IDS as readonly string[]).includes(c.id) &&
                 typeof c.value === "string") {
        const m = (categories[c.id] ??= {});
        m[c.value] = (m[c.value] ?? 0) + ha;
      }
    }
  }
  const rows = SUMMARY_IDS.flatMap((id) => {
    const a = acc.get(id);
    return a ? [{ id, value: a.sum / a.ha, unit: a.unit, coveredHa: a.ha }] : [];
  });
  return { rows, categories, totalHa, noDataHa };
}

/** `group`: several whole plots sent in one request (`members` are
 * their ids); never a cut of a plot. */
export type SummaryUnit = { id: string;
  kind: "parcel" | "review" | "field" | "group";
  name: string; geom: Multi; ha: number; members?: string[] };

/** Limits of one grouped request. */
const GROUP_HA = 2_500, GROUP_VERTICES = 1_800, PER_PLOT_UP_TO = 12;

/** What the whole-field summary asks for: every confirmed plot, plus the
 * land still to review; the outline itself when there are no plots. */
export function summaryUnits(parcels: { id: string; name: string; geom: Multi }[],
                             review: Multi, contour: Multi): SummaryUnit[] {
  if (!parcels.length) {
    return [{ id: "field", kind: "field", name: "", geom: contour,
              ha: multiHa(contour) }];
  }
  const units: SummaryUnit[] = parcels.map((p) => ({
    id: p.id, kind: "parcel", name: p.name, geom: p.geom, ha: multiHa(p.geom) }));
  // Many plots: group neighbours (the list is already ordered north to
  // south, west to east) so the summary takes a few requests, not hundreds.
  const out: SummaryUnit[] = [];
  if (units.length <= PER_PLOT_UP_TO) {
    out.push(...units);
  } else {
    let cur: SummaryUnit[] = [];
    const flush = () => {
      if (!cur.length) return;
      out.push(cur.length === 1 ? cur[0] : {
        id: "g" + cur[0].id, kind: "group",
        name: `${cur[0].name}–${cur[cur.length - 1].name}`,
        geom: cur.flatMap((u) => u.geom), ha: cur.reduce((a, u) => a + u.ha, 0),
        members: cur.map((u) => u.id) });
      cur = [];
    };
    for (const u of units) {
      const ha = cur.reduce((a, x) => a + x.ha, 0) + u.ha;
      const v = cur.reduce((a, x) => a + x.geom.flat(2).length, 0) +
        u.geom.flat(2).length;
      if (cur.length && (ha > GROUP_HA || v > GROUP_VERTICES)) flush();
      cur.push(u);
    }
    flush();
  }
  // land to review: pieces packed into requests within the same limits
  let pack: Multi = [];
  const flushReview = () => {
    if (pack.length && multiHa(pack) >= 0.5) {
      out.push({ id: `review${out.length}`, kind: "review", name: "",
                 geom: pack, ha: multiHa(pack) });
    }
    pack = [];
  };
  for (const piece of review) {
    const v = pack.flat(2).length + piece.flat().length;
    if (pack.length && (v > GROUP_VERTICES || multiHa([...pack, piece]) > GROUP_HA)) {
      flushReview();
    }
    pack.push(piece);
  }
  flushReview();
  return out;
}

/** Run async jobs with at most `limit` at a time; failures are kept as
 * results so finished work is never lost. */
export async function runLimited<T>(jobs: (() => Promise<T>)[], limit: number):
    Promise<({ ok: true; value: T } | { ok: false; error: unknown })[]> {
  const out = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      try { out[i] = { ok: true, value: await jobs[i]() }; }
      catch (error) { out[i] = { ok: false, error }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return out;
}

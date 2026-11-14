/** Presentation helpers for the rotations response (pure, testable). */
import type { Card as DiagCard, DiagnoseResponse,
               Strategy } from "../api/types";

/** One cereal swap that makes two catalog rotations near-identical. */
const CEREAL_SWAPS: ReadonlySet<string> = new Set(["trigo", "cebada"]);

/** True when b is the same rotation as a except for exactly one
 * cereal swap (trigo <-> cebada) at the same sequence position. */
export function isCerealVariant(a: Strategy, b: Strategy): boolean {
  const sa = a.sequence, sb = b.sequence;
  if (sa.length !== sb.length || sa.length === 0) return false;
  let swaps = 0;
  for (let i = 0; i < sa.length; i++) {
    if (sa[i].crop === sb[i].crop) continue;
    if (CEREAL_SWAPS.has(sa[i].crop) && CEREAL_SWAPS.has(sb[i].crop)) {
      swaps++;
    } else {
      return false;
    }
  }
  return swaps === 1;
}

export interface StrategyGroup {
  primary: Strategy;
  variants: Strategy[];
}

/** Group near-identical alternatives: a variant (single trigo/cebada
 * swap) folds into the card of the first strategy it matches. The
 * current strategy is always its own group. */
export function groupVariants(strategies: Strategy[]): StrategyGroup[] {
  const groups: StrategyGroup[] = [];
  for (const s of strategies) {
    const g = s.is_current ? undefined
      : groups.find((x) => isCerealVariant(x.primary, s));
    if (g) g.variants.push(s);
    else groups.push({ primary: s, variants: [] });
  }
  return groups;
}

/** Indicator id -> i18n key for benefits/indicators sections.
 * Returns null for keys the UI must hide (deprecated `carbon` alias). */
export function indicatorLabelKey(id: string): string | null {
  switch (id) {
    case "carbon": return null; // deprecated alias of residue_t_ha_yr
    case "residue_t_ha_yr": return "ind.residue";
    case "bare_soil_days": return "ind.bareSoil";
    case "water_balance": return "ind.waterBalance";
    case "water_balance_mm": return "ind.waterBalance";
    case "nitrogen": return "ind.nitrogen";
    case "erosion_risk": return "ind.erosion";
    case "pest_break": return "ind.pestBreak";
    case "income": return "ind.income";
    case "forage": return "ind.forage";
    case "burns_avoided": return "ind.burnsAvoided";
    case "irrigation_need_mm": return "ind.irrigationNeed";
    default: return `ind.${id}`;
  }
}

/** Benefit/indicator value as shown: raw API level words
 * (high/medium/low) map to the localized confidence words. */
export function benefitValue(v: unknown): string {
  return typeof v === "string"
    ? ({ high: "field.confidence.high",
         medium: "field.confidence.medium",
         low: "field.confidence.low",
         "con riego": "field.benefit.irrigated" } as
          Record<string, string>)[v] ?? v
    : String(v);
}

/** Localizable measure requirement pairs ("personas: 0",
 * "costo: bajo"); values that are API level words resolve to i18n
 * keys the caller translates. Empty pairs are dropped. */
export function measureReqPairs(requires?: Record<string, unknown>):
    { key: string; value: string }[] {
  return Object.entries(requires ?? {})
    .filter(([k, v]) => k !== "cost" && v != null && v !== "")
    .map(([k, v]) => ({ key: `measure.req.${k}`, value: benefitValue(v) }))
    .filter((p) => p.value !== "");
}

/** Supplemental irrigation sentence when the engine reports the
 * "con riego" water state; null otherwise. */
export function irrigationNeedMm(s: Strategy): number | null {
  const ind = s.indicators ?? {};
  if (ind.water_balance !== "con riego") return null;
  const mm = ind.irrigation_need_mm;
  return typeof mm === "number" ? mm : 0;
}

/* --- priority chips: pick order maps to weights 5/4/3 ---------------- */

export const PRIORITY_IDS = [
  "water", "soil", "erosion", "income",
  "forage", "nitrogen", "pests", "avoid_burning",
] as const;
export type PriorityId = (typeof PRIORITY_IDS)[number];
const CHIP_WEIGHTS = [5, 4, 3];

/** selected[] in pick order (max 3) -> the eight weights the back
 * expects. Empty selection = equal weights (all 3). */
export function prioWeights(selected: string[]): Record<string, number> {
  if (selected.length === 0) {
    return Object.fromEntries(PRIORITY_IDS.map((p) => [p, 3]));
  }
  return Object.fromEntries(PRIORITY_IDS.map((p) => {
    const i = selected.indexOf(p);
    return [p, i >= 0 ? CHIP_WEIGHTS[i] : 0];
  }));
}

/* --- diagnosis groups + summary ------------------------------------- */

/** Card groups for the scannable grid (P1-2). */
export const DIAG_GROUPS: { id: string; cards: string[] }[] = [
  { id: "water", cards: ["rain", "heavy_rain", "soil_moisture",
                        "water_trend", "crop_water", "recent_weather"] },
  { id: "temp", cards: ["frost", "heat"] },
  { id: "soil", cards: ["soil", "vigor_bare_soil", "slope"] },
  { id: "fire", cards: ["fire", "fire_weather"] },
];

/** Cards in group order, unknown ids appended at the end. */
export function groupedCards(cards: DiagCard[]):
    { group: string; cards: DiagCard[] }[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const used = new Set<string>();
  const out = DIAG_GROUPS.map((g) => {
    const list = g.cards
      .filter((id) => { const ok = byId.has(id); if (ok) used.add(id);
                        return ok; })
      .map((id) => byId.get(id)!);
    return { group: g.id, cards: list };
  }).filter((g) => g.cards.length > 0);
  const rest = cards.filter((c) => !used.has(c.id));
  if (rest.length) out.push({ group: "other", cards: rest });
  return out;
}

/** Value + unit as the tile shows it ("1.087 mm/año", "4,1 %"). */
export function cardValueText(c: DiagCard,
                              fmt: Intl.NumberFormat): string | null {
  if (c.value == null) return null;
  const v = typeof c.value === "number" ? fmt.format(c.value) : c.value;
  return c.unit ? `${v} ${c.unit}` : v;
}

/** One fact line of the two-line diagnosis summary: only facts whose
 * card has data. Returns i18n keys + vars, joined by the caller. */
export function summaryFacts(d: DiagnoseResponse):
    { key: string; vars: Record<string, string | number> }[] {
  const fmt = new Intl.NumberFormat("es", { maximumFractionDigits: 0 });
  const out: { key: string; vars: Record<string, string | number> }[] = [];
  const get = (id: string) => d.cards.find((c) => c.id === id);
  const rain = get("rain");
  if (rain?.value != null) {
    out.push({ key: "field.sum.rain",
               vars: { v: cardValueText(rain, fmt) ?? "" } });
  }
  const frost = get("frost");
  if (frost?.value != null) {
    out.push({ key: "field.sum.frost",
               vars: { v: cardValueText(frost, fmt) ?? "" } });
  }
  const heat = get("heat");
  if (heat?.value != null) {
    out.push({ key: "field.sum.heat",
               vars: { v: cardValueText(heat, fmt) ?? "" } });
  }
  return out;
}

/* --- strategy verdict + comparison ---------------------------------- */

interface DeltaSpec {
  id: string;          // indicators key
  better: "up" | "down";
  keyMore: string;     // i18n key when direction is the good one
}

const VERDICT_SPECS: DeltaSpec[] = [
  { id: "residue_t_ha_yr", better: "up",   keyMore: "rot.verdict.residue" },
  { id: "bare_soil_days",  better: "down", keyMore: "rot.verdict.bare" },
  { id: "erosion_risk",    better: "down", keyMore: "rot.verdict.erosion" },
  { id: "water_balance",   better: "down", keyMore: "rot.verdict.water" },
  { id: "burns_avoided",   better: "up",   keyMore: "rot.verdict.burns" },
];

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Numeric value of an indicator for comparisons: `water_balance` can
 * be the display string "con riego", so the numeric metric lives in
 * `water_balance_mm`. */
const indNum = (ind: Strategy["indicators"], id: string): number | null =>
  num(id === "water_balance"
      ? ind?.water_balance_mm ?? ind.water_balance
      : ind?.[id]);

/** One-line verdict built from the strongest indicator deltas versus
 * the current strategy (or the strategy's own profile when no current).
 * Returns an i18n key + vars; caller renders it. */
export function verdictDelta(s: Strategy, current?: Strategy | null):
    { key: string; parts: string[] } {
  if (s.is_current) return { key: "rot.verdict.current", parts: [] };
  const parts: string[] = [];
  if (current) {
    for (const spec of VERDICT_SPECS) {
      const a = indNum(s.indicators, spec.id);
      const b = indNum(current.indicators, spec.id);
      if (a == null || b == null) continue;
      const better = spec.better === "up" ? a > b : a < b;
      if (better && parts.length < 2) parts.push(spec.keyMore);
    }
  }
  return parts.length
    ? { key: "rot.verdict.parts", parts }
    : { key: "rot.verdict.balanced", parts: [] };
}

/** The four indicators shown in the comparison row. */
export const CMP_INDICATORS = [
  "water_balance", "bare_soil_days", "erosion_risk", "burns_avoided",
] as const;

/** Delta of an alternative vs the current strategy per comparison
 * indicator: direction + absolute delta (numeric pairs only). */
export function compareDeltas(alt: Strategy, current: Strategy):
    { id: string; dir: "up" | "down" | "same"; delta: number | null }[] {
  return CMP_INDICATORS.map((id) => {
    const a = indNum(alt.indicators, id);
    const b = indNum(current.indicators, id);
    if (a == null || b == null || a === b) {
      return { id, dir: "same" as const, delta: null };
    }
    return { id, dir: a > b ? ("up" as const) : ("down" as const),
             delta: Math.round((a - b) * 10) / 10 };
  });
}

/** Crop-month segments of a sequence item over a 12-month bar.
 * start/end are "MM-DD"; wrap-around splits into two segments. */
export function seqSegments(start: string, end: string):
    { from: number; to: number }[] {
  const mo = (d: string) => Number(d.slice(0, 2)) - 1;
  const a = mo(start), b = mo(end);
  if (a <= b) return [{ from: a, to: b }];
  return [{ from: a, to: 11 }, { from: 0, to: b }];
}

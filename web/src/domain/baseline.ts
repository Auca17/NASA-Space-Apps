/** Baseline stats over the fixed 2003-01..2022-12 window (D10). */
import type { MonthlySeries } from "./fireSeries";

export const BASELINE = { start: "2003-01", end: "2022-12" };

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface MonthStats {
  median: number;
  p25: number;
  p75: number;
  p95: number;
  n: number;
}

/** Calendar-month stats (Jan..Dec) over the baseline period only. */
export function monthlyBaseline(
    s: MonthlySeries,
    baseline = BASELINE): MonthStats[] {
  const buckets: number[][] = Array.from({ length: 12 }, () => []);
  s.months.forEach((mo, i) => {
    if (mo < baseline.start || mo > baseline.end) return;
    buckets[Number(mo.slice(5, 7)) - 1].push(s.values[i]);
  });
  return buckets.map((b) => {
    const sorted = [...b].sort((a, c) => a - c);
    return {
      median: quantile(sorted, 0.5),
      p25: quantile(sorted, 0.25),
      p75: quantile(sorted, 0.75),
      p95: quantile(sorted, 0.95),
      n: b.length,
    };
  });
}

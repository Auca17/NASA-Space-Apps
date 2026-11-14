/** Month semaphore from fire/daily shards (D9). Pure functions —
 * the same code runs inside the Web Worker wrapper. */

export interface DailyShard {
  shard: string;
  epoch: string; // "YYYY-MM-DD"
  cells: Record<string, { d: [number, number][] }>;
}

export interface SemaphoreConfig {
  windowDays: number;
  categories: Record<string, [number, number]>;
  ratioMinMedian: number;
  baselineStart: string; // "YYYY-MM-DD"
  baselineEnd: string;
}

export interface SemaphoreResult {
  value: number;          // fires in the current window
  median: number;
  percentile: number;     // 0..100 vs same-window baseline values
  category: string;       // key of categories
  ratio: number | null;   // x times median, or null when median < min
  lowBaseline: boolean;   // median < ratioMinMedian
}

const DAY_MS = 86_400_000;

function daysSinceEpoch(dateStr: string, epoch: string): number {
  return Math.round(
    (Date.parse(dateStr + "T00:00:00Z") -
     Date.parse(epoch + "T00:00:00Z")) / DAY_MS);
}

function dateFromOffset(off: number, epoch: string): string {
  return new Date(Date.parse(epoch + "T00:00:00Z") + off * DAY_MS)
    .toISOString().slice(0, 10);
}

/** Sum daily detections of the selected cells -> Map<offset, n>. */
export function sumDaily(shards: DailyShard[],
                         cells: Set<string>): Map<number, number> {
  const out = new Map<number, number>();
  for (const sh of shards) {
    for (const c of cells) {
      for (const [d, n] of sh.cells[c]?.d ?? []) {
        out.set(d, (out.get(d) ?? 0) + n);
      }
    }
  }
  return out;
}

/**
 * Sum of the `windowDays` ending on `offset` (inclusive) and the
 * same window for every baseline year at the same day-of-year.
 */
export function windowStats(
    daily: Map<number, number>, epoch: string,
    endDate: string, cfg: SemaphoreConfig) {
  const end = daysSinceEpoch(endDate, epoch);
  const win = (e: number) => {
    let s = 0;
    for (let d = e - cfg.windowDays + 1; d <= e; d++) {
      s += daily.get(d) ?? 0;
    }
    return s;
  };
  const value = win(end);
  const endY = Number(endDate.slice(0, 4));
  const base: number[] = [];
  for (let y = Number(cfg.baselineStart.slice(0, 4));
       y <= Number(cfg.baselineEnd.slice(0, 4)); y++) {
    if (y === endY) continue; // never compare against itself
    const d = endDate.replace(/^\d{4}/, String(y));
    const off = daysSinceEpoch(d, epoch);
    if (dateFromOffset(off, epoch) < cfg.baselineStart ||
        dateFromOffset(off, epoch) > cfg.baselineEnd) continue;
    base.push(win(off));
  }
  return { value, base };
}

export function semaphoreOf(value: number, base: number[],
                            cfg: SemaphoreConfig): SemaphoreResult {
  const sorted = [...base].sort((a, b) => a - b);
  const median = sorted.length
    ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
  const le = sorted.filter((v) => v <= value).length;
  const percentile = sorted.length
    ? Math.round((le / sorted.length) * 100) : 0;

  let category = "normal";
  if (!(value === 0 && median === 0)) {
    for (const [cat, [lo, hi]] of Object.entries(cfg.categories)) {
      if (percentile >= lo && (percentile < hi || hi >= 100)) {
        category = cat;
      }
    }
  }
  const lowBaseline = median < cfg.ratioMinMedian;
  return {
    value, median, percentile, category,
    ratio: lowBaseline || median === 0 ? null
      : Math.round((value / median) * 10) / 10,
    lowBaseline,
  };
}

/** Full pipeline used by the worker and by tests. */
export function semaphoreFromDaily(
    shards: DailyShard[], cells: Set<string>, endDate: string,
    cfg: SemaphoreConfig): SemaphoreResult {
  const epoch = shards[0]?.epoch ?? "2000-01-01";
  const daily = sumDaily(shards, cells);
  const { value, base } = windowStats(daily, epoch, endDate, cfg);
  return semaphoreOf(value, base, cfg);
}

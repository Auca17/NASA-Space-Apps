/** fire/cal shards -> aggregated monthly series, year x month matrix. */

export interface CalShard {
  shard: string;
  months: string[]; // "YYYY-MM"
  cells: Record<string, { m: number[]; clim?: number[]; lc?: string | null }>;
}

export interface MonthlySeries {
  months: string[];
  values: number[];
}

/** Sum the `m` series of the selected cells across loaded shards. */
export function aggregateMonthly(shards: CalShard[],
                                 cells: Set<string>): MonthlySeries {
  const months: string[] = [];
  const acc = new Map<string, number>();
  for (const sh of shards) {
    for (const [i, mo] of sh.months.entries()) {
      let v = acc.get(mo) ?? 0;
      for (const c of cells) {
        const cell = sh.cells[c];
        if (cell && i < cell.m.length) v += cell.m[i];
      }
      if (!acc.has(mo)) months.push(mo);
      acc.set(mo, v);
    }
  }
  months.sort();
  return { months, values: months.map((m) => acc.get(m) ?? 0) };
}

/** year -> 12 monthly values (missing months -> 0). */
export function yearMonthMatrix(s: MonthlySeries):
    Map<number, number[]> {
  const out = new Map<number, number[]>();
  s.months.forEach((mo, i) => {
    const y = Number(mo.slice(0, 4));
    const m = Number(mo.slice(5, 7));
    const row = out.get(y) ?? new Array(12).fill(0);
    row[m - 1] = s.values[i];
    out.set(y, row);
  });
  return out;
}

/**
 * Fire-season view: rows run July -> June so a season is not split.
 * A season is labelled by the year it starts in (Jul 2021..Jun 2022 = 2021).
 */
export function fireSeasonMatrix(matrix: Map<number, number[]>):
    Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const [y, row] of matrix) {
    const prev = out.get(y - 1) ?? new Array(12).fill(0);
    prev.splice(6, 6, ...row.slice(0, 6)); // Jan..Jun into season y-1
    out.set(y - 1, prev);
    const cur = out.get(y) ?? new Array(12).fill(0);
    cur.splice(0, 6, ...row.slice(6));     // Jul..Dec into season y
    out.set(y, cur);
  }
  return out;
}

/** Total per row key (year or season). */
export function rowTotals(matrix: Map<number, number[]>):
    Map<number, number> {
  const out = new Map<number, number>();
  for (const [k, row] of matrix) {
    out.set(k, row.reduce((a, b) => a + b, 0));
  }
  return out;
}

/** Downloadable CSV ("month,n") built in the browser. */
export function toCsv(s: MonthlySeries): string {
  const lines = ["month,n"];
  s.months.forEach((mo, i) => lines.push(`${mo},${s.values[i]}`));
  return lines.join("\n") + "\n";
}

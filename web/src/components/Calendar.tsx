/** Year x month table — real <table>, 44px touch targets, never color alone. */
import { css, viridis } from "../domain/colors";
import { monthlyBaseline } from "../domain/baseline";
import type { MonthlySeries } from "../domain/fireSeries";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun",
                "jul", "ago", "sep", "oct", "nov", "dic"];

export function Calendar({ matrix, mode, highlight, onPick, compact }: {
  matrix: Map<number, number[]>;
  mode: "counts" | "anomalies";
  highlight?: { year: number; month: number };
  onPick?: (year: number, month: number, v: number) => void;
  compact?: boolean;
}) {
  const years = [...matrix.keys()].sort((a, b) => b - a);
  // baseline for anomaly mode: median per month column across rows
  const series: MonthlySeries = { months: [], values: [] };
  for (const [y, row] of matrix) {
    row.forEach((v, m) => {
      series.months.push(`${y}-${String(m + 1).padStart(2, "0")}`);
      series.values.push(v);
    });
  }
  const base = monthlyBaseline(series);
  const max = Math.max(1, ...[...matrix.values()].flat());
  const cellInfo = (v: number, m: number) => {
    if (mode === "anomalies") {
      const med = base[m]?.median ?? 0;
      const anom = med > 0 ? v / med : (v === 0 ? 1 : 2);
      return { v: `${anom.toFixed(1)}×`, t: Math.min(anom / 3, 1) };
    }
    return { v: v ? String(Math.round(v)) : "·",
             t: Math.sqrt(v / max) };
  };
  return (
    <table className="cal" aria-label="calendario">
      <thead>
        <tr>
          <th scope="col">Año</th>
          {MONTHS.map((m) => <th key={m} scope="col">{compact ? m[0] : m}</th>)}
        </tr>
      </thead>
      <tbody>
        {years.map((y) => (
          <tr key={y} className={
            highlight?.year === y ? "current" : undefined}>
            <th scope="row">{y}</th>
            {(matrix.get(y) ?? []).map((v, m) => {
              const ci = cellInfo(v, m);
              const playing = highlight?.year === y &&
                highlight?.month === m;
              return (
                <td key={m} className={playing ? "playing" : undefined}
                    style={{ background: css(viridis(ci.t)) }}>
                  {onPick ? (
                    <button type="button"
                            aria-label={`${MONTHS[m]} ${y}: ${ci.v}`}
                            onClick={() => onPick(y, m, v)}>
                      {ci.v}
                    </button>
                  ) : ci.v}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

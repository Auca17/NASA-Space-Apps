/** Year x month table — real <table>, 44px touch targets, never color alone. */
import { css, textOn, viridis } from "../domain/colors";
import { monthlyBaseline } from "../domain/baseline";
import { useT } from "../i18n";
import type { MonthlySeries } from "../domain/fireSeries";

const monthShort = (lang: string, i: number) =>
  new Intl.DateTimeFormat(lang, { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(2024, i, 1)));

export function Calendar({ matrix, mode, highlight, onPick, compact }: {
  matrix: Map<number, number[]>;
  mode: "counts" | "anomalies";
  highlight?: { year: number; month: number };
  onPick?: (year: number, month: number, v: number) => void;
  compact?: boolean;
}) {
  const { t, lang } = useT();
  const years = [...matrix.keys()].sort((a, b) => b - a);
  // compact headers reuse the localized month-initials key
  const initials = t("ui.monthInitials").split(",");
  const months = [...Array(12)].map((_, i) =>
    compact ? (initials[i] ?? monthShort(lang, i))
            : monthShort(lang, i));
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
    <table className="cal" aria-label={t("calendar.aria")}>
      <thead>
        <tr>
          <th scope="col">{t("calendar.year")}</th>
          {months.map((m, i) => <th key={i} scope="col">{m}</th>)}
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
              const bg = viridis(ci.t);
              return (
                <td key={m} className={playing ? "playing" : undefined}
                    style={{ background: css(bg),
                             color: css(textOn(bg)) }}>
                  {onPick ? (
                    <button type="button"
                            aria-label={`${monthShort(lang, m)} ${y}: ${ci.v}`}
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

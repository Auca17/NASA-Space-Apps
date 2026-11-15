/** Whole-field summary: one diagnosis per plot (plus the land still to
 * review), at most two requests at a time, with progress per plot. A
 * failed plot keeps the others and can be retried on its own. Averages
 * are weighted by area and the hectares without data are shown. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import { apiDiagnose } from "../../api";
import type { DiagnoseResponse } from "../../api/types";
import { plotBody } from "../../domain/selection";
import {
  weightedSummary, runLimited, type SummaryUnit,
} from "../../domain/summary";

type Status = "waiting" | "running" | "done" | "failed";

/** Answers reused across openings of the summary (same geometry). */
const cache = new Map<string, DiagnoseResponse>();
const keyOf = (u: SummaryUnit) => JSON.stringify(u.geom);

export function FieldSummary({ fieldName, units, onAnalyze, onClose }: {
  fieldName: string;
  units: SummaryUnit[];
  /** open the full diagnosis of one plot */
  onAnalyze: (u: SummaryUnit) => void;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const fmt = new Intl.NumberFormat(lang === "en" ? "en" : "es",
    { maximumFractionDigits: 1 });
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [results, setResults] = useState<Record<string, DiagnoseResponse | null>>({});
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const run = useCallback(async (list: SummaryUnit[]) => {
    setStatus((s) => ({ ...s, ...Object.fromEntries(list.map((u) =>
      [u.id, cache.has(keyOf(u)) ? "done" : "waiting"])) }));
    await runLimited(list.map((u) => async () => {
      const hit = cache.get(keyOf(u));
      let diag = hit ?? null;
      if (!hit) {
        if (alive.current) setStatus((s) => ({ ...s, [u.id]: "running" }));
        diag = (await apiDiagnose(plotBody(u.geom))).diagnosis;
        if (diag) cache.set(keyOf(u), diag);
      }
      if (!alive.current) return;
      setResults((r) => ({ ...r, [u.id]: diag }));
      setStatus((s) => ({ ...s, [u.id]: diag ? "done" : "failed" }));
    }), 2);
  }, []);

  useEffect(() => { run(units); }, [run, units]);

  const finished = units.filter((u) => status[u.id] === "done" ||
                                       status[u.id] === "failed");
  const summary = weightedSummary(finished.map((u) => ({
    ha: u.ha, diag: results[u.id] ?? null })));
  const failed = units.filter((u) => status[u.id] === "failed");
  const name = (u: SummaryUnit) => u.kind === "review" ? t("parcel.review")
    : u.kind === "field" ? t("analyze.all") : u.name;

  return (
    <div className="field-summary">
      <div className="panel-head">
        <h3>{t("summary.title", { name: fieldName })}</h3>
        <button onClick={onClose} aria-label={t("ui.close")}>✕</button>
      </div>
      <p className="muted">{t("summary.how")}</p>
      <ul className="summary-units" aria-live="polite">
        {units.map((u) => (
          <li key={u.id} className={`su ${status[u.id] ?? "waiting"}`}>
            <span className="su-name">{name(u)}</span>
            <span className="muted">{fmt.format(u.ha)} ha</span>
            <span className="su-state">{t("summary.state." + (status[u.id] ?? "waiting"))}</span>
            {status[u.id] === "failed" && (
              <button onClick={() => run([u])}>{t("summary.retry")}</button>)}
            {u.kind !== "review" && status[u.id] === "done" && (
              <button className="link-btn" onClick={() => onAnalyze(u)}>
                {t("summary.open")}</button>)}
          </li>))}
      </ul>
      <p className="muted" role="status">
        {t("summary.progress", { n: finished.length, m: units.length })}
        {summary.noDataHa > 0 &&
          <> · <strong>{t("summary.noData", { ha: fmt.format(summary.noDataHa) })}</strong></>}
      </p>
      {summary.rows.length > 0 && (
        <table className="summary-table">
          <caption>{t("summary.weighted")}</caption>
          <tbody>
            {summary.rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{t("card." + r.id)}</th>
                <td>{fmt.format(r.value)} {r.unit}</td>
                <td className="muted">
                  {t("summary.covered", { ha: fmt.format(r.coveredHa) })}</td>
              </tr>))}
            {Object.entries(summary.categories).map(([id, cats]) => (
              <tr key={id}>
                <th scope="row">{t("card." + id)}</th>
                <td colSpan={2}>{Object.entries(cats).map(([c, ha]) =>
                  `${t("cardval." + c)}: ${fmt.format(ha)} ha`).join(" · ")}</td>
              </tr>))}
          </tbody>
        </table>)}
      {failed.length > 1 && (
        <button onClick={() => run(failed)}>{t("summary.retryAll")}</button>)}
    </div>);
}

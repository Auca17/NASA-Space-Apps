/** Area panel: 7d risk, semaphore, calendar, yearly bars, CSV, measures. */
import { useEffect, useMemo, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import { useT } from "../../i18n";
import { Card, BottomSheet, Legend } from "../../components/ui";
import { Calendar } from "../../components/Calendar";
import {
  fireCal, fireDaily, apiRiskResult, pointsCsvUrl, meta as apiMeta,
} from "../../api";
import {
  aggregateMonthly, yearMonthMatrix, fireSeasonMatrix,
  rowTotals, toCsv, type CalShard,
} from "../../domain/fireSeries";
import {
  type DailyShard, type SemaphoreResult,
  type SemaphoreConfig,
} from "../../domain/semaphore";
import { groupByShard } from "../../domain/h3area";
import {
  presentRisk, emergencyText, riskReasonText, type RiskView,
  type RiskCell,
} from "../../domain/risk";
import { EmergencyBlock } from "../emergency/EmergencyBlock";
import { viridis, css } from "../../domain/colors";
import { semaphorePeriod } from "../../domain/clarity";
import type { MetaJson } from "../../api/types";

function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/** Heavy semaphore math runs in a Web Worker (PRD 12.5). */
interface SemMsg {
  shards: DailyShard[]; cells: string[]; endDate: string;
  cfg: SemaphoreConfig;
}
async function runSemaphore(msg: SemMsg): Promise<SemaphoreResult | null> {
  if (typeof Worker !== "undefined") {
    try {
      const w = new Worker(
        new URL("../../domain/semaphore.worker.ts", import.meta.url),
        { type: "module" });
      const res = await new Promise<SemaphoreResult>((resolve, reject) => {
        w.onmessage = (e) => resolve(e.data as SemaphoreResult);
        w.onerror = reject;
        w.postMessage(msg);
      });
      w.terminate();
      return res;
    } catch { /* fall through to sync path */ }
  }
  const { semaphoreFromDaily } = await import("../../domain/semaphore");
  return semaphoreFromDaily(msg.shards, new Set(msg.cells),
    msg.endDate, msg.cfg);
}

export function AreaPanel({ lat, lon, cells, open, onClose, country,
                            month }: {
  lat: number; lon: number; cells: string[];
  open: boolean; onClose: () => void;
  country: string | null;
  month?: string | null;
}) {
  const { t, lang } = useT();
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const selection = `${lat},${lon}`;
  /** B1: a fetch failure is not "no data" — keep the states apart. */
  const [riskStatus, setRiskStatus] =
    useState<"loading" | "error" | "empty" | "data">("loading");
  const [risk, setRisk] = useState<RiskView | null>(null);
  /** Bump to re-run the risk query after a failure. */
  const [riskTick, setRiskTick] = useState(0);
  /** ISO A2 from /api/risk — preferred over the app's geolocated guess. */
  const [riskCountry, setRiskCountry] = useState<string | null>(null);
  const [riskData, setRiskData] = useState<{ selection: string; value: RiskCell | null } | null>(null);
  const riskCell = riskData?.selection === selection ? riskData.value : null;
  const [calendarData, setCalendarData] = useState<{
    selection: string; value: { months: string[]; values: number[] } | null;
  } | null>(null);
  const [semaphoreData, setSemaphoreData] = useState<{
    selection: string; value: SemaphoreResult | null; end: string;
  } | null>(null);
  const cal = calendarData?.selection === selection ? calendarData.value : null;
  const sem = semaphoreData?.selection === selection ? semaphoreData.value : null;
  const semEnd = semaphoreData?.selection === selection ? semaphoreData.end : null;
  const [season, setSeason] = useState(false);
  const [anomalies, setAnomalies] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const cellSet = useMemo(() => new Set(cells), [cells]);
  const shards = useMemo(() => [...groupByShard(cells).keys()], [cells]);

  useEffect(() => { apiMeta().then(setMeta); }, []);

  useEffect(() => {
    if (!open) return;
    let dead = false;
    setRiskStatus("loading");
    apiRiskResult(lat, lon).then((r) => {
      if (dead) return;
      if (!r.ok) {
        // never leave the previous point's risk on screen after a failure
        setRisk(null); setRiskCountry(null); setRiskStatus("error");
        setRiskData({ selection, value: null });
        return;
      }
      setRiskData({ selection, value: r.data });
      if (r.data) {
        setRisk(presentRisk(r.data));
        setRiskCountry(r.data.country ?? null);
        setRiskStatus("data");
      } else {
        setRisk(null);
        setRiskCountry(null);
        setRiskStatus("empty");
      }
    });
    return () => { dead = true; };
  }, [open, lat, lon, selection, riskTick]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all(shards.map(fireCal)).then((rows) => {
      if (!active) return;
      const cals = rows.filter((c): c is CalShard => c !== null);
      setCalendarData({ selection, value: cals.length ? aggregateMonthly(cals, cellSet) : null });
    });
    return () => { active = false; };
  }, [open, selection, cellSet, shards]);

  useEffect(() => {
    if (!open || !meta) return;
    let active = true;
    const end = new Date().toISOString().slice(0, 10);
    const cfg = {
      windowDays: meta.semaphore.window_days,
      categories: meta.semaphore.categories,
      ratioMinMedian: meta.semaphore.ratio_min_median,
      baselineStart: `${meta.baseline.start}-01`,
      baselineEnd: `${meta.baseline.end}-28`,
    };
    Promise.all(shards.map(fireDaily)).then(async (rows) => {
      if (!active) return;
      const dailies = rows.filter((d): d is DailyShard => d !== null);
      const value = dailies.length && dailies.length === shards.length
        ? await runSemaphore({ shards: dailies, cells, endDate: end, cfg }) : null;
      if (active) setSemaphoreData({ selection, value, end });
    }).catch(() => {
      if (active) setSemaphoreData({ selection, value: null, end });
    });
    return () => { active = false; };
  }, [open, selection, cells, shards, meta]);

  const calMatrix = useMemo(() => {
    if (!cal) return null;
    const m = yearMonthMatrix(cal);
    return season ? fireSeasonMatrix(m) : m;
  }, [cal, season]);

  useEffect(() => {
    if (!barsRef.current) return;
    if (!calMatrix) { barsRef.current.replaceChildren(); return; }
    const totals = [...rowTotals(calMatrix).entries()]
      .map(([year, n]) => ({ year, n }));
    barsRef.current.replaceChildren(Plot.plot({
      width: 340, height: 140, marginLeft: 40,
      x: { label: null, tickFormat: "d" },
      y: { label: null },
      marks: [Plot.barY(totals, { x: "year", y: "n", fill: "#b3401e" })],
      style: { background: "transparent", color: "inherit", fontSize: "11px" },
    }));
  }, [calMatrix, lang]);

  const thisMonth = month ?? new Date().toISOString().slice(0, 7);
  const monthFmt = new Intl.DateTimeFormat(lang === "en" ? "en" : "es",
    { month: "long", year: "numeric", timeZone: "UTC" });
  const monthLabel = (m: string) =>
    monthFmt.format(new Date(`${m}-01T00:00:00Z`));
  const curValue = cal && sem ? sem.value : null;
  // The semaphore always sums the last `window_days` up to today; it
  // must not borrow the month picked on the historic map.
  const windowDays = meta?.semaphore.window_days ?? 30;
  const period = semEnd ? semaphorePeriod(semEnd, windowDays) : null;
  const dayFmt = new Intl.DateTimeFormat(lang === "en" ? "en" : "es",
    { day: "numeric", month: "short", timeZone: "UTC" });
  const fmtDay = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));
  const semExtra = sem
    ? (sem.ratio != null
        ? t("sem.timesMedian", { x: sem.ratio })
        : (sem.lowBaseline && sem.value > 0
            ? t("sem.noBaseline")
            : t("sem.percentile", { p: sem.percentile })))
    : "";
  const effCountry = riskCell?.country ?? riskCountry ?? country;
  const riskHigh = risk ? ["alto", "muy_alto"].includes(risk.cat) : false;

  return (
    <BottomSheet open={open}>
      <div className="panel-head">
        <h3>{t("panel.title")}</h3>
        <button onClick={onClose} aria-label={t("ui.close")}>✕</button>
      </div>

      {sem && (
        <section className="lead" aria-live="polite">
          <p className="lead-place">{t("panel.point",
            { lat: lat.toFixed(2), lon: lon.toFixed(2) })}</p>
          <span className={`badge ${sem.category}`}>{t(`sem.${sem.category}`)}</span>
          <p className="lead-text">{t(`panel.lead.${sem.category}`, { d: windowDays })}</p>
        </section>
      )}

      <Card title={t("panel.risk7d")}>
        {riskStatus === "loading" && (
          <p className="muted" role="status">{t("panel.loading")}</p>)}
        {riskStatus === "error" && (
          <div role="alert">
            <p className="muted">{t("panel.riskError")}</p>
            <button type="button"
                    onClick={() => setRiskTick((k) => k + 1)}>
              {t("ui.retry")}</button>
          </div>)}
        {riskStatus === "empty" && (
          <p className="muted">{t("panel.noData")}</p>)}
        {riskStatus === "data" && risk && (
          <>
            <div className="big">
              <span aria-hidden="true">{risk.icon} </span>
              {risk.normalForSeason
                ? t("panel.normalForSeason")
                : `${t(`risk.cat.${risk.cat}`)}`}
              {risk.ratioText &&
                <span className="muted"> · {t("panel.ratioText",
                  { x: risk.ratioText.replace("×", "") })}</span>}
            </div>
            <p className="muted">
              {t("panel.prob", { p: risk.probText })} —{" "}
              {t(`panel.riskLevel.${risk.level}`)}
            </p>
            {risk.reasons.length > 0 && (
              <div><strong>{t("panel.reasons")}</strong>
                <ul>{risk.reasons.map((r) =>
                  <li key={r}>{riskReasonText(r, t)}</li>)}</ul>
              </div>)}
          </>)}
        {riskCell?.generated_at && riskCell.valid_until && <p className="muted">
          {t("risk.period", { start: new Date(riskCell.generated_at).toLocaleDateString(lang),
            end: new Date(riskCell.valid_until).toLocaleDateString(lang) })}
        </p>}
        <p className="notice">{t("panel.disclaimer")}<br />
          {emergencyText(effCountry, t)}</p>
      </Card>

      {semaphoreData?.selection === selection && !sem && <Card
        title={t("panel.semaphore", { d: windowDays })}>
        <p className="muted">{t("panel.noData")}</p>
      </Card>}
      {(riskHigh || sem?.category === "extremo") && (
        <EmergencyBlock country={effCountry}
                        mapCenter={{ lat, lon }}
                        lead={t("emerg.lead")} />)}

      {sem && (
        <Card title={t("panel.semaphore", { d: windowDays })}>
          <div className="big">
            <span className={`badge ${sem.category}`}>
              {t(`sem.${sem.category}`)}
            </span>
            <span className="muted"> · {t("sem.median",
              { n: sem.median })}</span>
          </div>
          {period && (
            <p>{t("sem.summary", {
              from: fmtDay(period.from), to: fmtDay(period.to),
              n: curValue ?? 0, extra: semExtra })}</p>)}
          {month && (
            <p className="muted">{t("sem.mapMonthNote",
              { month: monthLabel(month) })}</p>)}
        </Card>
      )}

      <details className="sec more detail-more">
      <summary>{t("panel.more")}</summary>
      <Card title={t("calendar.title")}>
        {calMatrix ? (
          <>
            <div className="chip-row" role="group">
              <span className="seg">
                <button aria-pressed={!season}
                        onClick={() => setSeason(false)}>
                  {t("calendar.calendarYear")}</button>
                <button aria-pressed={season}
                        onClick={() => setSeason(true)}>
                  {t("calendar.season")}</button>
              </span>
              <span className="seg">
                <button aria-pressed={!anomalies}
                        onClick={() => setAnomalies(false)}>
                  {t("calendar.counts")}</button>
                <button aria-pressed={anomalies}
                        onClick={() => setAnomalies(true)}>
                  {t("calendar.anomalies")}</button>
              </span>
            </div>
            {anomalies && (
              <p className="muted">{t("calendar.anomalies.hint")}</p>)}
            <div style={{ overflowX: "auto" }}>
              <Calendar compact
                matrix={calMatrix}
                mode={anomalies ? "anomalies" : "counts"}
                highlight={season
                  ? { year: Number(thisMonth.slice(5)) >= 7
                        ? Number(thisMonth.slice(0, 4))
                        : Number(thisMonth.slice(0, 4)) - 1,
                      month: (Number(thisMonth.slice(5)) + 5) % 12 }
                  : { year: Number(thisMonth.slice(0, 4)),
                      month: Number(thisMonth.slice(5)) - 1 }}
                onPick={(y, m, v) =>
                  setPicked(`${monthLabel(`${y}-${String(m + 1).padStart(2, "0")}`)}: ${v}`)} />
            </div>
            {picked && <p aria-live="polite">{picked}</p>}
            <Legend from="0"
              to={String(Math.max(1,
                ...[...calMatrix.values()].flat()))}
              colors={[css(viridis(0)), css(viridis(0.5)), css(viridis(1))]} />
            <p className="muted">{t("legend.unit")}</p>
          </>
        ) : <p className="muted">{t("panel.noData")}</p>}
      </Card>

      <Card title={t("bars.yearly")}>
        {calMatrix ? <div ref={barsRef} /> :
          <p className="muted">{t("panel.noData")}</p>}
      </Card>

      {cal && (
        <Card>
          <button onClick={() => downloadCsv(
              `fuegos_${lat.toFixed(2)}_${lon.toFixed(2)}.csv`,
              toCsv(cal))}>
            {t("csv.download")}</button>
          {shards.length === 1 && effCountry === "AR" && (
            <p><a href={pointsCsvUrl(shards[0],
                new Date().getFullYear())} download>
              {t("csv.rawPoints")}</a></p>)}
        </Card>
      )}
      </details>
    </BottomSheet>
  );
}

/** Area panel: 7d risk, semaphore, calendar, yearly bars, CSV, measures. */
import { useEffect, useMemo, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import { useT } from "../../i18n";
import { Card, BottomSheet, Legend } from "../../components/ui";
import { Calendar } from "../../components/Calendar";
import {
  fireCal, fireDaily, apiRisk, pointsCsvUrl, meta as apiMeta,
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
import { presentRisk, emergencyText } from "../../domain/risk";
import { EmergencyBlock } from "../emergency/EmergencyBlock";
import { viridis, css } from "../../domain/colors";
import { semaphorePeriod } from "../../domain/clarity";
import type { MetaJson } from "../../api/types";

const MONTH_NAMES = ["enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","septiembre","octubre","noviembre","diciembre"];

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
  const [risk, setRisk] = useState<ReturnType<typeof presentRisk> | null>(null);
  /** ISO A2 from /api/risk — preferred over the app's geolocated guess. */
  const [riskCountry, setRiskCountry] = useState<string | null>(null);
  const [cal, setCal] = useState<{ months: string[]; values: number[] } | null>(null);
  const [sem, setSem] = useState<SemaphoreResult | null>(null);
  /** Day the semaphore window ends on (today when it was computed). */
  const [semEnd, setSemEnd] = useState<string | null>(null);
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
    apiRisk(lat, lon).then((r) => {
      if (!dead) {
        setRisk(r ? presentRisk(r) : null);
        setRiskCountry(r?.country ?? null);
      }
    });
    (async () => {
      // cal first (small): renders the calendar without waiting on the
      // multi-MB daily shards; everything fetched in parallel.
      const cals = (await Promise.all(shards.map(fireCal)))
        .filter((c): c is CalShard => c !== null);
      if (dead) return;
      if (!cals.length) { setCal(null); } else {
        setCal(aggregateMonthly(cals, cellSet));
      }
      if (!meta) return;
      const dailies = (await Promise.all(shards.map(fireDaily)))
        .filter((d): d is DailyShard => d !== null);
      if (dead || !dailies.length) return;
      const end = new Date().toISOString().slice(0, 10);
      const s = await runSemaphore({
        shards: dailies, cells, endDate: end,
        cfg: {
          windowDays: meta.semaphore.window_days,
          categories: meta.semaphore.categories,
          ratioMinMedian: meta.semaphore.ratio_min_median,
          baselineStart: `${meta.baseline.start}-01`,
          baselineEnd: `${meta.baseline.end}-28`,
        },
      });
      if (!dead) { setSem(s); setSemEnd(end); }
    })();
    return () => { dead = true; };
  }, [open, lat, lon, cells, cellSet, shards, meta]);

  const calMatrix = useMemo(() => {
    if (!cal) return null;
    const m = yearMonthMatrix(cal);
    return season ? fireSeasonMatrix(m) : m;
  }, [cal, season]);

  useEffect(() => {
    if (!barsRef.current || !calMatrix) return;
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
  const monthLabel = (m: string) =>
    `${MONTH_NAMES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
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
  const effCountry = riskCountry ?? country;
  const riskHigh = risk ? ["alto", "muy_alto"].includes(risk.cat) : false;

  return (
    <BottomSheet open={open}>
      <div className="panel-head">
        <h3>{t("panel.title")}</h3>
        <button onClick={onClose} aria-label={t("ui.close")}>✕</button>
      </div>

      {sem && (
        <section className="lead" aria-live="polite">
          <p className="lead-place">{lat.toFixed(2)}°, {lon.toFixed(2)}°</p>
          <span className={`badge ${sem.category}`}>{t(`sem.${sem.category}`)}</span>
          <p className="lead-text">{t(`panel.lead.${sem.category}`, { d: windowDays })}</p>
        </section>
      )}

      <Card title={t("panel.risk7d")}>
        {risk ? (
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
              {t("panel.prob", { p: risk.probPct })} —{" "}
              {t(`panel.riskLevel.${risk.level}`)}
            </p>
            {risk.reasons.length > 0 && (
              <div><strong>{t("panel.reasons")}</strong>
                <ul>{risk.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>)}
          </>
        ) : <p className="muted">{t("panel.noData")}</p>}
        <p className="notice">{t("panel.disclaimer")}<br />
          {emergencyText(effCountry, t)}</p>
      </Card>

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
          {shards.length === 1 && country === "AR" && (
            <p><a href={pointsCsvUrl(shards[0],
                new Date().getFullYear())} download>
              {t("csv.rawPoints")}</a></p>)}
        </Card>
      )}
      </details>
    </BottomSheet>
  );
}

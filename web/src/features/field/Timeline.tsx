/** "Cómo viene el año": the last 24 months of field variables vs the
 * 2001-2020 normals, as four small multiples on one shared x axis.
 * Data: `timeline` in /api/field/diagnose and per parcel in
 * /api/field/parcels (task 47 contract). */
import { useId, useState } from "react";
import { useT } from "../../i18n";
import type { DiagTimeline, TimelineSeriesData } from "../../api/types";
import { Glossary } from "../../components/Glossary";

const W = 320, H = 108, PADT = 6, PADB = 18;
const PLOT = H - PADT - PADB;

/** |anomaly| thresholds that turn a month "unusual" (hatched). */
const ANOM_PCT = 30, ANOM_C = 1.5;

const monthNum = (ym: string) => parseInt(ym.slice(5, 7), 10) || 1;

/** 12-monthly normals expanded to the timeline's month list. */
export function normalFor(s: TimelineSeriesData | undefined,
                          months: string[]): (number | null)[] {
  const n12 = s?.normal ?? [];
  return months.map((m) => n12[monthNum(m) - 1] ?? null);
}

function range(vals: (number | null)[], norm: (number | null)[]):
    { lo: number; hi: number } {
  const all = [...vals, ...norm].filter((v): v is number => v != null);
  if (!all.length) return { lo: 0, hi: 1 };
  const hi = Math.max(...all);
  const lo = Math.min(0, Math.min(...all));
  return { lo, hi: hi > lo ? hi : lo + 1 };
}

/** Path segments for a series with possible null gaps. */
function segments(vals: (number | null)[], y: (v: number) => number,
                  cw: number): string[] {
  const segs: string[] = [];
  let cur = "";
  vals.forEach((v, i) => {
    if (v == null) { if (cur) { segs.push(cur); cur = ""; } return; }
    const x = i * cw + cw / 2;
    cur += `${cur ? "L" : "M"}${x.toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  return segs;
}

type PanelProps = {
  months: string[]; partial: number; title: string; unit: string;
  reading: string | null; noData: boolean; focus: number | null;
  onFocus: (i: number | null) => void; children: React.ReactNode;
  table: { heads: string[]; rows: (string | number | null)[][] };
};

/** One small multiple: title + unit + "?", svg, live readout, and a
 * visually hidden table with the same data. */
function Panel({ months, partial, title, unit, reading, noData, focus,
                 onFocus, children, table }: PanelProps) {
  const { t, lang } = useT();
  const cw = W / months.length;
  const initials = t("ui.monthInitials").split(",");
  const mLabel = (i: number) =>
    new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" })
      .format(new Date(`${months[i]}-15T12:00:00`));
  return (
    <figure className="tl-panel">
      <figcaption>
        <span>{title} <span className="muted">({unit})</span></span>
        <Glossary term="anomaly" />
      </figcaption>
      {reading && <p className="tl-read" aria-live="polite">{reading}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label={`${title}, ${months.length} ${t("field.timeline.months")}`}
           onMouseLeave={() => onFocus(null)}>
        {months.map((m, i) => {
          const mo = monthNum(m);
          const label = mo === 1 ? m.slice(0, 4)
                       : mo % 3 === 1 ? initials[mo - 1] : null;
          return (
            <g key={m}>
              <rect className="tl-col" x={i * cw} y={PADT}
                    width={cw} height={PLOT}
                    tabIndex={0} role="img"
                    aria-label={mLabel(i) +
                      (i === partial ? `, ${t("field.timeline.partial")}` : "")}
                    onFocus={() => onFocus(i)}
                    onMouseEnter={() => onFocus(i)} />
              {i === partial && (
                <rect className="tl-partial" x={i * cw + 0.5} y={PADT}
                      width={cw - 1} height={PLOT} />)}
              {label && (
                <text className="tl-tick" x={i * cw + cw / 2}
                      y={H - 4} textAnchor="middle">{label}</text>)}
            </g>);
        })}
        {children}
        {focus != null && (
          <line className="tl-focus" x1={focus * cw + cw / 2}
                x2={focus * cw + cw / 2} y1={PADT} y2={H - PADB} />)}
      </svg>
      {noData && <p className="tl-nodata muted">{t("field.timeline.noData")}</p>}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead><tr><th scope="col">{t("field.timeline.th.month")}</th>
          {table.heads.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {months.map((m, i) => (
            <tr key={m}><th scope="row">{m}</th>
              {table.rows.map((r, j) => <td key={j}>{r[i] ?? ""}</td>)}</tr>))}
        </tbody>
      </table>
    </figure>);
}

/** Full chart: headline + the four panels + basis/source. */
export function Timeline({ timeline: tl, label }: {
    timeline: DiagTimeline; label?: string }) {
  const { t, lang } = useT();
  const [focus, setFocus] = useState<{ p: string; i: number } | null>(null);
  const hatchId = `tlh${useId().replace(/:/g, "")}`;
  const fmt = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });
  const fmt1 = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const months = tl.months;
  const n = months.length, cw = W / n;
  const partial = tl.partial_last ? n - 1 : -1;
  const mLabel = (i: number) =>
    new Intl.DateTimeFormat(lang, { month: "long" })
      .format(new Date(`${months[i]}-15T12:00:00`));
  const y = (v: number, r: { lo: number; hi: number }) =>
    PADT + PLOT * (1 - (v - r.lo) / (r.hi - r.lo));

  if (!n || !tl.series) return null;

  /** Last complete month with a value, for the one-line reading. */
  const lastComplete = (s?: TimelineSeriesData) => {
    const vs = s?.values ?? [];
    for (let i = n - 1 - (partial === n - 1 ? 1 : 0); i >= 0; i--)
      if (vs[i] != null) return i;
    return -1;
  };

  const difText = (pct: number) => t(
    pct < 0 ? "field.timeline.less" : "field.timeline.more",
    { pct: fmt.format(Math.abs(pct)) });

  const readout = (p: string, vals: (number | null)[],
                   norm: (number | null)[], unit: string) => {
    if (focus?.p !== p) return null;
    const i = focus.i, v = vals[i];
    let s = `${mLabel(i)}: ${v == null ? t("field.timeline.noData")
                                      : `${fmt.format(v)} ${unit}`}`;
    const nv = norm[i];
    if (nv != null)
      s += ` (${t("field.timeline.th.normal")} ${fmt.format(nv)})`;
    if (i === partial) s += ` — ${t("field.timeline.partial")}`;
    return s;
  };

  /* ---------- panel 1: rain bars vs normal line ---------- */
  const rain = tl.series.rain_mm;
  const rainV = rain?.values ?? [], rainN = normalFor(rain, months);
  const rainA = rain?.anomaly_pct ?? [];
  const rainR = range(rainV, rainN);
  const rainAnom = months.map((_, i) =>
    rainA[i] != null && Math.abs(rainA[i]) >= ANOM_PCT);
  const rainLi = lastComplete(rain);
  const rainRead = focus?.p === "rain"
    ? readout("rain", rainV, rainN, "mm")
    : rainLi >= 0 && rainA[rainLi] != null
      ? `${mLabel(rainLi)}: ${difText(rainA[rainLi]!)}`
      : rainLi >= 0 ? `${mLabel(rainLi)}: ${fmt.format(rainV[rainLi]!)} mm`
      : null;

  /* ---------- panel 2: tmax line vs normal, anomaly shaded ---------- */
  const tmax = tl.series.tmax_c;
  const tV = tmax?.values ?? [], tN = normalFor(tmax, months);
  const tA = tmax?.anomaly_c ?? [];
  const tR = range(tV, tN);
  const tAnom = months.map((_, i) =>
    tA[i] != null && Math.abs(tA[i]) >= ANOM_C);
  const tLi = lastComplete(tmax);
  const tRead = focus?.p === "tmax"
    ? readout("tmax", tV, tN, "°C")
    : tLi >= 0 && tA[tLi] != null
      ? `${mLabel(tLi)}: ${tA[tLi]! > 0 ? "+" : ""}${fmt1.format(tA[tLi]!)} °C ${
          t(tA[tLi]! > 0 ? "field.timeline.warmer" : "field.timeline.cooler")}`
      : null;

  /* ---------- panel 3: root-zone moisture area vs normal ---------- */
  const mois = tl.series.root_moisture;
  // contract: GWETROOT monthly mean 0-1 -> shown as %; tolerate 0-100.
  const mScale = Math.max(0,
    ...(mois?.values ?? []).filter((v): v is number => v != null)) <= 1.5
    ? 100 : 1;
  const pct = (v: number | null) => v == null ? null : v * mScale;
  const mV = (mois?.values ?? []).map(pct);
  const mN = normalFor(mois, months).map(pct);
  const mA = mois?.anomaly_pct ?? [];
  const mR = range(mV, mN);
  const mAnom = months.map((_, i) =>
    mA[i] != null && Math.abs(mA[i]) >= ANOM_PCT);
  const mLi = lastComplete(mois);
  const mRead = focus?.p === "moist"
    ? readout("moist", mV, mN, "%")
    : mLi >= 0 && mA[mLi] != null
      ? `${mLabel(mLi)}: ${difText(mA[mLi]!)}`
      : null;

  /* ---------- panel 4: heat + frost day bars ---------- */
  const heat = tl.series.heat_days_35?.values ?? [];
  const frost = tl.series.frost_days?.values ?? [];
  const dR = range([...heat, ...frost], []);
  const dLi = Math.max(lastComplete(tl.series.heat_days_35),
                       lastComplete(tl.series.frost_days));
  const dRead = focus?.p === "days" && focus.i != null
    ? `${mLabel(focus.i)}: ${fmt.format(heat[focus.i] ?? 0)} ${
        t("field.timeline.heatD")}, ${fmt.format(frost[focus.i] ?? 0)} ${
        t("field.timeline.frostD")}` +
      (focus.i === partial ? ` (${t("field.timeline.partial")})` : "")
    : dLi >= 0
      ? `${mLabel(dLi)}: ${fmt.format(heat[dLi] ?? 0)} ${
          t("field.timeline.heatD")}, ${fmt.format(frost[dLi] ?? 0)} ${
          t("field.timeline.frostD")}`
      : null;

  const setP = (p: string) => (i: number | null) =>
    setFocus(i == null ? null : { p, i });
  const hatchDefs = <defs>
    <pattern id={hatchId} width="4" height="4"
             patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="4" className="tl-hatch-line" />
    </pattern>
  </defs>;
  const hatchFill = `url(#${hatchId})`;

  return (
    <div className="tl">
      {label && <h5 className="tl-parcel">{label}</h5>}
      {tl.headline && <p className="tl-headline">{tl.headline}</p>}

      <Panel months={months} partial={partial}
             title={t("field.timeline.p.rain")} unit="mm"
             reading={rainRead} noData={rainV.some((v) => v == null)}
             focus={focus?.p === "rain" ? focus.i : null}
             onFocus={setP("rain")}
             table={{ heads: [t("field.timeline.th.value") + " (mm)",
                              t("field.timeline.th.normal"),
                              t("field.timeline.th.anomaly") + " (%)"],
                      rows: [rainV, rainN, rainA] }}>
        {hatchDefs}
        {months.map((_, i) => rainAnom[i] && (
          <rect key={i} className="tl-anom" x={i * cw} y={PADT}
                width={cw} height={PLOT} fill={hatchFill} />))}
        {rainV.map((v, i) => v != null && (
          <rect key={i}
                className={"tl-bar rain" +
                  (rainAnom[i] ? " anom" : "") +
                  (i === partial ? " partial" : "")}
                x={i * cw + 1.5} width={cw - 3}
                y={y(v, rainR)} height={H - PADB - y(v, rainR)} />))}
        {segments(rainN, (v) => y(v, rainR), cw).map((d, i) => (
          <path key={i} className="tl-normal" d={d} />))}
      </Panel>

      <Panel months={months} partial={partial}
             title={t("field.timeline.p.tmax")} unit="°C"
             reading={tRead} noData={tV.some((v) => v == null)}
             focus={focus?.p === "tmax" ? focus.i : null}
             onFocus={setP("tmax")}
             table={{ heads: [t("field.timeline.th.value") + " (°C)",
                              t("field.timeline.th.normal"),
                              t("field.timeline.th.anomaly") + " (°C)"],
                      rows: [tV, tN, tA] }}>
        {hatchDefs}
        {months.map((_, i) => tAnom[i] && (
          <rect key={i} className="tl-anom" x={i * cw} y={PADT}
                width={cw} height={PLOT} fill={hatchFill} />))}
        {segments(tV, (v) => y(v, tR), cw).map((d, i) => (
          <path key={i} className="tl-line" d={d} />))}
        {tV.map((v, i) => v != null && (
          <circle key={i} className="tl-dot" cx={i * cw + cw / 2}
                  cy={y(v, tR)} r={i === partial ? 3 : 1.8} />))}
        {segments(tN, (v) => y(v, tR), cw).map((d, i) => (
          <path key={i} className="tl-normal" d={d} />))}
      </Panel>

      <Panel months={months} partial={partial}
             title={t("field.timeline.p.moist")} unit="%"
             reading={mRead} noData={mV.some((v) => v == null)}
             focus={focus?.p === "moist" ? focus.i : null}
             onFocus={setP("moist")}
             table={{ heads: [t("field.timeline.th.value") + " (%)",
                              t("field.timeline.th.normal"),
                              t("field.timeline.th.anomaly") + " (%)"],
                      rows: [mV, mN, mA] }}>
        {hatchDefs}
        {months.map((_, i) => mAnom[i] && (
          <rect key={i} className="tl-anom" x={i * cw} y={PADT}
                width={cw} height={PLOT} fill={hatchFill} />))}
        {segments(mV, (v) => y(v, mR), cw).map((d, i) => (
          <path key={i} className="tl-area" d={
            `${d}L${segEnd(mV, cw, i)},${H - PADB}` +
            `L${segStart(mV, cw, i)},${H - PADB}Z`} />))}
        {segments(mV, (v) => y(v, mR), cw).map((d, i) => (
          <path key={`l${i}`} className="tl-line" d={d} />))}
        {segments(mN, (v) => y(v, mR), cw).map((d, i) => (
          <path key={i} className="tl-normal" d={d} />))}
      </Panel>

      <Panel months={months} partial={partial}
             title={t("field.timeline.p.days")} unit={t("field.timeline.u.days")}
             reading={dRead} noData={heat.some((v) => v == null) ||
                                    frost.some((v) => v == null)}
             focus={focus?.p === "days" ? focus.i : null}
             onFocus={setP("days")}
             table={{ heads: [t("field.timeline.heatD"),
                              t("field.timeline.frostD")],
                      rows: [heat, frost] }}>
        {heat.map((v, i) => v != null && (
          <rect key={`h${i}`}
                className={"tl-bar heat" + (i === partial ? " partial" : "")}
                x={i * cw + 1} width={cw / 2 - 1.5}
                y={y(v, dR)} height={H - PADB - y(v, dR)} />))}
        {frost.map((v, i) => v != null && (
          <rect key={`f${i}`}
                className={"tl-bar frost" + (i === partial ? " partial" : "")}
                x={i * cw + cw / 2 + 0.5} width={cw / 2 - 1.5}
                y={y(v, dR)} height={H - PADB - y(v, dR)} />))}
      </Panel>

      <p className="tl-legend muted">
        <span className="tl-sw normal" /> {t("field.timeline.normals",
          { period: tl.normals_period ?? "2001-2020" })}
        {" · "}<span className="tl-sw anom" /> {t("field.timeline.hatch")}
        {partial >= 0 && <>{" · "}<span className="tl-sw partial" />{" "}
          {t("field.timeline.partial")}</>}
      </p>
      {(tl.basis || tl.source) && (
        <p className="tl-basis muted">
          {tl.basis}{tl.basis && tl.source ? " · " : ""}{tl.source}</p>)}
    </div>);
}

/** x of the first/last point of a value segment (for closing areas). */
function segBounds(vals: (number | null)[], segIdx: number):
    { s: number; e: number } {
  let k = -1, s = 0, e = 0, inSeg = false;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] != null) {
      if (!inSeg) { s = i; inSeg = true; }
      e = i;
    } else if (inSeg) { k++; if (k === segIdx) return { s, e }; inSeg = false; }
  }
  return { s, e };
}
const segStart = (v: (number | null)[], cw: number, i: number) =>
  (segBounds(v, i).s * cw + cw / 2).toFixed(1);
const segEnd = (v: (number | null)[], cw: number, i: number) =>
  (segBounds(v, i).e * cw + cw / 2).toFixed(1);

/** Collapsed block for the Resumen tab: headline + one rain sparkline,
 * expandable to the full chart. */
export function TimelinePeek({ timeline: tl, label }: {
    timeline: DiagTimeline; label?: string }) {
  const { t } = useT();
  const v = tl.series?.rain_mm?.values ?? [];
  const max = Math.max(1, ...v.filter((x): x is number => x != null));
  return (
    <section className="tl-peek" aria-labelledby="tl-peek-h">
      <h4 id="tl-peek-h">{t("field.timeline.title")}
        {label ? ` — ${label}` : ""}</h4>
      {tl.headline && <p className="tl-headline">{tl.headline}</p>}
      <details className="tl-more">
        <summary>
          <span className="tl-open">{t("field.timeline.open")}</span>
          <svg className="tl-spark" viewBox="0 0 120 28" aria-hidden="true">
            {v.map((x, i) => x != null && (
              <rect key={i} x={i * (120 / v.length)} width={120 / v.length - 1}
                    y={28 - (x / max) * 26} height={(x / max) * 26} />))}
          </svg>
        </summary>
        <Timeline timeline={tl} />
      </details>
    </section>);
}

/** Field lens: draw/tap plot -> diagnose -> rotations -> explain. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../i18n";
import { Card, BottomSheet, Tooltip } from "../../components/ui";
import { Glossary } from "../../components/Glossary";
import {
  apiDiagnose, apiRotations, apiExplain, apiFieldCatalog, ecostressDemo, knowledgeCases, orinValidation,
} from "../../api";
import type {
  Card as DiagCard, CaseEntry, CropEntry, DiagnoseResponse, Measure, OrinValidation,
  RotationEntry, RotationsResponse, Strategy,
} from "../../api/types";
import type { EcostressDemo } from "../../api";
import { OrinCard, SyntheticBanner } from "./OrinCard";
import {
  benefitValue, benefitRows, cardValueText, compareDeltas, deltaText, groupVariants,
  groupedCards, indicatorLabelKey, irrigationNeedMm, measureReqPairs,
  orderNote, prioWeights, rankNote,
  seqSegments, verdictDelta, PRIORITY_IDS, type Scenario,
} from "../../domain/rotations";
import { plainSummary, referenceText, localizeDiag } from "../../domain/clarity";
import {
  plotBody, multiHa, type Multi, type PlotBody,
} from "../../domain/selection";

/** The exact area sent to the diagnosis, and how to name it. */
export type AnalysisTarget = {
  geom: Multi;
  /** "Todo el campo", "Pieza 2", "Zona Norte (maíz)", "Lote de ejemplo" */
  areaLabel: string;
  /** saved field name, when the area belongs to one */
  fieldName?: string;
  /** whole field area, to say how much of it is analysed */
  fieldHa?: number;
  demoLot?: DemoLot;
};

const LS_PLOTS = "fs_plots";

const CONSTRAINTS = ["irrigation", "livestock", "machinery", "markets"] as const;

function savePlot(name: string, body: PlotBody) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_PLOTS) ?? "[]") as unknown[];
    all.push({ name, body, saved_at: new Date().toISOString() });
    localStorage.setItem(LS_PLOTS, JSON.stringify(all.slice(-20)));
  } catch { /* quota/parse errors: non-fatal */ }
}

function levelText(lv: number | null): string {
  if (lv == null) return "·";
  return ["○", "◔", "◑", "●"][Math.min(Math.max(lv, 0), 3)];
}

/** Word-first confidence badge + small dot (never color alone). */
export function ConfBadge({ level, t }: {
    level: string;
    t: (k: string, v?: Record<string, string | number>) => string }) {
  return (
    <span className={`badge conf-${level}`}>
      <i className="cdot" aria-hidden="true" />
      {t(`field.confidence.${level}`)}
    </span>);
}

function RainChart({ card, t }: {
    card: DiagCard;
    t: (k: string, v?: Record<string, string | number>) => string }) {
  const mm = card.rain_monthly_mm;
  if (!mm || mm.length !== 12) return null;
  const months = t("ui.monthInitials").split(",");
  const max = Math.max(...mm, 1);
  return (
    <div className="rain-chart">
      <p className="muted">{t("field.rainMonthly",
        { y0: 2001, y1: new Date().getFullYear() - 1 })}</p>
      <div className="rain-bars" role="img"
           aria-label={t("field.rainMonthly",
             { y0: 2001, y1: new Date().getFullYear() - 1 })}>
        {mm.map((v, i) => (
          <div key={i} className="rain-bar-col" title={`${months[i]}: ${v} mm`}>
            <div className="rain-bar"
                 style={{ height: `${Math.max(4, (v / max) * 100)}%` }} />
            <span className="rain-bar-label">{months[i]}</span>
          </div>))}
      </div>
      <p className="muted">
        {t("field.rainMinMax",
          { min: Math.round(Math.min(...mm)),
            max: Math.round(Math.max(...mm)) })}</p>
      <details>
        <summary>{t("field.rainTable")}</summary>
        <table className="cal">
          <tbody>
            <tr>{months.map((m, i) => <th key={i} scope="col">{m}</th>)}</tr>
            <tr>{mm.map((v, i) => <td key={i}>{v}</td>)}</tr>
          </tbody>
        </table>
      </details>
    </div>
  );
}

function StopConditions({ card, t }: {
    card: DiagCard;
    t: (k: string, v?: Record<string, string | number>) => string }) {
  if (!card.stop_conditions?.length) return null;
  return (
    <div className="stop-conditions">
      <strong>{t("field.stopConditions")}</strong>
      <ul>
        {card.stop_conditions.map((c) => (
          <li key={c}>{card.stop_detail?.[c] ?? c}</li>))}
      </ul>
    </div>
  );
}

/** Compact diagnosis tile: label, value with unit, confidence badge. */
function DiagTile({ c, t, fmt }: {
    c: DiagCard;
    t: (k: string, v?: Record<string, string | number>) => string;
    fmt: Intl.NumberFormat }) {
  // string values are backend ids (bajo, flat…): show them as words
  const vkey = typeof c.value === "string" ? `cardval.${c.value}` : null;
  const val = vkey && t(vkey) !== vkey ? t(vkey) : cardValueText(c, fmt);
  return (
    <div className="dtile">
      <div className="dtile-head">
        <span className="dtile-label">{t(`card.${c.id}`)}</span>
        <ConfBadge level={c.confidence} t={t} />
      </div>
      <div className="dtile-value">
        {val ?? <span className="muted">{t("field.noData")}</span>}
        {deltaText(c, fmt) && (
          <span className={`dtile-delta${c.delta! > 0 ? " up" : " down"}`}>
            {" "}{c.delta! > 0 ? "↑" : "↓"} {deltaText(c, fmt)}
          </span>)}
      </div>
      {c.text && <p className="muted">{c.text}</p>}
      {c.id === "rain" && <RainChart card={c} t={t} />}
      {c.id === "fire_weather" && <StopConditions card={c} t={t} />}
      {(c.source || c.resolution) && (
        <details className="dtile-src">
          <summary>{t("field.source")}</summary>
          <p className="muted">
            {c.source}{c.resolution ? ` · ${c.resolution}` : ""}
          </p>
        </details>)}
    </div>);
}

/** Afinidad bar 0-100 with a one-line scale tooltip. */
function Afinity({ score, t }: {
    score: number;
    t: (k: string, v?: Record<string, string | number>) => string }) {
  const pct = Math.round(Math.min(Math.max(score, 0), 1) * 100);
  return (
    <div className="affinity">
      <span className="aff-label">
        {t("rot.affinity")}: {pct}
        <Tooltip text={t("rot.affinityTip")} />
      </span>
      <div className="aff-bar" role="img"
           aria-label={`${t("rot.affinity")}: ${pct}/100`}>
        <div className="aff-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>);
}

/** Covered-vs-bare crop segments over a 12-month bar. */
function SeqBar({ s, t }: {
    s: Strategy;
    t: (k: string, v?: Record<string, string | number>) => string }) {
  const months = t("ui.monthInitials").split(",");
  return (
    <div className="seqbars">
      {s.sequence.map((seq, i) => {
        const covered = seq.cover !== false;
        return (
          <div className="seqrow" key={i}>
            <span className="seqcrop">{seq.crop}</span>
            <span className="seqbar" role="img"
                  aria-label={`${seq.crop}: ${seq.start}–${seq.end} · ` +
                    (covered ? t("rot.covered") : t("rot.bare"))}>
              {seqSegments(seq.start, seq.end).map((seg, j) => (
                <span key={j}
                      className={`seqfill ${covered ? "covered" : "bare"}`}
                      style={{
                        left: `${(seg.from / 12) * 100}%`,
                        width: `${((seg.to - seg.from + 1) / 12) * 100}%`,
                      }} />))}
            </span>
            <span className="seqcov">
              {covered ? t("rot.covered") : t("rot.bare")}
            </span>
          </div>);
      })}
      <div className="seqrow seqmonths" aria-hidden="true">
        <span className="seqcrop" />
        <span className="seqbar seqscale">
          {months.map((m, i) => <span key={i}>{m}</span>)}
        </span>
        <span className="seqcov" />
      </div>
    </div>);
}

/** Requirements/cost/checks/source block shared by the two measure
 * lists (diagnosis card and strategy section). */
function MeasureMeta({ m, t }: {
    m: Measure;
    t: (k: string, v?: Record<string, string | number>) => string }) {
  const note = m.requires?.reference_width_note;
  return (
    <>
      {m.requires && <div className="muted">
        {measureReqPairs(m.requires).map((p) =>
          `${t(p.key)}: ${p.value.startsWith("field.")
            ? t(p.value) : p.value}`).join(" · ")}</div>}
      {typeof note === "string" && <div className="muted">{note}</div>}
      {m.cost && <div className="muted">
        {t("measure.req.cost")}: {t(benefitValue(m.cost))}</div>}
      {m.checks && m.checks.length > 0 && (
        <div className="muted">{t("measure.checks")}: {m.checks.join("; ")}</div>)}
      {m.source && <div className="muted">{m.source}</div>}
    </>);
}

/** Measures that bring the "Un caso real" card into the prevention
 * block (harvester checks / harvest stop). */
const CASE_MEASURE_IDS = new Set(["clean_harvester", "harvest_timing"]);

/** A documented incident (kind news_report) shown next to the
 * prevention measures — report, never a worker testimony. */
export function CaseBlock({ c, t }: {
    c: CaseEntry;
    t: (k: string, v?: Record<string, string | number>) => string }) {
  return (
    <div className="case-block notice" role="note">
      <strong>{t("case.title")}</strong> — {c.place}, {c.date}
      <p>{c.summary}</p>
      <p className="muted">{t("case.disclaimer")}</p>
      {c.lessons && c.lessons.length > 0 && (
        <p className="muted">{t("case.lessons")}: {c.lessons.join("; ")}</p>)}
      {c.unknown && <p className="muted">{t("case.unknown")}: {c.unknown}</p>}
      {c.source?.url && (
        <p className="muted">{t("case.source")}:{" "}
          <a href={c.source.url} target="_blank" rel="noreferrer">
            {c.source.title ?? c.source.url}</a></p>)}
    </div>);
}

/** "Qué hacer" prevention-measures card + real case (exported for
 * tests). */
export function MeasuresCard({ measures, cases, t }: {
    measures: Measure[];
    cases?: CaseEntry[];
    t: (k: string, v?: Record<string, string | number>) => string }) {
  if (!measures.length) return null;
  const showCase = measures.some((m) => CASE_MEASURE_IDS.has(m.id));
  return (
    <Card title={t("measures.title")}>
      <ul>{measures.map((m) => (
        <li key={m.id}><strong>{m.name}</strong> — {m.why}
          <MeasureMeta m={m} t={t} />
        </li>))}</ul>
      {showCase && (cases ?? []).map((c) => (
        <CaseBlock key={c.id} c={c} t={t} />))}
    </Card>);
}

function Section({ title, count, open = false, children }: {
    title: string; count?: number; open?: boolean;
    children: React.ReactNode }) {
  return (
    <details className="sec" open={open}>
      <summary>{title}
        {count != null && count > 0 &&
          <span className="count"> {count}</span>}
      </summary>
      {children}
    </details>);
}

/** i18n key for a verdict, switched to its reference-scenario wording
 * when the baseline is the zone's typical rotation. */
const REF_VERDICT: Record<string, string> = {
  "rot.verdict.current": "rot.verdict.reference",
  "rot.verdict.parts": "rot.verdict.partsRef",
  "rot.verdict.balanced": "rot.verdict.balancedRef",
};

function StrategyCard({ s, t, current, variants, explain,
                        reference = false, rank }: {
    s: Strategy;
    t: (k: string, v?: Record<string, string | number>) => string;
    current?: Strategy | null;
    variants?: Strategy[];
    explain?: string;
    reference?: boolean;
    rank?: { key: string; n?: number } | null }) {
  const irr = irrigationNeedMm(s);
  const vd = verdictDelta(s, current);
  const vkey = reference ? REF_VERDICT[vd.key] ?? vd.key : vd.key;
  const verdict = vd.key === "rot.verdict.parts"
    ? t(vkey, { parts: vd.parts.map((k) => t(k))
                             .join(` ${t("ui.and")} `) })
    : t(vkey);
  const isRef = reference && s.is_current;
  const why = isRef ? t("rot.ref.why") : s.why;
  const explainText = isRef ? t("rot.ref.explain", { name: s.name })
    : explain && referenceText(explain, reference);
  return (
    <article className={`card strategy${s.is_current ? " current" : ""}`}>
      <h3>{s.name}
        {s.is_current && (
          <span className={`badge role${isRef ? " ref" : ""}`}>
            {t(isRef ? "rot.reference" : "rot.current")}</span>)}
        {variants?.map((v) => (
          <span key={v.id} className="badge variante" title={v.why}>
            {" "}{t("rot.variante")}: {v.name}</span>))}
      </h3>
      <p className="verdict">{verdict}</p>
      {rank && <p className="rank-note">{t(rank.key, { n: rank.n ?? "" })}</p>}
      <Afinity score={s.score} t={t} />
      <Section title={t("rot.why")} open>
        <p>{why}</p>
        {explainText && <p className="muted">{explainText}</p>}
      </Section>
      {/* changes versus the baseline; the baseline itself has none */}
      {!s.is_current &&
        (s.benefits && Object.keys(s.benefits).length > 0 || irr != null) && (
        <Section title={t(reference ? "rot.benefitsRef" : "rot.benefits")} open>
          <ul>
            {benefitRows(s.benefits ?? {}).map((b) => (
              <li key={b.id}>{t(b.key)}: {b.value.startsWith("field.")
                ? t(b.value) : b.value}</li>))}
            {irr != null && <li>{t("rot.irrigated", { mm: irr })}</li>}
          </ul>
        </Section>)}
      {s.sequence.length > 0 && (
        <Section title={t("rot.sequence")} open>
          <SeqBar s={s} t={t} />
        </Section>)}
      <Section title={t("rot.evidence")} count={s.evidence.length}>
        <ul>{s.evidence.map((e, i) => <li key={i}>{e.text}
          {e.source && <span className="muted"> — {e.source}</span>}</li>)}
        </ul>
      </Section>
      <Section title={t("rot.gaps")} count={s.gaps.length}>
        <ul>{s.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
      </Section>
      <Section title={t("rot.risks")} count={s.risks.length}>
        <ul>{s.risks.map((r) => <li key={r}>{r}</li>)}</ul>
      </Section>
      <Section title={t("rot.measures")} count={s.measures?.length ?? 0}>
        <ul>{(s.measures ?? []).map((m) => (
          <li key={m.id}><strong>{m.name}</strong>
            {m.why && <> — {m.why}</>}
            <MeasureMeta m={m} t={t} />
          </li>))}</ul>
      </Section>
    </article>
  );
}

/** Comparison table: each alternative vs the current rotation on the
 * four comparison indicators (arrows + words, never color alone). */
function CmpTable({ strategies, t, reference = false }: {
    strategies: Strategy[];
    reference?: boolean;
    t: (k: string, v?: Record<string, string | number>) => string }) {
  const current = strategies.find((s) => s.is_current);
  const alts = strategies.filter((s) => !s.is_current);
  if (!current || alts.length === 0) return null;
  const cells = (d: ReturnType<typeof compareDeltas>[number]) =>
    d.delta == null ? t("rot.cmp.same")
      : t(d.dir === "up" ? "rot.cmp.up" : "rot.cmp.down",
          { d: Math.abs(d.delta) });
  return (
    <details className="sec cmp-wrap">
      <summary>{t(reference ? "rot.cmp.titleRef" : "rot.cmp.title")}
        <span className="count"> {alts.length}</span></summary>
      <div style={{ overflowX: "auto" }}>
        <table className="cal cmp">
          <thead><tr><th scope="col">
            {t(reference ? "rot.reference" : "rot.current")}: {current.name}
          </th>
            {alts.map((a) => <th key={a.id} scope="col">{a.name}</th>)}
          </tr></thead>
          <tbody>
            {compareDeltas(alts[0], current).map((_, ci) => (
              <tr key={ci}>
                <th scope="row">
                  {t(indicatorLabelKey(
                    compareDeltas(alts[0], current)[ci].id) ?? "")}
                </th>
                {alts.map((a) => {
                  const d = compareDeltas(a, current)[ci];
                  return <td key={a.id}>{cells(d)}</td>;
                })}
              </tr>))}
          </tbody>
        </table>
      </div>
    </details>);
}

/** Rotations results block — exported for tests (Patagonia zero-state). */
export function RotationResults({ rots, diag, explain, t,
                                 reference = false, explainMode, onMethods }: {
    rots: RotationsResponse;
    diag: DiagnoseResponse | null;
    explain: Record<string, string>;
    /** true when the user answered "No sé": the baseline is the zone's
     * typical rotation, shown as a reference scenario. */
    reference?: boolean;
    explainMode?: string;
    onMethods?: () => void;
    t: (k: string, v?: Record<string, string | number>) => string }) {
  const current = rots.strategies.find((s) => s.is_current) ?? null;
  const groups = groupVariants(rots.strategies);
  const on = orderNote(rots);
  const trackRef = useRef<HTMLDivElement>(null);
  const [carIdx, setCarIdx] = useState(0);
  const onScroll = () => {
    const el = trackRef.current;
    if (!el || el.children.length === 0) return;
    const w = (el.children[0] as HTMLElement).offsetWidth + 12;
    setCarIdx(Math.min(groups.length - 1,
      Math.round(el.scrollLeft / w)));
  };
  return (
    <>
      {diag?.zone && (
        <p className="zone-header">
          <strong>{t("rot.zone", { z: t(`zone.${diag.zone}`) })}</strong>
          {diag.province && <span className="muted"> · {diag.province}</span>}
        </p>)}
      {on && <p className="scen-order" role="status">
        {t(on.key, on.vars)}</p>}
      {explainMode === "ai" && (
        <p className="explain-ai muted">
          {t("explain.aiLabel")}
          {onMethods && <>{" · "}
            <button className="linklike" onClick={onMethods}>
              {t("meth.link")}</button></>}
        </p>)}
      {rots.confidence === "low" && (
        <p className="notice" role="status">
          {t("rot.lowConfidence",
            { why: rots.gaps?.[0] ?? t("rot.noStrategies") })}
        </p>)}
      {rots.strategies.length === 0 ? (
        <div className="notice" role="status">
          <p>{t("rot.noStrategies")}</p>
          {(rots.zone_references ?? []).map((r, i) => (
            <p key={i} className="muted">
              <strong>{t("rot.zoneRef")}</strong>: {r.text}{" "}
              <span className="muted">— {r.source}</span>
            </p>))}
          <p className="muted">{t("rot.askAgronomist")}</p>
        </div>
      ) : (
        <>
          {rots.strategies.length === 1 &&
            rots.strategies[0].is_current && (
            <p className="muted">{t("rot.onlyCurrent")}</p>)}
          {reference && current && (
            <p className="notice ref-note" role="status">
              {t("rot.refNote")}</p>)}
          <CmpTable strategies={rots.strategies} t={t}
                    reference={reference} />
          <div className="strategies" ref={trackRef} onScroll={onScroll}>
            {groups.map((g) => (
              <StrategyCard key={g.primary.id} s={g.primary} t={t}
                            current={current} variants={g.variants}
                            explain={explain[g.primary.id]}
                            reference={reference} rank={rankNote(g.primary.id, rots)} />))}
          </div>
          {groups.length > 1 && (
            <div className="carousel-dots">
              {groups.map((g, i) => (
                <button key={g.primary.id} type="button"
                        className={`dot${i === carIdx ? " on" : ""}`}
                        aria-label={`${i + 1}`}
                        onClick={() => {
                          const el = trackRef.current;
                          const w = el?.children[0] &&
                            (el.children[0] as HTMLElement).offsetWidth + 12;
                          el?.scrollTo({ left: (w ?? 0) * i,
                                         behavior: "smooth" });
                        }} />))}
              <span className="muted">
                {t("rot.carousel", { i: carIdx + 1, n: groups.length })}
              </span>
            </div>)}
        </>)}
      <p className="notice">{rots.disclaimer || t("rot.disclaimer")}</p>
    </>);
}

/** A demo plot from orin/lots.geojson: rotations are not available for
 * its crop, only diagnosis + validation card. */
export interface DemoLot {
  name: string;
  crop_label: string;
  synthetic?: boolean;
}

export function FieldPanel({ target, open, onClose, onChangePlot, onMethods }: {
  target: AnalysisTarget | null; open: boolean; onClose: () => void;
  onChangePlot: () => void;
  onMethods?: () => void;
}) {
  const lot = target?.demoLot;
  const { t, lang } = useT();
  const [diag, setDiag] = useState<DiagnoseResponse | null>(null);
  const [orin, setOrin] = useState<OrinValidation | null>(null);
  const [cases, setCases] = useState<CaseEntry[]>([]);
  const [rots, setRots] = useState<RotationsResponse | null>(null);
  const [explain, setExplain] = useState<Record<string, string>>({});
  const [catalog, setCatalog] =
    useState<{ rotations: RotationEntry[]; crops: CropEntry[] } | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [explainMode, setExplainMode] = useState<string | null>(null);
  const [sc, setSc] = useState<Scenario | null>(null);
  const [eco, setEco] = useState<EcostressDemo | null>(null);
  const [current, setCurrent] = useState("unknown");
  const [prioSel, setPrioSel] = useState<string[]>([]);
  const [cons, setCons] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<1 | 2>(1);
  const [reading, setReading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [comparing, setComparing] = useState(false);
  const [compareFailed, setCompareFailed] = useState(false);
  const lastDiagnosisBody = useRef<PlotBody | null>(null);
  const comparisonRequests = useRef({ latest: 0 });
  /** Whether the shown results used the regional reference rotation. */
  const [refRun, setRefRun] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const fmt = useMemo(() =>
    new Intl.NumberFormat(lang === "en" ? "en" : "es",
      { maximumFractionDigits: 1 }), [lang]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setCatalogFailed(false);
    apiFieldCatalog().then((data) => {
      if (!active) return;
      setCatalog(data);
      setCatalogFailed(!data);
    });
    return () => { active = false; };
  }, [open, catalogRetry]);

  const body = useMemo<PlotBody | null>(() =>
    target ? plotBody(target.geom) : null, [target]);
  const fmtHa = (v: number) => fmt.format(v);
  const targetHa = target ? multiHa(target.geom) : 0;

  useEffect(() => {
    if (!open || !body) return;
    let active = true;
    const requests = comparisonRequests.current;
    if (lastDiagnosisBody.current !== body) {
      lastDiagnosisBody.current = body;
      setDiag(null);
      setStep(1);
    }
    setReading(true); setRots(null); setExplain({});
    setComparing(false); setCompareFailed(false);
    setExplainMode(null);
    apiDiagnose(sc ? { ...body, scenario: sc } : body).then((d) => {
      if (!active) return;
      setDiag(d); setReading(false);
      if (d) savePlot(lot?.name ?? "lote", body);
    });
    return () => {
      active = false;
      requests.latest++;
    };
  }, [open, body, lot, retry, sc]);

  useEffect(() => {
    if (open) { orinValidation().then(setOrin);
                ecostressDemo().then(setEco); }
  }, [open]);

  useEffect(() => {
    if (open) {
      knowledgeCases().then((k) => setCases(k?.cases ?? []));
    }
  }, [open]);

  // ECOSTRESS demo tile: only for the two demo plots (task 18.3)
  const ecoSite = (() => {
    if (!diag || !eco) return null;
    const [clat, clon] = diag.centroid;
    for (const [name, s] of Object.entries(eco.sites)) {
      const [w, so, e, n] = s.bbox;
      if (clat >= so && clat <= n && clon >= w && clon <= e) {
        return { name, ...s };
      }
    }
    return null;
  })();

  const togglePrio = (p: string) => setPrioSel((sel) => {
    if (sel.includes(p)) return sel.filter((x) => x !== p);
    return sel.length < 3 ? [...sel, p] : sel;
  });

  const runRotations = async () => {
    if (!diag || reading || comparing) return;
    const requests = comparisonRequests.current;
    const version = ++requests.latest;
    setComparing(true);
    setCompareFailed(false);
    setExplain({});
    const r = await apiRotations({
      diagnosis: diag,
      zone: diag.zone,
      current: current === "unknown" ? null : { rotation_id: current },
      priorities: prioWeights(prioSel),
      constraints: {
        irrigation: Boolean(cons.irrigation),
        livestock: Boolean(cons.livestock),
        machinery: Boolean(cons.machinery),
        markets: cons.markets ? catalog?.crops.map((c) => c.id) ?? [] : [],
      },
    });
    if (version !== requests.latest) return;
    setComparing(false);
    setCompareFailed(!r);
    setRots(r);
    setRefRun(current === "unknown");
    if (r) {
      const e = await apiExplain(r); // explain takes the rotations response
      if (e && version === requests.latest) {
        setExplainMode(e.mode ?? null);
        setExplain(Object.fromEntries(
          e.strategies.map((s) => [s.id, s.text])));
      }
    }
  };

  const summary = diag ? plainSummary(diag, lang) : [];
  const view = useMemo(() => diag && localizeDiag(diag, lang), [diag, lang]);
  const rotsView = useMemo<RotationsResponse | null>(() =>
    rots && lang === "en" ? {
      ...rots,
      strategies: rots.strategies.map((s) => ({
        ...s, name: s.name_en || s.name,
        measures: s.measures?.map((m) => ({
          ...m, name: m.name_en || m.name, why: m.why_en || m.why })),
      })),
    } : rots, [rots, lang]);
  const tv = (vars: Record<string, string | number>) =>
    Object.fromEntries(Object.entries(vars).map(([k, v]) =>
      [k, typeof v === "string" && v.startsWith("risk.cat.") ? t(v) : v]));
  const openCompare = () => {
    setStep(2);
    setTimeout(() => formRef.current?.scrollIntoView(
      { behavior: "smooth", block: "start" }), 50);
  };

  return (
    <BottomSheet open={open}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>{t("field.result.title")}</h3>
        <button onClick={onClose} aria-label={t("ui.close")}>✕</button>
      </div>
      {target && (
        <div className="analysis-scope">
          <strong>{target.fieldName
            ? `${target.fieldName} · ${target.areaLabel}` : target.areaLabel}</strong>
          <div className="muted">
            {target.fieldHa != null && Math.abs(target.fieldHa - targetHa) > 0.05
              ? t("analyze.scopePart", { a: fmtHa(targetHa), b: fmtHa(target.fieldHa) })
              : t("analyze.scopeAll", { a: fmtHa(targetHa) })}
            {target.geom.length > 1 &&
              <> · {t("analyze.scopePieces", { n: target.geom.length })}</>}
          </div>
        </div>)}
      {lot?.synthetic && <SyntheticBanner t={t} />}
      {reading && <p role="status">{t("field.diagnosing")}</p>}
      {!diag && !reading && target && (
        <div className="card">
          <p role="status">{t("field.diagnosis.failed")}</p>
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            {t("field.diagnosis.retry")}
          </button>
        </div>)}

      {diag && (
        <>
          <section className="card plain-summary"
                   aria-labelledby="plain-summary-h">
            <h3 id="plain-summary-h">{t("field.plain.title")}</h3>
            <p className="diag-summary">
              {diag.zone
                ? t("field.sum.l1z",
                    { zone: t(`zone.${diag.zone}`),
                      ha: fmt.format(diag.area_ha) })
                : t("field.sum.l1", { ha: fmt.format(diag.area_ha) })}
            </p>
            {summary.length > 0 ? (
              <dl className="plain-list">
                {summary.map((g) => (
                  <div key={g.group} className="plain-row">
                    <dt>{t(g.group === "soil" ? "field.plain.soil.title"
                      : `field.plain.${g.group}`)}</dt>
                    <dd>{g.facts.map((f) => t(f.key, tv(f.vars))).join(" ")}</dd>
                  </div>))}
              </dl>
            ) : <p className="muted">{t("field.noData")}</p>}
            <p className="muted plain-scale">{t("field.plain.scale")}</p>
          </section>

          <div className="field-actions">
            {step === 1 && !rots && !lot && (
              <button className="primary" onClick={openCompare}>
                {t("field.form.open")}</button>)}
            <button onClick={onChangePlot}>{t("field.changePlot")}</button>
          </div>

          <Card title={t("scen.title")} className="scen">
            <p className="muted">{t("scen.honest")}</p>
            <div className="scen-presets">
              <button onClick={() => setSc({ rain_pct: -20,
                                            temp_delta_c: 1 })}>
                {t("scen.preset.dry")}</button>
              <button onClick={() => setSc({ rain_pct: 0,
                                            temp_delta_c: 2 })}>
                {t("scen.preset.warm")}</button>
              <button onClick={() => setSc({ rain_pct: 20,
                                            temp_delta_c: 0 })}>
                {t("scen.preset.wet")}</button>
              <button onClick={() => setSc(null)}
                      disabled={!sc}>
                {t("scen.reset")}</button>
            </div>
            <label className="scen-slider">
              {t("scen.rain")}: {sc ? `${sc.rain_pct}%` : "0%"}
              <input type="range" min={-40} max={40} step={5}
                     value={sc?.rain_pct ?? 0}
                     aria-label={t("scen.rain")}
                     onChange={(e) => setSc({
                       rain_pct: Number(e.target.value),
                       temp_delta_c: sc?.temp_delta_c ?? 0 })} />
            </label>
            <label className="scen-slider">
              {t("scen.temp")}: {sc
                ? `${sc.temp_delta_c > 0 ? "+" : ""}${sc.temp_delta_c} °C`
                : "0 °C"}
              <input type="range" min={-2} max={4} step={0.5}
                     value={sc?.temp_delta_c ?? 0}
                     aria-label={t("scen.temp")}
                     onChange={(e) => setSc({
                       rain_pct: sc?.rain_pct ?? 0,
                       temp_delta_c: Number(e.target.value) })} />
            </label>
          </Card>

          <OrinCard data={orin} t={t} fmt={fmt} />

          {ecoSite && ecoSite.n_scenes > 0 && (
            <Card title={t("eco.title")} className="eco">
              <p className="muted">{t("eco.demo")}</p>
              <p><strong>
                {fmt.format(ecoSite.scenes[0]?.lst_c ?? 0)} °C
              </strong>{" "}
                {t("eco.last", { n: ecoSite.n_scenes })}
              </p>
              {ecoSite.bias_c != null && (
                <p className="muted">
                  {t("eco.bias", { v: `${ecoSite.bias_c > 0 ? "+" : ""}${
                    fmt.format(ecoSite.bias_c)}` })}
                </p>)}
              <details className="dtile-src">
                <summary>{t("field.source")}</summary>
                <p className="muted">ECOSTRESS ECO_L2T_LSTE · 70 m</p>
              </details>
            </Card>)}

          {view?.measures && view.measures.length > 0 && (
            <MeasuresCard measures={view.measures} cases={cases} t={t} />)}

          <details className="sec more">
            <summary>{t("field.details")}</summary>
            {groupedCards(view?.cards ?? []).map((g) => (
              <section key={g.group} className="diag-group">
                <h4>{t(`field.group.${g.group}`)}</h4>
                <div className="diag-grid">
                  {g.cards.map((c) => (
                    <DiagTile key={c.id} c={c} t={t} fmt={fmt} />))}
                </div>
              </section>))}
            <p className="muted">
              {t("field.glossary")}:{" "}
              {t("gloss.ndvi")}<Glossary term="ndvi" /> ·{" "}
              {t("gloss.et")}<Glossary term="et" /> ·{" "}
              {t("gloss.waterBalance")}<Glossary term="waterBalance" /> ·{" "}
              {t("gloss.anomaly")}<Glossary term="anomaly" /> ·{" "}
              {t("gloss.gdd")}<Glossary term="gdd" />
            </p>
          </details>

          <details className="sec more">
            <summary>{t("field.calendarMore")}</summary>
            <div style={{ overflowX: "auto" }}>
              <table className="cal" aria-label={t("calendar.aria")}>
                <thead><tr><th></th>
                  {(view ?? diag).calendar.months.map((m) =>
                    <th key={m} scope="col">{m}</th>)}
                </tr></thead>
                <tbody>
                  {diag.calendar.rows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">{t(`calendar.row.${row.id}`) !==
                        `calendar.row.${row.id}`
                        ? t(`calendar.row.${row.id}`)
                        : row.label ?? row.id}</th>
                      {row.levels.map((lv, i) => (
                        <td key={i} style={{
                          background: lv == null ? "transparent"
                            : `color-mix(in srgb, var(--covered) ${lv * 30}%, var(--panel))`,
                        }}>{levelText(lv)}</td>))}
                    </tr>))}
                </tbody>
              </table>
            </div>
          </details>

          {lot && (
            <p className="notice" role="status">
              {t("orin.rot.none", { crop: lot.crop_label })}
            </p>)}

          {step === 2 && !lot && (
            <div ref={formRef}>
            <Card title={t("field.form.run")}>
              <label>{t("field.form.current")}
                <select value={current}
                        onChange={(e) => setCurrent(e.target.value)}>
                  <option value="unknown">{t("field.form.dontKnow")}</option>
                  {catalog?.rotations.map((r) =>
                    <option key={r.id} value={r.id}>{r.name[lang] ?? r.name.es ?? r.id}</option>)}
                </select>
              </label>
              {catalogFailed && (
                <p role="status">
                  {t("field.form.catalogFailed")}{" "}
                  <button type="button" onClick={() => setCatalogRetry((n) => n + 1)}>
                    {t("field.diagnosis.retry")}
                  </button>
                </p>)}
              {current === "unknown" && (
                <p className="muted">{t("field.form.dontKnowHint")}</p>)}
              <fieldset className="prio-set">
                <legend>{t("prio.choose")}</legend>
                <div className="prio-chips" role="group"
                     aria-label={t("prio.choose")}>
                  {PRIORITY_IDS.map((p) => {
                    const rank = prioSel.indexOf(p);
                    return (
                      <button key={p} type="button" className="chip"
                              aria-pressed={rank >= 0}
                              onClick={() => togglePrio(p)}>
                        {t(`prio.${p}`)}
                        {rank >= 0 &&
                          <span className="rank"> {rank + 1}</span>}
                      </button>);
                  })}
                </div>
                <p className="muted">{t("prio.hint")}</p>
              </fieldset>
              <fieldset className="cons-set">
                <legend>{t("field.form.constraints")}</legend>
                <div className="cons-grid">
                  {CONSTRAINTS.map((c) => (
                    <label key={c}>
                      <input type="checkbox"
                        checked={cons[c] ?? false}
                        onChange={(e) =>
                          setCons({ ...cons, [c]: e.target.checked })} />
                      {t(`field.form.${c}`)}
                    </label>))}
                </div>
              </fieldset>
              {comparing && <p role="status">{t("field.form.comparing")}</p>}
              {compareFailed && <p role="status">{t("field.form.failed")}</p>}
              <button className="primary" onClick={runRotations}
                      disabled={reading || comparing}>
                {t("field.form.run")}</button>
            </Card>
            </div>)}
        </>
      )}

      {rotsView && <RotationResults rots={rotsView} diag={diag}
                                explain={explain} t={t}
                                reference={refRun}
                                explainMode={explainMode ?? undefined}
                                onMethods={onMethods} />}
      {!rots && diag && <p className="notice">{t("rot.disclaimer")}</p>}
    </BottomSheet>
  );
}
export type { PlotBody };
/** Exported for tests only. */
export { DiagTile as DiagTileForTest };

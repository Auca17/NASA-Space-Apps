import { CropRecommendations } from "./CropRecommendations";
import { DecisionDetail } from "./DecisionDetail";
import { RotationPlan } from "./RotationPlan";
import { coverSpans, fallowAdvice, rotationPlan, rowRuns, withCover } from "../../domain/rotationPlan";
import { moistureGeometry } from "../../domain/moisture";
import { MoisturePanel } from "./MoisturePanel";
import type { CurrentCrop, MoistureZone } from "../../api/types";
/** Field lens: draw/tap plot -> diagnose -> rotations -> explain. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../i18n";
import { Card, Tooltip } from "../../components/ui";
import { GlossDefs } from "../../components/Glossary";
import { DiagTile } from "./DiagTile";
import { Timeline, TimelinePeek } from "./Timeline";
import { SatelliteAccuracy } from "./SatelliteAccuracy";
import {
  apiCurrentCrop, apiDiagnose, apiRecommendationZones, apiRotations,
  apiFieldCatalog, ecostressDemo, knowledgeCases, orinValidation,
} from "../../api";
import type {
  CaseEntry, CropEntry, DiagnoseResponse, Measure, OrinValidation,
  RotationEntry, RotationsResponse, Strategy, StrategyEconomics,
} from "../../api/types";
import type { EcostressDemo } from "../../api";
import { OrinCard, SyntheticBanner } from "./OrinCard";
import {
  benefitValue, benefitRows, compareDeltas, groupVariants,
  groupedCards, humanizeGap, indicatorLabelKey, irrigationNeedMm, measureReqPairs,
  orderNote, prioWeights, rankNote,
  verdictDelta, type Scenario,
} from "../../domain/rotations";
import { plainSummary, referenceText, localizeDiag } from "../../domain/clarity";
import {
  plotBody, multiHa, type Multi, type PlotBody,
} from "../../domain/selection";
import {
  cropColor, cropDisplayName, hasHighFireAlert, largestPoly, normalizeCropLabel,
  parcelsBody, parcelsWithHighFire, parcelsWithDry,
  type Needs, type ParcelInput, type ParcelsResponse,
} from "../../domain/parcels";
import { apiParcels } from "../parcels/api";
import { AlertSignup } from "./AlertSignup";
import { HazardChip, ensoRainText } from "../parcels/HazardInd";
import { Icon } from "../parcels/CropIcon";
import {
  DEFAULT_ECONOMICS, DEFAULT_PROFILE, hiddenHazards, profileBody,
  visibleHazards, type Economics, type Profile,
} from "../../domain/parcelsProfile";
import "../../styles/parcels.css";

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
  /** Crop parcels drawn by the user; empty/missing analyses the whole
   * field as a single parcel. */
  parcels?: ParcelInput[];
  /** Needs step answers: null when skipped, undefined = ask first. */
  needs?: Needs | null;
  /** Guided demo (task 40): seed the fictional producer's profile and
   * economics instead of the stored ones, and fall back to a cached
   * real response when the live call fails. */
  demo?: {
    /** Dated cached response, shown only if the live call fails. */
    cached: ParcelsResponse;
    cachedDate: string;
    /** One-line producer description (falls back to demo.producer). */
    producer?: string;
  };
  profile?: Profile;
  econ?: Economics;
  declaredCrop?: string;
  nearby?: boolean;
  sections?: { name: string; geom: Multi; crop?: string }[];
  /** a plot of a saved field: its crop is shown only when some source
   * backs it (declared by the producer); otherwise «sin identificar» */
  parcel?: { crop: string | null; source: string };
};

const LS_PLOTS = "fs_plots";
/** Card groups shown first in the data view, in this order. */
const LAND_GROUPS = ["soil", "water", "temp"];

function savePlot(name: string, body: PlotBody) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_PLOTS) ?? "[]") as unknown[];
    all.push({ name, body, saved_at: new Date().toISOString() });
    localStorage.setItem(LS_PLOTS, JSON.stringify(all.slice(-20)));
  } catch { /* quota/parse errors: non-fatal */ }
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

/** The card shows the first sentence of the "why" (what improves and
 * what gets worse); the sequence is already drawn below it. */
const shortWhy = (why: string) => {
  const cut = why.indexOf(" Secuencia:");
  return cut > 0 ? why.slice(0, cut) : why;
};

/** Cost-benefit block of a rotation card: an estimate scaled by the
 * hectares, with what the cost includes and the expected harvest. */
function CostBenefit({ e, t }: {
    e: StrategyEconomics;
    t: (k: string, v?: Record<string, string | number>) => string }) {
  const { lang } = useT();
  // "always": Spanish CLDR leaves 4-digit numbers ungrouped (5338)
  const money = new Intl.NumberFormat(lang === "en" ? "en" : "es-AR",
    { maximumFractionDigits: 0,
      useGrouping: "always" } as unknown as Intl.NumberFormatOptions);
  const usd = (v: number) => `US$ ${money.format(v)}`;
  const tot = e.total;
  return (
    <section className="cost-benefit" aria-label={t("econ.title")}>
      <h4>{t("econ.title")}</h4>
      <dl className="econ-grid">
        <div><dt>{t("econ.cost")}</dt>
          <dd>{usd(e.per_ha.cost)} {t("econ.perHa")}
            {tot && <small>{t("econ.totalFor", { v: usd(tot.cost), ha: money.format(e.area_ha ?? 0) })}</small>}</dd></div>
        <div><dt>{t("econ.revenue")}</dt>
          <dd>{usd(e.per_ha.revenue)} {t("econ.perHa")}
            {tot && <small>{t("econ.totalFor", { v: usd(tot.revenue), ha: money.format(e.area_ha ?? 0) })}</small>}</dd></div>
        <div><dt>{t("econ.margin")}</dt>
          <dd className={e.per_ha.margin < 0 ? "econ-neg" : undefined}>
            {usd(e.per_ha.margin)} {t("econ.perHa")}
            {tot && <small>{t("econ.totalFor", { v: usd(tot.margin), ha: money.format(e.area_ha ?? 0) })}</small>}</dd></div>
        {e.harvest_t_total && e.harvest_t_total.length > 0 && (
          <div><dt>{t("econ.harvest")}</dt>
            <dd>{e.harvest_t_total.map((h) =>
              `${h.name}: ${money.format(h.t)} t`).join(" · ")}</dd></div>)}
      </dl>
      <p className="muted econ-note">
        {t(e.years > 1 ? "econ.disclaimerYears" : "econ.disclaimer", { n: e.years })}</p>
      <details className="econ-more">
        <summary>{t("econ.what")}</summary>
        <p><strong>{t("econ.includes")}</strong> {e.cost_includes.join(", ")}.</p>
        <p><strong>{t("econ.excludes")}</strong> {e.cost_excludes.join(", ")}.</p>
        <ul>{e.crops.map((c, i) => (
          <li key={i}>{c.name}: {usd(c.cost_ha)} {t("econ.perHa")}
            {c.harvest && c.yield_t_ha != null && c.price_usd_t != null
              ? ` · ${t("econ.cropYield", {
                  y: new Intl.NumberFormat(lang === "en" ? "en" : "es",
                    { maximumFractionDigits: 1 }).format(c.yield_t_ha),
                  p: usd(c.price_usd_t),
                  src: c.yield_source ?? "" })}`
              : ` · ${t("econ.noHarvest")}`}</li>))}</ul>
        <p className="muted">{e.sources.join(" · ")}</p>
      </details>
    </section>);
}

/** Month-by-month calendar of the rotation: one row per crop, green
 * while the crop is in the field, brown while the field has no crop. */
export function SeqBar({ s, t, soilPh }: {
    s: Strategy;
    soilPh?: number | null;
    t: (k: string, v?: Record<string, string | number>) => string }) {
  const { lang } = useT();
  const months = t("ui.monthInitials").split(",");
  const month = new Intl.DateTimeFormat(lang, { month: "short", timeZone: "UTC" });
  const monthOf = (md: string) => month.format(new Date(`2025-${md}T00:00:00Z`));
  const names = new Map((s.crops_info ?? []).map((c) => [c.id, c.name[lang] ?? c.name.es ?? c.id]));
  const anyBare = s.sequence.some((seq) => seq.cover === false);
  const day = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", timeZone: "UTC" });
  const dayOf = (md: string) => day.format(new Date(`2025-${md}T00:00:00Z`));
  // mid-sentence crop name: "Vicia (cobertura)" -> "vicia"
  const cleanName = (id?: string) => (id ? names.get(id) ?? id : "")
    .replace(/\s*\([^)]*\)$/, "").toLocaleLowerCase(lang);
  const gaps = fallowAdvice(rotationPlan(s.sequence, s.crops_info ?? [], soilPh), s.crops_info ?? [], soilPh);
  const covers = coverSpans(gaps);
  const rows = s.sequence.map((_, i) => withCover(rowRuns(s.sequence, i), covers));
  const has = (test: (who: string) => boolean) => rows.some((runs) => runs.some((run) => test(run.who)));
  const own = [...new Map(s.sequence.map((seq) => [seq.crop,
    `${cleanName(seq.crop)} (${monthOf(seq.start)} → ${monthOf(seq.end)})`])).values()].join(", ");
  const monthName = (m: number) => monthOf(`${String(m + 1).padStart(2, "0")}-15`);
  const runClass = (who: string, covered: boolean) => who === "own" ? (covered ? "covered" : "bare")
    : who === "fallow" ? "fallow" : who.startsWith("cover:") ? "cover" : "other";
  const runLabel = (who: string) => who === "own" ? "" : who === "fallow" ? t("rot.seq.fallowShort")
    : who.startsWith("cover:") ? t("rot.seq.coverShort", { crop: cleanName(who.slice(6)) }) : cleanName(who);
  const stepClass = (key: string) => key === "sow" ? "covered"
    : key.startsWith("cover") ? "cover" : "fallow";
  return (
    <div className="seqbars">
      <p className="seq-help">{t("rot.seq.help")}</p>
      <ul className="seq-legend">
        <li><span className="seq-swatch covered" aria-hidden="true" />{t("rot.seq.legend.crop", { list: own })}</li>
        {has((who) => who !== "own" && who !== "fallow" && !who.startsWith("cover:")) &&
          <li><span className="seq-swatch other" aria-hidden="true" />{t("rot.seq.legend.other")}</li>}
        {gaps.length > 0 && <li><span className="seq-swatch empty" aria-hidden="true" />{t("rot.seq.legend.fallow", {
          list: gaps.map((gap) => `${dayOf(gap.start)} → ${dayOf(gap.end)}`).join(", ") })}</li>}
        {covers.map((cover) => <li key={cover.crop + cover.from}>
          <span className="seq-swatch cover" aria-hidden="true" />{t("rot.seq.legend.cover", {
            crop: cleanName(cover.crop), from: dayOf(cover.from), to: dayOf(cover.to) })}</li>)}
        {anyBare && <li><span className="seq-swatch bare" aria-hidden="true" />{t("rot.seq.thin")}</li>}
      </ul>
      {s.sequence.map((seq, i) => {
        const covered = seq.cover !== false;
        const name = names.get(seq.crop) ?? seq.crop;
        const span = `${monthOf(seq.start)} → ${monthOf(seq.end)}`;
        return (
          <div className="seqrow" key={i}>
            <span className="seqcrop">{name}</span>
            <span className="seqbar" role="img"
                  aria-label={[t("rot.seq.row", { crop: name, span }),
                    ...rows[i].filter((run) => run.who !== "own").map((run) =>
                      `${monthName(run.from)}–${monthName(run.to)}: ${runLabel(run.who)}`)].join(". ")}>
              {rows[i].map((run, j) => {
                const label = runLabel(run.who);
                return <span key={j}
                      className={`seqfill ${runClass(run.who, covered)}`}
                      title={label || name}
                      style={{
                        left: `${(run.from / 12) * 100}%`,
                        width: `${((run.to - run.from + 1) / 12) * 100}%`,
                      }}>{run.to - run.from >= 1 && label && <span className="seqlabel">{label}</span>}</span>;
              })}
            </span>
            <span className="seqcov">{span}</span>
          </div>);
      })}
      <div className="seqrow seqmonths" aria-hidden="true">
        <span className="seqcrop" />
        <span className="seqbar seqscale">
          {months.map((m, i) => <span key={i}>{m}</span>)}
        </span>
        <span className="seqcov" />
      </div>
      {gaps.length > 0 && <div className="fallow-advice">
        <h5>{t("rot.fallow.title")}</h5>
        {gaps.map((gap, i) => <div key={i} className="fallow-gap">
          <p><strong>{t("rot.fallow.when", { from: dayOf(gap.start), to: dayOf(gap.end), days: gap.days })}</strong>
            {gap.after && gap.before && <> {t("rot.fallow.between", { after: cleanName(gap.after), before: cleanName(gap.before) })}</>}
          </p>
          <ol className="fallow-steps">{gap.steps.map((step) => <li key={step.key}>
            <span className={`seq-swatch ${stepClass(step.key)}`} aria-hidden="true" />{" "}
            <strong>{step.to ? `${dayOf(step.from)} → ${dayOf(step.to)}` : dayOf(step.from)}</strong>{" "}
            {t(`rot.fallow.do.${step.key}`, {
              after: cleanName(step.vars?.after), before: cleanName(step.vars?.before ?? gap.before),
              ph: soilPh != null ? String(soilPh).replace(".", lang === "es" ? "," : ".") : "" })}
          </li>)}</ol>
        </div>)}
      </div>}
    </div>);
}

/** Requirements/cost/checks/source block shared by the two measure
 * lists (diagnosis card and strategy section). */
function MeasureMeta({ m, t }: {
    m: Measure;
    t: (k: string, v?: Record<string, string | number>) => string }) {
  const note = m.requires?.reference_width_note;
  return (
    <details className="measure-meta">
      <summary>{t("measure.details")}</summary>
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
    </details>);
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
export function MeasuresCard({ measures, cases, title, t }: {
    measures: Measure[];
    cases?: CaseEntry[];
    title?: string;
    t: (k: string, v?: Record<string, string | number>) => string }) {
  if (!measures.length) return null;
  const showCase = measures.some((m) => CASE_MEASURE_IDS.has(m.id));
  return (
    <Card title={title ?? t("measures.title")}>
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
                        reference = false, rank, soilPh }: {
    s: Strategy;
    t: (k: string, v?: Record<string, string | number>) => string;
    current?: Strategy | null;
    variants?: Strategy[];
    explain?: string;
    reference?: boolean;
    rank?: { key: string; n?: number } | null;
    soilPh?: number | null }) {
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
      {/* at a glance: why, the sequence and the money; the rest folds */}
      <p className="strategy-why"><strong>{t("rot.why")}:</strong> {shortWhy(why)}</p>
      {explainText && !s.decision && <p className="muted strategy-ai">{explainText}</p>}
      <DecisionDetail decision={s.decision} fallback={why} facts={Object.fromEntries(
        ["water_balance_mm", "bare_soil_days", "soil_cover_fit"].flatMap((key) =>
          typeof s.indicators[key] === "number" ? [[key, s.indicators[key] as number]] : []),
      )} />
      {/* the rotation calendar stays visible */}
      {s.sequence.length > 0 && <SeqBar s={s} t={t} soilPh={soilPh} />}
      {s.economics && <CostBenefit e={s.economics} t={t} />}
      <details className="strategy-more">
        <summary>{t("rot.more")}</summary>
        {shortWhy(why) !== why && <p className="muted">{why}</p>}
        {s.sequence.length > 0 && (
          <Section title={t("rot.plan.title")} open>
            <RotationPlan s={s} soilPh={soilPh} t={t} />
          </Section>)}
        {!s.is_current && s.sequence.length > 0 && <dl className="plain-list">
          <div className="plain-row">
            <dt>{t("rot.work")}</dt>
            <dd>{t("rot.workHint", { n: s.sequence.filter((step) => step.cover !== false).length })}</dd>
          </div>
          {s.risks[0] && <div className="plain-row">
            <dt>{t("rot.checkFirst")}</dt>
            <dd>{s.risks[0]}</dd>
          </div>}
        </dl>}
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
        <Section title={t("rot.evidence")} count={s.evidence.length}>
          <ul>{s.evidence.map((e, i) => <li key={i}>{e.text}
            {e.source && <span className="muted"> — {e.source}</span>}</li>)}
          </ul>
        </Section>
        <Section title={t("rot.gaps")} count={s.gaps.length}>
          <ul>{s.gaps.map((g) => <li key={g}>{humanizeGap(g, t)}</li>)}</ul>
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
      </details>
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
  const comparison = alts.map((alt) => compareDeltas(alt, current));
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
            {comparison[0].map((delta, ci) => (
              <tr key={ci}>
                <th scope="row">
                  {t(indicatorLabelKey(
                    delta.id) ?? "")}
                </th>
                {alts.map((a, i) => {
                  const d = comparison[i][ci];
                  return <td key={a.id}>{cells(d)}</td>;
                })}
              </tr>))}
          </tbody>
        </table>
      </div>
    </details>);
}

/** Rotations results block — exported for tests (Patagonia zero-state). */
export function RotationResults({ rots, diag, explain = {}, t,
                                 reference = false, explainMode, onMethods }: {
    rots: RotationsResponse;
    diag: DiagnoseResponse | null;
    explain?: Record<string, string>;
    /** true when the user answered "No sé": the baseline is the zone's
     * typical rotation, shown as a reference scenario. */
    reference?: boolean;
    explainMode?: string;
    onMethods?: () => void;
    t: (k: string, v?: Record<string, string | number>) => string }) {
  const current = rots.strategies.find((s) => s.is_current) ?? null;
  const groups = groupVariants(rots.strategies);
  const commonMeasures = rots.strategies.length > 1 ?
    (rots.strategies[0].measures ?? []).filter((measure) => rots.strategies.every((strategy) =>
      strategy.measures?.some((item) => item.id === measure.id && item.why === measure.why))) : [];
  const commonIds = new Set(commonMeasures.map((measure) => measure.id));
  const on = orderNote(rots);
  return (
    <>
      {diag?.zone && (
        <p className="zone-header">
          <strong>{t("rot.zone", { z: t(`zone.${diag.zone}`) })}</strong>
          {diag.province && <span className="muted"> · {diag.province}</span>}
        </p>)}
      {on && <p className="scen-order" role="status">
        {t(on.key, on.vars)}</p>}
      {!!rots.strategies.length && rots.ranking_source && <p className="muted">
        {t(`decision.order.${rots.ranking_source}`)}</p>}
      {rots.strategies.length > 0 && rots.soil_data != null && <p className="muted">
        {t(rots.soil_data ? "rot.soilUsed" : "recs.soilMissing")}</p>}
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
          <MeasuresCard measures={commonMeasures} title={t("rot.commonMeasures")} t={t} />
          <div className="strategies">
            {groups.map((g) => (
              <StrategyCard key={g.primary.id} s={{ ...g.primary,
                measures: g.primary.measures?.filter((measure) => !commonIds.has(measure.id)) }} t={t}
                            current={current} variants={g.variants}
                            explain={explain[g.primary.id]}
                            reference={reference} rank={rankNote(g.primary.id, rots)}
                            soilPh={rots.soil_ph} />))}
          </div>
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

export function FieldPanel({ target, open, onClose, onChangePlot, onMethods, onResult, onEmergency, moistureSelection,
  onMoistureZones, onMoistureSelect, onRecommendationArea, nearbyUse }: {
  target: AnalysisTarget | null; open: boolean;
  onClose?: () => void;
  onRecommendationArea?: (geom: Multi | null) => void;
  nearbyUse?: "urban" | "checked" | "unavailable";
  onChangePlot: () => void;
  moistureSelection?: number | null;
  onMoistureZones?: (zones: MoistureZone[]) => void;
  onMoistureSelect?: (index: number | null) => void;
  onMethods?: () => void;
  /** Parcels response arrived: the map layer draws zones and badges. */
  onResult?: (res: ParcelsResponse, parcels: ParcelInput[],
              fixture: boolean) => void;
  /** Open the emergency block (tel numbers + message). */
  onEmergency?: () => void;
}) {
  const lot = target?.demoLot;
  const { t, lang } = useT();
  const [diag, setDiag] = useState<DiagnoseResponse | null>(null);
  const [orin, setOrin] = useState<OrinValidation | null>(null);
  const [cases, setCases] = useState<CaseEntry[]>([]);
  const [rots, setRots] = useState<RotationsResponse | null>(null);
  const [catalog, setCatalog] =
    useState<{ rotations: RotationEntry[]; crops: CropEntry[] } | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [sc, setSc] = useState<Scenario | null>(null);
  const [scenario, applyScenario] = useState<Scenario | null>(null);
  const [eco, setEco] = useState<EcostressDemo | null>(null);
  const [cons, setCons] = useState<Record<string, boolean>>({});
  // Rotations are the point of the challenge: the analysis always
  // opens on them; the field data lives in the second tab.
  const [tab, setTab] = useState<"recommendations" | "details" | "parcels">("recommendations");
  const [autoSections, setAutoSections] = useState<NonNullable<AnalysisTarget["sections"]> | null>(null);
  const [zoneDetectionFailed, setZoneDetectionFailed] = useState(false);
  const [areaIndex, setAreaIndex] = useState(0);
  const [sectionResult, setSectionResult] = useState<{ geom: Multi; data: DiagnoseResponse | null } | null>(null);
  const [sectionRetry, setSectionRetry] = useState(0);
  const [detected, setDetected] = useState<{ geometry: Multi; data: CurrentCrop | null } | null>(null);
  const [reading, setReading] = useState(false);
  const [retry, setRetry] = useState(0);
  // parcels flow (task 34): POST /api/field/parcels -> panel
  const [pres, setPres] = useState<
    import("../parcels/api").ParcelsResult | null>(null);
  const [pReading, setPReading] = useState(false);
  const [pRetry, setPRetry] = useState(0);
  // The panel only shows data: no priorities or economics to edit.
  // A guided demo still seeds its own fictional profile/economics.
  const [profile, setProfile] = useState<Profile>(target?.profile ?? DEFAULT_PROFILE);
  const [econ, setEcon] = useState<Economics>(target?.econ ?? DEFAULT_ECONOMICS);
  const needDiagnosis = true;
  const [diagnosisProblem, setDiagnosisProblem] = useState<string>();
  const [comparing, setComparing] = useState(false);
  const [compareFailed, setCompareFailed] = useState(false);
  const lastDiagnosisBody = useRef<PlotBody | null>(null);
  const comparisonRequests = useRef({ latest: 0 });
  const fmt = useMemo(() =>
    new Intl.NumberFormat(lang === "en" ? "en" : "es",
      { maximumFractionDigits: 1 }), [lang]);

  useEffect(() => {
    if (!open || !needDiagnosis) return;
    let active = true;
    setCatalogFailed(false);
    apiFieldCatalog().then((data) => {
      if (!active) return;
      setCatalog(data);
      setCatalogFailed(!data);
    });
    return () => { active = false; };
  }, [open, catalogRetry, needDiagnosis]);

  const body = useMemo<PlotBody | null>(() =>
    target ? plotBody(target.geom) : null, [target]);
  const definedSections = useMemo(() => target?.sections?.length ? target.sections :
    target?.parcels?.map((parcel) => ({ name: parcel.name, geom: [parcel.geom],
      crop: parcel.crop === "otro" ? undefined : parcel.crop })), [target]);
  const autoPartition = !target?.parcel && !target?.demoLot && !definedSections?.length;
  useEffect(() => {
    setAutoSections(null);
    setZoneDetectionFailed(false);
    // the division feeds both tabs (zone badges in the details): it does
    // not depend on the open tab, or switching would reset it
    if (!open || !body || !autoPartition) return;
    const controller = new AbortController();
    apiRecommendationZones(body, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      setZoneDetectionFailed(!data);
      setAutoSections((data?.zones ?? []).map((geom) => ({
        name: "", geom: moistureGeometry(geom),
      })));
    });
    return () => controller.abort();
  }, [body, open, autoPartition]);

  const sections = definedSections?.length ? definedSections : autoSections;
  const section = sections?.[areaIndex];
  const recGeometry = section?.geom ?? target?.geom;
  const declaredCrop = section ? section.crop : target?.declaredCrop ??
    (target?.parcel?.source === "manual" ? target.parcel.crop ?? undefined : undefined) ??
    lot?.crop_label;
  useEffect(() => {
    if (!open || tab !== "recommendations" || !recGeometry || declaredCrop ||
        (autoPartition && !sections) || zoneDetectionFailed) return;
    let active = true;
    apiCurrentCrop(plotBody(recGeometry)).then((data) => {
      if (active) setDetected({ geometry: recGeometry, data });
    });
    return () => { active = false; };
  }, [recGeometry, tab, open, autoPartition, sections, zoneDetectionFailed, declaredCrop]);

  useEffect(() => {
    if (!open || tab !== "recommendations" || !section) return;
    const controller = new AbortController();
    apiDiagnose(plotBody(section.geom), controller.signal).then(({ diagnosis }) => {
      if (!controller.signal.aborted) setSectionResult({ geom: section.geom, data: diagnosis });
    });
    return () => controller.abort();
  }, [section, open, tab, sectionRetry]);

  useEffect(() => {
    onRecommendationArea?.(open && tab === "recommendations" ? section?.geom ?? null : null);
    return () => onRecommendationArea?.(null);
  }, [section, open, tab, onRecommendationArea]);
  const fmtHa = (v: number) => fmt.format(v);
  const targetHa = target ? multiHa(target.geom) : 0;

  /** Parcels sent to the API: the drawn ones, or the whole field as a
   * single parcel (demo lot keeps its declared crop when known). */
  const effParcels = useMemo<ParcelInput[]>(() => {
    if (!target) return [];
    if (target.parcels?.length) return target.parcels;
    // the field's division into zones: one badge (fire / soil water)
    // per zone, matching the "Zona 1 · 12 ha" selector
    if (sections?.length) {
      return sections.map((sec, i) => ({
        id: `z${i + 1}`, name: sec.name || t("recs.sector", { n: i + 1 }),
        crop: normalizeCropLabel(sec.crop), geom: largestPoly(sec.geom),
        zone: true }));
    }
    // the division is still being detected: wait for it
    if (autoPartition && autoSections === null && !zoneDetectionFailed) return [];
    return [{ id: "p1", name: t("parcels.wholeField"),
              crop: normalizeCropLabel(lot?.crop_label),
              geom: largestPoly(target.geom), wholeField: true }];
  }, [target, lot, t, sections, autoPartition, autoSections, zoneDetectionFailed]);
  /** Needs answered in the parcels wizard, if any; the analysis never
   * waits for a form. */
  const effNeeds = target?.needs ?? null;

  // Zones of the automatic division are named after what Sentinel-2
  // sees on them now ("Barbecho", "Pastura/monte"...), as they arrive;
  // until then, and when the image is mixed, they stay "Zona N".
  const [zoneLabels, setZoneLabels] = useState<Record<number, string>>({});
  useEffect(() => {
    setZoneLabels({});
    if (!open || !autoSections?.length) return;
    let live = true;
    autoSections.forEach((sec, i) => {
      if (sec.name) return;
      apiCurrentCrop(plotBody(sec.geom)).then((r) => {
        if (!live || r?.status !== "available" || !r.zones.length) return;
        const top = [...r.zones].sort((a, b) => b.share - a.share)[0];
        if (top.share < 0.6) return;
        setZoneLabels((m) => ({ ...m,
          [i]: lang === "en" ? top.class.short_en : top.class.short_es }));
      });
    });
    return () => { live = false; };
  }, [open, autoSections, lang]);
  /** Name shown for section i: its own, the detected crop (numbered
   * when two zones share it) or "Zona N". */
  const sectionLabel = (i: number) => {
    const own = sections?.[i]?.name;
    if (own) return own;
    const label = zoneLabels[i];
    if (!label) return t("recs.sector", { n: i + 1 });
    const same = Object.entries(zoneLabels)
      .filter(([, v]) => v === label).map(([k]) => Number(k)).sort((a, b) => a - b);
    return same.length > 1 ? `${label} ${same.indexOf(i) + 1}` : label;
  };
  /** effParcels with the display names (never re-requests the analysis). */
  const shownParcels = useMemo(() => effParcels.map((p) => p.zone
    ? { ...p, name: sectionLabel(Number(p.id.slice(1)) - 1) } : p),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effParcels, zoneLabels, sections, t]);
  const shownParcelsRef = useRef(shownParcels);
  shownParcelsRef.current = shownParcels;

  /** Set when the shown result is the demo's cached response, not a
   * live call — the panel says "resultado guardado del …". */
  const [cachedDate, setCachedDate] = useState<string | null>(null);

  // New target: reset the whole flow.
  useEffect(() => {
    setPres(null);
    setTab("recommendations");
    setDiag(null); setRots(null); setCachedDate(null);
    setDiagnosisProblem(undefined);
    // a demo target carries its own fictional profile/economics
    setProfile(target?.profile ?? DEFAULT_PROFILE);
    setEcon(target?.econ ?? DEFAULT_ECONOMICS);
  }, [target]);

  // POST /api/field/parcels — the main analysis.
  useEffect(() => {
    if (!open || !target || !effParcels.length) {
      return;
    }
    let active = true;
    setPReading(true); setPres(null);
    apiParcels(
      parcelsBody(target.geom, effParcels, effNeeds, lang,
                  profileBody(profile, econ))).then((r) => {
      if (!active) return;
      let out = r;
      if (!r.ok && target.demo) {
        // guided demo: the cached real response keeps the demo going
        out = { ok: true, res: target.demo.cached, fixture: true };
        setCachedDate(target.demo.cachedDate);
      }
      setPres(out); setPReading(false);
      if (out.ok) {
        if (body) savePlot(lot?.name ?? "lote", body);
        onResult?.(out.res, shownParcelsRef.current, out.fixture);
      }
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target, effNeeds, effParcels, lang, pRetry, profile, econ]);

  useEffect(() => {
    if (pres?.ok) onResult?.(pres.res, shownParcels, pres.fixture);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownParcels]);

  // Crop recommendations use the lighter diagnosis. The guided flow also
  // fetches it when the user opens its detailed information.
  useEffect(() => {
    if (!open || !body || !needDiagnosis) return;
    const controller = new AbortController();
    const requests = comparisonRequests.current;
    const changed = lastDiagnosisBody.current !== body;
    if (changed) {
      lastDiagnosisBody.current = body;
      setDiag(null);
      setCons({});
      setAreaIndex(0);
      setSectionResult(null);
      setSc(null);
      if (scenario) { applyScenario(null); return; }
    }
    setReading(true); setRots(null); setDiagnosisProblem(undefined);
    setComparing(false); setCompareFailed(false);
    apiDiagnose(scenario ? { ...body, scenario } : body, controller.signal)
      .then(({ diagnosis: d, problem }) => {
      if (controller.signal.aborted) return;
      setDiag((old) => d ?? (scenario ? old : null)); setReading(false);
      setDiagnosisProblem(problem ?? (d || !scenario ? undefined : "scenario"));
      if (d) savePlot(lot?.name ?? "lote", body);
    });
    return () => {
      controller.abort();
      requests.latest++;
    };
  }, [open, body, lot, retry, scenario, needDiagnosis]);

  useEffect(() => {
    if (open && tab === "details") { orinValidation().then(setOrin);
                ecostressDemo().then(setEco); }
  }, [open, tab]);

  useEffect(() => {
    if (open && tab === "details") {
      knowledgeCases().then((k) => setCases(k?.cases ?? []));
    }
  }, [open, tab]);

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


  const runRotations = async () => {
    const local = section ? (
      sectionResult?.geom === section.geom ? sectionResult.data : null
    ) : diag;
    if (!local || local.coverage?.comparable === false || (!section && reading) || comparing) return;
    const requests = comparisonRequests.current;
    const version = ++requests.latest;
    setComparing(true);
    setCompareFailed(false);
    const r = await apiRotations({
      diagnosis: local,
      zone: local.zone,
      current: null,
      rank_with_gemini: true,
      lang,
      // no priority picker: every goal weighs the same
      priorities: prioWeights([]),
      constraints: {
        irrigation: cons.irrigation,
        livestock: cons.livestock,
      },
    });
    if (version !== requests.latest) return;
    setComparing(false);
    setCompareFailed(!r);
    setRots(r);
  };

  const base = useMemo(() => diag ? { ...diag, ...diag.baseline } : null, [diag]);
  const summary = base ? plainSummary(base, lang) : [];
  const view = useMemo(() => base && localizeDiag(base, lang), [base, lang]);
  const simulated = diag?.scenario ? localizeDiag(diag, lang) : null;
  const canCompare = diag?.coverage?.comparable !== false;
  const riskDate = base?.cards.find((card) => card.id === "fire")?.generated_at;
  const riskEnd = base?.cards.find((card) => card.id === "fire")?.valid_until;
  const dateLabel = (value: string) => new Date(value).toLocaleDateString(lang);
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
  const sectionReading = section && sectionResult?.geom !== section.geom;
  const recommendationData = section ? (
    sectionResult?.geom === section.geom ? sectionResult.data : null
  ) : base;
  const currentImage = detected?.geometry === recGeometry ? detected?.data : undefined;
  const sectionName = section && sectionLabel(areaIndex);
  const canRotate = !!recommendationData && (!target?.nearby || nearbyUse === "checked") &&
    !lot && recommendationData.coverage?.comparable !== false &&
    !zoneDetectionFailed && (!autoPartition || sections != null);

  // Rotations run by themselves as soon as the area's data is ready,
  // and again when the farmer says whether there is irrigation/livestock.
  useEffect(() => {
    comparisonRequests.current.latest++;
    setRots(null); setComparing(false); setCompareFailed(false);
  }, [cons.irrigation, cons.livestock]);
  useEffect(() => {
    if (!open || !canRotate || rots || comparing || compareFailed) return;
    runRotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canRotate, recommendationData, rots, comparing, compareFailed]);

  return (
    <div className="field-analysis-results" hidden={!open}>
      <header className="analysis-header">
        <div className="analysis-actions" role="group" aria-label={t("recs.views")}>
          <button type="button" aria-pressed={tab === "recommendations"}
                  onClick={() => setTab("recommendations")}>{t("recs.tab")}</button>
          <button type="button" aria-pressed={tab === "details"}
                  onClick={() => setTab("details")}>{t("recs.details")}</button>
          <button type="button" aria-pressed={tab === "parcels"}
                  onClick={() => setTab("parcels")}>{t("recs.parcels")}</button>
          <button type="button" onClick={onClose ?? onChangePlot}>{t("recs.changeField")}</button>
        </div>
        {tab === "recommendations" && sections && sections.length > 1 && <div className="rec-area">
          <label htmlFor="recommendation-area"><strong>{t(autoPartition ? "recs.changeArea" : "recs.changeParcel")}</strong></label>
          <select id="recommendation-area" aria-describedby="recommendation-area-help"
            value={areaIndex} onChange={(e) => {
            comparisonRequests.current.latest++;
            setRots(null); setComparing(false); setCompareFailed(false);
            setAreaIndex(Number(e.target.value));
          }}>
            {sections.map((part, i) => <option key={i} value={i}>
              {sectionLabel(i)}
              {" · "}{fmtHa(multiHa(part.geom))} ha
            </option>)}
          </select>
          <small id="recommendation-area-help" className="muted">{t(autoPartition ? "recs.sectorNote" : "recs.parcelNote")}</small>
        </div>}
      </header>
      {target && (
        <div className="analysis-scope">
          <strong>{[target.fieldName, tab === "recommendations" ? sectionName ?? target.areaLabel : target.areaLabel]
            .filter(Boolean).join(" · ")}</strong>
          <div className="muted">
            {tab === "recommendations" && section
              ? t("analyze.scopePart", { a: fmtHa(multiHa(section.geom)), b: fmtHa(targetHa) })
              : target.fieldHa != null && Math.abs(target.fieldHa - targetHa) > 0.05
              ? t("analyze.scopePart", { a: fmtHa(targetHa), b: fmtHa(target.fieldHa) })
              : t("analyze.scopeAll", { a: fmtHa(targetHa) })}
            {target.geom.length > 1 &&
              <> · {t("analyze.scopePieces", { n: target.geom.length })}</>}
          </div>
          {target.demo && (
            <p className="muted demo-note">
              <strong>{target.demo.producer ?? t("demo.producer")}</strong><br />
              {t("demo.disclaimer")}
            </p>)}
          {target.parcel && (
            <div className="muted">
              {t("parcel.boundarySource", { s: t("parcel.src." + target.parcel.source) })}
              {" · "}
              {target.parcel.crop
                ? t(target.parcel.source === "crop" && !target.declaredCrop ? "recs.historicalCrop" :
                  "parcel.cropDeclared", { c: target.parcel.crop })
                : t("parcel.cropUnknown")}
            </div>)}
        </div>)}
      {lot?.synthetic && <SyntheticBanner t={t} />}

      <div hidden={tab !== "details"}>
      {reading && <p role="status">{t("field.diagnosing")}</p>}
      {!diag && !reading && target && (
        <div className="card">
          <p role="status">{t(diagnosisProblem ? "field.diagnosis." + diagnosisProblem :
            "field.diagnosis.failed")}</p>
          {diagnosisProblem ? <button type="button" onClick={onChangePlot}>
            {t("field.changePlot")}
          </button> : <button type="button" onClick={() => setRetry((n) => n + 1)}>
            {t("field.diagnosis.retry")}
          </button>}
        </div>)}
      {diag?.degraded && (
        <div className="card diag-degraded" role="alert">
          <p><strong>{t("field.degraded.title")}</strong>{" "}
            {diag.degraded_reason ?? t("field.degraded.unknown")}</p>
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            {t("field.diagnosis.retry")}
          </button>
        </div>)}

      {/* first what the land is like today: soil, water, temperature */}
      {diag && view && (
        <section className="card land-state" aria-labelledby="land-h"
                 data-tour="land">
          <h3 id="land-h" style={{ marginTop: 0 }}>{t("land.title")}</h3>
          <p className="muted">{t("land.intro")}</p>
          {LAND_GROUPS.map((id) => groupedCards(view.cards)
            .find((g) => g.group === id)).filter((g) => g != null).map((g) => (
            <section key={g.group} className="diag-group">
              <h4>{t(`field.group.${g.group}`)}</h4>
              <div className="diag-grid">
                {g.cards.map((c) => (
                  <DiagTile key={c.id} c={c} t={t} fmt={fmt} />))}
              </div>
            </section>))}
          <p className="muted land-note">{t("land.nutrients")}</p>
        </section>)}

      {pReading && (
        <p role="status">{t("parcels.analyzing")}</p>)}

      {pres && !pres.ok && (
        <div className="card">
          <p role="status">{t(pres.errorKey)}</p>
          <button type="button" onClick={() => setPRetry((n) => n + 1)}>
            {t("field.diagnosis.retry")}
          </button>
        </div>)}

      {pres?.ok && pres.fixture && !cachedDate && (
        <p className="notice" role="status">{t("parcels.fixture")}</p>)}
      {pres?.ok && cachedDate && (
        <p className="notice" role="status">
          {t("demo.saved", { date: cachedDate })}</p>)}

      {/* a nearby-services failure alone is a quiet note inside the
          nearby section, not a big "incomplete" card */}
      {pres?.ok && pres.res.degraded && !pres.res.nearby.degraded && (
        <div className="card diag-degraded" role="alert">
          <p><strong>{t("field.degraded.title")}</strong>{" "}
            {pres.res.degraded_reason ?? t("field.degraded.unknown")}</p>
          <button type="button" onClick={() => setPRetry((n) => n + 1)}>
            {t("field.diagnosis.retry")}
          </button>
        </div>)}

      {pres?.ok && (
        <>
          {/* alerts stay above the tabs */}
          <div data-tour="alerts">
            <ParcelAlerts res={pres.res} parcels={shownParcels} t={t}
                          onEmergency={onEmergency} />
          </div>
        </>
      )}

      {/* the only interactive part of the data view */}
      {diag && (<>
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
              <button onClick={() => { setSc(null); applyScenario(null); }}
                      disabled={!sc && !scenario}>
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
            <button type="button" onClick={() => applyScenario(sc)}
                    disabled={!sc || (sc === scenario && !diagnosisProblem) ||
                      reading || diag.degraded}>
              {t("scen.apply")}
            </button>
            {diagnosisProblem === "scenario" && <p role="status">{t("field.diagnosis.scenario")}
              {" "}<button onClick={() => setRetry((n) => n + 1)}>
                {t("field.diagnosis.retry")}
              </button>
            </p>}
            {simulated && <div className="scen-results">
              <h4>{t("scen.results")}</h4>
              {simulated.cards.filter((card) => card.delta != null).map((card) =>
                <DiagTile key={card.id} c={card} t={t} fmt={fmt} />)}
            </div>}
          </Card>
      </>)}


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
            {diag.coverage && diag.coverage.available_cards < diag.coverage.total_cards &&
              <p role="status">{t(diag.coverage.available_cards > 0 ? "field.coverage.partial" : "field.coverage.empty",
                { n: diag.coverage.available_cards, total: diag.coverage.total_cards })}</p>}
            {!canCompare && <p className="muted">{t("field.coverage.noCompare")}</p>}
            {riskDate && riskEnd && <p className="muted">{t("risk.period", {
              start: dateLabel(riskDate), end: dateLabel(riskEnd),
            })}</p>}
            {diag.terrain_coverage != null && diag.terrain_coverage < 0.95 &&
              <p className="muted">{t("field.coverage.terrain",
                { n: fmt.format(diag.terrain_coverage * 100) })}</p>}
            <p className="muted plain-scale">{t("field.plain.scale")}</p>
          </section>
          {open && tab === "details" && body && onMoistureZones && onMoistureSelect &&
        <MoisturePanel key={JSON.stringify(body)} body={body}
          selected={moistureSelection ?? null}
          onZones={onMoistureZones} onSelect={onMoistureSelect} />}

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

        </>)}
      {/* more parcel information (the parcel summary has its own tab) */}
      {pres?.ok && (
        <section aria-labelledby="parcels-more-h">
          <h3 id="parcels-more-h">{t("parcels.tab.more")}</h3>
          <HiddenHazards res={pres.res} parcels={shownParcels}
                         profile={profile} t={t} fmt={fmt} />
          {pres.res.parcels.some((p) => p.timeline) && (
            <section className="card tl-block"
                     aria-label={t("field.timeline.title")}>
              <h4 style={{ marginTop: 0 }}>{t("field.timeline.title")}</h4>
              {pres.res.parcels.filter((p) => p.timeline).map((p) => (
                <Timeline key={`tl-${p.id}`} timeline={p.timeline!}
                  label={pres.res.parcels.filter((x) => x.timeline)
                         .length > 1
                         ? parcelName(shownParcels, p.id) : undefined} />))}
            </section>)}
          <SourcesBlock res={pres.res} t={t} />
        </section>
      )}
      {pres?.ok && (
        <AlertSignup parcels={pres.res.parcels.map((p) => ({
            name: parcelName(shownParcels, p.id),
            indicators: p.indicators, alerts: p.alerts }))}
          fieldName={target?.fieldName ?? lot?.name} />)}
      {diag && (<>
          <details className="sec more">
            <summary>{t("field.details")}</summary>
            {groupedCards(view?.cards ?? []).filter((g) =>
              !LAND_GROUPS.includes(g.group)).map((g) => (
              <section key={g.group} className="diag-group">
                <h4>{t(`field.group.${g.group}`)}</h4>
                <div className="diag-grid">
                  {g.cards.map((c) => (
                    <DiagTile key={c.id} c={c} t={t} fmt={fmt} />))}
                </div>
              </section>))}
            {diag.timeline && (
              <section className="card tl-block"
                       aria-label={t("field.timeline.title")}>
                <h4 style={{ marginTop: 0 }}>{t("field.timeline.title")}</h4>
                <Timeline timeline={diag.timeline} />
              </section>)}
            <SatelliteAccuracy
              accuracy={diag.accuracy}
              tempAdjustC={diag.temp_adjust_c}
              elevationM={diag.elevation_m}
              cellElevationM={diag.power_cell_elevation_m} />
            <details className="gloss-all">
              <summary>{t("field.glossary")}</summary>
              <GlossDefs />
            </details>
          </details>

        </>
      )}
      </div>

      <div hidden={tab !== "parcels"}>
        {pReading && <p role="status">{t("parcels.analyzing")}</p>}
        {pres && !pres.ok && <p role="status">{t(pres.errorKey)}{" "}
          <button type="button" onClick={() => setPRetry((n) => n + 1)}>
            {t("field.diagnosis.retry")}</button></p>}
        {pres?.ok && (
          <ParcelsResult res={pres.res} parcels={shownParcels}
                         profile={profile} t={t} fmt={fmt}
                         onRetry={() => setPRetry((n) => n + 1)} />)}
      </div>

      <div hidden={tab !== "recommendations"}>
        {reading && <p role="status">{t("field.diagnosing")}</p>}
        {!diag && !reading && diagnosisProblem && <p role="status">
          {t("field.diagnosis." + diagnosisProblem)}{" "}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>{t("field.diagnosis.retry")}</button>
        </p>}
        {target?.nearby && <p className="notice">
          {t("recs.nearby")}{" "}
          {t(nearbyUse === "urban" ? "recs.nearbyUrban"
            : nearbyUse === "unavailable" ? "recs.nearbyUnavailable"
            : nearbyUse === undefined ? "recs.nearbyChecking"
            : recommendationData?.land_cover === "crop" ? "recs.nearbyCrop" : "recs.nearbyUnknown")}
        </p>}
        {(sectionReading || (autoPartition && sections == null && !!diag)) &&
          <p role="status">{t("recs.areaLoading")}</p>}
        {section && sectionResult?.geom === section.geom && !sectionResult.data &&
          <p role="status">{t("field.diagnosis.failed")}{" "}
            <button onClick={() => { setSectionResult(null); setSectionRetry((n) => n + 1); }}>
              {t("field.diagnosis.retry")}
            </button>
          </p>}
        {zoneDetectionFailed && <p role="status">{t("recs.noSectors")}</p>}

        {/* two folds after picking the parcel: the rotations to plant
            (primary) and what to sow next season */}
        <details className="rec-group primary">
          <summary>
            <span className="rec-group-title">{t("recs.group.rotations")}</span>
            <span className="rec-group-hint">{t("recs.group.rotationsHint")}</span>
          </summary>
          {canRotate && (comparing || compareFailed || !rotsView) && (
            <section className="rot-auto" aria-live="polite">
              <p className="muted">{t("field.form.rotationReference")}</p>
              {comparing && <p role="status">{t("field.form.comparing")}</p>}
              {compareFailed && <p role="status">{t("field.form.failed")}{" "}
                <button type="button" onClick={() => setCompareFailed(false)}>
                  {t("field.diagnosis.retry")}</button></p>}
            </section>)}
          {rotsView && (!target?.nearby || nearbyUse === "checked") && (
            <div data-tour="rotations">
              <RotationResults rots={rotsView} diag={recommendationData}
                               t={t} reference
                               onMethods={onMethods} />
            </div>)}
          {!canRotate && !rotsView && <p className="muted">{t("recs.group.waiting")}</p>}
        </details>

        <details className="rec-group">
          <summary>
            <span className="rec-group-title">{t("recs.top")}</span>
            <span className="rec-group-hint">{t("recs.group.cropsHint")}</span>
          </summary>
          {recommendationData && (!target?.nearby || nearbyUse === "checked") &&
            !zoneDetectionFailed && (!autoPartition || sections != null)
            ? <CropRecommendations key={JSON.stringify(section?.geom ?? body)}
                diagnosis={recommendationData} crops={catalog?.crops ?? []} declared={declaredCrop}
                observation={currentImage}
                resources={cons} onResources={setCons} />
            : <p className="muted">{t("recs.group.waiting")}</p>}
        </details>
        {catalogFailed && <p role="status">{t("field.form.catalogFailed")}{" "}
          <button onClick={() => setCatalogRetry((n) => n + 1)}>{t("field.diagnosis.retry")}</button>
        </p>}
      {!rots && diag && <p className="notice">{t("rot.disclaimer")}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------- parcels result --- */

type TFn = (k: string, v?: Record<string, string | number>) => string;
const parcelName = (parcels: ParcelInput[], id: string) =>
  parcels.find((p) => p.id === id)?.name ?? id;

/** Fire and drought alerts — they sit above the tabs and stay visible
 * whatever the farmer's priorities are. */
export function ParcelAlerts({ res, parcels, t, onEmergency }: {
    res: ParcelsResponse; parcels: ParcelInput[]; t: TFn;
    onEmergency?: () => void }) {
  const highFire = parcelsWithHighFire(res);
  const dry = parcelsWithDry(res).filter((p) => !hasHighFireAlert(p));
  const name = (id: string) => parcelName(parcels, id);
  // one message per alert, naming every parcel it applies to (the same
  // risk repeated parcel by parcel read as noise)
  const group = (list: typeof highFire, keep: (a: { kind: string;
      severity: string }) => boolean) => {
    const by = new Map<string, string[]>();
    for (const p of list) {
      for (const a of p.alerts.filter(keep)) {
        const ids = by.get(a.text) ?? [];
        if (!ids.includes(p.id)) ids.push(p.id);
        by.set(a.text, ids);
      }
    }
    return [...by.entries()].map(([text, ids]) => {
      const all = ids.length > 1 && ids.length === res.parcels.length;
      const names = ids.map(name);
      const who = all ? t("parcels.alert.all")
        : names.length > 1
          ? `${names.slice(0, -1).join(", ")} ${t("ui.and")} ${names.at(-1)}`
          : names[0];
      const plural = ids.length > 1;
      return { key: ids.join("|") + text, who,
               text: plural ? text.replace(/en esta parcela/g, "en estas parcelas")
                 .replace(/in this parcel/g, "in these parcels") : text };
    });
  };
  const fires = group(highFire, (a) => a.kind === "fire" && a.severity === "high");
  const drys = group(dry, (a) => a.kind === "dry");
  return (
    <>
      {fires.map((g) => (
        <div key={g.key} className="parcel-alert fire" role="alert">
          <Icon kind="flame" size={18} />
          <div>
            <p><strong>{g.who}:</strong> {g.text}</p>
            {onEmergency
              ? <button type="button" className="chip"
                        onClick={onEmergency}>
                  {t("parcels.alert.emergency")}</button>
              : <a href="#parcels-emergency">
                  {t("parcels.alert.emergency")}</a>}
          </div>
        </div>))}
      {drys.map((g) => (
        <div key={g.key} className="parcel-alert dry" role="status">
          <Icon kind="drop" size={16} />
          <div>
            <p><strong>{g.who}:</strong> {g.text}</p>
          </div>
        </div>))}
    </>);
}

/** Economics line under a parcel row: margin per hectare and total,
 * break-even yield, risk-adjusted margin — always marked as a rough
 * estimate, with the basis one tap away. Never color alone. */
function EconLine({ p, t, fmt }: {
    p: import("../../domain/parcels").ApiParcel;
    t: TFn; fmt: Intl.NumberFormat }) {
  const e = p.economics;
  if (!e || e.margin_per_ha == null) return null;
  const cur = e.currency ?? "USD";
  return (
    <p className="econ-line">
      <strong>{t("parcels.econ.margin")}</strong>{" "}
      {fmt.format(e.margin_per_ha)} {cur}/ha
      {e.margin_total != null &&
        <> · {t("parcels.econ.total",
               { v: `${fmt.format(e.margin_total)} ${cur}` })}</>}
      {e.break_even_yield_t_ha != null &&
        <> · {t("parcels.econ.breakEven",
               { v: fmt.format(e.break_even_yield_t_ha) })}</>}
      {e.risk_adjusted_margin_per_ha != null &&
        <> · {t("parcels.econ.riskAdj",
               { v: `${fmt.format(e.risk_adjusted_margin_per_ha)} ${cur}` })}</>}
      {" "}<em className="muted">{t("parcels.econ.approx")}</em>
      {e.yield_source === "magyp_department" && (
        <> <em className="muted">
            {t("parcels.econ.magypYield")}</em></>)}
      {e.basis && <Tooltip text={e.basis}
                           label={t("parcels.econ.margin")} />}
    </p>);
}

/** The "Resumen" tab: summary headline, one row per parcel (hazards in
 * the API order, first three visible, icon + word + value + basis),
 * economics when declared, and the nearest services. */
export function ParcelsResult({ res, parcels, profile, t, fmt }: {
    res: ParcelsResponse;
    parcels: ParcelInput[];
    profile: Profile;
    t: TFn;
    fmt: Intl.NumberFormat;
    onRetry?: () => void }) {
  const { lang } = useT();
  const name = (id: string) => parcelName(parcels, id);
  return (
    <>
      <section className="parcel-summary"
               aria-labelledby="parcel-summary-h">
        <h4 id="parcel-summary-h">{res.summary.headline}</h4>
        {res.summary.bullets.length > 0 && (
          <ul>{res.summary.bullets.slice(0, 3)
            .map((b, i) => <li key={i}>{b}</li>)}</ul>)}
        {res.summary.source === "gemini" && (
          <p className="parcel-source">{t("parcels.summary.gemini")}</p>)}
        {res.summary.source !== "gemini" &&
         res.summary.source !== "template" && (
          <p className="parcel-source">{res.summary.source}</p>)}
      </section>

      <ul className="parcel-rows" data-tour="parcels">
        {res.parcels.map((p) => {
          const high = hasHighFireAlert(p);
          const shown = visibleHazards(p, profile).slice(0, 3);
          const enso = shown.includes("enso")
            ? ensoRainText(p, t, fmt) : null;
          return (
            <li key={p.id} className="parcel-res-row">
              <div className="parcel-res-top">
                <span className="parcel-swatch"
                      style={{ background: cropColor(p.crop) }} />
                <span className="parcel-name">{name(p.id)}</span>
                {!parcels.find((x) => x.id === p.id)?.wholeField && (
                  <span className="parcel-crop muted">
                    {p.crop === "otro" ? t("parcels.cropOther")
                      : p.crop === "sin_cultivo" ? t("parcels.cropNone")
                      : cropDisplayName(p.crop, lang)}</span>)}
                {p.alerts.length > 0 && (
                  <Icon kind="alert" size={14}
                        title={t("parcels.alertHas")} />)}
                <span className="parcel-ha muted">
                  {fmt.format(p.area_ha)} ha</span>
              </div>
              <div className="parcel-inds">
                {shown.map((h) => (
                  <HazardChip key={h} p={p} h={h} t={t} fmt={fmt}
                              Tooltip={Tooltip} />))}
                {high && <span className="sr-only">
                  {t("parcels.alertHas")}</span>}
              </div>
              {enso && <p className="hz-sub muted">{enso}</p>}
              <EconLine p={p} t={t} fmt={fmt} />
            </li>);
        })}
        {res.parcels.length === 0 && (
          <li className="muted">{t("parcels.empty")}</li>)}
      </ul>

      {res.parcels.map((p) => p.timeline && (
        <TimelinePeek key={`tl-${p.id}`} timeline={p.timeline}
          label={res.parcels.filter((x) => x.timeline).length > 1
                 ? name(p.id) : undefined} />))}

    </>);
}

/** "Más información" extra: the hazards the farmer hid, still shown
 * here honestly (hail = no satellite data). */
export function HiddenHazards({ res, parcels, profile, t, fmt }: {
    res: ParcelsResponse; parcels: ParcelInput[]; profile: Profile;
    t: TFn; fmt: Intl.NumberFormat }) {
  const rows = res.parcels
    .map((p) => ({ p, hidden: hiddenHazards(p, profile) }))
    .filter((x) => x.hidden.length > 0);
  if (!rows.length) return null;
  return (
    <section className="card">
      <h4 style={{ marginTop: 0 }}>{t("parcels.hz.moreHidden")}</h4>
      <ul className="parcel-rows">
        {rows.map(({ p, hidden }) => (
          <li key={p.id} className="parcel-res-row">
            <div className="parcel-res-top">
              <span className="parcel-swatch"
                    style={{ background: cropColor(p.crop) }} />
              <span className="parcel-name">
                {parcelName(parcels, p.id)}</span>
            </div>
            <div className="parcel-inds">
              {hidden.map((h) => (
                <HazardChip key={h} p={p} h={h} t={t} fmt={fmt}
                            Tooltip={Tooltip} />))}
            </div>
          </li>))}
      </ul>
    </section>);
}

/** Data sources, moved to "Más información". */
export function SourcesBlock({ res, t }: {
    res: ParcelsResponse; t: TFn }) {
  if (!res.sources.length) return null;
  return (
    <details className="sec more">
      <summary>{t("parcels.sources")}</summary>
      <ul>
        {res.sources.map((s) => <li key={s.id}>{s.text}</li>)}
      </ul>
    </details>);
}
export type { PlotBody };
/** Exported for tests only. */
export { DiagTile as DiagTileForTest };

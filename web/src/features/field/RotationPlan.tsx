import type { Strategy } from "../../api/types";
import { useT } from "../../i18n";
import { phRange } from "../../domain/cropDetail";
import { rotationPlan, rotationTech, type PlanEntry } from "../../domain/rotationPlan";

type TFn = (k: string, v?: Record<string, string | number>) => string;

/** "How this rotation works": the sequence year by year, in plain
 * words, plus the technical reasons with their data. */
export function RotationPlan({ s, soilPh, t }: { s: Strategy; soilPh?: number | null; t: TFn }) {
  const { lang } = useT();
  const crops = s.crops_info ?? [];
  const plan = rotationPlan(s.sequence, crops, soilPh);
  if (!plan.entries.length) return null;
  const info = new Map(crops.map((c) => [c.id, c]));
  const name = (id?: string) => {
    const c = id ? info.get(id) : undefined;
    // "Vicia (cobertura)" -> "Vicia": the stage text already says its role
    return c ? (c.name[lang] ?? c.name.es ?? c.id).replace(/\s*\([^)]*\)$/, "") : id ?? "";
  };
  const date = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", timeZone: "UTC" });
  const day = (md: string) => date.format(new Date(`2025-${md}T00:00:00Z`));
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const fmt = (n: number) => number.format(n);
  const years = [...new Set(plan.entries.map((e) => e.year))];
  const lines = (e: PlanEntry) => {
    const vars = { from: day(e.start), to: day(e.end), crop: name(e.crop), days: e.days };
    const out = [t(`rot.plan.${e.kind}`, vars)];
    const c = e.crop ? info.get(e.crop) : undefined;
    if (c?.n_fixation && e.kind !== "fallow") out.push(t("rot.plan.legume", { crop: name(e.crop) }));
    if ((e.ph === "low" || e.ph === "high") && soilPh != null && c)
      out.push(t(e.ph === "low" ? "rot.plan.phLow" : "rot.plan.phHigh",
        { crop: name(e.crop), ph: fmt(soilPh), range: phRange(c, fmt) }));
    return out;
  };
  const tech = rotationTech(s.indicators, crops, soilPh, fmt, lang);
  return <div className="rot-plan">
    <p>{t("rot.plan.intro", { years: plan.years })}</p>
    <ol className="rot-years">{years.map((year) => <li key={year}>
      <strong>{t("rot.plan.year", { n: year })}</strong>
      <ul>{plan.entries.filter((e) => e.year === year).map((e, i) => <li key={i}
          className={`rot-step ${e.kind}`}>
        {lines(e).map((text, j) => <span key={j} className={j ? "muted rot-note" : undefined}>{text}</span>)}
      </li>)}</ul>
    </li>)}</ol>
    {plan.restart && <p className="muted">{plan.restartFallow
      ? t("rot.plan.restartFallow", { from: day(plan.restartFallow.start), to: day(plan.restartFallow.end),
          days: plan.restartFallow.days, crop: name(plan.restart) })
      : t("rot.plan.restart", { crop: name(plan.restart) })}</p>}
    <details className="rot-glossary">
      <summary>{t("rot.plan.glossary")}</summary>
      <dl className="plain-list">{["fallow", "cover", "second", "pasture", "legume"].map((k) =>
        <div className="plain-row" key={k}><dt>{t(`rot.term.${k}`)}</dt><dd>{t(`rot.term.${k}.def`)}</dd></div>)}
      </dl>
    </details>
    {tech.length > 0 && <>
      <h5>{t("recs.techTitle")}</h5>
      <ul className="rot-tech">{tech.map((line) => <li key={line.key}>{t(line.key, line.vars)}</li>)}</ul>
    </>}
  </div>;
}

import type { Strategy } from "../../api/types";
import { useT } from "../../i18n";
import { rotationPlan, rotationTech, whyEachCrop, type PlanEntry } from "../../domain/rotationPlan";

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
    return [t(`rot.plan.${e.kind}`, vars)];
  };
  const lower = (id: string) => name(id).toLocaleLowerCase(lang);
  const why = whyEachCrop(s.sequence, crops, soilPh, fmt).map(({ crop, lines: reasons }) => ({
    crop,
    texts: reasons.map(({ key, vars }) => t(key, {
      ...vars,
      ...(vars.prev ? { prev: lower(vars.prev) } : {}),
      ...(vars.next ? { next: lower(vars.next) } : {}),
      ...(vars.fam ? { fam: t(`rot.family.${vars.fam}`) } : {}),
      ...(vars.famPrev ? { famPrev: t(`rot.family.${vars.famPrev}`) } : {}),
    })),
  }));
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
    <h5>{t("rot.why.title")}</h5>
    <dl className="rot-why">{why.map(({ crop, texts }) => <div key={crop}>
      <dt>{name(crop)}</dt>
      <dd><ul>{texts.map((text) => <li key={text}>{text}</li>)}</ul></dd>
    </div>)}</dl>
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

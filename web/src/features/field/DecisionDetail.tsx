import type { RankedDecision } from "../../api/types";
import type { Section } from "../../domain/cropDetail";
import { useT } from "../../i18n";

const FACT_LABELS: Record<string, string> = {
  rain: "card.rain", heavy_rain: "card.heavy_rain", frost: "card.frost",
  heat: "card.heat", slope: "card.slope", infiltration: "card.infiltration",
  bare_soil_days: "ind.bareSoil", pest_break: "ind.pestBreak", residue_t_ha_yr: "ind.residue",
};
const UNITS: Record<string, string> = {
  rain: "mm/año", frost: "días/año", heat: "días/año", heavy_rain: "días/año", slope: "%",
  rain_mm: "mm", water_demand_mm: "mm", water_balance_mm: "mm", soil: "g/kg",
  cover_days: "días", bare_soil_days: "días/año", residue_t_ha_yr: "t/ha/año",
  balance_mm: "mm", rain_wet_mm: "mm", rain_expected_mm: "mm", balance_expected_mm: "mm",
  oni: "°C", enso_rain_effect_pct: "%",
};

export function DecisionDetail({ decision, fallback, facts, sections }: {
  decision?: RankedDecision;
  fallback: string;
  facts?: Record<string, number | string | boolean>;
  /** detailed explanation by topic; replaces the generic fallback */
  sections?: Section[];
}) {
  const { t, lang } = useT();
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
  const entries = Object.entries(decision?.evidence ?? facts ?? {});
  return <details className="decision-detail">
    <summary>{t("decision.detail")}</summary>
    {sections?.map((section) => <section className="detail-section" key={section.id}>
      <h5>{t(`recs.detail.title.${section.id}`)}</h5>
      <ul>{section.lines.map((line) => <li key={line.key}>{t(line.key, line.vars)}</li>)}</ul>
    </section>)}
    {decision && sections?.length ? <section className="detail-section">
      <h5>{t("recs.detail.title.gemini")}</h5>
      <p>{decision.why}</p>
    </section> : (!sections?.length || decision) && <p>{decision?.why ?? fallback}</p>}
    {entries.length > 0 && <dl className="plain-list">
      {entries.map(([key, value]) => <div className="plain-row" key={key}>
        <dt>{t(FACT_LABELS[key] ?? `decision.fact.${key}`)}</dt>
        <dd>{typeof value === "boolean" ? t(value ? "field.form.yes" : "field.form.no") :
          typeof value === "number" ? [number.format(value), UNITS[key]].filter(Boolean).join(" ") : value}</dd>
      </div>)}
    </dl>}
    {decision && <small className="muted">{t("decision.gemini")}</small>}
  </details>;
}

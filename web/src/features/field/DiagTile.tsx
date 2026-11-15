/** Compact diagnosis tile extracted from FieldLens: label (+ glossary
 * "?" for the terms the card uses), value with unit, confidence badge. */
import type { Card as DiagCard } from "../../api/types";
import { cardValueText, deltaText } from "../../domain/rotations";
import { CARD_TERMS, Glossary } from "../../components/Glossary";

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
export function DiagTile({ c, t, fmt }: {
    c: DiagCard;
    t: (k: string, v?: Record<string, string | number>) => string;
    fmt: Intl.NumberFormat }) {
  // string values are backend ids (bajo, flat…): show them as words
  const vkey = typeof c.value === "string" ? `cardval.${c.value}` : null;
  const val = vkey && t(vkey) !== vkey ? t(vkey) : cardValueText(c, fmt);
  return (
    <div className="dtile">
      <div className="dtile-head">
        <span className="dtile-label">{t(`card.${c.id}`)}
          {(CARD_TERMS[c.id] ?? []).map((term) => (
            <Glossary key={term} term={term} />))}</span>
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

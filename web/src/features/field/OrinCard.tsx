/** Orin validation card (D31): "qué tan bien ve el satélite tu lote".
 * One row per compared variable; invented files get a persistent
 * banner and muted numbers. Missing file -> renders nothing. */
import type { OrinValidation, OrinVariable } from "../../api/types";
import { Card } from "../../components/ui";
import {
  biasKey, hasOrinData, isSynthetic, qualityRatio, takeaway,
  varLabelKey,
} from "../../domain/orin";

type T = (k: string, v?: Record<string, string | number>) => string;

/** Persistent warning shown whenever invented data reaches the screen. */
export function SyntheticBanner({ t }: { t: T }) {
  return (
    <p className="orin-banner" role="status">
      <span className="orin-banner-icon" aria-hidden="true">⚠</span>
      {t("orin.banner")}
    </p>
  );
}

function VarRow({ v, t, fmt }: { v: OrinVariable; t: T;
    fmt: Intl.NumberFormat }) {
  const bias = biasKey(v.bias, v.unit, fmt.format(Math.abs(v.bias)));
  return (
    <div className="orin-row">
      <div className="orin-row-head">
        <strong>{t(varLabelKey(v.id))}</strong>
        <span className={`badge q-${v.quality}`}>
          <i className="cdot" aria-hidden="true" />
          {t(`orin.q.${v.quality}`)}
        </span>
        <span className="qbar" aria-hidden="true">
          <i style={{ width: `${qualityRatio(v.quality) * 100}%` }} />
        </span>
      </div>
      <p>
        {v.satellite.dataset} · {v.satellite.resolution} —{" "}
        {t("orin.sites", { n: v.field.n_sites, m: v.n })}
      </p>
      <p>{t("orin.rmse", { v: fmt.format(v.rmse), u: v.unit })}
        {bias && <>; {t(bias.key, bias.vars)}</>}</p>
      <details className="orin-details">
        <summary>{t("orin.details")}</summary>
        <ul className="muted">
          <li>RMSE: {fmt.format(v.rmse)} {v.unit}</li>
          <li>bias: {fmt.format(v.bias)} {v.unit}</li>
          <li>r: {fmt.format(v.r)} · n: {v.n}</li>
          <li>{v.satellite.period} · {v.satellite.dataset}</li>
          <li>{v.field.source} · {t("orin.sitesShort",
                                      { n: v.field.n_sites })}</li>
        </ul>
      </details>
    </div>
  );
}

export function OrinCard({ data, t, fmt }: {
    data: OrinValidation | null; t: T; fmt: Intl.NumberFormat }) {
  if (!hasOrinData(data)) return null;
  const synth = isSynthetic(data);
  const label = (id: string) => t(varLabelKey(id));
  return (
    <Card title={t("orin.title")}>
      {synth && <SyntheticBanner t={t} />}
      <div className={synth ? "orin-synth" : undefined}>
        {data!.variables.map((v) => (
          <VarRow key={v.id} v={v} t={t} fmt={fmt} />))}
        <p className="orin-take">
          {takeaway(data!.variables, label)
            .map((p) => t(p.key, p.vars)).join("; ")}.
        </p>
      </div>
      {data!.source && <p className="muted">{data!.source}</p>}
    </Card>
  );
}

import { useEffect, useState } from "react";
import { apiCropRecommendations } from "../../api";
import type { CropEntry, CropRecommendations as Result, CurrentCrop, DiagnoseResponse } from "../../api/types";
import { prioWeights } from "../../domain/rotations";
import { useT } from "../../i18n";
import { detailSections, phRange } from "../../domain/cropDetail";
import { outlookLine } from "../../domain/cropReasons";
import { DecisionDetail } from "./DecisionDetail";

// Market and machinery do not change the result, so they are not asked.
const RESOURCES = ["irrigation", "livestock"] as const;
const OBSERVED_CROPS: Partial<Record<string, string>> = {
  winter_cereal: "winter_cereal", summer_early: "maiz", fallow: "fallow", perennial: "perennial",
};
const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export function knownCrop(name: string, catalog: CropEntry[]): string {
  const key = normalize(name);
  if (/^(sin[ _]cultivo|barbecho|fallow)$/.test(key)) return "fallow";
  if (/\b(vid|vinedo|pastura|perenne|olivar|frutal|alfalfa)\b/.test(key)) return "perennial";
  return catalog.find((c) => [c.id, c.name.es, c.name.en].some((v) =>
    v && normalize(v) === key))?.id ?? "unknown";
}

function optionConditions(option: Result["options"][number]) {
  if (Array.isArray(option.conditions)) return option.conditions;
  // Older API responses expose the same warnings as individual flags.
  const conditions: NonNullable<Result["options"][number]["conditions"]> = [];
  if (option.needs_irrigation && option.rain_mm != null) conditions.push("water");
  if (option.fits_frost === false) conditions.push("frost");
  return conditions;
}

export function CropRecommendations({ diagnosis, crops, declared, observation, resources,
  onResources }: {
  diagnosis: DiagnoseResponse; crops: CropEntry[]; declared?: string;
  observation?: CurrentCrop | null;
  resources: Record<string, boolean>;
  onResources: (next: Record<string, boolean>) => void;
}) {
  const { t, lang } = useT();
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<Result | null>();
  const observedClass = observation?.status === "available"
    ? observation.zones.find((zone) => zone.share >= .8)?.class.id : undefined;
  const detectedCrop = observedClass ? OBSERVED_CROPS[observedClass] : undefined;
  const detecting = !declared && observation === undefined;
  const current = declared ? knownCrop(declared, crops) : detectedCrop ?? "unknown";
  useEffect(() => {
    if (detecting) return;
    const controller = new AbortController();
    setResult(undefined);
    apiCropRecommendations({
      diagnosis, current, priorities: prioWeights([]), rank_with_gemini: true, lang,
      constraints: {
        irrigation: resources.irrigation, livestock: resources.livestock,
      },
    }, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult(data);
    });
    return () => controller.abort();
  }, [diagnosis, current, detecting, resources, retry, lang]);

  const afterCrop = current !== "unknown" && current !== "fallow" && current !== "perennial";
  const name = crops.find((row) => row.id === current)?.name;
  const cropName = current === "winter_cereal" ? t("recs.winterCereal")
    : name?.[lang] ?? name?.es ?? declared ?? (current === "maiz" ? t("recs.maize") : current);
  const formatDate = (day: string) => new Intl.DateTimeFormat(lang, {
    dateStyle: "medium", timeZone: "UTC",
  }).format(new Date(day + "T00:00:00Z"));
  const formatNumber = new Intl.NumberFormat(lang);
  const ranked = result?.status !== "ok" ? [] : result.ranking_source === "gemini" ? result.options
    : [...result.options].sort((a, b) => Number(a.conditional) - Number(b.conditional) || b.score - a.score);
  const renderOption = (row: Result["options"][number]) => <li className="card" key={row.id}>
    <div className="rec-heading">
      <h4>{row.name[lang] ?? row.name.es ?? row.id}</h4>
      <strong className={row.conditional ? "rec-conditional" : "rec-affinity"}>
        {t(row.conditional ? "recs.conditional" : row.score >= .8 ? "recs.high" : "recs.medium")}
      </strong>
    </div>
    <p>{t("recs.window", { start: formatDate(row.sow_from), end: formatDate(row.sow_until) })}</p>
    {row.rain_mm == null && <p>{t("recs.rainMissing")}</p>}
    {optionConditions(row).map((condition) => <p className="rec-conditional" key={condition}>
      {t("recs.condition." + condition, {
        gap: formatNumber.format(row.water_demand_mm - (row.rain_mm ?? 0)),
        ph: result?.status === "ok" && result.land?.ph != null ? formatNumber.format(result.land.ph) : "",
        range: phRange(row, formatNumber.format),
      })}
    </p>)}
    {(() => {
      const sections = detailSections(row, result?.status === "ok" ? result.land : null,
        result?.status === "ok" ? result.outlook : null, formatNumber.format);
      const [decision, ...rest] = sections;
      return <>
        <div className="rec-tech">
          <h5>{t("recs.techTitle")}</h5>
          <ul>{decision.lines.map((line) => <li key={line.key} className={line.tone ? `rec-${line.tone}` : undefined}>
            {t(line.key, line.vars)}</li>)}</ul>
        </div>
        <DecisionDetail decision={row.decision} fallback={t("decision.cropFallback")} sections={rest} facts={{
      ...(row.rain_mm != null ? { rain_mm: row.rain_mm } : {}), water_demand_mm: row.water_demand_mm,
      ...(row.balance_mm != null ? { balance_mm: row.balance_mm } : {}),
      ...(row.rain_expected_mm != null ? { rain_expected_mm: row.rain_expected_mm } : {}),
      ...(row.balance_expected_mm != null ? { balance_expected_mm: row.balance_expected_mm } : {}),
      ...(row.cover_days != null ? { cover_days: row.cover_days } : {}),
    }} />
      </>;
    })()}
  </li>;
  return <section className="crop-recs">
    <h2>{t(afterCrop ? "recs.next" : "recs.title", { crop: cropName })}</h2>
    {detecting ? <p role="status">{t("recs.detecting")}</p>
      : declared ? <p className="muted">{t("recs.savedCrop", {
          crop: current === "fallow" ? t("recs.fallow") : cropName,
        })}</p>
      : detectedCrop ? <p className="muted">{t("recs.detected", {
          crop: t("recs.observed." + observedClass),
        })}{observation?.as_of && ` · ${formatDate(observation.as_of)}`}</p>
      : <p className="muted">{t("recs.unknown")}</p>}
    {!detecting && result?.available_from && <p className="muted">{t("recs.after", {
      date: formatDate(result.available_from),
    })}</p>}
    {detecting ? null : result === undefined ? <p role="status">{t("recs.loading")}</p>
      : result === null ? <p role="status">{t("recs.error")}{" "}
          <button onClick={() => setRetry((n) => n + 1)}>{t("field.diagnosis.retry")}</button>
        </p>
      : result.status !== "ok" ? <p role="status">{t("recs." + result.status)}</p>
      : result.options.length === 0 ? <p role="status">{t("recs.empty")}</p>
      : <>
        <h3>{t("recs.top")}</h3>
        {result.ranking_source && <small className="muted">{t(`decision.order.${result.ranking_source}`)}</small>}
        {result.soil_data != null && <p className="muted">{t(result.soil_data ? "recs.soilUsed" : "recs.soilMissing")}</p>}
        <p className="notice rec-outlook">{(({ key, vars }) => t(key, vars))(outlookLine(result.outlook, formatNumber.format))}</p>
        <p className="muted">{t("recs.sharedData")}</p>
        {ranked.length < 3 && <p className="muted">{t(ranked.length === 1 ? "recs.oneOption" : "recs.fewOptions")}</p>}
        {ranked.every((row) => row.conditional) && <p className="notice">{t("recs.allConditional")}</p>}
        <ol className="rec-list">{ranked.slice(0, 3).map(renderOption)}</ol>
        {ranked.length > 3 && <details className="card rec-filters">
          <summary>{t("recs.more", { count: ranked.length - 3 })}</summary>
          <ol className="rec-list" start={4}>{ranked.slice(3).map(renderOption)}</ol>
        </details>}
      </>}
    {result?.regional_crops && result.regional_crops.length > 0 && <details className="card rec-filters" open>
      <summary>{t("recs.regionalCrops")}</summary>
      <p className="muted">{t("recs.regionalCropsNote")}</p>
      <ul>{result.regional_crops.map((row) => <li key={row.id}>{row.name[lang] ?? row.name.es ?? row.id}</li>)}</ul>
    </details>}
    <details className="card rec-filters">
      <summary>{t("recs.filters")}</summary>
      <fieldset className="cons-set">
        <legend>{t("field.form.constraints")}</legend>
        <div className="cons-grid">{RESOURCES.map((key) =>
          <label key={key}>{t("field.form." + key)}
            <select aria-label={t("field.form." + key)}
                    value={String(resources[key] ?? "")} onChange={(e) => {
              const next = { ...resources };
              if (e.target.value === "") delete next[key];
              else next[key] = e.target.value === "true";
              onResources(next);
            }}>
              <option value="">{t("field.form.dontKnow")}</option>
              <option value="true">{t("field.form.yes")}</option>
              <option value="false">{t("field.form.no")}</option>
            </select>
          </label>)}</div>
      </fieldset>
    </details>
  </section>;
}

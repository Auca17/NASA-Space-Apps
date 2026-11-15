/** "Qué tan bien ve el satélite tu lote": per-variable typical error
 * from our own validations, plus the elevation correction applied.
 * `accuracy` comes from the diagnose response (task 44 contract); when
 * absent the card still renders with the generic limits text. */
import { useT } from "../../i18n";
import { Glossary } from "../../components/Glossary";
import type { DiagAccuracy } from "../../api/types";

export type { DiagAccuracy };

export function SatelliteAccuracy({ accuracy, tempAdjustC, elevationM,
                                    cellElevationM }: {
    accuracy?: DiagAccuracy | null;
    tempAdjustC?: number | null;
    elevationM?: number | null;
    cellElevationM?: number | null }) {
  const { t, lang } = useT();
  const fmt = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const a = accuracy ?? null;
  const tempAdj = tempAdjustC ?? a?.elevation_correction_c ?? null;
  const elevDiff = elevationM != null && cellElevationM != null
    ? Math.round(elevationM - cellElevationM) : null;
  const srcName = (s: string) => {
    const k = `field.accuracy.src.${s}`;
    return t(k) !== k ? t(k) : s;
  };

  return (
    <div className="card acc-card">
      <h4>{t("field.accuracy.title")} <Glossary term="satGround" /></h4>
      {a?.temp_rmse_c != null && (
        <p>{t("field.accuracy.temp", { v: fmt.format(a.temp_rmse_c) })}
          {a.temp_rmse_adjusted_c != null &&
            " " + t("field.accuracy.tempAdj",
              { v: fmt.format(a.temp_rmse_adjusted_c) })}
        </p>)}
      {a?.rain_rmse_mm_month != null && (
        <p>{t("field.accuracy.rain",
          { v: fmt.format(a.rain_rmse_mm_month) })}
          {a.rain_bias_mm_month != null &&
            " " + t("field.accuracy.rainBias", {
              v: fmt.format(Math.abs(a.rain_bias_mm_month)),
              dir: a.rain_bias_mm_month >= 0 ? "+" : "-" })}
          {a.rain_r != null &&
            " " + t("field.accuracy.rainR",
              { v: fmt.format(a.rain_r) })}
        </p>)}
      {tempAdj != null && tempAdj !== 0 && (
        <p>{t("field.accuracy.elev",
          { v: `${tempAdj > 0 ? "+" : ""}${fmt.format(tempAdj)}`,
            d: elevDiff != null ? fmt.format(elevDiff) : "?" })}</p>)}
      {a?.stations && (a.stations.temperature != null ||
                       a.stations.rain != null) && (
        <p className="muted">{t("field.accuracy.stations",
          { t: a.stations.temperature ?? 0,
            r: a.stations.rain ?? 0 })}</p>)}
      {a?.note && <p className="muted">{a.note}</p>}
      {!a && <p>{t("field.accuracy.generic")}</p>}
      {a?.sources?.length ? (
        <p className="muted">{t("field.accuracy.sources",
          { list: a.sources.map(srcName).join(", ") })}</p>) : null}
    </div>);
}

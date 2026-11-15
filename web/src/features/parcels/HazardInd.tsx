/** One hazard indicator: icon + word + value, with the basis one tap
 * away. Honest wordings: hail always says "sin dato satelital", ENSO
 * shows the current phase and the historical rain tendency (never a
 * forecast), anything without data says "sin dato". */
import type { ApiParcel } from "../../domain/parcels";
import type { HazardId } from "../../domain/parcelsProfile";
import { Icon } from "./CropIcon";

export const HAZARD_ICON: Record<HazardId, string> = {
  fire: "flame", drought: "drop", frost: "frost", enso: "enso",
  heat: "sun", snow: "snow", hail: "hail", flood: "wave",
};

type V = Record<string, string | number>;
type T = (k: string, v?: V) => string;

/** Short value text for a hazard (rows, badges); null = no data. */
export function hazardText(p: ApiParcel, h: HazardId, t: T,
                           fmt: Intl.NumberFormat): string {
  const i = p.indicators;
  switch (h) {
    case "fire":
      return i.fire.pct != null ? `${fmt.format(i.fire.pct)} %`
        : t("parcels.hz.noData");
    case "drought":
      return i.water.pct != null ? `${fmt.format(i.water.pct)} %`
        : t("parcels.hz.noData");
    case "heat":
      return i.heat.days_over_35 != null
        ? t("parcels.hz.heatDays", { v: fmt.format(i.heat.days_over_35) })
        : t("parcels.hz.noData");
    case "frost":
      return i.frost.frost_free_days != null
        ? t("parcels.hz.frostFree",
            { v: fmt.format(i.frost.frost_free_days) })
        : t("parcels.hz.noData");
    case "snow":
      if (!i.snow) return t("parcels.hz.noData");
      return i.snow.days_per_year != null
        ? t("parcels.hz.snowDays", { v: fmt.format(i.snow.days_per_year) })
        : t("parcels.hz.noData");
    case "hail":
      return t("parcels.hz.hailNone");
    case "enso":
      if (!i.enso?.phase_now) return t("parcels.hz.noData");
      return t(`parcels.hz.enso.${i.enso.phase_now}`);
    case "flood":
      if (!i.flood || i.flood.available === false) {
        return t("parcels.hz.noData");
      }
      return i.flood.heavy_rain_days_yr != null
        ? t("parcels.hz.floodDays",
            { v: fmt.format(i.flood.heavy_rain_days_yr) })
        : t("parcels.hz.noData");
  }
}

export function hazardBasis(p: ApiParcel, h: HazardId): string | null {
  const i = p.indicators;
  const b = h === "fire" ? i.fire.basis
    : h === "drought" ? i.water.basis
    : h === "heat" ? i.heat.basis
    : h === "frost" ? i.frost.basis
    : h === "snow" ? i.snow?.basis
    : h === "hail" ? i.hail?.basis
    : h === "enso" ? i.enso?.basis
    : i.flood?.basis;
  return b ?? null;
}

/** ENSO tendency line: "en años Niño llueve X % más/menos en tu zona
 * (tendencia histórica, no pronóstico)" — only when the cell history
 * supports it. */
export function ensoRainText(p: ApiParcel, t: T,
                             fmt: Intl.NumberFormat): string | null {
  const e = p.indicators.enso;
  const n = e?.rain_effect_pct?.el_nino;
  if (!e || n == null) return null;
  const rain = n >= 0
    ? t("parcels.enso.more", { v: fmt.format(n) })
    : t("parcels.enso.less", { v: fmt.format(Math.abs(n)) });
  return `${rain} (${t("parcels.enso.trend")})`;
}

/** Row chip: icon + word + value + basis tooltip. */
export function HazardChip({ p, h, t, fmt, Tooltip }: {
    p: ApiParcel; h: HazardId; t: T; fmt: Intl.NumberFormat;
    Tooltip: (props: { text: string; label?: string }) =>
        React.ReactElement }) {
  const basis = hazardBasis(p, h);
  return (
    <span className="parcel-ind">
      <Icon kind={HAZARD_ICON[h]} size={13} title={t(`parcels.hz.${h}`)} />
      <span className="parcel-ind-word">{t(`parcels.hz.${h}`)}</span>
      {" "}{hazardText(p, h, t, fmt)}
      {basis && <Tooltip text={basis} label={t(`parcels.hz.${h}`)} />}
    </span>);
}

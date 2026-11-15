/** Technical, data-backed reasons for a crop recommendation. Every
 * number comes from the recommendations API; nothing is estimated here. */
import type { CropOutlook, CropRecommendations } from "../api/types";

export type Reason = { key: string; vars: Record<string, string> };
type Option = Pick<CropRecommendations["options"][number],
  "rain_mm" | "water_demand_mm" | "balance_mm" | "rain_wet_mm" | "rain_expected_mm" |
  "balance_expected_mm" | "cover_days" | "fits_frost" | "different_family" | "same_family" |
  "rain_period">;

const signed = (n: number, fmt: (n: number) => string) => (n > 0 ? "+" : "") + fmt(n);

export function technicalReasons(row: Option, outlook: CropOutlook | null | undefined,
                                 fmt: (n: number) => string): Reason[] {
  const out: Reason[] = [];
  if (row.rain_mm != null) {
    const balance = row.balance_mm ?? row.rain_mm - row.water_demand_mm;
    out.push({ key: row.rain_period === "year" ? "recs.tech.balanceYear" : "recs.tech.balance", vars: {
      rain: fmt(row.rain_mm), need: fmt(row.water_demand_mm), balance: signed(balance, fmt),
      pct: fmt(Math.round(100 * row.rain_mm / Math.max(row.water_demand_mm, 1))),
    } });
    if (outlook?.phase && outlook.phase !== "neutral" && row.rain_wet_mm === 0) {
      out.push({ key: "recs.tech.season.outside", vars: { season: outlook.season ?? "" } });
    } else if (outlook?.phase && row.rain_expected_mm != null && row.balance_expected_mm != null) {
      out.push({ key: `recs.tech.season.${outlook.phase}`, vars: {
        oni: fmt(outlook.oni), period: outlook.oni_period, season: outlook.season ?? "",
        effect: signed(outlook.rain_effect_pct ?? 0, fmt), wet: fmt(row.rain_wet_mm ?? 0),
        expected: fmt(row.rain_expected_mm), balance: signed(row.balance_expected_mm, fmt),
      } });
    }
  }
  if (row.fits_frost != null) out.push({ key: row.fits_frost ? "recs.tech.frostOk" : "recs.tech.frostRisk", vars: {} });
  if (row.cover_days != null) out.push({ key: "recs.tech.cover", vars: { days: fmt(row.cover_days) } });
  if (row.different_family) out.push({ key: "recs.tech.different", vars: {} });
  else if (row.same_family) out.push({ key: "recs.tech.same", vars: {} });
  return out;
}

export function outlookLine(outlook: CropOutlook | null | undefined, fmt: (n: number) => string): Reason {
  if (!outlook?.phase) return { key: "recs.outlook.none", vars: {} };
  const vars = { oni: fmt(outlook.oni), period: outlook.oni_period, season: outlook.season ?? "" };
  if (!outlook.effects) return { key: "recs.outlook.noHistory", vars: { ...vars, phase: outlook.phase } };
  return { key: `recs.outlook.${outlook.phase}`, vars: {
    ...vars, nino: signed(outlook.effects.el_nino, fmt), nina: signed(outlook.effects.la_nina, fmt),
  } };
}

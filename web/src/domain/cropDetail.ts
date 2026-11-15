/** Detailed "why" of a crop recommendation, section by section: the
 * decision, the field's soil today and how this crop treats it, water,
 * the expected climate and the risks. Only data the API returned is
 * used; a line whose data is missing is left out. */
import type { CropLand, CropOutlook, CropRecommendations } from "../api/types";
import { technicalReasons, type Reason } from "./cropReasons";

export type Line = Reason & { tone?: "plus" | "minus" };
export type Section = { id: "decision" | "land" | "water" | "climate" | "risks"; lines: Line[] };
type Option = Partial<CropRecommendations["options"][number]> &
  Pick<CropRecommendations["options"][number], "water_demand_mm" | "rain_mm">;

const signed = (n: number, fmt: (n: number) => string) => (n > 0 ? "+" : "") + fmt(n);

function decisionLines(row: Option, balance: number | undefined, fmt: (n: number) => string): Line[] {
  const plus: Line[] = [];
  const minus: Line[] = [];
  if (balance != null) {
    if (balance >= 0) plus.push({ key: "recs.detail.plus.water", vars: { balance: signed(balance, fmt) }, tone: "plus" });
    else minus.push({ key: "recs.detail.minus.water", vars: { gap: fmt(-balance) }, tone: "minus" });
  }
  if (row.fits_frost === true) plus.push({ key: "recs.detail.plus.frost", vars: {}, tone: "plus" });
  if (row.fits_frost === false) minus.push({ key: "recs.detail.minus.frost", vars: {}, tone: "minus" });
  if (row.erosion_level === "baja") plus.push({ key: "recs.detail.plus.erosion", vars: {}, tone: "plus" });
  if (row.erosion_level === "alta") minus.push({ key: "recs.detail.minus.erosion", vars: {}, tone: "minus" });
  if (row.different_family) plus.push({ key: "recs.detail.plus.family", vars: {}, tone: "plus" });
  if (row.same_family) minus.push({ key: "recs.detail.minus.family", vars: {}, tone: "minus" });
  return [{ key: row.conditional ? "recs.detail.verdict.conditional" : "recs.detail.verdict.ok", vars: {} },
    ...plus, ...minus];
}

function landLines(row: Option, l: CropLand, fmt: (n: number) => string): Line[] {
  const out: Line[] = [];
  if (l.carbon_g_kg != null && l.infiltration != null) out.push({ key: "recs.detail.soil", vars: {
    texture: l.texture ?? "", carbon: fmt(l.carbon_g_kg), infil: fmt(l.infiltration) } });
  if (l.infiltration_class && row.bare_days != null) out.push({
    key: `recs.detail.infil.${l.infiltration_class}`, vars: { bare: fmt(row.bare_days) } });
  if (row.erosion_level && l.slope_pct != null && l.heavy_rain_days != null && row.bare_days != null) {
    out.push({ key: `recs.detail.erosion.${row.erosion_level}`, vars: {
      slope: fmt(l.slope_pct), heavy: fmt(l.heavy_rain_days), bare: fmt(row.bare_days) } });
  }
  if (row.residue_t_ha != null) out.push({
    key: row.residue_t_ha >= 4 ? "recs.detail.residue.high" : "recs.detail.residue.low",
    vars: { t: fmt(row.residue_t_ha) } });
  if (row.n_fixation) out.push({ key: "recs.detail.nitrogen", vars: {} });
  if (row.cover_days != null) out.push(l.bare_soil_days != null
    ? { key: "recs.detail.coverToday", vars: { cover: fmt(row.cover_days), today: fmt(l.bare_soil_days) } }
    : { key: "recs.detail.cover", vars: { cover: fmt(row.cover_days) } });
  return out;
}

function waterLines(row: Option, l: CropLand, balanceLine: Reason | undefined,
                    fmt: (n: number) => string): Line[] {
  const out: Line[] = [];
  if (l.rain_30d_pct != null && l.rain_30d_mm != null && l.rain_30d_normal_mm != null &&
      l.root_moisture_pct != null) {
    const level = l.rain_30d_pct < 70 ? "dry" : l.rain_30d_pct > 130 ? "wet" : "normal";
    out.push({ key: `recs.detail.start.${level}`, vars: {
      moisture: fmt(l.root_moisture_pct), rain: fmt(l.rain_30d_mm), normal: fmt(l.rain_30d_normal_mm),
      pct: fmt(l.rain_30d_pct) } });
  }
  if (balanceLine) out.push(balanceLine);
  if (row.root_depth_cm != null) out.push({
    key: row.root_depth_cm >= 100 ? "recs.detail.roots.deep" : "recs.detail.roots.shallow",
    vars: { cm: fmt(row.root_depth_cm) } });
  if (row.drought_tolerance) out.push({ key: `recs.detail.drought.${row.drought_tolerance}`, vars: {} });
  return out;
}

function climateLines(row: Option, l: CropLand, outlook: CropOutlook | null | undefined,
                      season: Reason | undefined, fmt: (n: number) => string): Line[] {
  if (!season) return [];
  const out: Line[] = [season];
  if (season.key === "recs.tech.season.outside") return out;
  const effect = outlook?.rain_effect_pct ?? 0;
  if (effect < 0 && row.balance_expected_mm != null) {
    out.push(row.balance_expected_mm < 0
      ? { key: "recs.detail.climate.deficit", vars: { gap: fmt(-row.balance_expected_mm) } }
      : { key: "recs.detail.climate.drierOk", vars: { balance: signed(row.balance_expected_mm, fmt) } });
  } else if (effect > 0) {
    out.push({ key: l.infiltration_class === "baja" ? "recs.detail.climate.wetterRunoff"
      : "recs.detail.climate.wetterRecharge", vars: {} });
  }
  return out;
}

export function detailSections(row: Option, land: CropLand | null | undefined,
                               outlook: CropOutlook | null | undefined,
                               fmt: (n: number) => string): Section[] {
  const l = land ?? {};
  const tech = technicalReasons(row as Parameters<typeof technicalReasons>[0], outlook, fmt);
  const balance = row.balance_expected_mm ?? row.balance_mm ??
    (row.rain_mm != null ? row.rain_mm - row.water_demand_mm : undefined);
  const risks: Line[] = tech.filter((r) => r.key.startsWith("recs.tech.frost"));
  if (l.heat_days != null && row.heat_tolerance) risks.push({
    key: `recs.detail.heat.${row.heat_tolerance}`, vars: { days: fmt(l.heat_days) } });
  const sections: Section[] = [
    { id: "decision", lines: decisionLines(row, balance, fmt) },
    { id: "land", lines: landLines(row, l, fmt) },
    { id: "water", lines: waterLines(row, l, tech.find((r) => r.key.startsWith("recs.tech.balance")), fmt) },
    { id: "climate", lines: climateLines(row, l, outlook, tech.find((r) => r.key.startsWith("recs.tech.season.")), fmt) },
    { id: "risks", lines: risks },
  ];
  return sections.filter((s) => s.lines.length > 0);
}

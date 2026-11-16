/** How a rotation works in the field, step by step and year by year:
 * what is sown and when, what is done between crops (fallow), and the
 * technical reasons behind the sequence, all from API data. */
import type { CropInfo, Strategy } from "../api/types";
import type { Reason } from "./cropReasons";

type Step = Strategy["sequence"][number];
export type PlanEntry = {
  kind: "grain" | "second" | "cover" | "pasture" | "fallow";
  year: number;
  crop?: string;
  start: string;
  end: string;
  days: number;
  ph?: "ok" | "low" | "high";
};
export type Plan = {
  entries: PlanEntry[];
  years: number;
  restart?: string;
  /** fallow between the last step and the next round, when it is real */
  restartFallow?: { start: string; end: string; days: number };
};

/** gaps up to this many days are the normal turnaround, not a fallow */
const TURNAROUND_DAYS = 7;
const DAY = 86_400_000;
const BASE = Date.UTC(2025, 0, 1);

const doy = (md: string) => {
  const [m, d] = md.split("-").map(Number);
  return Math.min(364, Math.round((Date.UTC(2025, m - 1, d) - BASE) / DAY));
};
const md = (abs: number) => {
  const day = new Date(BASE + (((abs % 365) + 365) % 365) * DAY);
  return `${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;
};
const yearOf = (abs: number) => Math.floor(abs / 365) + 1;

export function phFit(ph: number | null | undefined, info?: CropInfo): PlanEntry["ph"] {
  if (ph == null || info?.ph_min == null) return undefined;
  if (ph < info.ph_min) return "low";
  if (info.ph_max != null && ph > info.ph_max) return "high";
  return "ok";
}

export function rotationPlan(sequence: Step[], crops: CropInfo[] = [], soilPh?: number | null): Plan {
  const info = new Map(crops.map((c) => [c.id, c]));
  const entries: PlanEntry[] = [];
  let prevEnd: number | null = null;
  let prevKind: PlanEntry["kind"] | null = null;
  let first = 0;
  for (const step of sequence) {
    const s = doy(step.start);
    let start = s;
    if (prevEnd != null) {
      start = s + 365 * Math.floor((prevEnd + 1) / 365);
      while (start <= prevEnd) start += 365;
      // overlapping windows in the catalog: sow right after the harvest
      if (start - prevEnd > 300) start = prevEnd + 1;
    } else first = start;
    const length = ((doy(step.end) - s) % 365 + 365) % 365 || 364;
    const end = start + length;
    const gap = prevEnd == null ? 0 : start - prevEnd - 1;
    if (gap > TURNAROUND_DAYS) {
      entries.push({ kind: "fallow", year: yearOf(prevEnd! + 1), start: md(prevEnd! + 1),
                     end: md(start - 1), days: gap });
    }
    const role = info.get(step.crop)?.role ?? "grain";
    const kind: PlanEntry["kind"] = role === "grain" && prevKind === "grain" && prevEnd != null &&
      gap <= TURNAROUND_DAYS ? "second" : role;
    entries.push({ kind, year: yearOf(start), crop: step.crop, start: step.start, end: step.end,
                   days: length + 1, ph: phFit(soilPh, info.get(step.crop)) });
    prevEnd = end;
    prevKind = role;
  }
  if (prevEnd == null) return { entries, years: 0 };
  const plan: Plan = {
    entries, years: Math.max(1, Math.round((prevEnd - first) / 365)), restart: sequence[0].crop,
  };
  const closing = ((doy(sequence[0].start) - (prevEnd % 365) - 1) % 365 + 365) % 365;
  if (closing > TURNAROUND_DAYS && closing < 250) {
    plan.restartFallow = { start: md(prevEnd + 1), end: md(prevEnd + closing), days: closing };
  }
  return plan;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Technical lines of a rotation, each with the data behind it. */
export function rotationTech(ind: Record<string, unknown>, crops: CropInfo[] = [],
                             soilPh: number | null | undefined, fmt: (n: number) => string,
                             lang = "es"): Reason[] {
  const out: Reason[] = [];
  const name = (c: CropInfo) => c.name[lang] ?? c.name.es ?? c.id;
  const water = num(ind.water_balance_mm);
  if (water != null) out.push(water >= 0
    ? { key: "rot.tech.waterOk", vars: { mm: fmt(water) } }
    : { key: "rot.tech.waterShort", vars: { mm: fmt(-water) } });
  const bare = num(ind.bare_soil_days);
  if (bare != null) out.push({ key: "rot.tech.bare", vars: {
    days: fmt(bare), erosion: String(ind.erosion_risk ?? "—"), infiltration: String(ind.infiltration ?? "—") } });
  const residue = num(ind.residue_t_ha_yr);
  if (residue != null) out.push({ key: "rot.tech.residue", vars: { t: fmt(residue) } });
  const families = num(ind.families);
  if (families != null) out.push({ key: "rot.tech.families", vars: {
    n: fmt(families), breaks: fmt(num(ind.pest_break) ?? 0) } });
  const nitrogen = crops.filter((c) => c.n_fixation);
  if (nitrogen.length) out.push({ key: "rot.tech.nitrogen", vars: {
    crops: nitrogen.map(name).join(", ") } });
  if (soilPh != null) {
    const ranged = crops.filter((c) => c.ph_min != null);
    const outside = ranged.filter((c) => phFit(soilPh, c) !== "ok");
    if (outside.length) out.push({ key: "rot.tech.phOut", vars: {
      ph: fmt(soilPh),
      crops: outside.map((c) => `${name(c)} (${fmt(c.ph_min!)}–${c.ph_max != null ? fmt(c.ph_max) : "…"})`)
        .join(", "),
    } });
    else if (ranged.length) out.push({ key: "rot.tech.phOk", vars: { ph: fmt(soilPh) } });
  }
  return out;
}

export type FallowTip = {
  start: string; end: string; days: number;
  after?: string; before?: string;
  /** i18n suffixes under rot.fallow.tip.* */
  tips: string[];
};

/** What to do in each period without a crop: weeds, residue, a cover
 * crop when the gap is a long autumn-winter one, soil test and liming
 * when the soil pH misses a crop's range, and sowing preparation. */
export function fallowAdvice(plan: Plan, crops: CropInfo[] = [], soilPh?: number | null): FallowTip[] {
  const acid = soilPh != null && crops.some((c) => c.ph_min != null && soilPh < c.ph_min);
  const gaps: Omit<FallowTip, "tips">[] = [];
  plan.entries.forEach((e, i) => {
    if (e.kind !== "fallow") return;
    gaps.push({ start: e.start, end: e.end, days: e.days,
                after: plan.entries[i - 1]?.crop, before: plan.entries[i + 1]?.crop });
  });
  if (plan.restartFallow) {
    const last = [...plan.entries].reverse().find((e) => e.crop);
    gaps.push({ ...plan.restartFallow, after: last?.crop, before: plan.restart });
  }
  return gaps.map((gap) => {
    const month = Number(gap.start.slice(0, 2));
    const winter = month >= 3 && month <= 8;
    const tips = ["weeds"];
    if (gap.days >= 20) tips.push("residue");
    if (gap.days >= 60 && winter) tips.push(gap.before === "maiz" ? "coverForMaize" : "cover");
    if (gap.days >= 45) tips.push("soilTest");
    if (acid && gap.days >= 45) tips.push("lime");
    tips.push("sowPrep");
    return { ...gap, tips };
  });
}

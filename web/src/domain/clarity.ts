/** Plain-language helpers for the "Analizar mi campo" journey. */
import type { DiagnoseResponse } from "../api/types";

type Fact = { key: string; vars: Record<string, string | number> };
export type SummaryGroup = { group: "climate" | "soil" | "fire";
                             facts: Fact[] };

const FIRE_CATS = ["bajo", "moderado", "alto", "muy_alto"];

/** Short diagnosis summary grouped as climate / soil / fire. Only facts
 * whose card carries data are returned, so the screen never shows a
 * value the backend did not compute. */
export function plainSummary(d: DiagnoseResponse,
                             locale = "es"): SummaryGroup[] {
  d = localizeDiag(d, locale);
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const get = (id: string) => d.cards.find((c) => c.id === id);
  const numFact = (id: string, key: string): Fact | null => {
    const v = get(id)?.value;
    return typeof v === "number" ? { key, vars: { v: fmt.format(v) } } : null;
  };

  const climate: (Fact | null)[] = [
    numFact("rain", "field.plain.rain"),
    numFact("frost", "field.plain.frost"),
    numFact("heat", "field.plain.heat"),
  ];

  const soilCard = get("soil");
  const texture = soilCard?.value != null
    ? (soilCard.text ?? "").split(";")[0].trim() : "";
  const soil: (Fact | null)[] = [
    texture ? { key: "field.plain.soil", vars: { v: texture } } : null,
    numFact("slope", "field.plain.slope"),
  ];

  const fireCard = get("fire");
  const cat = typeof fireCard?.value === "string" &&
    FIRE_CATS.includes(fireCard.value) ? fireCard.value : null;
  const season = cat
    ? /(?:Temporada de quemas|Burning season):\s*([^;]+)/
        .exec(fireCard?.text ?? "")?.[1]?.trim()
    : undefined;
  const fire: (Fact | null)[] = [
    cat ? { key: "field.plain.fireRisk", vars: { cat: `risk.cat.${cat}` } }
        : null,
    season ? { key: "field.plain.burnSeason", vars: { v: season } } : null,
  ];

  const groups: [SummaryGroup["group"], (Fact | null)[]][] =
    [["climate", climate], ["soil", soil], ["fire", fire]];
  return groups
    .map(([group, fs]) => ({ group,
      facts: fs.filter((f): f is Fact => f !== null) }))
    .filter((g) => g.facts.length > 0);
}

/** Inclusive date range the fire semaphore sums: the `windowDays`
 * ending on `endDate` (YYYY-MM-DD, UTC). */
export function semaphorePeriod(endDate: string, windowDays: number):
    { from: string; to: string } {
  const end = new Date(`${endDate}T00:00:00Z`);
  const from = new Date(end.getTime() - (windowDays - 1) * 86_400_000);
  return { from: from.toISOString().slice(0, 10), to: endDate };
}

/** The backend explains alternatives "frente a la actual" even when the
 * baseline is the zone's typical rotation; relabel it as a reference. */
export function referenceText(text: string, reference: boolean): string {
  return reference
    ? text.replaceAll("frente a la actual",
                      "frente al escenario de referencia")
    : text;
}

export const MIN_DRAW_POINTS = 3;

/** Whether a drawn outline can be closed, and how many points are left. */
export function drawStatus(points: number):
    { canFinish: boolean; missing: number } {
  const missing = Math.max(0, MIN_DRAW_POINTS - points);
  return { canFinish: missing === 0, missing };
}

const UNIT_EN: Record<string, string> = {
  "mm/año": "mm/yr", "días/año": "days/yr", "días": "days",
  "mm/día": "mm/day",
};
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Diagnosis rendered in the chosen language. The backend keeps Spanish
 * texts (its engines parse them) and sends English ones alongside, so
 * Spanish returns the response as is. */
export function localizeDiag(d: DiagnoseResponse, lang: string):
    DiagnoseResponse {
  if (lang !== "en") return d;
  return {
    ...d,
    cards: d.cards.map((c) => ({
      ...c,
      text: c.text_en || c.text,
      unit: c.unit ? UNIT_EN[c.unit] ?? c.unit : c.unit,
      ...(c.stop_detail
        ? { stop_detail: c.stop_detail_en ?? c.stop_detail } : {}),
    })),
    calendar: {
      ...d.calendar,
      months: d.calendar.months.map((m, i) => MONTHS_EN[i] ?? m),
    },
    measures: d.measures?.map((m) => ({
      ...m, name: m.name_en || m.name, why: m.why_en || m.why })),
  };
}

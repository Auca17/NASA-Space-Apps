/** Farming calendar: the rotation's crops overlaid on the diagnosis
 * climate rows (bare soil, frost, water stress, heat, burn season). */
import { useT } from "../../i18n";
import type { CalendarRow } from "../../api/types";
import { Glossary, ROW_TERMS } from "../../components/Glossary";

/** A crop bar on the calendar: label + sowing->harvest window. */
export type CalCrop = { id: string; label: string; start: string;
                        end: string };

/** Crop catalog entry shape used to resolve windows per zone (the
 * catalog endpoint emits the full knowledge record; only these fields
 * are read here). */
export type CatalogCrop = {
  id: string;
  name?: { es?: string; en?: string };
  sowing?: Record<string, [string, string] | undefined>;
  harvest?: Record<string, [string, string] | undefined>;
};

/** Months (1-12) a crop occupies the field, from the start of the
 * sowing window to the end of the harvest window. Handles windows that
 * wrap the year (sow Nov, harvest Apr). */
export function cropMonths(start: string, end: string): boolean[] {
  const s = parseInt(start.slice(0, 2), 10), e = parseInt(end.slice(0, 2), 10);
  if (!s || !e || s < 1 || s > 12 || e < 1 || e > 12)
    return Array(12).fill(false);
  const out = Array(12).fill(false);
  for (let m = s; ; m = (m % 12) + 1) {
    out[m - 1] = true;
    if (m === e) break;
  }
  return out;
}

function windowFor(crop: CatalogCrop, zone: string | null | undefined):
    { start: string; end: string } | null {
  const z = zone ?? "";
  const zones = [z, "pampa_humeda", ...Object.keys(crop.sowing ?? {})];
  for (const key of zones) {
    const sow = crop.sowing?.[key], har = crop.harvest?.[key];
    if (sow && har) return { start: sow[0], end: har[1] };
  }
  return null;
}

/** Crop bars for the calendar: the current rotation's sequence when a
 * rotation exists (its start/end are already zone-resolved), else each
 * parcel crop's catalog window for the diagnosis zone. */
export function calendarCrops(opts: {
    sequence?: { crop: string; start: string; end: string }[] | null;
    parcelCrops?: string[];
    catalog?: CatalogCrop[] | null;
    zone?: string | null;
    lang: string }): CalCrop[] {
  const { sequence, parcelCrops, catalog, zone, lang } = opts;
  const label = (id: string) => {
    const c = catalog?.find((c) => c.id === id);
    return (lang === "en" ? c?.name?.en : c?.name?.es)
           ?? c?.name?.es ?? id;
  };
  const seen = new Set<string>();
  if (sequence?.length) {
    return sequence.filter((s) => !seen.has(s.crop) && seen.add(s.crop))
      .map((s) => ({ id: s.crop, label: label(s.crop),
                     start: s.start, end: s.end }));
  }
  const out: CalCrop[] = [];
  for (const id of parcelCrops ?? []) {
    if (seen.has(id)) continue;
    const c = catalog?.find((c) => c.id === id);
    if (!c) continue;                 // "otro"/"sin_cultivo"/unknown ids
    const w = windowFor(c, zone);
    if (!w) continue;
    seen.add(id);
    out.push({ id, label: label(id), start: w.start, end: w.end });
  }
  return out;
}

/** Level at or above which an environmental row counts as a real
 * exposure (2 = media, 3 = alta on the 0-3 backend scale). */
export const RISK_LEVEL = 2;

export interface CropRisk {
  label: string;
  frost: number[];                   // 0-based months flagged
  water: number[];
}

/** Months where each crop bar coincides with frost or water stress. */
export function cropRisks(crops: CalCrop[], rows: CalendarRow[]):
    CropRisk[] {
  const level = (id: string, m: number) =>
    rows.find((r) => r.id === id)?.levels[m] ?? 0;
  return crops.map((c) => {
    const months = cropMonths(c.start, c.end);
    const risk: CropRisk = { label: c.label, frost: [], water: [] };
    months.forEach((on, m) => {
      if (!on) return;
      if ((level("frost", m) ?? 0) >= RISK_LEVEL)
        risk.frost.push(m);
      if ((level("water_stress", m) ?? 0) >= RISK_LEVEL)
        risk.water.push(m);
    });
    return risk;
  });
}

const LEVEL_TEXT = ["○", "◔", "◑", "●"];

/** The agricultural calendar: crop bars over the climate rows, risky
 * coincidences marked in red (colour + hatch) and named in a sentence. */
export function Calendar({ months, rows, crops }: {
    months: string[]; rows: CalendarRow[]; crops?: CalCrop[] }) {
  const { t, lang } = useT();
  const monthFmt = new Intl.DateTimeFormat(lang, { month: "long" });
  const monthName = (m: number) => monthFmt.format(new Date(2020, m, 1));
  const monthList = (ms: number[]) => ms.map(monthName).join(", ");

  const risks = cropRisks(crops ?? [], rows);
  const riskParts: string[] = [];
  for (const r of risks) {
    if (r.frost.length)
      riskParts.push(t("field.calendar.riskFrost",
        { crop: r.label, months: monthList(r.frost) }));
    if (r.water.length)
      riskParts.push(t("field.calendar.riskWater",
        { crop: r.label, months: monthList(r.water) }));
  }
  const riskAt = (i: number, m: number) =>
    (risks[i].frost.includes(m) || risks[i].water.includes(m));

  const missing = rows
    .filter((r) => r.levels.every((lv) => lv == null))
    .map((r) => t(`calendar.row.${r.id}`) !== `calendar.row.${r.id}`
                ? t(`calendar.row.${r.id}`) : r.label ?? r.id);
  const rowLabel = (r: CalendarRow) =>
    t(`calendar.row.${r.id}`) !== `calendar.row.${r.id}`
      ? t(`calendar.row.${r.id}`) : r.label ?? r.id;

  return (
    <div className="agri-cal">
      <div style={{ overflowX: "auto" }}>
        <table className="cal" aria-label={t("calendar.aria")}>
          <thead><tr><th></th>
            {months.map((m) => <th key={m} scope="col">{m}</th>)}
          </tr></thead>
          <tbody>
            {(crops ?? []).map((c, i) => {
              const on = cropMonths(c.start, c.end);
              return (
                <tr key={c.id} className="cal-croprow">
                  <th scope="row">{c.label}</th>
                  {on.map((v, m) => (
                    <td key={m}
                        className={!v ? "cal-off"
                              : riskAt(i, m) ? "cal-risk" : "cal-on"}
                        aria-label={`${months[m]}: ${
                          riskAt(i, m) ? t("field.calendar.legendRisk")
                          : v ? t("field.calendar.legendCrop")
                          : "-"}`}>
                      {v ? (riskAt(i, m) ? "!" : "●") : ""}
                    </td>))}
                </tr>);
            })}
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{rowLabel(row)}
                  {ROW_TERMS[row.id] &&
                    <Glossary term={ROW_TERMS[row.id]} />}</th>
                {row.levels.every((lv) => lv == null)
                  ? <td colSpan={12} className="cal-off muted">
                      {t("field.noData")}</td>
                  : row.levels.map((lv, m) => (
                    <td key={m} className={lv == null ? "cal-off" : ""}
                        style={{ background: lv == null ? "transparent"
                          : `color-mix(in srgb, var(--covered) ${
                              lv * 30}%, var(--panel))` }}>
                      {lv == null ? "·" : LEVEL_TEXT[lv]}
                    </td>))}
              </tr>))}
          </tbody>
        </table>
      </div>
      <p className="cal-legend muted">
        <span className="cal-sw cal-on" aria-hidden="true" />{" "}
        {t("field.calendar.legendCrop")}{" · "}
        <span className="cal-sw cal-risk" aria-hidden="true" />{" "}
        {t("field.calendar.legendRisk")}{" · "}
        {t("field.calendar.legendScale")}
      </p>
      {!crops?.length &&
        <p className="muted">{t("field.calendar.noCrops")}</p>}
      {missing.length > 0 &&
        <p className="muted">{t("field.calendar.missing",
          { list: missing.join(", ") })}</p>}
      {riskParts.length > 0 &&
        <p className="cal-risks" role="note">
          {t("field.calendar.risk", { parts: riskParts.join("; ") })}.
        </p>}
    </div>);
}

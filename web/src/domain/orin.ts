/** Pure helpers for the Orin satellite-vs-field validation card
 * (contract 2.9, D31). Every sentence is built from i18n templates —
 * never free text. */
import type { OrinVariable, OrinValidation } from "../api/types";

/** True when a served file is marked as invented example data:
 * `synthetic: true` at top level or on any geojson feature/property. */
export function isSynthetic(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const o = json as Record<string, unknown>;
  if (o.synthetic === true) return true;
  if (Array.isArray(o.features)) {
    return o.features.some((f) => {
      const fo = f as Record<string, unknown> | null;
      return fo?.synthetic === true ||
        (fo?.properties as Record<string, unknown> | undefined)
          ?.synthetic === true;
    });
  }
  return false;
}

/** Quality -> bar fill 0..1 (the word badge is the primary signal). */
export function qualityRatio(q: string): number {
  return q === "good" ? 1 : q === "fair" ? 0.66 : 0.33;
}

/** Bias sentence key + vars: sign decides "más" / "menos" / none.
 * bias = satellite minus field, so bias < 0 means the satellite reads
 * lower than the station. */
export function biasKey(v: number, unit: string, abs: string):
    { key: string; vars: Record<string, string | number> } | null {
  if (!Number.isFinite(v)) return null;
  if (v === 0) return { key: "orin.bias.none", vars: {} };
  return {
    key: v < 0 ? "orin.bias.less" : "orin.bias.more",
    vars: { v: abs, u: unit },
  };
}

/** One phrase of the takeaway per variable, from fixed templates.
 * Returns i18n key + vars so the caller joins localized phrases. */
export function takeawayPhrase(v: OrinVariable, varLabel: string):
    { key: string; vars: Record<string, string | number> } {
  if (v.quality === "poor") {
    return { key: "orin.take.poor",
             vars: { v: varLabel, res: v.satellite.resolution } };
  }
  return { key: `orin.take.${v.quality}`, vars: { v: varLabel } };
}

/** The one-sentence takeaway: the best variable that "se ve bien" plus
 * every variable that does not see the plot well (fair/poor) — those
 * are the ones the farmer must not over-trust. Falls back to the first
 * two variables. */
export function takeaway(vars: OrinVariable[], label: (id: string) => string):
    { key: string; vars: Record<string, string | number> }[] {
  const good = vars.find((v) => v.quality === "good");
  const weak = vars.filter((v) => v.quality !== "good")
    .sort((a, b) => (a.quality === "fair" ? 0 : 1) -
                    (b.quality === "fair" ? 0 : 1));
  const pick = [good, ...weak].filter(Boolean) as OrinVariable[];
  const use = pick.length ? pick : vars.slice(0, 2);
  return use.slice(0, 3).map((v) => takeawayPhrase(v, label(v.id)));
}

/** Variable display key; unknown ids keep a readable fallback. */
export function varLabelKey(id: string): string {
  return `orin.var.${id}`;
}

/** The card only renders when the file exists and has variables. */
export function hasOrinData(v: OrinValidation | null | undefined): boolean {
  return Boolean(v?.variables?.length);
}

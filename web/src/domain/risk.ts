/** 7-day risk presentation rules (D29) — text + icon, never color alone. */

export type RiskCat = "bajo" | "moderado" | "alto" | "muy_alto";

export interface RiskCell {
  p: number;
  clim: number;
  ratio: number | null;
  cat: RiskCat;
  level: "historial" | "clima";
  model_version?: string;
  reasons?: string[];
  generated_at?: string | null;
  valid_until?: string | null;
  current?: boolean;
  country?: string | null;
}

export interface RiskView {
  cat: RiskCat;
  icon: string;
  normalForSeason: boolean;  // level historial + ratio 1 (D29)
  headline: string;          // cat text or "normal para la época"
  ratioText: string | null;  // "2.6× lo normal"
  probText: string;          // "<1" or "≈N" — the model is not precise
                             // enough to show decimals (round-2 minor)
  reasons: string[];
  level: "historial" | "clima";
}

export const CAT_ICON: Record<RiskCat, string> = {
  bajo: "▼", moderado: "◆", alto: "▲", muy_alto: "▲▲",
};

export const CAT_ORDER: RiskCat[] =
  ["bajo", "moderado", "alto", "muy_alto"];

export function presentRisk(cell: RiskCell): RiskView {
  const normal = cell.level === "historial" && cell.ratio === 1;
  const pct = cell.p * 100;
  return {
    cat: cell.cat,
    icon: CAT_ICON[cell.cat] ?? "●",
    normalForSeason: normal,
    headline: normal ? "normal" : cell.cat,
    ratioText: cell.ratio != null && cell.ratio !== 1
      ? `${cell.ratio}×` : null,
    probText: pct < 1 ? "<1" : `≈${Math.round(pct)}`,
    reasons: (cell.reasons ?? []).slice(0, 3),
    level: cell.level,
  };
}

/** The model writes its "why" phrases in Spanish
 * (model/fire_risk/predict.py). Map the whole known vocabulary to i18n
 * keys so the English UI does not leak backend strings; anything
 * outside the vocabulary renders verbatim so new phrases never vanish. */
const REASON_KEYS: Record<string, string> = {
  "sin señales de riesgo destacables": "risk.reason.none",
  "focos en las celdas vecinas": "risk.reason.neighbors",
  "focos recientes en la celda": "risk.reason.recent",
  "temporada de quemas": "risk.reason.season",
  "lluvias recientes muy bajas": "risk.reason.dry",
};

export function riskReasonText(reason: string,
    t: (k: string, v?: Record<string, string | number>) => string) {
  const key = REASON_KEYS[reason];
  if (key) return t(key);
  let m = /^(\d+) días sin lluvia$/.exec(reason);
  if (m) return t("risk.reason.dryDays", { n: Number(m[1]) });
  m = /^humedad relativa (\d+) ?%$/.exec(reason);
  if (m) return t("risk.reason.humidity", { n: Number(m[1]) });
  m = /^calor de los últimos días \((\d+) ?°C\)$/.exec(reason);
  if (m) return t("risk.reason.heat", { n: Number(m[1]) });
  return reason;
}

/** Emergency numbers by country code (AR gets 100/911 per PRD 6.5). */
export function emergencyText(country: string | null,
                              t: (k: string) => string): string {
  return country === "AR"
    ? t("panel.emergency.ar")
    : t("panel.emergency.other");
}

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
}

export interface RiskView {
  cat: RiskCat;
  icon: string;
  normalForSeason: boolean;  // level historial + ratio 1 (D29)
  headline: string;          // cat text or "normal para la época"
  ratioText: string | null;  // "2.6× lo normal"
  probPct: number;
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
  return {
    cat: cell.cat,
    icon: CAT_ICON[cell.cat] ?? "●",
    normalForSeason: normal,
    headline: normal ? "normal" : cell.cat,
    ratioText: cell.ratio != null && cell.ratio !== 1
      ? `${cell.ratio}×` : null,
    probPct: Math.round(cell.p * 1000) / 10,
    reasons: (cell.reasons ?? []).slice(0, 3),
    level: cell.level,
  };
}

/** Emergency numbers by country code (AR gets 100/911 per PRD 6.5). */
export function emergencyText(country: string | null,
                              t: (k: string) => string): string {
  return country === "AR"
    ? t("panel.emergency.ar")
    : t("panel.emergency.other");
}

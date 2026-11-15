/** Guided demo tour state (tasks 40 + 52): the dismissal flag lives
 * in sessionStorage — "No volver a mostrar" holds only for the visit,
 * so every new take of the demo starts the tour again. Anchors are
 * real DOM selectors resolved at runtime; `tab` makes the panel
 * switch to the right parcels tab while the step shows. */
import type { DemoId } from "./demoFarms";

export const TOUR_KEY = "ashfield.demoTour.v1";

/** True once the tour was dismissed this session; also true when
 * storage is unavailable (fail closed: don't nag every load). */
export function tourSeen(): boolean {
  try { return sessionStorage.getItem(TOUR_KEY) === "1"; }
  catch { return true; }
}

export function markTourSeen() {
  try { sessionStorage.setItem(TOUR_KEY, "1"); }
  catch { /* full/blocked */ }
}

export interface TourStep {
  /** CSS selector of the anchor element (resolved at runtime). */
  sel: string;
  /** i18n key of the hint text. */
  key: string;
  /** Parcels tab the panel opens for this step, if any. */
  tab?: "resumen" | "rotaciones" | "prioridades" | "mas";
}

/** Pampa (7 steps): parcels -> badges -> alerts -> priorities ->
 * calendar -> rotations card -> "Más información". */
const PAMPA_STEPS: TourStep[] = [
  { sel: '[data-tour="parcels"]', key: "demo.tour.parcels",
    tab: "resumen" },
  { sel: '[data-tour="badges"]', key: "demo.tour.badges" },
  { sel: '[data-tour="alerts"]', key: "demo.tour.alerts" },
  { sel: "#tab-prioridades", key: "demo.tour.priorities",
    tab: "prioridades" },
  { sel: '[data-tour="calendar"]', key: "demo.tour.calendar",
    tab: "mas" },
  { sel: '[data-tour="rotaciones"]', key: "demo.tour.rotations",
    tab: "rotaciones" },
  { sel: '[data-tour="masinfo"]', key: "demo.tour.more", tab: "mas" },
];

/** Mendoza (5 steps): same open, then the perennials note in
 * Rotaciones and "Más información". */
const MENDOZA_STEPS: TourStep[] = [
  { sel: '[data-tour="parcels"]', key: "demo.tour.parcels",
    tab: "resumen" },
  { sel: '[data-tour="badges"]', key: "demo.tour.badges" },
  { sel: '[data-tour="alerts"]', key: "demo.tour.alerts" },
  { sel: '[data-tour="rotaciones"]', key: "demo.tour.rotPerennials",
    tab: "rotaciones" },
  { sel: '[data-tour="masinfo"]', key: "demo.tour.more", tab: "mas" },
];

export function tourSteps(farm: DemoId): readonly TourStep[] {
  return farm === "mendoza" ? MENDOZA_STEPS : PAMPA_STEPS;
}

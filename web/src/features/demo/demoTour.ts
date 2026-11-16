/** Guided demo tour state (task 40): the dismissal flag lives in
 * localStorage; anchors are real DOM selectors resolved at runtime. */

export const TOUR_KEY = "ashfield.demoTour.v1";

/** True once the tour was dismissed; also true when storage is
 * unavailable (fail closed: don't nag every load). */
export function tourSeen(): boolean {
  try { return localStorage.getItem(TOUR_KEY) === "1"; }
  catch { return true; }
}

export function markTourSeen() {
  try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* full/blocked */ }
}

/** Anchors are real DOM nodes; each step lists a CSS selector and the
 * field-panel tab it lives in (the tour switches tabs for the farmer). */
export type TourTab = "recommendations" | "details";
export const TOUR_STEPS: readonly { sel: string; key: string; tab?: TourTab }[] = [
  { sel: '[data-tour="rotations"]', key: "demo.tour.rotations", tab: "recommendations" },
  { sel: '[data-tour="land"]', key: "demo.tour.land", tab: "details" },
  { sel: '[data-tour="badges"]', key: "demo.tour.badges" },
  { sel: '[data-tour="alerts"]', key: "demo.tour.alerts", tab: "details" },
  { sel: '[data-tour="parcels"]', key: "demo.tour.parcels", tab: "details" },
  { sel: "#tab-mas", key: "demo.tour.more", tab: "details" },
];

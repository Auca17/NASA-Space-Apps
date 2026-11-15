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

/** Anchors are real DOM nodes; each step lists a CSS selector. */
export const TOUR_STEPS = [
  { sel: '[data-tour="parcels"]', key: "demo.tour.parcels" },
  { sel: '[data-tour="badges"]', key: "demo.tour.badges" },
  { sel: '[data-tour="alerts"]', key: "demo.tour.alerts" },
  { sel: "#tab-prioridades", key: "demo.tour.priorities" },
  { sel: "#tab-mas", key: "demo.tour.more" },
] as const;

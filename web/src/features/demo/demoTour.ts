/** Guided demo tour state (tasks 40/42): the dismissal flag lives in
 * localStorage; anchors are real DOM selectors resolved at runtime.
 * `id` is a stable step name the app uses to reveal tab-bound
 * anchors before the hint tries to position itself. */

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

/** Anchors are real DOM nodes; each step lists a CSS selector. The
 * six steps walk the whole Field Shift brief: parcels, map badges,
 * the alert + emergency link, the Rotaciones tab, one alternative
 * card with its five sections, and "Más información". */
export const TOUR_STEPS = [
  { id: "parcels", sel: '[data-tour="parcels"]',
    key: "demo.tour.parcels" },
  { id: "badges", sel: '[data-tour="badges"]',
    key: "demo.tour.badges" },
  { id: "alerts", sel: '[data-tour="alerts"]',
    key: "demo.tour.alerts" },
  { id: "rotaciones", sel: '[data-tour="rotaciones"]',
    key: "demo.tour.rotations" },
  { id: "rotcard", sel: ".strategies .strategy",
    key: "demo.tour.rotcard" },
  { id: "more", sel: "#tab-mas", key: "demo.tour.more" },
] as const;

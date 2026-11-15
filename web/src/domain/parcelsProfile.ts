/** Farmer profile (task 37): which hazards the farmer wants to see,
 * in which order, plus optional per-parcel costs and prices.
 * Everything lives in localStorage (never on a server) and goes to the
 * API only inside the parcels request body. */
import type { ApiParcel } from "./parcels";

export type HazardId =
  "fire" | "drought" | "frost" | "enso" | "heat" |
  "snow" | "hail" | "flood";

/** All hazards, in the sensible default order from the brief. */
export const HAZARDS: HazardId[] =
  ["fire", "drought", "frost", "enso", "heat", "snow", "hail", "flood"];

/** Hazard id -> key inside `parcel.indicators` (drought is the water
 * indicator: low soil moisture). */
export const INDICATOR_KEY: Record<HazardId, string> = {
  fire: "fire", drought: "water", frost: "frost", heat: "heat",
  enso: "enso", snow: "snow", hail: "hail", flood: "flood",
};

export interface Profile {
  /** Display order; always all eight ids. */
  order: HazardId[];
  /** Hidden from the main view; still computed, shown under "Más
   * información". */
  hidden: HazardId[];
}

export const DEFAULT_PROFILE: Profile = { order: [...HAZARDS], hidden: [] };

export type Currency = "USD" | "ARS";

export interface ParcelEcon {
  cost_per_ha?: number;
  price_per_t?: number;
  expected_yield_t_ha?: number;
}

export interface Economics {
  currency: Currency;
  /** keyed by parcel id; entries with no number are dropped on save. */
  parcels: Record<string, ParcelEcon>;
}

export const DEFAULT_ECONOMICS: Economics =
  { currency: "USD", parcels: {} };

/* ------------------------------------------------ storage ---------- */

const PROFILE_KEY = "ashfield.profile.v1";
const ECON_KEY = "ashfield.econ.v1";

const isHazard = (s: string): s is HazardId =>
  (HAZARDS as string[]).includes(s);

function store<T>(key: string, v: T) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* full/blocked */ }
}

/** Parsed profile from storage; anything invalid falls back to the
 * default order with nothing hidden. */
export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE, order: [...HAZARDS] };
    const j = JSON.parse(raw) as { order?: string[]; hidden?: string[] };
    const order = (j.order ?? []).filter(isHazard);
    for (const h of HAZARDS) if (!order.includes(h)) order.push(h);
    const hidden = (j.hidden ?? []).filter(isHazard);
    return { order, hidden };
  } catch {
    return { ...DEFAULT_PROFILE, order: [...HAZARDS] };
  }
}

export function saveProfile(p: Profile) { store(PROFILE_KEY, p); }

export function loadEconomics(): Economics {
  try {
    const raw = localStorage.getItem(ECON_KEY);
    if (!raw) return { ...DEFAULT_ECONOMICS };
    const j = JSON.parse(raw) as Partial<Economics>;
    const currency = j.currency === "ARS" ? "ARS" : "USD";
    const parcels: Record<string, ParcelEcon> = {};
    for (const [id, e] of Object.entries(j.parcels ?? {})) {
      const c = e as ParcelEcon;
      const out: ParcelEcon = {};
      for (const k of
        ["cost_per_ha", "price_per_t", "expected_yield_t_ha"] as const) {
        const v = c[k];
        if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
      }
      if (Object.keys(out).length) parcels[id] = out;
    }
    return { currency, parcels };
  } catch {
    return { ...DEFAULT_ECONOMICS };
  }
}

export function saveEconomics(e: Economics) { store(ECON_KEY, e); }

/* ------------------------------------------------ edits ------------ */

/** Move `id` by `delta` positions (-1 up, +1 down). No-op at edges. */
export function moveHazard(order: HazardId[], id: HazardId, delta: number):
    HazardId[] {
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = order.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Move `id` to position `to` (drag reorder). */
export function reorderHazard(order: HazardId[], id: HazardId, to: number):
    HazardId[] {
  const from = order.indexOf(id);
  if (from < 0) return order;
  const next = order.slice();
  next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, id);
  return next;
}

export function toggleHidden(p: Profile, id: HazardId): Profile {
  return { ...p,
    hidden: p.hidden.includes(id)
      ? p.hidden.filter((h) => h !== id)
      : [...p.hidden, id] };
}

/** The `profile` field of POST /api/field/parcels. Economics only go
 * when at least one parcel carries a number. */
export function profileBody(p: Profile, e: Economics):
    {
      priorities: { id: HazardId; rank: number }[];
      hidden: HazardId[];
      economics?: { currency: Currency;
                    parcels: Record<string, ParcelEcon> };
    } {
  const parcels: Record<string, ParcelEcon> = {};
  for (const [id, pe] of Object.entries(e.parcels)) {
    const clean: ParcelEcon = {};
    for (const k of
      ["cost_per_ha", "price_per_t", "expected_yield_t_ha"] as const) {
      const v = pe[k];
      if (typeof v === "number" && Number.isFinite(v)) clean[k] = v;
    }
    if (Object.keys(clean).length) parcels[id] = clean;
  }
  return {
    priorities: p.order.map((id, i) => ({ id, rank: i + 1 })),
    hidden: p.hidden,
    ...(Object.keys(parcels).length
        ? { economics: { currency: e.currency, parcels } } : {}),
  };
}

/* ------------------------------------------------ results ---------- */

/** Visible hazards of a parcel in the API's order (profile first,
 * severity for the rest; hidden ids land on `extra`). Falls back to
 * the profile/default order when the response predates the field. */
export function visibleHazards(p: ApiParcel, profile: Profile): HazardId[] {
  const hidden = new Set([
    ...profile.hidden,
    ...(p.extra ?? []).filter((x) => x.hidden).map((x) => x.id),
  ]);
  const apiOrder = (p.order ?? []).filter((x): x is HazardId => isHazard(x));
  const order = apiOrder.length ? apiOrder : profile.order;
  return order.filter((h) => !hidden.has(h));
}

/** Hazards kept out of the main view (for "Más información"). */
export function hiddenHazards(p: ApiParcel, profile: Profile): HazardId[] {
  const shown = new Set(visibleHazards(p, profile));
  return HAZARDS.filter((h) => !shown.has(h));
}

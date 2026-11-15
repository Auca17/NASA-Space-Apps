/** Emergency-call helpers (task 26): distances, compass direction, the
 * "read to the operator" message. Pure domain — no invented values. */
import type { LiveBody } from "./live";

export type LatLon = [number, number];

const EARTH_KM = 6371;
const DEG = Math.PI / 180;

/** Great-circle distance in km between two [lat, lon] points. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLa = (b[0] - a[0]) * DEG, dLo = (b[1] - a[1]) * DEG;
  const la1 = a[0] * DEG, la2 = b[0] * DEG;
  const h = Math.sin(dLa / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 8-point compass index (0=N … 7=NW) of `to` seen from `from`. */
export function compass8(from: LatLon, to: LatLon): number {
  const y = Math.sin((to[1] - from[1]) * DEG) * Math.cos(to[0] * DEG);
  const x = Math.cos(from[0] * DEG) * Math.sin(to[0] * DEG) -
    Math.sin(from[0] * DEG) * Math.cos(to[0] * DEG) *
    Math.cos((to[1] - from[1]) * DEG);
  const bearing = (Math.atan2(y, x) / DEG + 360) % 360;
  return Math.round(bearing / 45) % 8;
}

/** i18n key of a compass index, es order: N NE E SE S SO O NO. */
export const DIRECTION_KEYS = [
  "emerg.dir.n", "emerg.dir.ne", "emerg.dir.e", "emerg.dir.se",
  "emerg.dir.s", "emerg.dir.so", "emerg.dir.o", "emerg.dir.no",
];

/** A detection as the app knows it: position plus when it was seen. */
export interface Detection {
  lat: number;
  lon: number;
  /** ISO datetime of the satellite acquisition, when the source has it. */
  at: Date | null;
}

/** Points of a points-mode /api/live body (arrays or objects). */
export function livePoints(b: LiveBody): Detection[] {
  if (b.mode === "cells") return [];
  return (b.points ?? []).flatMap((p) => {
    if (Array.isArray(p)) {
      const [lat, lon, , , ts] = p;
      return typeof lat === "number" && typeof lon === "number"
        ? [{ lat, lon, at: parseAt(ts) }] : [];
    }
    const at = (p as { acq_datetime?: string }).acq_datetime;
    return [{ lat: p.lat, lon: p.lon, at: parseAt(at) }];
  });
}

function parseAt(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(v)
    ? v : `${v}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface NearbyDetection {
  km: number;
  /** index into DIRECTION_KEYS */
  dir: number;
  /** hours since the satellite pass, null when the row carried no time */
  hoursAgo: number | null;
}

/** The detection closest to `from`, or null when there are none.
 * `now` is injectable for tests. */
export function nearestDetection(dets: Detection[], from: LatLon,
    now: Date = new Date()): NearbyDetection | null {
  let best: NearbyDetection | null = null;
  for (const d of dets) {
    const km = haversineKm(from, [d.lat, d.lon]);
    if (best && km >= best.km) continue;
    best = {
      km,
      dir: compass8(from, [d.lat, d.lon]),
      hoursAgo: d.at
        ? Math.max(0, (now.getTime() - d.at.getTime()) / 3_600_000)
        : null,
    };
  }
  return best;
}

/** OpenStreetMap link centred on the point — the map the operator can
 * open while the caller reads coordinates aloud. */
export function mapLink(lat: number, lon: number): string {
  const la = lat.toFixed(5), lo = lon.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}` +
    `#map=14/${la}/${lo}`;
}

export interface MessageCtx {
  /** coordinates the message will quote */
  lat: number;
  lon: number;
  /** "user" = shared GPS position, "map" = visible map centre */
  source: "user" | "map";
  /** nearest satellite detection the app knows, if any */
  detection?: { km: number; dirKey: string; hoursAgo: number | null } | null;
  /** wind text when some view really has it; omitted otherwise */
  wind?: string | null;
}

/** The sentence the user reads to the operator. Only values the app
 * really has; a missing field leaves no trace in the text. */
export function emergencyMessage(ctx: MessageCtx,
    t: (k: string, v?: Record<string, string | number>) => string): string {
  const parts = [t("emerg.msg.intro")];
  const locKey = ctx.source === "user" ? "emerg.msg.locUser"
                                       : "emerg.msg.locMap";
  const lat = ctx.lat.toFixed(4), lon = ctx.lon.toFixed(4);
  parts.push(t(locKey, { lat, lon, url: mapLink(ctx.lat, ctx.lon) }));
  const d = ctx.detection;
  if (d) {
    const vars: Record<string, string | number> =
      { km: Math.round(d.km * 10) / 10, dir: t(d.dirKey) };
    parts.push(d.hoursAgo != null
      ? t("emerg.msg.det", { ...vars, h: Math.round(d.hoursAgo) })
      : t("emerg.msg.detNoTime", vars));
  }
  if (ctx.wind) parts.push(t("emerg.msg.wind", { v: ctx.wind }));
  return parts.join(" ");
}

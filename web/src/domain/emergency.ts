/** Emergency-call helpers (task 26): the "read to the operator"
 * message. Pure domain — no invented values. The live-detection
 * helpers (nearest point, compass, distances) left with the Live
 * view (task 49). */
export type LatLon = [number, number];

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
  parts.push(t(locKey, { lat: ctx.lat.toFixed(4), lon: ctx.lon.toFixed(4),
                         url: mapLink(ctx.lat, ctx.lon) }));
  if (ctx.wind) parts.push(t("emerg.msg.wind", { v: ctx.wind }));
  return parts.join(" ");
}

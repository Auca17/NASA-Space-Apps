/** Automatic split by crop: every saved field with no zones is divided
 * into one zone per crop of INTA's map as soon as it is in the list,
 * without the user opening it or pressing anything. Runs once per field
 * (the result is stored as `cropSplit`); if INTA is down it retries
 * after a minute. */
import { useEffect, useRef } from "react";
import { apiCropZones } from "../../api";
import { geoJsonToMulti, type Field } from "../../domain/fields";
import { plotBody, type Multi } from "../../domain/selection";
import type { Lang } from "../../i18n";

export type NewZone = { name: string; crop: string; geom: Multi };
const RETRY_MS = 60_000;

/** Ask INTA for the field's crop zones; null when it could not answer. */
export async function cropZonesFor(geom: Multi, lang: Lang):
    Promise<{ zones: NewZone[]; result: "done" | "none" } | null> {
  const r = await apiCropZones(plotBody(geom));
  if (!r || r.status === "unavailable") return null;
  const zones = r.zones.map((z) => ({ name: z.crop[lang], crop: z.crop[lang],
                                      geom: geoJsonToMulti(z.geometry) }));
  return { zones, result: zones.length ? "done" : "none" };
}

export function useAutoCropSplit(fields: Field[], lang: Lang,
    apply: (fieldId: string, zones: NewZone[], result: "done" | "none") => void) {
  /** field id -> when it may be asked again (Infinity: in flight or done) */
  const asked = useRef(new Map<string, number>());
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    const now = Date.now();
    for (const f of fields) {
      if (f.zones.length || f.cropSplit || (asked.current.get(f.id) ?? 0) > now)
        continue;
      asked.current.set(f.id, Infinity);
      void cropZonesFor(f.geom, lang).then((r) => {
        if (!r) { asked.current.set(f.id, Date.now() + RETRY_MS); return; }
        applyRef.current(f.id, r.zones, r.result);
      });
    }
  }, [fields, lang]);
}

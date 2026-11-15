/** "Mis campos": fields and crop zones kept in this browser only.
 *
 * Geometry is a Multi (pieces, each [outer, ...holes]) for fields and
 * zones alike. Records saved by the first version ({ parts: ring[] } and
 * zones with { ring }) are upgraded when read; the key stays the same. */
import { multiHa, type LatLon, type Multi } from "./selection";

export type Zone = { id: string; name: string; crop: string; geom: Multi };
export type Field = { id: string; name: string; geom: Multi;
                      zones: Zone[]; createdAt: string };

const KEY = "fs_fields_v1";

const uid = () => Date.now().toString(36) +
  Math.random().toString(36).slice(2, 7);

type StoredZone = Partial<Zone> & { ring?: LatLon[] };
type Stored = Omit<Partial<Field>, "zones"> & { parts?: LatLon[][];
  zones?: StoredZone[] };

/** Upgrade a stored record to the current shape (null if unusable). */
function upgrade(r: Stored): Field | null {
  const geom: Multi | undefined = Array.isArray(r.geom) ? r.geom
    : Array.isArray(r.parts) ? r.parts.map((ring) => [ring]) : undefined;
  if (!r.id || !geom?.length) return null;
  return {
    id: r.id, name: r.name ?? "", createdAt: r.createdAt ?? "", geom,
    zones: (r.zones ?? []).flatMap((z) => {
      const g: Multi | undefined = Array.isArray(z.geom) ? z.geom
        : Array.isArray(z.ring) ? [[z.ring]] : undefined;
      return z.id && g ? [{ id: z.id, name: z.name ?? "",
                            crop: z.crop ?? "", geom: g }] : [];
    }),
  };
}

export function loadFields(): Field[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v)
      ? v.flatMap((r) => { const f = r && upgrade(r); return f ? [f] : []; })
      : [];
  } catch { return []; }
}

function write(all: Field[]) {
  localStorage.setItem(KEY, JSON.stringify(all));
}

function update(id: string, fn: (f: Field) => Field) {
  write(loadFields().map((f) => (f.id === id ? fn(f) : f)));
}

export function saveField(f: { name: string; geom: Multi }): Field {
  const field: Field = { id: uid(), name: f.name.trim() || "Campo",
    geom: f.geom, zones: [], createdAt: new Date().toISOString() };
  write([...loadFields(), field]);
  return field;
}

export function renameField(id: string, name: string) {
  const n = name.trim();
  if (n) update(id, (f) => ({ ...f, name: n }));
}

export function deleteField(id: string) {
  write(loadFields().filter((f) => f.id !== id));
}

/** Name and crop are optional: they only help organise the field. */
export function addZone(fieldId: string,
                        z: { name: string; crop: string; geom: Multi }): Zone {
  const zone: Zone = { id: uid(), name: z.name.trim(),
                       crop: z.crop.trim(), geom: z.geom };
  update(fieldId, (f) => ({ ...f, zones: [...f.zones, zone] }));
  return zone;
}

export function updateZone(fieldId: string, zoneId: string,
                           patch: Partial<Pick<Zone, "name" | "crop">>) {
  update(fieldId, (f) => ({ ...f, zones: f.zones.map((z) =>
    z.id === zoneId ? { ...z, ...patch } : z) }));
}

export function removeZone(fieldId: string, zoneId: string) {
  update(fieldId, (f) => ({ ...f, zones: f.zones.filter((z) => z.id !== zoneId) }));
}

export const fieldHa = (f: Pick<Field, "geom">) => multiHa(f.geom);
export const zoneHa = (z: Pick<Zone, "geom">) => multiHa(z.geom);

/** Zone colours (panel swatches and map fills), distinct and readable. */
export const ZONE_COLORS = ["#f9a825", "#8e24aa", "#00897b", "#e53935",
                            "#3949ab", "#6d4c41"];

/** An area of a saved field that can be sent to the diagnosis. */
export type AreaOption = { id: string; kind: "all" | "piece" | "zone";
  /** piece number (1-based) or zone name; "" for the whole field */
  label: string; crop?: string; geom: Multi; ha: number };

/** What can be analysed in a field: the whole field (every piece, holes
 * respected), each piece on its own when there are several, and each
 * saved zone. */
export function analysisOptions(f: Field): AreaOption[] {
  const out: AreaOption[] = [
    { id: "all", kind: "all", label: "", geom: f.geom, ha: fieldHa(f) }];
  if (f.geom.length > 1) {
    f.geom.forEach((p, i) => out.push({ id: `p${i}`, kind: "piece",
      label: String(i + 1), geom: [p], ha: multiHa([p]) }));
  }
  f.zones.forEach((z, i) => out.push({ id: `z:${z.id}`, kind: "zone",
    label: z.name || `${i + 1}`, crop: z.crop, geom: z.geom, ha: zoneHa(z) }));
  return out;
}

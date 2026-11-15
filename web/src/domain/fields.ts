/** "Mis campos": fields and crop zones kept in this browser only.
 *
 * Geometry is a Multi (pieces, each [outer, ...holes]) for fields and
 * zones alike. Records saved by the first version ({ parts: ring[] } and
 * zones with { ring }) are upgraded when read; the key stays the same. */
import { multiHa, type LatLon, type Multi } from "./selection";
import type { ParcelSource } from "./split";

/** A plot (parcela) of the field. `source` says what delimited it:
 * "ftw" Fields of The World boundaries, "osm" OpenStreetMap roads,
 * "manual" drawn or corrected by the producer (also every zone saved
 * before plots were detected). `crop` is what the producer declared. */
export type Zone = { id: string; name: string; crop: string; geom: Multi;
                     source?: ParcelSource; cropDeclared?: boolean };
/** Where the accepted plots came from and how much land they cover. */
export type DetectionMeta = { at: string; sources: string[];
                              parcelHa: number; reviewHa: number };
/** `review`: land inside the outline no source delimited («Límite por
 * revisar»). Both it and `detection` are absent in older records. */
export type Field = { id: string; name: string; geom: Multi;
                      zones: Zone[]; createdAt: string;
                      /** crop typed by the user when the map has none */
                      crop?: string;
                      /** the automatic split by crop already ran */
                      cropSplit?: "done" | "none";
                      review?: Multi; detection?: DetectionMeta };

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
    ...(typeof r.crop === "string" && r.crop ? { crop: r.crop } : {}),
    ...(r.cropSplit === "done" || r.cropSplit === "none"
      ? { cropSplit: r.cropSplit } : {}),
    zones: (r.zones ?? []).flatMap((z) => {
      const g: Multi | undefined = Array.isArray(z.geom) ? z.geom
        : Array.isArray(z.ring) ? [[z.ring]] : undefined;
      return z.id && g ? [{ id: z.id, name: z.name ?? "",
                            crop: z.crop ?? "", geom: g,
                            ...(z.source ? { source: z.source } : {}),
                            ...(z.cropDeclared === true ? { cropDeclared: true } : {}) }] : [];
    }),
    ...(Array.isArray(r.review) ? { review: r.review } : {}),
    ...(r.detection ? { detection: r.detection } : {}),
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

export function saveExampleFields(examples: Field[]) {
  const fields = loadFields();
  const existing = new Set(fields.map((field) => field.id));
  const missing = examples.filter((example) => !existing.has(example.id));
  if (missing.length) write([...fields, ...missing]);
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
    z.id === zoneId ? { ...z, ...patch,
      ...(patch.crop !== undefined ? { cropDeclared: true } : {}) } : z) }));
}

export function removeZone(fieldId: string, zoneId: string) {
  update(fieldId, (f) => ({ ...f, zones: f.zones.filter((z) => z.id !== zoneId) }));
}

/** Accept detected plots: they replace earlier detected ones; plots the
 * producer drew or corrected are kept. */
export function acceptDetection(fieldId: string,
    parcels: { name: string; geom: Multi; source: ParcelSource }[],
    review: Multi, meta: DetectionMeta) {
  update(fieldId, (f) => ({
    ...f, review, detection: meta,
    zones: [...f.zones.filter((z) => (z.source ?? "manual") === "manual"),
            ...parcels.map((p) => ({ id: uid(), name: p.name.trim(),
                                     crop: "", geom: p.geom, source: p.source }))],
  }));
}

/** Drop a plot: its land goes back to «Límite por revisar». */
export function discardParcel(fieldId: string, zoneId: string) {
  update(fieldId, (f) => {
    const z = f.zones.find((x) => x.id === zoneId);
    return z ? { ...f, zones: f.zones.filter((x) => x.id !== zoneId),
                 review: [...(f.review ?? []), ...z.geom] } : f;
  });
}

/** Corrected borders: the plot becomes manual; land it no longer covers
 * (`leftover`) is added to «Límite por revisar». */
export function replaceParcel(fieldId: string, zoneId: string, geom: Multi,
                              leftover: Multi) {
  update(fieldId, (f) => ({
    ...f, review: [...(f.review ?? []), ...leftover],
    zones: f.zones.map((z) => (z.id === zoneId
      ? { ...z, geom, source: "manual" as const } : z)),
  }));
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

/** Several zones in one write (the field split by crop). */
export function addZones(fieldId: string,
                         zs: { name: string; crop: string; geom: Multi }[],
                         source?: ParcelSource) {
  const zones: Zone[] = zs.map((z) => ({ id: uid(), name: z.name.trim(),
    crop: z.crop.trim(), geom: z.geom, ...(source ? { source } : {}) }));
  update(fieldId, (f) => ({ ...f, zones: [...f.zones, ...zones] }));
  return zones;
}

export function setFieldCrop(id: string, crop: string) {
  update(id, (f) => ({ ...f, crop: crop.trim() }));
}

/** GeoJSON Polygon/MultiPolygon ([lon, lat], closed rings) -> Multi. */
export function geoJsonToMulti(g: { type: string; coordinates: unknown }): Multi {
  const ring = (r: number[][]) => {
    const pts = r.map(([lo, la]) => [la, lo] as LatLon);
    const [a, b] = [pts[0], pts[pts.length - 1]];
    return pts.length > 1 && a[0] === b[0] && a[1] === b[1] ? pts.slice(0, -1) : pts;
  };
  const poly = (p: number[][][]) => p.map(ring);
  return g.type === "MultiPolygon"
    ? (g.coordinates as number[][][][]).map(poly)
    : [poly(g.coordinates as number[][][])];
}

export function markCropSplit(id: string, result: "done" | "none") {
  update(id, (f) => ({ ...f, cropSplit: result }));
}

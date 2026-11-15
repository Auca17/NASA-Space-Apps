/** Captures REAL parcels + rotations responses for a guided demo so
 * the offline fallback is honest "saved" data, not hand-written
 * numbers. Builds the exact requests the app sends — parcelsBody +
 * profileBody, then plotBody -> diagnose -> rotations with the same
 * inference (inferCurrentRotation, deriveRotPriorities, prioWeights)
 * the panel uses — and writes the verbatim responses to
 * src/features/demo/<farm>Cached.json.
 * Run: npx vite-node scripts/capture-demo.mjs [pergamino|mendoza]
 *      DEMO_API=http://host:port npx vite-node scripts/capture-demo.mjs */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parcelsBody } from "../src/domain/parcels.ts";
import { profileBody } from "../src/domain/parcelsProfile.ts";
import { plotBody } from "../src/domain/selection.ts";
import {
  deriveRotPriorities, inferCurrentRotation, prioWeights,
} from "../src/domain/rotations.ts";
import {
  DEMO_FARMS,
} from "../src/features/demo/demoFarms.ts";

const id = process.argv[2] ?? "pergamino";
const farm = DEMO_FARMS[id];
if (!farm) {
  console.error(`unknown farm "${id}" — expected pergamino|mendoza`);
  process.exit(1);
}
const API = process.env.DEMO_API ?? "http://localhost:8000";
const post = async (path, body) => {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error(`POST ${API}${path} -> ${r.status}`);
    process.exit(1);
  }
  return r.json();
};

// 1. the parcels analysis — same body the app sends
const response = await post("/api/field/parcels", parcelsBody(
  farm.boundary, farm.parcels, farm.needs, "es",
  profileBody(farm.profile, farm.econ)));

// 2. diagnosis (same plotBody the app sends) — needed for rotations
const diagnosis = await post("/api/field/diagnose",
                             plotBody(farm.boundary));

// 3. rotations — catalog, inferred current, derived priorities: the
//    same derivation the panel runs automatically
const catalog = await (await fetch(`${API}/api/field/catalog`)).json();
const inferred = inferCurrentRotation(
  farm.parcels.map((p) => p.crop), catalog.rotations);
const hasEcon = Object.keys(farm.econ?.parcels ?? {}).length > 0;
const derived = deriveRotPriorities(farm.profile.order, hasEcon);
const rotations = diagnosis?.cards
  ? await post("/api/field/rotations", {
      diagnosis, zone: diagnosis.zone,
      current: inferred ? { rotation_id: inferred.id } : null,
      priorities: prioWeights(derived.sel),
      constraints: {},
    })
  : null;

const out = {
  captured_at: new Date().toISOString().slice(0, 10),
  inferred_rotation: inferred,
  derived_priorities: derived,
  response,
  ...(rotations ? { rotations } : {}),
};
const dest = fileURLToPath(
  new URL(`../src/features/demo/${id}Cached.json`, import.meta.url));
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log("saved", dest);
console.log("captured_at", out.captured_at,
  "| parcels:", (response.parcels ?? []).map((p) => p.id).join(", "));
console.log("inferred:", inferred?.id ?? "(none)",
  "| priorities:", derived.sel.join(", ") || "(none)",
  "| strategies:", rotations?.strategies?.length ?? 0);

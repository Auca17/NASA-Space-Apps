/** Captures a REAL parcels response for an example field so the
 * offline fallback is honest "saved" data, not hand-written numbers.
 * Builds the exact request the app sends (parcelsBody + profileBody
 * over the farm's boundary, parcels, needs, profile and economics),
 * POSTs it to the live API and writes the verbatim response to
 * src/features/demo/<farm>Cached.json.
 * Run: npx vite-node scripts/capture-demo.mjs mendoza
 *      npx vite-node scripts/capture-demo.mjs pampa
 *      DEMO_API=http://host:port npx vite-node scripts/capture-demo.mjs pampa */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parcelsBody } from "../src/domain/parcels.ts";
import { profileBody } from "../src/domain/parcelsProfile.ts";
import { DEMO_FARMS } from "../src/features/demo/demoFarms.ts";

const id = process.argv[2] ?? "mendoza";
const farm = DEMO_FARMS[id];
if (!farm) {
  console.error(`unknown farm "${id}"; use: ${Object.keys(DEMO_FARMS).join(", ")}`);
  process.exit(1);
}
const API = process.env.DEMO_API ?? "http://localhost:8000";
const body = parcelsBody(
  farm.boundary, farm.parcels, farm.needs, "es",
  profileBody(farm.profile, farm.econ));

const r = await fetch(`${API}/api/field/parcels`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
if (!r.ok) {
  console.error(`POST ${API}/api/field/parcels -> ${r.status}`);
  process.exit(1);
}
const response = await r.json();
const out = { captured_at: new Date().toISOString().slice(0, 10), response };
const dest = fileURLToPath(
  new URL(`../src/features/demo/${id}Cached.json`, import.meta.url));
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log("saved", dest);
console.log("captured_at", out.captured_at,
  "| parcels:", (response.parcels ?? []).map((p) => p.id).join(", "),
  "| degraded:", response.degraded ?? false);

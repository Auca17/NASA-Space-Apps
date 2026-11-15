/** Captures a REAL parcels response for the Mendoza demo so the
 * offline fallback is honest "saved" data, not hand-written numbers.
 * Builds the exact request the app sends — parcelsBody + profileBody
 * over MENDOZA_* — POSTs it to the live API and writes the verbatim
 * response to src/features/demo/mendozaCached.json.
 * Run: npx vite-node scripts/capture-demo.mjs
 *      DEMO_API=http://host:port npx vite-node scripts/capture-demo.mjs */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parcelsBody } from "../src/domain/parcels.ts";
import { profileBody } from "../src/domain/parcelsProfile.ts";
import {
  MENDOZA_BOUNDARY, MENDOZA_PARCELS, MENDOZA_NEEDS,
  MENDOZA_PROFILE, MENDOZA_ECON,
} from "../src/features/demo/mendozaFarm.ts";

const API = process.env.DEMO_API ?? "http://localhost:8000";
const body = parcelsBody(
  MENDOZA_BOUNDARY, MENDOZA_PARCELS, MENDOZA_NEEDS, "es",
  profileBody(MENDOZA_PROFILE, MENDOZA_ECON));

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
  new URL("../src/features/demo/mendozaCached.json", import.meta.url));
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log("saved", dest);
console.log("captured_at", out.captured_at,
  "| parcels:", (response.parcels ?? []).map((p) => p.id).join(", "));

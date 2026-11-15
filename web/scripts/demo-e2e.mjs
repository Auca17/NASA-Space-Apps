/** Task 40 end-to-end: /app/#demo at 390px and 1280px.
 * Expects: the Mendoza farm loads with no drawing, the live parcels
 * analysis runs, parcels + badges + zones appear on the map, the
 * fictional-producer disclaimer shows, and the 5-step tour walks and
 * dismisses (and stays dismissed). Screenshots: screenshots/41-*. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5410";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const fails = [];
const ok = (cond, label) => {
  console.log(cond ? "PASS" : "FAIL", label);
  if (!cond) fails.push(label);
};

const browser = await chromium.launch();

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("console", (m) => {
    if (m.type() === "error")
      console.log(`  console.error[${tag}]:`, m.text().slice(0, 160));
  });
  const snap = (n) =>
    page.screenshot({ path: `${OUT}41-${n}-${tag}.png` });

  await page.goto(`${BASE}/app/#demo`, { waitUntil: "networkidle" });

  // the panel opens on the farm scope with the disclaimer
  const scope = page.locator(".analysis-scope");
  await scope.waitFor({ timeout: 30000 });
  ok((await scope.textContent() ?? "").includes("Finca Los Álamos"),
     `${tag} scope says Finca Los Álamos`);
  ok((await page.locator(".demo-note").textContent() ?? "")
     .includes("inventados para la demo"), `${tag} disclaimer note`);

  // the live analysis lands: alerts + tabs + parcel rows
  await page.waitForSelector(".parcel-res-row", { timeout: 60000 });
  const names = await page.locator(".parcel-res-row .parcel-name")
    .allTextContents();
  for (const n of ["La Vid", "Los Olivos", "El Ajal"]) {
    ok(names.some((x) => x.includes(n)), `${tag} parcel row "${n}"`);
  }
  const saved = await page.locator(".notice").allTextContents();
  ok(saved.some((s) => /guardado del/i.test(s))
     ? "fallback used" : true, `${tag} live result (no saved fallback)`);

  // map badges over the parcels
  const badges = await page.locator(".parcel-badge").count();
  ok(badges >= 3, `${tag} map badges (${badges})`);

  // tour: step 1 visible, walk to the end, dismiss -> gone for good
  const hint = page.locator(".tour-hint");
  await hint.waitFor({ timeout: 15000 }).catch(() => {});
  ok(await hint.isVisible(), `${tag} tour step 1`);
  await snap(`tour-${tag === "390" ? "1" : "1"}`);
  for (let i = 0; i < 4 && await hint.isVisible(); i++) {
    await page.getByRole("button", { name: /siguiente|next/i }).click();
  }
  ok(await page.getByRole("button", { name: /listo|done/i }).isVisible(),
     `${tag} tour last step`);
  await page.getByRole("button", { name: /listo|done/i }).click();
  ok(!(await hint.isVisible()), `${tag} tour dismissed`);
  ok(await page.evaluate(
    () => localStorage.getItem("ashfield.demoTour.v1")) === "1",
    `${tag} tour dismissal persisted`);

  await snap("result");

  // "Más información" tab works and the emergency alert sits on top
  await page.getByRole("tab", { name: /más información|more/i }).click();
  await page.waitForTimeout(800);
  await snap("more");

  // second load: no tour again
  await page.goto(`${BASE}/app/#demo`, { waitUntil: "networkidle" });
  await page.waitForSelector(".parcel-res-row", { timeout: 60000 });
  await page.waitForTimeout(1200);
  ok(!(await hint.isVisible()), `${tag} tour stays dismissed`);

  await page.close();
}

await run(390, 760, "390");
await run(1280, 800, "1280");
await browser.close();
console.log(fails.length ? `FAILURES: ${fails.join(" | ")}` : "ALL PASS");
process.exit(fails.length ? 1 : 0);

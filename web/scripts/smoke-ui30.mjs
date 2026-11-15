/** Task 30/26 screenshot harness: real R2 data + local backend.
 * Saves screenshots under web/screenshots/ (git-ignored):
 *  - map with the raster base (map-base)
 *  - map fallback with every raster domain blocked (map-fallback)
 *  - degraded diagnosis from a STUBBED response (degraded)
 *  - Orin validation card, "Un caso real", ECOSTRESS (real R2 data)
 *  - emergency block: menu entry + country numbers from a stubbed
 *    risk response (harness only). The live nearby detection and the
 *    fire area panel left with the fire/live views (task 49).
 * Usage: node scripts/smoke-ui30.mjs [baseUrl] */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:4173";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
];
const RASTER = /gibs\.earthdata\.nasa\.gov|tile\.openstreetmap\.org|tiles\.maps\.eox\.at/;
const defects = [];
const note = (sev, what) => defects.push(`[${sev}] ${what}`);

/* The demo calls POST /api/field/parcels; the degraded card renders
 * when the response is degraded but the nearby block is not. Base the
 * stub on the captured real response so every other section still
 * renders. */
const DEGRADED = (() => {
  const res = JSON.parse(readFileSync(fileURLToPath(new URL(
    "../src/features/demo/mendozaCached.json", import.meta.url)),
    "utf8")).response;
  res.degraded = true;
  res.degraded_reason =
    "NASA POWER no respondió: se muestran solo los datos locales.";
  res.nearby = { ...(res.nearby ?? {}), degraded: false };
  return res;
})();

for (const s of SIZES) {
  const tag = `${s.width}px`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height }, locale: "es" });
  // dismiss the guided demo tour so it never blocks the panel
  await ctx.addInitScript(
    "localStorage.setItem('ashfield.demoTour.v1','1')");
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  const snap = async (name, ms = 0) => {
    if (ms) await page.waitForTimeout(ms);
    await page.screenshot({ path: `${OUT}${name}-${tag}.png` });
  };

  /* the chooser is a peekable sheet on compact widths — expand before
   * touching the option details it hides. */
  const expandChooser = async () => {
    const h = page.locator(
      ".picker-head button[aria-expanded='false']").first();
    if (await h.count()) await h.click().catch(() => {});
    await page.waitForTimeout(400);
  };

  /* -- 1. real base map (mounts on entering the field flow) ------- */
  await page.goto(`${BASE}/app/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /Analizar mi campo/i }).first()
    .click().catch(() => {});
  await page.waitForTimeout(6000);
  await snap("map-base", 500);
  const px = await page.evaluate(() => {
    const c = document.querySelector(".map canvas");
    if (!c) return "nocanvas";
    const g = c.getContext("webgl2") || c.getContext("webgl");
    return g ? "hasgl" : "nogl";
  });
  if (px === "nocanvas") note("high", `no map canvas @${tag}`);

  /* -- 2. fallback: all raster domains blocked -------------------- */
  await page.route(RASTER, (r) => r.abort());
  await page.goto(`${BASE}/app/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12000);
  await snap("map-fallback", 500);
  await page.unroute(RASTER);

  /* -- 3. degraded parcels analysis (stubbed — harness only) ------ */
  await page.route("**/api/field/parcels", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(DEGRADED) }));
  await page.goto(`${BASE}/app/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /ejemplo: finca en Mendoza/i })
    .first().click().catch(() => {});
  await page.waitForSelector(".diag-degraded, [role='alert']",
    { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const d = await page.locator(".diag-degraded").count();
  if (!d) note("high", `degraded notice missing @${tag}`);
  await snap("degraded");
  await page.unroute("**/api/field/parcels");

  /* -- 4. real field flow: Orin demo lot → "Más información" ------ */
  await page.goto(`${BASE}/app/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /Analizar mi campo/i }).first()
    .click().catch(() => {});
  await page.waitForTimeout(1500);
  await expandChooser();
  await page.locator("summary", { hasText: /ejemplo/i }).first()
    .click().catch(() => {});
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /\(ejemplo\)/i }).first()
    .click().catch(() => {});
  /* the Orin lot asks needs first — skip them */
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Saltear|Skip/i }).first()
    .click().catch(() => {});
  /* the diagnosis (and the Orin/ECOSTRESS cards with it) loads lazily
   * inside the "Más información" tab */
  await page.waitForSelector("#tab-mas", { timeout: 120000 })
    .catch(() => {});
  await page.locator("#tab-mas").first().click().catch(() => {});
  await page.waitForSelector(".dtile, .diag-grid, .orin-row",
    { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const orin = page.locator(".orin-row").first();
  if (await orin.count()) {
    await orin.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);
    await snap("orin-card");
  } else note("high", `orin card missing @${tag}`);

  /* "Un caso real" only renders when the diagnosis yields a harvest
   * measure (clean_harvester / harvest_timing); the demo plot may not
   * trigger one — absence is conditional, not a defect. */
  const caseEl = page.locator("text=/Un caso real/").first();
  if (await caseEl.count()) {
    await caseEl.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);
    await snap("case-card");
  } else console.log(`info: case card not triggered @${tag} ` +
    "(conditional — needs a harvest measure in the diagnosis)");

  const eco = page.locator("text=/ECOSTRESS/i").first();
  if (await eco.count()) {
    await eco.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);
    await snap("ecostress-card");
  } else note("medium", `ecostress card missing @${tag}`);

  /* -- 5. emergency menu entry ------------------------------------ */
  await page.getByRole("button", { name: /Emergencias/i }).first()
    .click().catch(() => {});
  await page.waitForTimeout(1200);
  const em = await page.locator(".emerg").count();
  if (!em) note("high", `emergency sheet missing @${tag}`);
  await snap("emerg-menu");
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator("button[aria-label*='errar'], .panel-head button")
    .last().click().catch(() => {});

  /* -- 6. emergency sheet picks the country via the risk endpoint
   *      (stubbed — harness only) ------------------------------- */
  await page.route("**/api/risk**", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ p: 0.41, clim: 0.08, ratio: 5.1,
      cat: "alto", level: "clima", country: "AR",
      reasons: ["stub"], h3_r5: "85c2e827fffffff" }) }));
  await page.goto(`${BASE}/app/`,
    { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /Emergencias/i }).first()
    .click().catch(() => {});
  await page.waitForTimeout(2500);
  const ar911 = await page.locator("a[href='tel:911']").count();
  if (!ar911) note("high", `AR emergency numbers missing @${tag}`);
  await snap("emerg-area");
  await page.unroute("**/api/risk**");

  for (const e of errs) note("medium", `${tag}: ${e}`);
  await browser.close();
}

console.log("\n=== DEFECTS ===");
if (!defects.length) console.log("none");
for (const d of defects) console.log(d);

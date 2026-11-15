/** Landing imagery: clean app screenshots on real R2 data.
 * Usage: node scripts/landing-shots.mjs [baseUrl]
 * Requires: dev server (VITE_DATA_BASE_URL=R2) + back on :8000.
 * Output: git-ignored web/screenshots/app-*.png — curate + convert
 * the keepers into public/landing/. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const SIZES = [{ w: 1280, h: 800 }, { w: 390, h: 844 }];

for (const { w, h } of SIZES) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(
    "localStorage.setItem('ashfield.demoTour.v1','1')");
  const page = await ctx.newPage();
  const snap = async (name, ms = 1200) => {
    await page.waitForTimeout(ms);
    await page.screenshot({ path: `${OUT}app-${name}-${w}px.png` });
    console.log("saved", name, w);
  };

  // 1. boot: fields list over the satellite basemap
  await page.goto(BASE + "/app/", { waitUntil: "domcontentloaded" });
  await snap("boot-fields", 3200);

  // 2. field diagnosis (Mendoza demo farm — real data only)
  await page.goto(BASE + "/app/#demo", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".parcel-badge, .card",
    { timeout: 60000 }).catch(() => {});
  await snap("field-diagnosis", 2000);

  // 3. detail tab: lazy diagnosis + validation card
  await page.locator("#tab-mas").first().click().catch(() => {});
  await page.waitForSelector(".dtile, .card", { timeout: 120000 })
    .catch(() => {});
  await page.getByText(/sat[eé]lite tu lote|estaciones/i).first()
    .scrollIntoViewIfNeeded().catch(() => {});
  await snap("validation-card", 1000);

  // 4. scenario sliders
  await page.getByText(/escenario|lluvia|temperatura/i).first()
    .scrollIntoViewIfNeeded().catch(() => {});
  await snap("scenarios", 800);

  // 5. rotation cards with the five sections
  await page.getByRole("button", { name: /comparar rotaciones/i })
    .click().catch(() => {});
  await page.waitForSelector(".strategy", { timeout: 40000 }).catch(() => {});
  await snap("rotations", 1600);

  await browser.close();
}
console.log("done");

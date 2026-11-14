/** Before/after screenshots for the task-14 polish, at 390 and 1280 px.
 * Usage: node scripts/shots.mjs <prefix> [baseUrl] */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const PREFIX = process.argv[2] ?? "14-shot";
const BASE = process.argv[3] ?? "http://localhost:5198";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const w of [390, 1280]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 800 }, locale: "es" });
  const page = await ctx.newPage();
  const tag = `${PREFIX}-${w}px`;

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}${tag}-welcome.png` });

  await page.goto(`${BASE}/?r2=2#-33.89,-60.57`,
    { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /analizar mi campo/i })
    .click().catch(() => {});
  await page.getByRole("button", { name: /demo/i })
    .click().catch(() => {});
  await page.waitForSelector(".diag-grid, .chip-row .card",
    { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}${tag}-diagnosis.png` });

  const btn = page.getByRole("button", { name: /comparar rotaciones/i })
    .first();
  await btn.click().catch(() => {});
  // step-2 form may need a second click on the run button
  await page.getByRole("button", { name: /comparar rotaciones/i })
    .last().click().catch(() => {});
  await page.waitForSelector(".strategy", { timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}${tag}-rotations.png` });
  console.log(tag, "strategies:", await page.locator(".strategy").count());
  await ctx.close();
}
await browser.close();

/** Targeted rotations-flow smoke: demo -> opciones de cultivo ->
 * Comparar rotaciones -> strategies, sections, methods panel.
 * Usage: node scripts/smoke-rotations.mjs [baseUrl] */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:4173";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

for (const w of [390, 1280]) {
  const tag = `${w}px`;
  const browser = await chromium.launch();
  const page = await (await browser.newContext({
    viewport: { width: w, height: w === 390 ? 844 : 800 },
    locale: "es" })).newPage();
  page.on("pageerror", (e) => console.log(`[pageerror ${tag}]`, e.message));
  page.on("console", (m) => {
    if (m.type() === "error")
      console.log(`[console ${tag}]`, m.text().slice(0, 160));
  });
  const snap = (n) => page.screenshot({ path: `${OUT}${n}-${tag}.png` });
  const click = async (re, which = "first") => {
    const b = page.getByRole("button", { name: re })[which]();
    if (await b.count()) { await b.click().catch(() => {}); return true; }
    return false;
  };

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await click(/^Analizar mi campo$/i);
  await page.waitForTimeout(1200);
  await page.locator("summary", { hasText: /Probar con un ejemplo/ })
    .first().click().catch(() => {});
  await page.waitForTimeout(400);
  await click(/Abrir el ejemplo: finca en Mendoza/i);
  await page.waitForSelector(".dtile, .card", { timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(1500);

  await click(/Ver opciones de cultivo|opciones de cultivo/i);
  await page.waitForTimeout(1200);
  await snap("rot-form");
  await click(/Comparar rotaciones/i, "last");
  const got = await page.waitForSelector(".strategy", { timeout: 120000 })
    .then(() => true).catch(() => false);
  await page.waitForTimeout(1500);
  console.log(`[${tag}] strategies:`,
    await page.locator(".strategy").count(), "rendered:", got);
  await snap("rot-strategies");

  // open the five sections of the first strategy
  const secs = page.locator(".strategy").first()
    .locator("details > summary");
  const n = await secs.count();
  for (let i = 0; i < n; i++) {
    await secs.nth(i).click().catch(() => {});
    await page.waitForTimeout(120);
  }
  console.log(`[${tag}] strategy sections:`, n);
  await snap("rot-sections");

  // scroll panel to bottom for measures/comparison shots
  await page.locator(".sheet-body, .bottom-sheet, main").first()
    .evaluate((el) => el.scrollTo(0, el.scrollHeight)).catch(() => {});
  await page.waitForTimeout(600);
  await snap("rot-bottom");

  await browser.close();
}
console.log("done");

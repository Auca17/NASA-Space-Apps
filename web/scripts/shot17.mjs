import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
const browser = await chromium.launch();
for (const w of [390, 1280]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 800 }, locale: "es" });
  const page = await ctx.newPage();
  // fire mode + layer selector + methods link in header
  await page.goto("http://localhost:5198/app/?r2=2#-33.89,-60.57",
    { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}17-after-${w}px-fire.png` });
  // open methods drawer
  await page.getByRole("button", { name: /métodos|methods/i }).click().catch(()=>{});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}17-after-${w}px-methods.png` });
  await page.keyboard.press("Escape");
  // switch to a field layer at zoom 5
  const sel = page.locator("select").first();
  if (await sel.count()) {
    await sel.selectOption({ label: /lluvia|rain/i }).catch(()=>{});
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}17-after-${w}px-layer.png` });
  // field mode: scenario UI
  await page.getByRole("button", { name: /analizar mi campo/i }).click().catch(()=>{});
  await page.getByRole("button", { name: /demo/i }).click().catch(()=>{});
  await page.waitForSelector(".diag-grid", { timeout: 60000 }).catch(()=>{});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}17-after-${w}px-field.png` });
  // apply dry preset then screenshot deltas
  await page.getByRole("button", { name: /seco|dry/i }).click().catch(()=>{});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}17-after-${w}px-scenario.png` });
  console.log(w, "done");
  await ctx.close();
}
await browser.close();

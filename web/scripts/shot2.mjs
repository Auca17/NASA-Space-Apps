import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
const browser = await chromium.launch();
for (const w of [390, 1280]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 800 }, locale: "es" });
  const page = await ctx.newPage();
  await page.goto("http://localhost:5198/app/?r2=2#-33.89,-60.57",
    { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /analizar mi campo/i }).click().catch(()=>{});
  await page.getByRole("button", { name: /demo/i }).click().catch(()=>{});
  await page.waitForSelector(".diag-grid", { timeout: 60000 }).catch(()=>{});
  await page.getByRole("button", { name: /^Comparar rotaciones$/ }).first().click().catch(()=>{});
  await page.getByRole("button", { name: /Conservar agua/i }).click().catch(()=>{});
  await page.getByRole("button", { name: /Reducir erosión/i }).click().catch(()=>{});
  await page.locator("button.primary").last().click().catch(()=>{});
  await page.waitForSelector(".strategy", { timeout: 60000 }).catch(()=>{});
  await page.waitForTimeout(1000);
  const card = page.locator(".strategy").first();
  await card.scrollIntoViewIfNeeded().catch(()=>{});
  await page.screenshot({ path: `${OUT}14-after-${w}px-strategy.png` });
  console.log(w, "ok", await page.locator(".strategy").count());
  await ctx.close();
}
await browser.close();

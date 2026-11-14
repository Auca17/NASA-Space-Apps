/** Time-to-first-panel (calendar table) on production build, Fast 4G. */
import { chromium } from "playwright";
const BASE = process.argv[2] ?? "http://localhost:5198";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Network.emulateNetworkConditions", {
  offline: false, latency: 150,
  downloadThroughput: 4.5 * 1024 * 1024 / 8,
  uploadThroughput: 3 * 1024 * 1024 / 8,
});
for (const [name, ll] of [["corrientes", "-27.95,-56.95"],
                          ["pergamino", "-33.89,-60.57"]]) {
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const t0 = Date.now();
  await page.goto(BASE + `/?t=${name}#${ll}`,
    { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table.cal", { timeout: 90000 })
    .catch(() => console.log(`  ${name}: TIMEOUT`));
  console.log(`${name}: ${Date.now() - t0} ms (panel/calendar)`);
}
// warm second pass (cache on)
await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
const t0 = Date.now();
await page.goto(BASE + "/?t=warm#-33.89,-60.57",
  { waitUntil: "domcontentloaded" });
await page.waitForSelector("table.cal", { timeout: 90000 }).catch(() => {});
console.log(`pergamino warm: ${Date.now() - t0} ms`);
await browser.close();

/** Task-11 verification driver: screenshots + measurements on real data.
 * Usage: node scripts/verify.mjs [baseUrl]
 * Requires: dev server (DATA_DIR=../data/dev_v1) + back on :8000. */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const report = { shots: [], timings: {}, checks: [], notes: [] };
const say = (k, v) => { report.checks.push(`${k}: ${v}`);
  console.log(`  [check] ${k}: ${v}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  acceptDownloads: true,
});
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") report.notes.push("console: " + m.text());
});
const snap = async (name, ms = 1200) => {
  await page.waitForTimeout(ms);
  await page.screenshot({ path: `${OUT}${name}.png` });
  report.shots.push(name);
  console.log("saved", name);
};

// ---------- 1. welcome + mobile header -------------------------------------
await page.goto(BASE + "/app/", { waitUntil: "domcontentloaded" });
await page.setViewportSize({ width: 390, height: 844 });
await snap("11-header-mobile", 1500);
await page.setViewportSize({ width: 1280, height: 800 });

// ---------- 2. globe: sphere + 2022-02 hexagons ----------------------------
await page.getByRole("button", { name: /explorar el planeta/i }).click();
await page.waitForTimeout(1500);
// historic controls default to latest month; set slider to 2022-02 (idx 255)
await page.evaluate(() => {
  const s = document.querySelector(".controls input[type=range]");
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, "value").set;
  set.call(s, "255"); // 2000-11 + 255 = 2022-02
  s.dispatchEvent(new Event("input", { bubbles: true }));
  s.dispatchEvent(new Event("change", { bubbles: true }));
});
await snap("11-globe-2022-02", 3000);
const nHex = await page.locator("canvas").count();
say("globe canvas", nHex);
// zoomed-out sphere check: just screenshot (visual)
await snap("11-globe-sphere", 500);

// ---------- 3. Corrientes panel ---------------------------------------------
await page.goto(BASE + "/app/?r=1#-27.95,-56.95",
  { waitUntil: "domcontentloaded" });
await page.waitForSelector(".panel", { timeout: 20000 }).catch(() => {});
await page.waitForSelector("table.cal", { timeout: 30000 }).catch(() => {});
await snap("11-panel-corrientes", 1500);

// read calendar cell values to compare against CSV later
const calCells = await page.evaluate(() => {
  const tds = [...document.querySelectorAll("table.cal td")];
  return tds.slice(0, 60).map((td) => td.textContent?.trim());
});
const semText = await page.locator(".card").allTextContents()
  .catch(() => []);
say("panel cards", semText.length);
await page.screenshot({ path: `${OUT}11-panel-corrientes-full.png`,
  fullPage: false });

// CSV download + compare 3 values
try {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 8000 }),
    page.getByRole("button", { name: /descargar csv/i }).click(),
  ]);
  const path = await dl.path();
  const csv = readFileSync(path, "utf8");
  const rows = csv.trim().split("\n").slice(1)
    .map((l) => l.split(","));
  report.notes.push(`csv rows: ${rows.length}, first: ${rows[0]}`);
  say("csv download", `${rows.length} months`);
  // compare 3 random CSV month values against the calendar cells
  const sample = [0, 1, 2]
    .map(() => rows[Math.floor(Math.random() * rows.length)]);
  const matched = sample.filter(([, v]) =>
    calCells.some((c) => c === v || (c && v && Number(c) === Number(v))));
  say("csv vs calendar", `${matched.length}/3 cells match`);
  report.notes.push(`csv-vs-calendar: ${matched.length}/3`);
  report.timings.csvRows = rows.length;
} catch (e) {
  say("csv download", "FAILED: " + e.message);
}

// ---------- 4. historic play 2021-12 -> 2022-04 ------------------------------
await page.evaluate(() => {
  const s = document.querySelector(".controls input[type=range]");
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, "value").set;
  set.call(s, "253"); // 2000-11 + 253 = 2021-12
  s.dispatchEvent(new Event("input", { bubbles: true }));
  s.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(1500);
await snap("11-historic-2021-12", 1000);
await page.keyboard.press("Space");
await page.waitForTimeout(3500);
await snap("11-historic-playing", 500);

// ---------- 5. live mode -----------------------------------------------------
await page.getByRole("button", { name: /en vivo/i }).click();
await page.waitForTimeout(4000);
await snap("11-live-ar", 1000);
const liveText = await page.locator(".controls").textContent()
  .catch(() => "");
say("live notice", liveText.includes("térmica") ? "shown" : "MISSING");

// ---------- 6. field end-to-end ----------------------------------------------
await page.getByRole("button", { name: /analizar mi campo/i }).click();
await page.getByRole("button", { name: /demo/i }).click();
await page.waitForTimeout(2000);
await snap("11-field-loading", 500);
await page.waitForSelector(".card", { timeout: 30000 }).catch(() => {});
await snap("11-field-diagnosis", 1500);
// scroll to bottom of panel then run rotations
await page.getByRole("button", { name: /comparar rotaciones/i })
  .click().catch(() => {});
await page.waitForTimeout(15000);
await snap("11-rotations", 1000);
const strats = await page.locator(".strategy").count();
say("rotation cards", strats);

// ---------- 7. time to first panel, Fast 4G ----------------------------------
const cdp = await ctx.newCDPSession(page);
await cdp.send("Network.emulateNetworkConditions", {
  offline: false, latency: 150,
  downloadThroughput: 4.5 * 1024 * 1024 / 8,
  uploadThroughput: 3 * 1024 * 1024 / 8,
});
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
for (const [name, ll] of [["corrientes", "-27.95,-56.95"],
                          ["pampa", "-33.89,-60.57"]]) {
  const t0 = Date.now();
  await page.goto(BASE + `/app/?t=${name}#${ll}`,
    { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table.cal", { timeout: 60000 })
    .catch(() => {});
  report.timings[name] = Date.now() - t0;
  console.log(`  [timing] ${name}: ${report.timings[name]} ms`);
}

await browser.close();
console.log(JSON.stringify(report.timings));
console.log("NOTES:", report.notes.join(" | "));

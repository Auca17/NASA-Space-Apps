/** Task-13 R2 check: welcome + Corrientes panel + Pergamino rotations
 * against a build pointed at the real R2 bucket (VITE_DATA_BASE_URL). */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5198";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 }, locale: "es" });
const page = await ctx.newPage();
const reqs = [];
page.on("request", (r) => reqs.push(r.url()));
const say = (k, v) => console.log(`${k}: ${v}`);

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}13-r2-welcome.png` });

// Corrientes panel
await page.goto(BASE + "/?r2=1#-27.95,-56.95",
  { waitUntil: "domcontentloaded" });
await page.waitForSelector("table.cal", { timeout: 60000 })
  .catch(() => say("corrientes panel", "TIMEOUT"));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}13-r2-corrientes.png` });

// Pergamino field -> rotations (zone header must read Pampa húmeda)
await page.goto(BASE + "/?r2=2#-33.89,-60.57",
  { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /analizar mi campo/i }).click()
  .catch(() => {});
await page.getByRole("button", { name: /demo/i }).click().catch(() => {});
await page.waitForSelector(".card", { timeout: 45000 }).catch(() => {});
await page.screenshot({ path: `${OUT}13-r2-field.png` });
await page.getByRole("button", { name: /comparar rotaciones/i })
  .click().catch(() => {});
await page.waitForSelector(".strategy", { timeout: 45000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}13-r2-rotations.png` });
say("strategies", await page.locator(".strategy").count());
say("zone header", await page.locator(".zone-header").textContent()
  .catch(() => "MISSING"));

const r2 = reqs.filter((u) => u.includes("r2.dev"));
say("r2 requests", r2.length + " (first: " + (r2[0] ?? "none") + ")");
say("r2 failures", reqs.filter((u) => u.includes("r2.dev")).length -
  r2.length);
await browser.close();

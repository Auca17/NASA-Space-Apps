/** Live check: open-path vertex drag + midpoint handles on the field
 * outline. Draws 3 points by clicking the map, drags vertex 0, then
 * drags an edge midpoint, screenshotting each step. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5277";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("PE:", String(e).slice(0, 300)));
await page.goto(BASE + "/app/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

await page.getByRole("button", { name: /analizar mi campo/i }).first().click();
await page.waitForTimeout(1200);
// point-by-point mode
await page.getByRole("button", { name: /dibujar punto por punto/i })
  .first().click();
await page.waitForTimeout(500);

// three clicks -> open triangle
const pts = [[500, 300], [780, 300], [780, 520]];
for (const [x, y] of pts) { await page.mouse.click(x, y); await page.waitForTimeout(300); }
await page.screenshot({ path: OUT + "drag-1-open.png" });

// drag vertex 0 down-left; the fill must follow live
await page.mouse.move(500, 300);
await page.mouse.down();
await page.mouse.move(480, 360, { steps: 6 });
await page.screenshot({ path: OUT + "drag-2-moving.png" });
await page.mouse.up();
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + "drag-3-dropped.png" });

// drag the midpoint of edge v0-v1 (~(630,330)) into the shape
await page.mouse.move(630, 330);
await page.mouse.down();
await page.mouse.move(630, 400, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + "drag-4-midpoint.png" });

// undo twice -> the midpoint vertex and the v0 move both roll back
const undo = page.getByRole("button",
  { name: /borrar último punto|undo/i }).first();
if (await undo.count()) { await undo.click(); await page.waitForTimeout(200);
  await undo.click(); await page.waitForTimeout(200); }
await page.screenshot({ path: OUT + "drag-5-undo.png" });

console.log("done");
await browser.close();

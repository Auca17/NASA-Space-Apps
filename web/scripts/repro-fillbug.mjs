/** Repro: field fill breaks into tile blocks at high zoom.
 * Coords -> 50 ha selection near Pergamino, then zoom +/- through the
 * in-app controls and screenshot at ~z12 / ~z16 / ~z17.
 * Usage: node scripts/repro-fillbug.mjs [base] [tag] */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5277";
const TAG = process.argv[3] ?? "fillbug";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(BASE + "/app/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

await page.getByRole("button", { name: /analizar mi campo/i }).first()
  .click();
await page.waitForTimeout(1200);
await page.locator("details").getByText(/otras formas de marcar/i)
  .first().click();
await page.locator(".coord-form input").nth(0).fill("-33.89");
await page.locator(".coord-form input").nth(1).fill("-60.57");
await page.getByRole("button", { name: /usar este punto/i }).click();
await page.waitForSelector("text=Revisá el terreno", { timeout: 15000 });
await page.waitForTimeout(2000); // fly-in settles

const zoomBtn = (name) =>
  page.getByRole("button", { name });

// report the live zoom via the debug hook: no direct access, so we go
// by click counts relative to the selection's ~z15 fly-in.
await page.screenshot({ path: `${OUT}${TAG}-z15sel.png` });

await zoomBtn(/acercar mapa/i).click();   // ~z16
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}${TAG}-z16.png` });

await zoomBtn(/acercar mapa/i).click();   // ~z17
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}${TAG}-z17.png` });

for (let i = 0; i < 4; i++) {             // back to ~z13
  await zoomBtn(/alejar mapa/i).click();
  await page.waitForTimeout(700);
}
await page.screenshot({ path: `${OUT}${TAG}-z13.png` });

await browser.close();
console.log("done");

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
const setMonth = (idx) => `(() => {
  const s = document.querySelector(".controls input[type=range]");
  if (!s) return;
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, "value").set;
  set.call(s, "${idx}");
  s.dispatchEvent(new Event("input", { bubbles: true }));
  s.dispatchEvent(new Event("change", { bubbles: true }));
})()`;

for (const { w, h } of SIZES) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const snap = async (name, ms = 1200) => {
    await page.waitForTimeout(ms);
    await page.screenshot({ path: `${OUT}app-${name}-${w}px.png` });
    console.log("saved", name, w);
  };

  // 1. globe with fire layer on a real month (2022-02, Corrientes peak)
  await page.goto(BASE + "/app/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /mapa de fuego/i })
    .click().catch(() => {});
  await page.waitForTimeout(1800);
  await page.evaluate(setMonth(255));
  await snap("globe-2022-02", 3200);

  // 2. area panel — Corrientes, the 2022 case study
  await page.goto(BASE + "/app/?r=1#-27.95,-56.95",
    { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table.cal", { timeout: 30000 }).catch(() => {});
  await snap("area-panel", 1800);

  // 3. field diagnosis (Pergamino demo plot — real data only)
  await page.goto(BASE + "/app/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button",
    { name: /ejemplo.*pergamino/i }).click().catch(() => {});
  await page.waitForSelector(".card", { timeout: 60000 }).catch(() => {});
  await snap("field-diagnosis", 2000);

  // 4. validation card (scroll inside panel to the Orin card)
  await page.getByText(/sat[eé]lite tu lote|estaciones/i).first()
    .scrollIntoViewIfNeeded().catch(() => {});
  await snap("validation-card", 1000);

  // 5. scenario sliders (in the rotations form)
  await page.getByText(/escenario|lluvia|temperatura/i).first()
    .scrollIntoViewIfNeeded().catch(() => {});
  await snap("scenarios", 800);

  // 6. rotation cards with the five sections
  await page.getByRole("button", { name: /comparar rotaciones/i })
    .click().catch(() => {});
  await page.waitForSelector(".strategy", { timeout: 40000 }).catch(() => {});
  await snap("rotations", 1600);

  await browser.close();
}
console.log("done");

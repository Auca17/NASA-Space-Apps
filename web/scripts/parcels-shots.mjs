/** Parcel-flow screenshots: demo plot -> needs -> parcels result. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

for (const s of [{ n: "390", w: 390, h: 844 }, { n: "1280", w: 1280, h: 800 }]) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
  const snap = (name, ms = 800) => page.waitForTimeout(ms)
    .then(() => page.screenshot({ path: `${OUT}${name}-${s.w}px.png` }))
    .then(() => console.log("saved", name, s.n));

  await page.goto(BASE + "/app/", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /ejemplo|pergamino/i }).first()
    .click().catch((e) => console.log("demo:", e.message.slice(0, 80)));
  await snap("parcels-needs", 2500);
  await page.getByRole("button", { name: /omitir|saltar|continuar|analizar/i })
    .last().click().catch((e) => console.log("needs:", e.message.slice(0, 80)));
  await snap("parcels-loading", 800);
  await snap("parcels-result", 12000);
  await browser.close();
}

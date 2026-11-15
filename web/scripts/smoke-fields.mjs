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
  // the app boots into the fields list already
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await snap("fields-panel2");
  // zones inside a field detail — open a field if listed
  await page.locator(".field-list button, .field-item button").first()
    .click().catch(() => {});
  await page.waitForTimeout(800);
  await click(/Zonas de cultivo/i);
  await page.waitForTimeout(1000);
  await snap("split-zones2");
  await browser.close();
}
console.log("done");

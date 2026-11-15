/** Task 48 screenshots: the "Cómo viene el año" timeline — peek block in
 * Resumen + full chart in "Más información" (Mendoza demo), 390/1280px.
 * Until task 47 merges, the `timeline` field is injected into live API
 * responses from scripts/timeline.fixture.json (the exact contract the
 * back-end branch pushed in fixtures/api/diagnose.response.json). */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:4199";
const OUT = "screenshots/48-";
const TL = JSON.parse(readFileSync(
  new URL("./timeline.fixture.json", import.meta.url), "utf8"));

const injectTimeline = async (route) => {
  try {
    const res = await route.fetch();
    const json = await res.json();
    if (Array.isArray(json?.parcels))
      json.parcels.forEach((p) => { if (p && typeof p === "object") p.timeline = TL; });
    else if (json && typeof json === "object")
      json.timeline = TL;
    await route.fulfill({ response: res, json });
  } catch { /* page closed with a request in flight */ }
};

const browser = await chromium.launch();
for (const w of [390, 1280]) {
  const page = await browser.newPage({ viewport: { width: w, height: 844 } });
  page.on("pageerror", (e) =>
    console.log(`PAGEERR ${w}:`, e.message.slice(0, 160)));
  await page.route("**/api/field/parcels", injectTimeline);
  await page.route("**/api/field/diagnose", injectTimeline);
  await page.goto(`${BASE}/app/#demo`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const skip = page.getByRole("button", { name: /omitir|saltar|cerrar/i }).first();
  if (await skip.count()) await skip.click().catch(() => {});
  await page.waitForSelector(".parcel-res-row, [role='tab']", { timeout: 90000 })
    .catch(() => {});

  // 1) Resumen tab: peek block, collapsed then expanded
  const peek = page.locator(".tl-peek").first();
  console.log(w, "peek:", await peek.count());
  if (await peek.count()) {
    await peek.scrollIntoViewIfNeeded().catch(() => {});
    await peek.screenshot({ path: `${OUT}peek-${w}px.png` });
    await peek.locator("summary").first().click().catch(() => {});
    await page.waitForTimeout(600);
    await peek.screenshot({ path: `${OUT}peek-open-${w}px.png` });
  }

  // 2) "Más información": full chart per parcel + under diagnosis cards
  await page.getByRole("tab", { name: /Más información|More/i }).first()
    .click().catch(() => {});
  const tl = page.locator(".tl-block, .tl").first();
  await tl.waitFor({ timeout: 90000 }).catch(() => {});
  console.log(w, "tl blocks:", await page.locator(".tl").count());
  await page.waitForTimeout(800);
  const panel = page.locator(".panel").first();
  await panel.screenshot({ path: `${OUT}panel-${w}px.png` });
  for (const [i, name] of ["rain", "full"].entries()) {
    const p = page.locator(".tl-panel").nth(i);
    if (await p.count())
      await p.screenshot({ path: `${OUT}${name}-${w}px.png` });
  }
  const block = page.locator(".tl-block").first();
  if (await block.count())
    await block.screenshot({ path: `${OUT}timeline-${w}px.png` });
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await page.close();
}
await browser.close();

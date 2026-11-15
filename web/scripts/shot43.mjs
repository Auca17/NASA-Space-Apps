/** Task 43 screenshots: agricultural calendar + accuracy card in the
 * diagnosis panel (Mendoza demo), at 390px and 1280px. */
import { chromium } from "playwright";
const BASE = process.argv[2] ?? "http://localhost:4199";
const OUT = "screenshots/43-";
const browser = await chromium.launch();
for (const w of [390, 1280]) {
  const page = await browser.newPage({ viewport: { width: w, height: 844 } });
  page.on("pageerror", (e) => console.log(`PAGEERR ${w}:`, e.message.slice(0, 160)));
  await page.goto(`${BASE}/app/#demo`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const skip = page.getByRole("button", { name: /omitir|saltar|cerrar/i }).first();
  if (await skip.count()) await skip.click().catch(() => {});
  await page.waitForSelector(".parcel-res-row, [role='tab']", { timeout: 90000 })
    .catch(() => {});
  // the full diagnosis (calendar + details) lives behind "Más información"
  await page.getByRole("tab", { name: /Más información|More/i }).first()
    .click().catch(() => {});
  // the lazy diagnosis takes a while; wait for its details to exist
  await page.locator("summary", { hasText: /calendario agr|calendar/i })
    .first().waitFor({ timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1000);
  for (const name of [/detalladas|detailed/i, /calendario agr|calendar/i]) {
    const sum = page.locator("summary", { hasText: name }).first();
    if (await sum.count()) await sum.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  const g = page.locator(".gloss-all summary").first();
  if (await g.count()) await g.click().catch(() => {});
  await page.waitForTimeout(500);
  const panel = page.locator(".panel").first();
  await panel.screenshot({ path: `${OUT}panel-${w}px.png` });
  const acc = page.locator(".acc-card").first();
  if (await acc.count()) await acc.screenshot({ path: `${OUT}accuracy-${w}px.png` });
  const cal = page.locator(".agri-cal").first();
  if (await cal.count()) await cal.screenshot({ path: `${OUT}calendar-${w}px.png` });
  console.log(w, "acc:", await acc.count(), "cal:", await cal.count());
  await page.close();
}
await browser.close();

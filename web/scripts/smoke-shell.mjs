/** Task 33 visual check (task 49: fire/live modes are gone — the
 * field flow is the whole app): welcome rows, topbar home control,
 * field panel + map-tools collision, emergency sheet.
 * Screenshots to web/screenshots/ at 390 and 1280 px.
 * Usage: node scripts/smoke-shell.mjs [baseUrl] */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:4173";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

for (const w of [390, 1280]) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: w, height: w === 390 ? 844 : 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/api/**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: "{}" }));
  const shot = (name) => page.screenshot({ path: `${OUT}33-${name}-${w}px.png` });

  // boot lands on the fields list (the app is field-only since task 49)
  await page.goto(BASE + "/app/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shot("boot-fields");

  // welcome still reachable through the home control
  await page.click(".topbar-home").catch(() => {});
  await page.waitForTimeout(800);
  await shot("welcome");
  await page.click("details.welcome-more summary").catch(() => {});
  await page.waitForTimeout(300);
  await shot("welcome-more");

  // field mode + emergency sheet open → map tools must step left
  await page.click(".welcome button.primary");
  await page.waitForTimeout(1500);
  await shot("field");
  await page.click(".emerg-link");
  await page.waitForTimeout(800);
  await shot("field-emerg");

  if (errors.length) console.log(`PAGEERRORS ${w}px:`, errors);
  else console.log(`OK ${w}px`);
  await browser.close();
}

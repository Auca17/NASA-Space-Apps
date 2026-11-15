/** Task 33 visual check: welcome rows, topbar home control, live mode
 * world cells, field panel + map-tools collision, emergency sheet.
 * Screenshots to web/screenshots/ at 390 and 1280 px.
 * Usage: node scripts/smoke-shell.mjs [baseUrl] */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:4173";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const liveBody = {
  updated_at: "2026-11-15T03:00:00Z", window_h: 24,
  mode: "cells", sources: ["VIIRS_SNPP_NRT"],
  cells: [
    ["85c2e8bbfffffff", 12], ["85c2e83fffffff", 8],
    ["85c2e93fffffff", 21], ["85c2e8c3fffffff", 5],
  ],
};
const pointBody = {
  updated_at: "2026-11-15T03:00:00Z", window_h: 24,
  mode: "points", sources: ["VIIRS_SNPP_NRT"], country: "AR",
  points: [[-33.55, -60.6, 4.2, "N20", "2026-11-15T01:12:00Z"]],
};

for (const w of [390, 1280]) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: w, height: w === 390 ? 844 : 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/api/**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/live**", (route) => {
    const url = route.request().url();
    const m = url.match(/bbox=([^&]+)/);
    const bbox = m ? m[1].split(",").map(Number) : null;
    const world = bbox && (bbox[2] - bbox[0] >= 350);
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify(world ? liveBody : pointBody) });
  });
  const shot = (name) => page.screenshot({ path: `${OUT}33-${name}-${w}px.png` });

  // welcome
  await page.goto(BASE + "/app/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shot("welcome");
  await page.click("details.welcome-more summary");
  await page.waitForTimeout(300);
  await shot("welcome-more");

  // live mode (world cells)
  await page.click("button:has-text('Ver focos en vivo'), button:has-text('See live hotspots')");
  await page.waitForTimeout(2500);
  await shot("live");

  // field mode + emergency sheet open → map tools must step left
  await page.click("nav button:first-child");
  await page.waitForTimeout(1500);
  await shot("field");
  await page.click(".emerg-link");
  await page.waitForTimeout(800);
  await shot("field-emerg");

  if (errors.length) console.log(`PAGEERRORS ${w}px:`, errors);
  else console.log(`OK ${w}px`);
  await browser.close();
}

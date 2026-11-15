/** Task 38 mobile shell check: compact top bar, bottom tab bar,
 * peekable field chooser, Encuadre control, Más sheet.
 * Real device emulation: iPhone 13 + a 360px Android profile, plus 1280.
 * Screenshots to web/screenshots/38-*.
 * Usage: node scripts/smoke-mobile38.mjs [baseUrl] */
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:4173";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const PROFILES = [
  { name: "iphone13", conf: devices["iPhone 13"] },
  { name: "360", conf: { viewport: { width: 360, height: 760 },
    isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile" } },
  { name: "1280", conf: { viewport: { width: 1280, height: 800 } } },
];

const liveBody = { updated_at: "2026-11-15T03:00:00Z", window_h: 24,
  mode: "cells", sources: ["VIIRS"], country: "AR",
  cells: [["85c2e8bbfffffff", 12], ["85c2e83fffffff", 8]] };

for (const { name, conf } of PROFILES) {
  const browser = await chromium.launch();
  const page = await browser.newPage(conf);
  const tap = (sel) => page.locator(sel).click();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/api/**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/live**", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(liveBody) }));

  const shot = (n) => page.screenshot({ path: `${OUT}38-${n}-${name}.png` });

  await page.goto(BASE + "/app/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  await shot("welcome");

  // "Más" sheet open
  if (await page.locator(".menu-btn").isVisible()) {
    await tap(".menu-btn");
    await page.waitForTimeout(350);
    await shot("menu");
    await tap(".menu-backdrop");
    await page.waitForTimeout(250);
  }

  // field mode: chooser peek (default) then expand via handle
  await page.locator("nav button").first().click();
  await page.waitForTimeout(1600);
  await shot("field-peek");
  await tap(".field-chooser .picker-head button:first-child");
  await page.waitForTimeout(400);
  await shot("field-full");
  // Encuadre popover
  if (await page.locator(".field-frame").isVisible()) {
    await tap(".field-frame summary");
    await page.waitForTimeout(300);
    await shot("frame");
  }

  if (errors.length) console.log(`PAGEERRORS ${name}:`, errors);
  else console.log(`OK ${name}`);
  await browser.close();
}

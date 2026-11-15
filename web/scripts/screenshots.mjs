/** Dev-time screenshot capture (git-ignored output).
 * Usage: node scripts/screenshots.mjs [baseUrl] */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
];

const shots = [];

for (const s of SIZES) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: s.width, height: s.height } });
  const snap = async (name, ms = 1200) => {
    await page.waitForTimeout(ms);
    await page.screenshot({ path: `${OUT}${name}-${s.width}px.png` });
    shots.push(`${name}-${s.width}px.png`);
    console.log("saved", name, s.width);
  };

  // 1. welcome
  await page.goto(BASE + "/app/", { waitUntil: "networkidle" }).catch(() => {});
  await snap("welcome", 800);

  // 2. explore -> globe + panel (reticle + historic controls)
  await page.getByRole("button", { name: /explorar el planeta/i })
    .click().catch(() => {});
  await snap("globe-panel", 2500);

  // 3. historic mode = same view, playback running
  await page.getByRole("button", { name: /reproducir|▶/i })
    .first().click().catch(() => {});
  await snap("historic", 1500);

  // 4. field lens -> demo plot -> diagnosis
  await page.getByRole("button", { name: /analizar mi campo/i })
    .click().catch(() => {});
  await page.getByRole("button", { name: /demo/i })
    .click().catch(() => {});
  await snap("field-diagnosis", 3500);

  // 5. rotations (needs backend; screenshot whatever renders)
  await page.getByRole("button", { name: /comparar rotaciones/i })
    .click().catch(() => {});
  await snap("rotations", 2500);

  await browser.close();
}
console.log("done:", shots.join(", "));

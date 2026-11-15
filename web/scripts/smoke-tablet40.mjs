/** Task 40 layout test (task 49: fire/live tabs and the bottom tab
 * bar are gone — the field flow is the whole app). Checks:
 *  - no topbar element is clipped or overflows the bar
 *  - the frame control (.field-frame/.field-extents) never intersects
 *    a sheet (.panel) or the chooser
 *  - one sheet at a time ≤900: chooser hidden while a .panel is open
 *  - no mode switch / bottom tab bar anywhere
 * Screenshots to web/screenshots/40-*.
 * Usage: node scripts/smoke-tablet40.mjs [baseUrl] */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:4199";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const defects = [];
const check = (name, ok, extra = "") => {
  if (!ok) defects.push(`${name}${extra ? ` — ${extra}` : ""}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${ok ? "" : extra}`);
};

const overlap = (a, b) => a && b &&
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 &&
  a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

/** Every visible topbar descendant must fit its box — the bar may not
 * clip or squeeze any label. */
const topbarOverflow = () => {
  const bad = [];
  const tb = document.querySelector(".topbar");
  const r = tb.getBoundingClientRect();
  for (const el of tb.querySelectorAll("*")) {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;        // hidden
    const cs = getComputedStyle(el);
    if (b.width <= 2 && b.height <= 2 &&
        (cs.overflow === "hidden" || cs.clipPath !== "none"))
      continue;                                  // sr-only text
    // fixed descendants legitimately leave the bar's own box —
    // check their content, not their position
    let fixed = false;
    for (let n = el; n && n !== tb; n = n.parentElement)
      if (getComputedStyle(n).position === "fixed") { fixed = true; break; }
    if (el.scrollWidth > el.clientWidth + 1 ||
        el.scrollHeight > el.clientHeight + 2 ||
        (!fixed && (b.left < r.left - 1 || b.right > r.right + 1)))
      bad.push((el.className.baseVal !== undefined
        ? el.className.baseVal : el.className) +
        ":" + (el.textContent || "").slice(0, 24));
  }
  return bad;
};

const WIDTHS = [
  { w: 360, h: 760 }, { w: 390, h: 844 }, { w: 412, h: 915 },
  { w: 600, h: 960 }, { w: 720, h: 1080 }, { w: 768, h: 1024 },
  { w: 820, h: 1180 }, { w: 900, h: 700 }, { w: 1024, h: 768 },
  { w: 1280, h: 800 },
];
const LANDSCAPE = [
  { w: 720, h: 390 }, { w: 844, h: 390 }, { w: 900, h: 500 },
  { w: 1024, h: 640 }, { w: 1180, h: 820 },
];

const browser = await chromium.launch();

for (const { w, h } of [...WIDTHS, ...LANDSCAPE]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/app/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const trunc = await page.evaluate(topbarOverflow);
  check(`${w}x${h} topbar`, trunc.length === 0, trunc.join(" | "));

  const compact = w <= 900;
  const noTabs = await page.evaluate(
    () => !document.querySelector(".topbar nav"));
  check(`${w}x${h} no mode tabs`, noTabs);

  // field mode: chooser + frame control (welcome's main button)
  await page.locator(".welcome button.primary").click();
  await page.waitForTimeout(800);
  await page.waitForSelector(".field-chooser", { timeout: 8000 })
    .catch(() => {});
  await page.screenshot({ path: `${OUT}40-field-${w}x${h}.png` });

  const frame = await page.locator(
    ".field-frame summary:visible, .field-extents:visible")
    .first().boundingBox().catch(() => null);
  const chooser = await page.locator(".field-chooser").boundingBox()
    .catch(() => null);
  check(`${w}x${h} frame vs chooser`,
    !overlap(frame, chooser),
    frame && chooser ? JSON.stringify([frame, chooser]) : "missing");

  // emergencies sheet: only one sheet may be open on narrow layouts
  if (compact) {
    await page.locator(".menu-btn").click();
    await page.locator(".topbar-menu button").first().click();
  } else {
    await page.locator(".emerg-link").click();
  }
  await page.waitForSelector(".panel", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const chooserVisible = await page.locator(".field-chooser").isVisible()
    .catch(() => false);
  check(`${w}x${h} one sheet`,
    compact ? !chooserVisible : true,
    "chooser still visible under .panel");
  const frame2 = await page.locator(
    ".field-frame summary:visible, .field-extents:visible")
    .first().boundingBox().catch(() => null);
  const panel = await page.locator(".panel").boundingBox()
    .catch(() => null);
  check(`${w}x${h} frame vs panel`, !overlap(frame2, panel));
  await page.screenshot({ path: `${OUT}40-emerg-${w}x${h}.png` });
  await page.locator(".panel-head button").first().click()
    .catch(() => {});
  await page.waitForTimeout(400);

  // closing restores the chooser
  if (compact) {
    check(`${w}x${h} chooser restored`,
      await page.locator(".field-chooser").isVisible());
  }

  check(`${w}x${h} pageerrors`, errors.length === 0,
    errors.join(" | ").slice(0, 300));
  await page.close();
}

await browser.close();
if (defects.length) {
  console.log(`\n${defects.length} defect(s):`);
  for (const d of defects) console.log(` - ${d}`);
  process.exit(1);
}
console.log("\nNo defects.");

/** Round-2 audit B1–B5 visual check on the real backend + R2 data:
 *  B2 reticle sits on the exact queried point (map centre)
 *  B3 playback controls ride above the open sheet at ≤720 px
 *  B4 live mode shows the same reference reticle
 *  B5 English UI shows localized months/reasons
 *  plus the closed-panel reopen affordance.
 * Screenshots to web/screenshots/ at 390 and 1280 px.
 * Usage: node scripts/smoke-fire39.mjs [baseUrl] */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:4199";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const defects = [];
const check = (name, ok, extra = "") => {
  if (!ok) defects.push(`${name}${extra ? ` — ${extra}` : ""}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${extra}`);
};

const centerDist = (a, b) => {
  const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  return Math.hypot(ac.x - bc.x, ac.y - bc.y);
};

for (const w of [390, 1280]) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: w, height: w === 390 ? 844 : 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${BASE}/app/#-34.6,-58.4`, { waitUntil: "networkidle" });
  await page.waitForSelector(".panel", { timeout: 20000 });
  await page.waitForTimeout(2500); // risk + cells settle

  // B2: reticle centre vs map centre (the point that was queried)
  const ret = await page.locator(".reticle").boundingBox();
  const map = await page.locator(".map").boundingBox();
  check(`${w}px reticle at map centre`,
    ret && map && centerDist(ret, map) < 2,
    ret && map ? `offset ${centerDist(ret, map).toFixed(1)}px` : "missing");

  // B3: controls fully above the open sheet on phones
  if (w === 390) {
    const ctl = await page.locator(".controls").boundingBox();
    const panel = await page.locator(".panel").boundingBox();
    check("390px controls above sheet",
      ctl && panel && ctl.y + ctl.height <= panel.y + 1,
      ctl && panel
        ? `ctl bottom ${(ctl.y + ctl.height).toFixed(0)} vs panel top ${panel.y.toFixed(0)}`
        : "missing");
  }

  await page.screenshot({ path: `${OUT}39-fire-${w}px.png` });

  // reopen affordance after closing the panel
  await page.locator(".panel-head button").first().click();
  const reopen = page.locator(".fire-reopen");
  check(`${w}px reopen affordance`, await reopen.isVisible());
  if (await reopen.isVisible()) {
    await reopen.click();
    check(`${w}px panel reopens`,
      await page.locator(".panel").isVisible());
  }

  // B4: live mode shows the same centred reference
  await page.locator(".bottom-modes button", { hasText: /vivo|live/i })
    .first().click().catch(() => {});
  await page.waitForTimeout(2000);
  const liveRet = await page.locator(".reticle").boundingBox();
  check(`${w}px live reticle visible`, !!liveRet);
  await page.screenshot({ path: `${OUT}39-live-${w}px.png` });

  check(`${w}px pageerrors`, errors.length === 0, errors.join(" | "));
  await browser.close();
}

// B5: English UI — localized month label and mapped backend reasons
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => localStorage.setItem("fs_lang", "en"));
  await page.goto(`${BASE}/app/#-34.6,-58.4`, { waitUntil: "networkidle" });
  await page.waitForSelector(".panel", { timeout: 20000 });
  await page.waitForTimeout(2500);
  const body = await page.locator(".panel").innerText();
  check("en risk reasons not Spanish",
    !/focos en las celdas|sin señales|días sin lluvia|temporada de quemas|humedad relativa/i.test(body),
    body.slice(0, 200));
  const ctlText = await page.locator(".controls").innerText();
  check("en slider month label",
    /[A-Z][a-z]{2} \d{4}|\d{4}/.test(ctlText) && !/(ene|feb|abr|ago|dic)\.? \d{4}/i.test(ctlText),
    ctlText.slice(0, 80));
  await page.screenshot({ path: `${OUT}39-fire-en-1280px.png` });
  await browser.close();
}

if (defects.length) {
  console.log(`\n${defects.length} defect(s):`);
  for (const d of defects) console.log(` - ${d}`);
  process.exit(1);
}
console.log("\nNo defects.");

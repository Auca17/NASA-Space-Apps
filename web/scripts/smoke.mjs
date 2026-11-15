/** Smoke test of the integrated app against a vite-preview build backed
 * by the real R2 bucket + a local backend on :8000.
 * Walks every main flow at 390 and 1280 px, saves screenshots under
 * web/screenshots/ and prints a defect report at the end.
 * Usage: node scripts/smoke.mjs [baseUrl] */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:4173";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
];

const defects = [];

for (const s of SIZES) {
  const tag = `${s.width}px`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height }, locale: "es" });
  // dismiss the guided demo tour so it never blocks the panel
  await ctx.addInitScript(
    "localStorage.setItem('ashfield.demoTour.v1','1')");
  const page = await ctx.newPage();

  const errs = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push(`console: ${m.text()}`);
  });
  page.on("requestfailed", (r) =>
    errs.push(`reqfail: ${r.url().slice(0, 140)} ${r.failure()?.errorText}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("favicon"))
      errs.push(`http ${r.status()}: ${r.url().slice(0, 140)}`);
  });

  const snap = async (name, ms = 0) => {
    if (ms) await page.waitForTimeout(ms);
    const file = `${name}-${tag}.png`;
    await page.screenshot({ path: `${OUT}${file}`, fullPage: false });
    return file;
  };
  const flushErrs = (flow, shot) => {
    for (const e of errs.splice(0)) {
      defects.push({ flow, tag, shot, kind: e.split(":")[0], detail: e });
    }
  };
  const note = (flow, severity, what, shot) =>
    defects.push({ flow, tag, shot, kind: severity, detail: what });
  const btn = (re) => page.getByRole("button", { name: re });
  const click = async (re, which = "first") => {
    const b = btn(re)[which]();
    if (await b.count()) { await b.click().catch(() => {}); return true; }
    return false;
  };
  const openDetails = async (summaryRe) => {
    const sm = page.locator("summary", { hasText: summaryRe }).first();
    if (await sm.count()) { await sm.click().catch(() => {}); return true; }
    return false;
  };
  /* on compact widths the field chooser is a peekable sheet: expand
   * it before touching the option details, which peek hides. */
  const expandChooser = async () => {
    const h = page.locator(
      ".picker-head button[aria-expanded='false']").first();
    if (await h.count()) await h.click().catch(() => {});
    await page.waitForTimeout(400);
  };
  /* the app boots into the fields list; the chooser opens through
   * "Agregar campo" → "Buscar". */
  const openChooser = async () => {
    await page.locator("summary",
      { hasText: /Agregar campo|Add field/i }).first()
      .click().catch(() => {});
    await page.getByRole("button", { name: /^Buscar$|^Search$/i })
      .first().click().catch(() => {});
    await page.waitForTimeout(600);
    await expandChooser();
  };

  /* 1 ---------------------------------- boot: fields list + map ---- */
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const wShot = await snap("boot-fields", 800);
  if (await page.locator(".map").count() === 0)
    note("boot", "high", "no .map element on boot", wShot);
  if (await page.locator(".controls.fields").count() === 0)
    note("boot", "high", "fields list not shown on boot", wShot);
  flushErrs("boot", wShot);

  /* 2 ------------- #lat,lon deep link stays in the field flow ------ */
  await page.goto(`${BASE}#-27.95,-56.95`,
    { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const cShot = await snap("corrientes");
  if (await page.locator(".map").count() === 0)
    note("deeplink", "high", "#lat,lon lost the map", cShot);
  flushErrs("deeplink", cShot);

  /* 5 ------------------------------ field lens: #demo example ----- */
  await page.goto(`${BASE}#demo`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".parcel-badge, [role='tab']",
    { timeout: 60000 }).catch(() => {});
  // the detailed diagnosis loads lazily inside "Más información"
  await page.locator("#tab-mas").first().click().catch(() => {});
  await page.waitForSelector(".dtile, .diag-grid, .strategy",
    { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const dShot = await snap("field-diagnosis");
  if (!await page.locator(".dtile, .card").first().count())
    note("field", "high", "diagnosis rendered no cards", dShot);
  flushErrs("field-diagnosis", dShot);

  // Orin validation card (part of the same panel)
  const oShot = await snap("orin-card", 500);
  if (!await page.locator("[class*='orin']").count())
    note("orin", "medium", "Orin card not found in the panel", oShot);

  // scenario sliders
  const sliders = page.locator('input[type="range"]');
  const nSliders = await sliders.count();
  if (nSliders) {
    for (let i = 0; i < nSliders; i++) {
      await sliders.nth(i).evaluate((el) => {
        const inp = el;
        inp.value = String((Number(inp.min) + Number(inp.max)) / 2);
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }).catch(() => {});
    }
    await page.waitForTimeout(3500);
  }
  const scShot = await snap("field-scenario");
  if (!nSliders)
    note("field", "medium", "no scenario sliders found", scShot);
  flushErrs("field-scenario", scShot);

  // rotations: open form, then run
  await click(/Comparar rotaciones/i);
  await page.waitForTimeout(800);
  await snap("rotations-form");
  await click(/Comparar rotaciones/i, "last");
  await page.waitForSelector(".strategy", { timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  const rShot = await snap("field-rotations");
  const nStrat = await page.locator(".strategy").count();
  if (nStrat !== 4)
    note("rotations", "medium", `${nStrat} .strategy cards (expected 4)`,
         rShot);
  flushErrs("field-rotations", rShot);

  // the five sections of a strategy + panel details
  const summaries = page.locator("details > summary");
  const nDet = await summaries.count();
  for (let i = 0; i < nDet; i++) {
    await summaries.nth(i).click().catch(() => {});
    await page.waitForTimeout(120);
  }
  const secShot = await snap("field-sections");
  note("sections", "info", `${nDet} collapsible sections`, secShot);
  flushErrs("field-sections", secShot);

  // methods panel
  await click(/Datos y m[eé]todos/i);
  await page.waitForTimeout(1200);
  const mShot = await snap("methods");
  flushErrs("methods", mShot);
  await page.keyboard.press("Escape").catch(() => {});
  await click(/Cerrar|✕/i);

  /* 6 ----------------------------- Chucky field selection ------------ */
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await openChooser();
  await page.waitForTimeout(1000);
  await snap("field-chooser");

  // place finder
  const search = page.locator(
    'input[placeholder*="Localidad"], input[type="search"]').first();
  if (await search.count()) {
    await search.fill("Chacabuco").catch(() => {});
    await click(/^Buscar$/i);
    await page.waitForTimeout(3000);
  }
  const pShot = await snap("place-finder");
  if (!await search.count())
    note("field-select", "medium", "no place-finder input", pShot);
  // click first result if any
  const res = page.locator(
    '[role="option"], .place-result, .results li, .results button').first();
  if (await res.count()) {
    await res.click().catch(() => {});
    await page.waitForTimeout(2000);
  } else {
    note("place-finder", "low", "no search results for 'Chacabuco'", pShot);
  }
  const pShot2 = await snap("place-finder-result");
  flushErrs("place-finder", pShot2);

  // freehand: open "Otras formas de marcar" then pick free draw
  await expandChooser();
  await openDetails(/Otras formas de marcar/);
  await page.waitForTimeout(400);
  await click(/mano alzada/i);
  await page.waitForTimeout(600);
  const map = page.locator(".map").first();
  if (await map.count()) {
    const box = await map.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      const r = Math.min(box.width, box.height) / 6;
      await page.mouse.move(cx - r, cy - r);
      await page.mouse.down();
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a),
          { steps: 2 });
      }
      await page.mouse.up();
      await page.waitForTimeout(2500);
    }
  }
  const fShot = await snap("freehand-review");
  flushErrs("freehand", fShot);

  // selection review -> confirm
  await click(/Analizar este terreno|Confirmar/i);
  await page.waitForTimeout(1500);
  const rvShot = await snap("selection-review");
  flushErrs("review", rvShot);

  // fields list (the boot sheet)
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const fpShot = await snap("fields-panel");
  if (await page.locator(".controls.fields").count() === 0)
    note("fields-panel", "medium", "fields list not visible", fpShot);
  flushErrs("fields-panel", fpShot);

  // zones (split)
  await click(/Zonas de cultivo/i);
  await page.waitForTimeout(1000);
  const spShot = await snap("split-zones");
  flushErrs("split", spShot);

  await browser.close();
}

console.log("\n=== DEFECTS ===");
if (!defects.length) console.log("none");
for (const d of defects)
  console.log(`[${d.kind}] ${d.flow} @${d.tag} (${d.shot}) — ${d.detail}`);

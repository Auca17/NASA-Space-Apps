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

  /* 1 ---------------------------------------------------- welcome ---- */
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const wShot = await snap("welcome", 800);
  if (await page.locator(".map").count() === 0)
    note("welcome", "high", "no .map element on welcome", wShot);
  flushErrs("welcome", wShot);

  /* 2 --------------------------------------------- Corrientes panel -- */
  await page.goto(`${BASE}/?r2=1#-27.95,-56.95`,
    { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const cShot = await snap("corrientes");
  flushErrs("corrientes", cShot);

  /* 3 ------------------------------------------------ historic player - */
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await click(/Abrir el mapa de fuego|Fuego/i);
  await page.waitForTimeout(2500);
  const play = page.locator(
    'button[aria-label*="eproduc"], button:has-text("▶")').first();
  if (await play.count()) await play.click().catch(() => {});
  await page.waitForTimeout(2500);
  const hShot = await snap("historic");
  flushErrs("historic", hShot);

  /* 4 ------------------------------------------------------ live mode - */
  await click(/^En vivo$/i);
  await page.waitForTimeout(4000);
  const lShot = await snap("live");
  flushErrs("live", lShot);

  /* 5 --------------------------------- field lens: example farm ----- */
  await click(/^Analizar mi campo$/i);
  await page.waitForTimeout(1500);
  // expand the examples disclosure, then open the example farm
  await openDetails(/Probar con un ejemplo/);
  await page.waitForTimeout(400);
  const demoClicked = await click(/Abrir el ejemplo: finca en Mendoza/i);
  await page.waitForSelector(".dtile, .diag-grid, .strategy",
    { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const dShot = await snap("field-diagnosis");
  if (!demoClicked)
    note("field", "high", "demo button not clickable (chooser state?)",
         dShot);
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
  await click(/^Analizar mi campo$/i);
  await page.waitForTimeout(1500);
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

  // fields panel
  await click(/^Analizar mi campo$/i);
  await page.waitForTimeout(800);
  await click(/Mis campos/i);
  await page.waitForTimeout(1200);
  const fpShot = await snap("fields-panel");
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

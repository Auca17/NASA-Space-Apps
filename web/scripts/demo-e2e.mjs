/** Task 52 end-to-end: the two guided demo farms.
 * For each farm (pampa via #demo-pampa and the #demo alias, mendoza
 * via #demo-mendoza) at 390px and 1280px, in a fresh context AND a
 * localStorage-polluted one: the saved real capture renders (labelled
 * with its date), the DEMO banner + ribbon show, parcels + badges
 * appear, the Rotaciones tab works (four cards with their sections on
 * pampa; the perennials note on mendoza), and the tour runs (7 steps
 * pampa / 5 mendoza) and dismisses for the session. ?rec=1 hides the
 * tour, the "Otros ejemplos" control and the language button.
 * Screenshots: screenshots/52-*.
 * Usage: node scripts/demo-e2e.mjs [base-url] */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5420";
const OUT = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const fails = [];
const ok = (cond, label) => {
  console.log(cond ? "PASS" : "FAIL", label);
  if (!cond) fails.push(label);
};

const FARMS = {
  pampa: {
    hash: "#demo-pampa", name: "Estancia La Aurora",
    parcels: ["Lote Soja", "El Maizal", "El Trigal"],
    tourSteps: 7, rotCards: 4,
  },
  mendoza: {
    hash: "#demo-mendoza", name: "Finca Los Álamos",
    parcels: ["La Vid", "Los Olivos", "El Ajal"],
    tourSteps: 5, rotCards: null, // perennials note instead
  },
};

const browser = await chromium.launch();

/** Polluted localStorage: a rival profile/econ + saved plots must not
 * change the demo at all. */
const SEED = `
  localStorage.setItem("fs_parcel_profile", JSON.stringify({
    order: ["snow","flood","heat","hail","fire","drought","frost","enso"],
    hidden: ["fire"] }));
  localStorage.setItem("fs_parcel_econ", JSON.stringify({
    currency: "ARS",
    parcels: { soja: { cost_per_ha: 1, price_per_t: 1,
                       expected_yield_t_ha: 1 } } }));
  localStorage.setItem("fs_plots", JSON.stringify(
    [{ name: "polluted", body: {} }]));
`;

async function run(id, width, height, tag, stale) {
  const farm = FARMS[id];
  const ctx = await browser.newContext({ viewport: { width, height } });
  if (stale) await ctx.addInitScript(SEED);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error")
      console.log(`  console.error[${tag}]:`, m.text().slice(0, 160));
  });
  const label = `${id}-${tag}${stale ? "-stale" : ""}`;
  const snap = (n) =>
    page.screenshot({ path: `${OUT}52-${id}-${n}-${tag}.png` });

  await page.goto(`${BASE}/app/${farm.hash}&notour`,
                  { waitUntil: "networkidle" });

  // farm scope + DEMO banner + disclaimer + saved-result label
  const scope = page.locator(".analysis-scope");
  await scope.waitFor({ timeout: 30000 });
  ok((await scope.textContent() ?? "").includes(farm.name),
     `${label} scope says ${farm.name}`);
  ok(await page.locator(".demo-banner").isVisible(),
     `${label} DEMO banner`);
  ok(await page.locator(".demo-ribbon").isVisible(),
     `${label} DEMO ribbon`);
  ok((await page.locator(".demo-note").textContent() ?? "")
     .includes("demo"), `${label} disclaimer note`);

  // the saved capture renders instantly — no 15s wait
  await page.waitForSelector(".parcel-res-row", { timeout: 20000 });
  const names = await page.locator(".parcel-res-row .parcel-name")
    .allTextContents();
  for (const n of farm.parcels) {
    ok(names.some((x) => x.includes(n)), `${label} parcel row "${n}"`);
  }
  ok(names.length === 3, `${label} exactly 3 parcel rows`);
  const notices = await page.locator(".notice").allTextContents();
  ok(notices.some((s) => /guardado del/i.test(s)),
     `${label} saved-result label`);
  const badges = await page.locator(".parcel-badge").count();
  ok(badges >= 3, `${label} map badges (${badges})`);

  // Rotaciones tab
  await page.getByRole("tab", { name: /rotaciones|rotations/i }).click();
  await page.waitForTimeout(600);
  if (farm.rotCards) {
    // scope to the tab: the hidden recommendations section renders
    // the same cards again
    const cards = await page.locator(
      ".rotaciones article.card.strategy").count();
    ok(cards === farm.rotCards,
       `${label} ${farm.rotCards} rotation cards (got ${cards})`);
    // five sections live inside the cards (why/evidence/benefits/
    // gaps/risks render as details.sec)
    const secs = await page.locator(
      ".rotaciones article.card.strategy details.sec").count();
    ok(secs >= farm.rotCards * 3,
       `${label} card sections (${secs})`);
    ok(await page.getByText(/estimada|estimated/i).first()
       .isVisible().catch(() => false),
       `${label} inferred current rotation line`);
    await snap("rotaciones");
  } else {
    ok(await page.getByText(/anuales|annual/i).first()
       .isVisible().catch(() => false),
       `${label} perennials note`);
  }

  // "Más información" tab works
  await page.getByRole("tab", { name: /más información|more/i }).click();
  await page.waitForTimeout(600);
  await snap("mas");

  await snap("map");
  await ctx.close();
}

async function tourRun(id, tag) {
  const farm = FARMS[id];
  const ctx = await browser.newContext(
    { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/${farm.hash}`,
                  { waitUntil: "networkidle" });
  await page.waitForSelector(".parcel-res-row", { timeout: 30000 });
  const hint = page.locator(".tour-hint");
  await hint.waitFor({ timeout: 15000 }).catch(() => {});
  ok(await hint.isVisible(), `${id}-${tag} tour step 1`);
  await page.screenshot({ path: `${OUT}52-${id}-tour-1280.png` });
  for (let i = 0; i < farm.tourSteps - 1 && await hint.isVisible(); i++) {
    await page.getByRole("button", { name: /siguiente|next/i }).click();
    await page.waitForTimeout(250);
  }
  ok(await page.getByRole("button", { name: /listo|done/i })
       .isVisible(), `${id}-${tag} tour last step`);
  await page.getByRole("button", { name: /listo|done/i }).click();
  ok(!(await hint.isVisible()), `${id}-${tag} tour dismissed`);
  ok(await page.evaluate(
    () => globalThis.sessionStorage.getItem("ashfield.demoTour.v1")) === "1",
    `${id}-${tag} dismissal saved in session`);

  // "Otros ejemplos" switches farms without a reload — wait until the
  // scope actually changes (the old rows match .parcel-res-row too)
  const other = id === "pampa" ? "mendoza" : "pampa";
  await page.locator('[data-tour="demo-other"]').click();
  const switched = await page.waitForFunction(
    (n) => document.querySelector(".analysis-scope")
      ?.textContent?.includes(n) ?? false,
    FARMS[other].name, { timeout: 15000 })
    .then(() => true).catch(() => false);
  ok(switched, `${id}-${tag} Otros ejemplos -> ${FARMS[other].name}`);

  // same session: tour stays dismissed on the second farm
  await page.waitForTimeout(1200);
  ok(!(await hint.isVisible()),
     `${id}-${tag} tour stays dismissed this session`);
  await ctx.close();
}

async function recRun() {
  const ctx = await browser.newContext(
    { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/?rec=1#demo-pampa`,
                  { waitUntil: "networkidle" });
  await page.waitForSelector(".parcel-res-row", { timeout: 30000 });
  await page.waitForTimeout(1500);
  ok(await page.locator(".demo-banner").isVisible(), "rec banner kept");
  ok(!(await page.locator(".tour-hint").isVisible()), "rec hides tour");
  ok(!(await page.locator(".lang-btn").isVisible()),
     "rec hides language button");
  ok(!(await page.locator('[data-tour="demo-other"]').isVisible()
       .catch(() => false)), "rec hides Otros ejemplos");
  await page.screenshot({ path: `${OUT}52-pampa-rec-1280.png` });
  await ctx.close();
}

async function aliasRun() {
  const ctx = await browser.newContext(
    { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  for (const hash of ["#demo", "#demo-cualquiera"]) {
    await page.goto(`${BASE}/app/${hash}&notour`,
                    { waitUntil: "networkidle" });
    await page.waitForSelector(".parcel-res-row", { timeout: 30000 });
    ok((await page.locator(".analysis-scope").textContent() ?? "")
       .includes("Estancia La Aurora"),
       `${hash} -> pampa farm`);
  }
  await ctx.close();
}

for (const id of ["pampa", "mendoza"]) {
  await run(id, 390, 844, "390", false);
  await run(id, 1280, 800, "1280", false);
  await run(id, 1280, 800, "1280", true);
  await tourRun(id, "1280");
}
await aliasRun();
await recRun();

// the 1920 screenshot for the brief
{
  const ctx = await browser.newContext(
    { viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/#demo-pampa&notour`,
                  { waitUntil: "networkidle" });
  await page.waitForSelector(".parcel-res-row", { timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}52-pampa-map-1920.png` });
  await page.goto(`${BASE}/app/#demo-mendoza&notour`,
                  { waitUntil: "networkidle" });
  await page.waitForSelector(".parcel-res-row", { timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}52-mendoza-map-1920.png` });
  await ctx.close();
}

await browser.close();
console.log(fails.length ? `FAILURES: ${fails.join(" | ")}` : "ALL PASS");
process.exit(fails.length ? 1 : 0);

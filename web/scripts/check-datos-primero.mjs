// Manual check for the "datos primero" branch: demo + nearby analysis,
// screenshots of each tab and the test alert e-mail.
// usage: node scripts/check-datos-primero.mjs <outdir>
import { chromium } from "playwright";
const out = process.argv[2] ?? ".";
const BASE = process.env.APP ?? "http://localhost:5173/app/";
const browser = await chromium.launch();
const log = (...a) => console.log(...a);

async function run(name, url, ctxOpts, startFn) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...ctxOpts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await startFn(page);
  const panel = page.locator(".field-analysis-results").first();
  await panel.waitFor({ state: "visible", timeout: 30000 });
  const recsPressed = await page.getByRole("button", { name: "Recomendaciones" }).getAttribute("aria-pressed");
  log(`[${name}] opens on Recomendaciones:`, recsPressed);
  // rotations appear by themselves (or the crop list, when rotations do not apply)
  const rot = page.locator('[data-tour="rotations"]');
  try { await rot.waitFor({ state: "visible", timeout: 45000 }); log(`[${name}] rotations shown automatically`); }
  catch { log(`[${name}] rotations NOT shown;`, (await page.locator(".rot-auto").allInnerTexts()).join(" | ").slice(0, 300)); }
  await page.waitForTimeout(1500);
  const order = await page.evaluate(() => {
    const box = [...document.querySelectorAll(".field-analysis-results > div")].find((d) => !d.hidden && d.querySelector("h3,h4,h2"));
    return box ? [...box.querySelectorAll("h3,h4")].map((h) => h.textContent.trim()).filter(Boolean).slice(0, 8) : [];
  });
  log(`[${name}] recommendations headings in order:`, order);
  const why = await page.locator('[data-tour="rotations"] .strategy, [data-tour="rotations"] article').allInnerTexts().catch(() => []);
  if (why.length) log(`[${name}] first strategy card:`, why.slice(0, 2).map((w) => w.replace(/\s+/g, " ").slice(0, 400)));
  await page.screenshot({ path: `${out}/${name}-1-recomendaciones.png`, fullPage: false });
  await panel.screenshot({ path: `${out}/${name}-1-recomendaciones-panel.png` }).catch(() => {});

  await page.getByRole("button", { name: "Ver detalles del campo" }).click();
  await page.locator('[data-tour="land"]').waitFor({ state: "visible", timeout: 45000 });
  const det = await page.evaluate(() => {
    const box = [...document.querySelectorAll(".field-analysis-results > div")].find((d) => !d.hidden && d.querySelector('[data-tour="land"]'));
    return [...box.querySelectorAll("h3,h4,summary")].map((h) => h.textContent.trim()).filter(Boolean).slice(0, 14);
  });
  log(`[${name}] details headings in order:`, det);
  const forms = await page.evaluate(() => ({
    needs: !!document.body.textContent.includes("Antes de analizar"),
    prioridades: !![...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes("Mis prioridades")),
    numeros: document.body.textContent.includes("Mis números"),
  }));
  log(`[${name}] leftover forms:`, forms);
  await panel.screenshot({ path: `${out}/${name}-2-detalles-panel.png` }).catch(() => {});

  const send = page.getByRole("button", { name: "Mandarme un mail de prueba" });
  if (await send.count()) {
    await page.getByLabel("Tu mail").fill("prueba@example.com");
    await send.click();
    const st = page.locator(".alert-signup [role=status]");
    await page.waitForFunction(() => document.querySelector(".alert-signup [role=status]")?.textContent?.length > 10, null, { timeout: 20000 });
    log(`[${name}] alert result:\n` + (await st.innerText()).slice(0, 1200));
    const cookie = (await ctx.cookies()).find((c) => c.name === "ashfield_email");
    log(`[${name}] cookie saved:`, cookie ? decodeURIComponent(cookie.value) : null);
    await page.locator(".alert-signup").screenshot({ path: `${out}/${name}-3-aviso.png` });
  } else log(`[${name}] alert card not shown`);
  log(`[${name}] page errors:`, errors.filter((e) => !/Failed to load resource|503|live/.test(e)).slice(0, 5));
  await ctx.close();
}

if (!process.env.SKIP_DEMO) await run("demo", BASE + "#demo", {}, async () => {});
await run("pergamino", BASE, {
  geolocation: { latitude: -33.89, longitude: -60.57, accuracy: 30 }, permissions: ["geolocation"],
}, async (page) => {
  const near = page.getByRole("button", { name: "Analizar alrededor" });
  await near.waitFor({ timeout: 15000 });
  await near.click();
});
await browser.close();

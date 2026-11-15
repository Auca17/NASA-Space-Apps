import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

const render = async (lang: string) => {
  cleanup();
  vi.resetModules();
  document.documentElement.lang = lang;
  document.body.innerHTML = '<div id="root"></div>';
  await import("./main");
};

describe("landing page", () => {
  beforeEach(() => { cleanup(); });

  it("renders a skip link targeting #main", async () => {
    await render("en");
    const skip = document.querySelector("a.skip");
    expect(skip?.getAttribute("href")).toBe("#main");
    expect(document.getElementById("main")).toBeTruthy();
  });

  it("renders exactly one h1", async () => {
    await render("en");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });

  it("language switch points EN page to /es/ and ES page to /", async () => {
    await render("en");
    let sw = document.querySelector(".lang-switch");
    expect(sw?.getAttribute("href")).toBe("/es/");
    expect(sw?.getAttribute("hreflang")).toBe("es");

    await render("es");
    sw = document.querySelector(".lang-switch");
    expect(sw?.getAttribute("href")).toBe("/");
    expect(sw?.getAttribute("hreflang")).toBe("en");
  });

  it("open-the-app buttons point to /app/", async () => {
    await render("en");
    const links = [...document.querySelectorAll('a[href="/app/"]')];
    expect(links.length).toBeGreaterThanOrEqual(2);
  });

  it("status labels are word-first (visible text next to icon)", async () => {
    await render("es");
    const statuses = [...document.querySelectorAll(".status")];
    expect(statuses.length).toBeGreaterThan(10);
    for (const s of statuses) {
      expect(s.textContent?.trim().length).toBeGreaterThan(2);
    }
  });

  it("images carry width, height and alt", async () => {
    await render("en");
    for (const img of document.querySelectorAll("main img")) {
      expect(img.getAttribute("width")).toBeTruthy();
      expect(img.getAttribute("height")).toBeTruthy();
      expect(img.getAttribute("alt")).toBeTruthy();
    }
  });

  it("the requirement table lives behind the collapsible brief section", async () => {
    await render("en");
    const det = document.querySelector("details.brief-details");
    expect(det).toBeTruthy();
    expect(det!.querySelector("summary")).toBeTruthy();
    expect(det!.querySelectorAll(".req-table").length).toBe(1);
    expect(det!.hasAttribute("open")).toBe(false);
  });

  it("the collapsed summary exposes a status scoreline before opening", async () => {
    await render("en");
    const score = document.querySelector("details.brief-details .summary-score");
    expect(score?.textContent).toMatch(/Field Shift: \d+ done · \d+ partial/);
    await render("es");
    const scoreEs = document.querySelector("details.brief-details .summary-score");
    expect(scoreEs?.textContent).toMatch(/hecho/i);
  });

  it("the brief details is deep-linkable via #brief", async () => {
    await render("en");
    const det = document.querySelector("details.brief-details");
    expect(det?.id).toBe("brief");
    location.hash = "#brief";
    await render("en");
    expect(document.querySelector("details.brief-details")?.hasAttribute("open")).toBe(true);
    location.hash = "";
  });

  it("requirement groups label their sections with matching ids", async () => {
    await render("en");
    for (const sec of document.querySelectorAll(".req-group")) {
      const id = sec.getAttribute("aria-labelledby");
      expect(sec.querySelector(`#${id}`)).toBeTruthy();
    }
  });

  it("hero image asks for high fetch priority", async () => {
    await render("en");
    const img = document.querySelector(".hero-shot img");
    expect(img?.getAttribute("fetchpriority")).toBe("high");
  });

  it("pending markers are localized, never hardcoded Spanish", async () => {
    await render("en");
    const en = [...document.querySelectorAll(".pend-tag")].map((t) => t.textContent);
    expect(en.every((t) => t === "[PENDING]")).toBe(true);
    await render("es");
    const es = [...document.querySelectorAll(".pend-tag")].map((t) => t.textContent);
    expect(es.every((t) => t === "[PENDIENTE]")).toBe(true);
  });

  it("hero offers exactly one primary and one example action", async () => {
    await render("es");
    const cta = document.querySelector(".hero-cta");
    expect(cta?.querySelectorAll("a.btn-primary").length).toBe(1);
    const ex = cta?.querySelector('a[href^="/app/#"]');
    expect(ex?.textContent).toContain("ejemplo");
  });

  it("shows at most three overview blocks", async () => {
    await render("en");
    expect(document.querySelectorAll(".blocks .block").length).toBeLessThanOrEqual(3);
  });
});

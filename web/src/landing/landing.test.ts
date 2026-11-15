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
});

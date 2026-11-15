import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { CONTENT, type Landing, type ReqRow } from "./content";

const WEB = resolve(import.meta.dirname, "../..");
const PUBLIC_ROUTES = ["/", "/es/", "/app/"];
const STATUSES = new Set(["done", "partial", "not-included"]);

const allRows = (l: Landing): ReqRow[] =>
  l.brief.groups.flatMap((g) => g.rows);

const allHrefs = (l: Landing): { href: string; pending?: boolean }[] => [
  ...allRows(l).flatMap((r) => (r.see ? [{ href: r.see.href }] : [])),
  ...l.team.links.map((l2) => ({ href: l2.href, pending: l2.pending })),
];

describe("landing content", () => {
  it("both languages expose the same key paths", () => {
    // compare structure by shape, not array identity: re-key arrays by index
    const shape = (o: unknown): unknown => {
      if (Array.isArray(o)) return o.map(shape);
      if (o && typeof o === "object") {
        return Object.fromEntries(
          Object.entries(o as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, shape(v)]));
      }
      return typeof o;
    };
    expect(shape(CONTENT.en)).toEqual(shape(CONTENT.es));
  });

  it("requirement ids and statuses match across languages", () => {
    const en = allRows(CONTENT.en);
    const es = allRows(CONTENT.es);
    expect(en.length).toBe(es.length);
    en.forEach((r, i) => {
      expect(es[i].id).toBe(r.id);
      expect(es[i].status).toBe(r.status);
      expect(STATUSES.has(r.status)).toBe(true);
    });
  });

  it("every status label is word-first text, not icon-only", () => {
    for (const l of [CONTENT.en, CONTENT.es]) {
      for (const s of STATUSES) {
        expect(l.brief.statusLabel[s as ReqRow["status"]].length).toBeGreaterThan(2);
      }
    }
  });

  it("every link target exists (route, public asset, or https)", () => {
    for (const l of [CONTENT.en, CONTENT.es]) {
      for (const { href, pending } of allHrefs(l)) {
        if (pending) continue;
        if (href.startsWith("https://")) continue;
        const clean = href.split("#")[0];
        expect(PUBLIC_ROUTES.includes(clean) ||
          existsSync(resolve(PUBLIC, clean.slice(1)))).toBe(true);
      }
    }
  });

  it("pending links carry the pending marker, never a fake URL", () => {
    for (const l of [CONTENT.en, CONTENT.es]) {
      for (const link of l.team.links.filter((x) => x.pending)) {
        expect(link.href).toBe("#");
      }
    }
  });

  it("no [PENDIENTE] text inside visible link labels", () => {
    for (const l of [CONTENT.en, CONTENT.es]) {
      for (const link of l.team.links) {
        expect(link.label).not.toMatch(/PENDIENTE/);
      }
    }
  });

  it("image assets referenced by content exist in public/", () => {
    for (const l of [CONTENT.en, CONTENT.es]) {
      for (const img of [l.proof.img, l.trust.orinImg]) {
        expect(existsSync(resolve(PUBLIC, img.src.slice(1)))).toBe(true);
        expect(img.width).toBeGreaterThan(0);
        expect(img.height).toBeGreaterThan(0);
        expect(img.alt.length).toBeGreaterThan(20);
      }
    }
  });
});

const PUBLIC = resolve(WEB, "public");

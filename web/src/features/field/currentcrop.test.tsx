import { describe, it, expect, vi, afterEach } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { CurrentCropPanel } from "./CurrentCrop";
import { useAutoCropSplit } from "./autoCropSplit";
import { squareRing } from "../../domain/selection";
import type { Field } from "../../domain/fields";

const square = [[-60.70, -33.97], [-60.68, -33.97], [-60.68, -33.95],
                [-60.70, -33.95], [-60.70, -33.97]];
const json = (b: unknown) => new Response(JSON.stringify(b));
const now = (zones: unknown[]) => json({ status: zones.length ? "available" : "no_detail",
  source: "Sentinel-2", resolution_m: 20, season: "2026-2027", as_of: "2026-11-08", zones });
const wheat = { class: { id: "winter_cereal", es: "Trigo o cebada (en pie o recién cosechado)",
  en: "Wheat or barley", short_es: "Trigo/cebada", short_en: "Wheat/barley" },
  kind: "crop", ha: 80, share: 0.6, geometry: { type: "Polygon", coordinates: [square] } };
const fallow = { ...wheat, class: { ...wheat.class, id: "fallow", es: "Barbecho, listo para la siembra de verano",
  short_es: "Barbecho" }, kind: "fallow", ha: 40, share: 0.3 };

afterEach(() => vi.unstubAllGlobals());

describe("CurrentCropPanel", () => {
  it("says what is on the field now, with the image date", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => now([wheat, fallow])));
    render(<I18nProvider><CurrentCropPanel geom={[[squareRing(-34, -60.1, 400)]]} />
           </I18nProvider>);
    expect(await screen.findByText(/Trigo o cebada/)).toBeInTheDocument();
    expect(screen.getByText(/Barbecho, listo/)).toBeInTheDocument();
    expect(screen.getByText(/8 nov 2026/)).toBeInTheDocument();
    expect(screen.getByText(/campaña 2026-2027/i)).toBeInTheDocument();
  });
});

describe("useAutoCropSplit with the current season", () => {
  const ring = squareRing(-33.96, -60.69, 500);
  const f = (id: string): Field => ({ id, name: id, geom: [[ring]], zones: [], createdAt: "" });

  it("prefers what is on the field now over last campaign's map", async () => {
    const fetch = vi.fn(async (url: string) => String(url).includes("current-crop")
      ? now([wheat, fallow]) : json({ status: "available", zones: [] }));
    vi.stubGlobal("fetch", fetch);
    const apply = vi.fn();
    renderHook(() => useAutoCropSplit([f("now1")], "es", apply));
    await vi.waitFor(() => expect(apply).toHaveBeenCalled());
    const [, zones, result] = apply.mock.calls[0];
    expect(result).toBe("done");
    expect(zones.map((z: { crop: string }) => z.crop)).toEqual(["Trigo/cebada", "Barbecho"]);
    expect(fetch.mock.calls.some(([u]) => String(u).includes("crop-zones"))).toBe(false);
  });
});

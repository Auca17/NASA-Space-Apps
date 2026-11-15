import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { DetectedCrop, cropLine } from "./DetectedCrop";
import { squareRing } from "../../domain/selection";
import type { CropDetection, CropSeason } from "../../api/types";

const season = (s: Partial<CropSeason>): CropSeason => ({
  season: "summer", campaign: "2024-2025", status: "crop", crop: null,
  share: null, coverage: null, ...s });
const result = (seasons: CropSeason[]): CropDetection => ({
  source: "INTA · Mapa Nacional de Cultivos", source_url: "https://x",
  resolution_m: 30, seasons });

afterEach(() => vi.unstubAllGlobals());

describe("cropLine", () => {
  it("names the crop, its share and the campaign", () => {
    const es = cropLine(season({ crop: { id: "soy", es: "Soja", en: "Soybean" },
                                 share: .74 }), "es");
    expect(es.crop).toBe("Soja");
    expect(es.detail).toMatch(/^74\s%\sde la parcela · Verano 2024-2025$/);
    expect(cropLine(season({ season: "winter", campaign: "2024",
                               crop: { id: "winter_cereals", es: "Cereales de invierno",
                                       en: "Winter cereals" }, share: 1 }), "en"))
      .toEqual({ crop: "Winter cereals", detail: "100% of the parcel · Winter 2024" });
  });
  it("says why there is no crop", () => {
    expect(cropLine(season({ status: "no_coverage" }), "es").crop)
      .toBe("sin identificar");
    expect(cropLine(season({ status: "non_agricultural", share: .9 }), "es").crop)
      .toBe("sin cultivo (no agrícola)");
    expect(cropLine(season({ status: "fallow", share: .8 }), "es").crop)
      .toBe("barbecho");
    expect(cropLine(season({ status: "unavailable" }), "es").crop)
      .toBe("sin identificar");
  });
});

describe("DetectedCrop", () => {
  // a different parcel per test: answers are cached per geometry
  let lon = -60.69;
  const wrap = () => {
    lon += .05;
    const geom = [[squareRing(-33.96, lon, 500)]];
    return render(<I18nProvider><DetectedCrop geom={geom} /></I18nProvider>);
  };

  it("shows the detected crop with source and campaign, no input needed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(result([
      season({ crop: { id: "soy", es: "Soja", en: "Soybean" }, share: .74 }),
      season({ season: "winter", campaign: "2024", status: "non_agricultural", share: 1 }),
    ])))));
    wrap();
    expect(await screen.findByText("Soja")).toBeInTheDocument();
    expect(screen.getByText(/Verano 2024-2025/)).toBeInTheDocument();
    expect(screen.getByText(/INTA · Mapa Nacional de Cultivos/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("falls back to «sin identificar» when there is no coverage", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(result([
      season({ status: "no_coverage" }),
      season({ season: "winter", campaign: "2024", status: "no_coverage" }),
    ])))));
    wrap();
    expect(await screen.findByText(/sin identificar/i)).toBeInTheDocument();
    expect(screen.getByText(/fuera de la cobertura/i)).toBeInTheDocument();
  });

  it("falls back to «sin identificar» when the service fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    wrap();
    expect(await screen.findByText(/sin identificar/i)).toBeInTheDocument();
  });
});

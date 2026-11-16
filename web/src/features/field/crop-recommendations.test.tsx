import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { CurrentCrop, DiagnoseResponse } from "../../api/types";
import { I18nProvider } from "../../i18n";

const recommend = vi.fn();
vi.mock("../../api", () => ({ apiCropRecommendations: (...args: unknown[]) => recommend(...args) }));
const { CropRecommendations } = await import("./CropRecommendations");

const props = {
  diagnosis: { zone: "pampa_humeda", cards: [] } as unknown as DiagnoseResponse,
  crops: [], resources: {}, onResources: vi.fn(),
};
const imagery = (id: string, share: number): CurrentCrop => ({
  status: "available", source: "Sentinel-2", resolution_m: 20, season: "2026-2027",
  as_of: "2026-11-08", zones: [{
    kind: "crop", ha: 8, share, class: { id, es: "", en: "", short_es: "", short_en: "" },
    geometry: { type: "Polygon", coordinates: [] },
  }],
});

beforeEach(() => recommend.mockReset().mockResolvedValue({ status: "ok", options: [] }));

it("shows the crop detected from imagery without a crop selector", async () => {
  render(<I18nProvider><CropRecommendations {...props}
    observation={imagery("winter_cereal", .85)} /></I18nProvider>);
  expect(screen.getByRole("heading", { name: /después de trigo o cebada/i })).toBeInTheDocument();
  expect(screen.getByText(/estimado con sentinel/i)).toBeInTheDocument();
  expect(recommend).toHaveBeenLastCalledWith(expect.objectContaining({ current: "winter_cereal" }), expect.anything());

  expect(screen.queryByLabelText("Cultivo actual")).not.toBeInTheDocument();
  await screen.findByText(/ninguna opción/i);
});

it("shows no crop when the image supports it and limits the main recommendations to three", async () => {
  const option = (id: string, conditions: string[] = []) => ({
    id, name: { es: id }, score: .8, conditional: conditions.length > 0, conditions,
    sow_from: "2026-11-15", sow_until: "2026-11-30", rain_mm: 216, water_demand_mm: 650,
  });
  recommend.mockResolvedValue({ status: "ok", options: [
    option("Soja"), option("Trigo"), option("Maíz", ["water"]), option("Sorgo", ["frost"]),
  ] });
  render(<I18nProvider><CropRecommendations {...props} observation={imagery("fallow", .9)} /></I18nProvider>);
  expect(screen.getByText(/sin cultivo visible/i)).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "Qué sembrar en la próxima campaña" })).toBeInTheDocument();
  expect(within(screen.getAllByRole("list")[0]).getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByText(/434 mm por debajo/i)).toBeInTheDocument();
  const more = screen.getByText("Ver más cultivos (1)");
  expect(more.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(more);
  expect(more.closest("details")).toHaveAttribute("open");
  expect(screen.getByRole("heading", { name: "Sorgo" })).toBeInTheDocument();
});

it("renders options returned by an API without the conditions array", async () => {
  const base = { sow_from: "2026-11-15", sow_until: "2026-11-30", water_demand_mm: 650 };
  recommend.mockResolvedValue({ status: "ok", options: [
    { ...base, id: "maiz", name: { es: "Maíz" }, score: .95, conditional: true,
      rain_mm: 216, needs_irrigation: true, fits_frost: false },
    { ...base, id: "soja", name: { es: "Soja" }, score: .8, conditional: false,
      rain_mm: 650, needs_irrigation: false, fits_frost: true },
  ] });
  render(<I18nProvider><CropRecommendations {...props} observation={null} /></I18nProvider>);
  expect(await screen.findByRole("heading", { name: "Qué sembrar en la próxima campaña" })).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual(["Soja", "Maíz"]);
  expect(screen.getByText(/434 mm por debajo/i)).toBeInTheDocument();
  expect(screen.getByText(/expuesta a heladas/i)).toBeInTheDocument();
});

it("shows Gemini order and the evidence for the selected detail", async () => {
  const base = { sow_from: "2026-11-15", sow_until: "2026-11-30", water_demand_mm: 650, conditional: false };
  recommend.mockResolvedValue({ status: "ok", ranking_source: "gemini", options: [
    { ...base, id: "maiz", name: { es: "Maíz" }, score: .65, decision: {
      why: "El orden refleja el clima y la textura disponible.", evidence: { texture: "Arcilloso" },
    } },
    { ...base, id: "soja", name: { es: "Soja" }, score: .91 },
  ] });
  render(<I18nProvider><CropRecommendations {...props} observation={null} /></I18nProvider>);
  expect(await screen.findByText(/ordenado con gemini/i)).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual(["Maíz", "Soja"]);
  fireEvent.click(screen.getAllByText("Detalle", { exact: true })[0]);
  expect(screen.getByText("Arcilloso")).toBeVisible();
  expect(recommend).toHaveBeenCalledWith(expect.objectContaining({ rank_with_gemini: true }), expect.anything());
});

it("waits for this parcel and leaves a mixed signal unconfirmed", async () => {
  const view = (observation?: CurrentCrop) => <I18nProvider><CropRecommendations {...props}
    observation={observation} /></I18nProvider>;
  const { rerender } = render(view());
  expect(recommend).not.toHaveBeenCalled();
  rerender(view(imagery("summer_early", .55)));
  expect(screen.getByText(/actual sin confirmar/i)).toBeInTheDocument();
  await waitFor(() => expect(recommend).toHaveBeenCalledWith(expect.objectContaining({ current: "unknown" }), expect.anything()));
  await screen.findByText(/ninguna opción/i);
});

it("explains each option with its water balance and the coming season's ENSO scenario", async () => {
  recommend.mockResolvedValue({ status: "ok", ranking_source: "catalog",
    outlook: { phase: "la_nina", oni: -0.8, oni_period: "SON 2026", season: "2026-27", rain_effect_pct: -20,
               effects: { el_nino: 15, la_nina: -20 } },
    options: [{ id: "soja", name: { es: "Soja" }, score: .9, conditional: false, conditions: [],
      sow_from: "2026-11-15", sow_until: "2026-12-10", rain_mm: 620, water_demand_mm: 500,
      balance_mm: 120, rain_wet_mm: 520, rain_expected_mm: 516, balance_expected_mm: 16,
      cover_days: 150, bare_days: 215, fits_frost: true, different_family: true, same_family: false,
      erosion_level: "baja", drought_tolerance: "medium", heat_tolerance: "medium", root_depth_cm: 120,
      residue_t_ha: 2.5, n_fixation: true }],
    land: { texture: "Franco-arcilloso", carbon_g_kg: 19.5, infiltration: 40, infiltration_class: "media",
            slope_pct: 3.8, heavy_rain_days: 2, root_moisture_pct: 46, rain_30d_mm: 50.9,
            rain_30d_normal_mm: 106, rain_30d_pct: 48, bare_soil_days: 122, heat_days: 20 } });
  render(<I18nProvider><CropRecommendations {...props} observation={null} /></I18nProvider>);
  expect(await screen.findByText(/clima de la campaña 2026-27: la niña/i)).toBeInTheDocument();
  expect(screen.getByText(/tendencia histórica, no un pronóstico/i)).toBeInTheDocument();
  expect(screen.getByText(/620 mm de lluvia media contra 500 mm.*\+120 mm.*124 %/i)).toBeInTheDocument();
  expect(screen.getByText(/lluvia esperada es 516 mm y el saldo \+16 mm/i)).toBeInTheDocument();
  expect(screen.getByText(/período libre de heladas/i)).toBeInTheDocument();
  expect(screen.getByText(/rota con el cultivo anterior/i)).toBeVisible();
  expect(screen.getByText(/la lluvia cubre la demanda del ciclo \(saldo \+16 mm\)/i)).toBeVisible();
  fireEvent.click(screen.getByText("Detalle", { exact: true }));
  expect(screen.getByRole("heading", { name: /estado del suelo del lote/i })).toBeVisible();
  expect(screen.getByText(/suelo franco-arcilloso con 19,5 g\/kg de carbono orgánico/i)).toBeVisible();
  expect(screen.getByText(/arranque con poca agua.*46 %.*50,9 mm contra 106 mm/i)).toBeVisible();
  expect(screen.getByText(/el balance esperado sigue positivo \(\+16 mm\)/i)).toBeVisible();
  expect(screen.getByText(/20 días al año por encima de 35 °c/i)).toBeVisible();
});

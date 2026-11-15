import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { apiMoisture } from "../../api";
import type { MoistureZone } from "../../api/types";
import { I18nProvider } from "../../i18n";
import { MoisturePanel } from "./MoisturePanel";

vi.mock("../../api", () => ({ apiMoisture: vi.fn() }));

const geometry = { type: "Polygon", coordinates: [
  [[-60.57, -33.89], [-60.56, -33.89], [-60.56, -33.88], [-60.57, -33.89]],
] } as const;
const body = { polygon: {
  type: geometry.type,
  coordinates: geometry.coordinates.map((ring) => ring.map(([x, y]) => [x, y])),
} };

describe("field moisture layer", () => {
  it("shows no detail when a scene does not support a sector comparison", async () => {
    vi.mocked(apiMoisture).mockResolvedValueOnce({ status: "no_detail" });
    const onZones = vi.fn();
    render(<I18nProvider><MoisturePanel body={body} selected={null}
      onZones={onZones} onSelect={vi.fn()} /></I18nProvider>);
    expect(await screen.findByText(/no permiten distinguir zonas/)).toBeInTheDocument();
    expect(onZones).toHaveBeenLastCalledWith([]);
  });

  it("publishes the sector geometries and presents the selected area", async () => {
    const zones: MoistureZone[] = [
      { kind: "dry", ha: 12, geometry: {
        type: geometry.type,
        coordinates: geometry.coordinates.map((ring) => ring.map(([x, y]) => [x, y])),
      } },
    ];
    vi.mocked(apiMoisture).mockResolvedValueOnce({
      status: "available", date: "2026-11-08", coverage: .8, resolution_m: 20, zones,
    });
    const onZones = vi.fn(), onSelect = vi.fn();
    render(<I18nProvider><MoisturePanel body={body} selected={0}
      onZones={onZones} onSelect={onSelect} /></I18nProvider>);
    expect(await screen.findByText(/Señal más seca · 12 ha · imagen del/)).toBeInTheDocument();
    await waitFor(() =>
      expect(onZones).toHaveBeenLastCalledWith(zones));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});

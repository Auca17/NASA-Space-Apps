import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { squareRing } from "../../domain/selection";
import type { SummaryUnit } from "../../domain/summary";

const apiDiagnose = vi.fn();
vi.mock("../../api", () => ({ apiDiagnose: (...a: unknown[]) => apiDiagnose(...a) }));
const { FieldSummary } = await import("./FieldSummary");

const unit = (id: string, lat: number, ha: number): SummaryUnit =>
  ({ id, kind: "parcel", name: `Parcela ${id}`, ha,
     geom: [[squareRing(lat, -60.69, 400 + Number(id))]] });
const diag = (rain: number) => ({ diagnosis: { cards: [
  { id: "rain", value: rain, unit: "mm/año", text: "", source: "", confidence: "high" }] } });

beforeEach(() => apiDiagnose.mockReset());

describe("FieldSummary", () => {
  it("keeps finished plots when one fails, shows hectares without data and retries only that one", async () => {
    apiDiagnose.mockResolvedValueOnce(diag(1000))
      .mockResolvedValueOnce({ diagnosis: null, problem: "network" })
      .mockResolvedValueOnce(diag(800));
    const units = [unit("1", -33.9, 300), unit("2", -33.95, 100)];
    render(<I18nProvider><FieldSummary fieldName="Estancia" units={units}
      onAnalyze={vi.fn()} onClose={vi.fn()} /></I18nProvider>);
    expect(await screen.findByText(/100 ha sin datos/i)).toBeInTheDocument();
    expect(screen.getByText("1000 mm/año")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    await waitFor(() => expect(screen.queryByText(/sin datos/i)).toBeNull());
    expect(screen.getByText("950 mm/año")).toBeInTheDocument();   // weighted by ha
    expect(apiDiagnose).toHaveBeenCalledTimes(3);
  });
});

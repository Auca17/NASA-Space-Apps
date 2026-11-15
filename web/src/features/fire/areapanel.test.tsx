/** Round-2 audit B1/B5: the risk card keeps loading, error and
 * genuine no-data apart (with retry), and backend "why" phrases go
 * through i18n instead of leaking Spanish into the English UI. */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import es from "../../i18n/es.json";
import en from "../../i18n/en.json";
import { riskReasonText, presentRisk } from "../../domain/risk";
import { AreaPanel } from "./AreaPanel";

vi.mock("../../api", () => ({
  apiRiskResult: vi.fn(),
  meta: vi.fn(async () => null),
  fireCal: vi.fn(async () => null),
  fireDaily: vi.fn(async () => null),
  pointsCsvUrl: vi.fn(() => "x.csv"),
}));

import { apiRiskResult } from "../../api";
const riskMock = vi.mocked(apiRiskResult);

const renderPanel = () =>
  render(
    <I18nProvider>
      <AreaPanel lat={-34.6} lon={-58.4} cells={[]} open
                 onClose={() => {}} country={null} />
    </I18nProvider>);

describe("risk card states (B1)", () => {
  beforeEach(() => {
    localStorage.setItem("fs_lang", "es");
    riskMock.mockReset();
  });

  /** The calendar/bars cards render the same no-data string on their
   * own; assertions must be scoped to the risk card. */
  const riskCard = () =>
    within(screen.getByText(es["panel.risk7d"]).closest(".card")!);

  it("a failed fetch shows an error with retry, not 'no data'", async () => {
    riskMock.mockResolvedValue({ ok: false, status: 500 });
    renderPanel();
    await screen.findByRole("alert");
    expect(screen.getByText(es["panel.riskError"])).toBeTruthy();
    expect(riskCard().queryByText(es["panel.noData"])).toBeNull();
    expect(screen.getByRole("button", { name: es["ui.retry"] }))
      .toBeTruthy();
  });

  it("retry re-queries and a real 404 becomes the no-data state", async () => {
    riskMock
      .mockResolvedValueOnce({ ok: false, status: 0 })
      .mockResolvedValueOnce({ ok: true, data: null });
    renderPanel();
    const retry = await screen.findByRole("button",
      { name: es["ui.retry"] });
    fireEvent.click(retry);
    await waitFor(() =>
      expect(riskCard().getAllByText(es["panel.noData"]).length)
        .toBeGreaterThan(0));
    expect(riskMock).toHaveBeenCalledTimes(2);
  });

  it("a successful response renders the risk view", async () => {
    riskMock.mockResolvedValue({ ok: true, data: {
      p: 0.2, clim: 0.2, ratio: 1.01, cat: "moderado", level: "clima",
      reasons: ["sin señales de riesgo destacables"], country: "AR" } });
    renderPanel();
    await screen.findByText(es["risk.reason.none"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("risk reason localization (B5)", () => {
  const tEn = (k: string, v?: Record<string, string | number>) => {
    let s = (en as Record<string, string>)[k] ?? k;
    for (const [key, val] of Object.entries(v ?? {}))
      s = s.replaceAll(`{${key}}`, String(val));
    return s;
  };

  it("covers the whole known backend vocabulary in English", () => {
    const cases: [string, string][] = [
      ["sin señales de riesgo destacables", "No notable risk signals"],
      ["focos en las celdas vecinas", "Detections in neighboring cells"],
      ["focos recientes en la celda", "Recent detections in this cell"],
      ["temporada de quemas", "Burn season"],
      ["lluvias recientes muy bajas", "Very little recent rain"],
      ["12 días sin lluvia", "12 days without rain"],
      ["humedad relativa 41 %", "Relative humidity 41 %"],
      ["calor de los últimos días (34 °C)", "Heat in recent days (34 °C)"],
    ];
    for (const [raw, want] of cases)
      expect(riskReasonText(raw, tEn), raw).toBe(want);
  });

  it("unknown phrases pass through verbatim", () => {
    expect(riskReasonText("otra razón desconocida", tEn))
      .toBe("otra razón desconocida");
  });

  it("probability renders as a band, not false precision", () => {
    expect(presentRisk({ p: 0.0347, clim: 0.02, ratio: 1.7,
      cat: "alto", level: "clima" }).probText).toBe("≈3");
    expect(presentRisk({ p: 0.004, clim: 0.02, ratio: null,
      cat: "bajo", level: "clima" }).probText).toBe("<1");
  });
});

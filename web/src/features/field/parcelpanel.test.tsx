import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
// the crop lookup (INTA map) has its own tests; here it only marks where
// it is shown and for which geometry
vi.mock("./CurrentCrop", () => ({
  CurrentCropPanel: () => <span data-testid="current-crop" />,
}));
vi.mock("./DetectedCrop", () => ({
  DetectedCrop: ({ declared }: { declared?: string }) =>
    <span data-testid="detected-crop">{declared || "lookup"}</span>,
}));
const { ParcelPanel } = await import("./ParcelPanel");
import type { Proposal } from "./ParcelPanel";
import { squareRing } from "../../domain/selection";
import type { Field } from "../../domain/fields";

const ring = squareRing(-33.96, -60.69, 500);
const field = (zones: Field["zones"] = [], review: Field["review"] = []): Field =>
  ({ id: "f", name: "Estancia", geom: [[squareRing(-33.96, -60.69, 5500)]],
     zones, review, createdAt: "" });
const fns = () => ({ onSelect: vi.fn(), onDetect: vi.fn(), onProposalToggle: vi.fn(),
  onProposalName: vi.fn(), onAccept: vi.fn(), onReject: vi.fn(), onRename: vi.fn(),
  onCrop: vi.fn(), onDiscard: vi.fn(), onFix: vi.fn(), onAnalyze: vi.fn(),
  onSummary: vi.fn(), onDrawParcel: vi.fn(), onSavePending: vi.fn(),
  onDiscardPending: vi.fn(), onBack: vi.fn() });
const wrap = (el: React.ReactElement) => render(<I18nProvider>{el}</I18nProvider>);

describe("ParcelPanel", () => {
  it("shows three proposed plots, the land to review and what is missing", () => {
    const proposal: Proposal = { status: "ready", keep: [true, true, false],
      names: ["Parcela 1", "Parcela 2", "Parcela 3"],
      notes: ["parcel.cov.ftwPartial"],
      detection: { parcels: [0, 1, 2].map(() => ({ geom: [ring], ha: 100, source: "ftw" as const })),
        review: [{ geom: [ring], ha: 40 }], excluded: [], totalHa: 340,
        parcelHa: 300, reviewHa: 40, excludedHa: 0 } };
    const f = fns();
    wrap(<ParcelPanel field={field()} selected={null} proposal={proposal}
                      pending={null} {...f} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByText(/límite por revisar: 40 ha/i)).toBeInTheDocument();
    expect(screen.getByText(/cubre solo parte del campo/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /aceptar 2 parcela/i }));
    expect(f.onAccept).toHaveBeenCalledOnce();
    fireEvent.click(screen.getAllByRole("listitem")[1]);
    expect(f.onSelect).toHaveBeenCalledWith("p1");
  });

  it("lists confirmed plots with the crop only from a source", () => {
    const f = fns();
    wrap(<ParcelPanel field={field([
      { id: "a", name: "Parcela 1", crop: "", geom: [[ring]], source: "ftw" },
      { id: "b", name: "Lote viejo", crop: "maíz", geom: [[ring]] },
      { id: "c", name: "Soja", crop: "Soja", geom: [[ring]], source: "crop" },
      { id: "d", name: "Parcela 4", crop: "", geom: [[ring]], source: "ftw" }], [[ring]])}
      selected="a" proposal={null} pending={null} {...f} />);
    // field-level and selected-plot lookups in INTA's map
    expect(screen.getAllByTestId("detected-crop")).toHaveLength(2);
    expect(screen.getByText(/declarado por vos: maíz/i)).toBeInTheDocument();
    expect(screen.getByText(/detectado al dividir por cultivo: Soja/i)).toBeInTheDocument();
    expect(screen.getByText(/tocá la parcela para ver lo que hay hoy/i)).toBeInTheDocument();
    expect(screen.getAllByText(/fields of the world/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/límite por revisar: 100 ha/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^analizar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /corregir bordes/i }));
    fireEvent.click(screen.getByRole("button", { name: /^descartar$/i }));
    expect(f.onAnalyze).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    expect(f.onFix).toHaveBeenCalledOnce();
    expect(f.onDiscard).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /resumen de todo el campo/i }));
    expect(f.onSummary).toHaveBeenCalledOnce();
  });

  it("splits the field by crop on request and says what happened", async () => {
    const f = fns();
    const onSplitByCrop = vi.fn().mockResolvedValue("none");
    wrap(<ParcelPanel field={field()} selected={null} proposal={null}
                      pending={null} {...f} onSplitByCrop={onSplitByCrop} />);
    fireEvent.click(screen.getByRole("button", { name: /dividir por cultivo/i }));
    expect(await screen.findByText(/no se encontraron cultivos/i)).toBeInTheDocument();
  });

  it("keeps the field usable with no plots (detection failed or not run)", () => {
    const f = fns();
    wrap(<ParcelPanel field={field()} selected={null} proposal={null}
                      pending={null} {...f} />);
    expect(screen.getByText(/el campo queda guardado igual/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /detectar parcelas/i }));
    expect(f.onDetect).toHaveBeenCalledOnce();
  });
});

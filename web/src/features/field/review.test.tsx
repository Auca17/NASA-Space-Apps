import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { SelectionReview, AdjustPanel, type LandCheck, type Adjust }
  from "./SelectionReview";
import { squareRing } from "../../domain/selection";

const ring = squareRing(-33.96, -60.69, 500); // 100 ha
const renderReview = (check: LandCheck, approx = false) => {
  const fns = { onEdit: vi.fn(), onCancel: vi.fn(), onConfirm: vi.fn(),
               onAdjust: vi.fn(), onSave: vi.fn() };
  render(<I18nProvider>
    <SelectionReview geom={[[ring]]} approx={approx} check={check} {...fns} />
  </I18nProvider>);
  return fns;
};
const confirmBtn = () =>
  screen.getByRole("button", { name: /analizar este terreno/i });

describe("SelectionReview", () => {
  it("shows the area and the three actions; confirm triggers analysis", () => {
    const fns = renderReview("ok");
    expect(screen.getByText(/superficie: 100 ha/i)).toBeInTheDocument();
    fireEvent.click(confirmBtn());
    fireEvent.click(screen.getByRole("button", { name: /editar selección/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(fns.onConfirm).toHaveBeenCalledOnce();
    expect(fns.onEdit).toHaveBeenCalledOnce();
    expect(fns.onCancel).toHaveBeenCalledOnce();
  });

  it("labels a point selection as approximate", () => {
    renderReview("ok", true);
    expect(screen.getByText("Aproximada")).toBeInTheDocument();
    expect(screen.getByText(/círculo aproximado de 50 ha/i))
      .toBeInTheDocument();
  });

  it("warns and blocks confirming when the source says urban", () => {
    renderReview("urban");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "La selección está en una zona urbana. Revisá el contorno o elegí otro terreno.");
    expect(confirmBtn()).toBeDisabled();
  });

  it("allows confirming when land use cannot be determined", () => {
    renderReview("unknown");
    expect(screen.getByText(/podés analizar el terreno igual/i))
      .toBeInTheDocument();
    expect(confirmBtn()).toBeEnabled();
  });

  it("waits for the land-use check before confirming", () => {
    renderReview("checking");
    expect(confirmBtn()).toBeDisabled();
  });
});

describe("SelectionReview: save and adjust", () => {
  it("asks for a name before saving to Mis campos", () => {
    const fns = renderReview("ok");
    fireEvent.click(screen.getByRole("button", { name: /guardar en mis campos/i }));
    const input = screen.getByRole("textbox", { name: /nombre del campo/i });
    expect(screen.getByRole("button", { name: /^guardar$/i })).toBeDisabled();
    fireEvent.change(input, { target: { value: "Campo Los Álamos" } });
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));
    expect(fns.onSave).toHaveBeenCalledWith("Campo Los Álamos");
  });
  it("offers Ajustar selección", () => {
    const fns = renderReview("ok");
    fireEvent.click(screen.getByRole("button", { name: /ajustar selección/i }));
    expect(fns.onAdjust).toHaveBeenCalledOnce();
  });
  it("sums several pieces and says they are separate", () => {
    render(<I18nProvider>
      <SelectionReview geom={[[ring], [squareRing(-33.9, -60.69, 500)]]}
        approx={false} check="ok" onEdit={vi.fn()} onCancel={vi.fn()}
        onConfirm={vi.fn()} onAdjust={vi.fn()} onSave={vi.fn()} />
    </I18nProvider>);
    expect(screen.getByText(/superficie: 200 ha/i)).toBeInTheDocument();
    expect(screen.getByText(/2 piezas/i)).toBeInTheDocument();
  });
});

describe("AdjustPanel", () => {
  const adjust: Adjust = {
    status: "ready", on: [true, false],
    unverified: ["adjust.cov.tracks"],
    result: { pieces: [{ geom: [ring], ha: 98.4 }, { geom: [ring], ha: 97.1 }],
              excluded: [], totalHa: 200, roadHa: 4.5, urbanHa: 0, smallHa: 0 },
  };
  it("lists suggested pieces, what is excluded and what was not verified", () => {
    const onToggle = vi.fn(), onApply = vi.fn(), onEditPiece = vi.fn(),
          onOriginal = vi.fn();
    render(<I18nProvider>
      <AdjustPanel adjust={adjust} onToggle={onToggle} onApply={onApply}
                   onEditPiece={onEditPiece} onOriginal={onOriginal}
                   onRedraw={vi.fn()} />
    </I18nProvider>);
    expect(screen.getByLabelText(/pieza 1 · 98,4 ha/i)).toBeChecked();
    expect(screen.getByLabelText(/pieza 2 · 97,1 ha/i)).not.toBeChecked();
    expect(screen.getByText(/calles y caminos: 4,5 ha/i)).toBeInTheDocument();
    expect(screen.getByText(/huellas/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/pieza 2/i));
    expect(onToggle).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: /usar 1 pieza/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /editar/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /dibujo original/i }));
    expect(onApply).toHaveBeenCalledOnce();
    expect(onEditPiece).toHaveBeenCalledWith(0);
    expect(onOriginal).toHaveBeenCalledOnce();
  });
});

describe("SelectionReview area limits", () => {
  it("blocks analyzing and saving a selection above 5.000 ha", () => {
    render(<I18nProvider>
      <SelectionReview geom={[[squareRing(-33.96, -60.69, 5000)]]} approx={false}
        check="ok" onEdit={vi.fn()} onCancel={vi.fn()} onConfirm={vi.fn()}
        onAdjust={vi.fn()} onSave={vi.fn()} />
    </I18nProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent(/muy grande/i);
    expect(confirmBtn()).toBeDisabled();
    expect(screen.getByRole("button", { name: /guardar en mis campos/i }))
      .toBeDisabled();
  });
});

// regression (review #1): a fully urban selection offered a piece of the
// same size; now nothing is offered and the user can draw again
describe("AdjustPanel with nothing usable", () => {
  it("says no usable area is left and offers drawing again", () => {
    const onRedraw = vi.fn();
    render(<I18nProvider>
      <AdjustPanel onToggle={vi.fn()} onApply={vi.fn()} onEditPiece={vi.fn()}
        onOriginal={vi.fn()} onRedraw={onRedraw}
        adjust={{ status: "ready", on: [], unverified: [],
          result: { pieces: [], excluded: [], totalHa: 49.4, roadHa: 0,
                    urbanHa: 49.4, smallHa: 0 } }} />
    </I18nProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent(/no queda superficie utilizable/i);
    expect(screen.queryByRole("button", { name: /usar/i })).toBeNull();
    expect(screen.getByText(/zona urbana: 49,4 ha/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /volver a dibujar/i }));
    expect(onRedraw).toHaveBeenCalledOnce();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { FieldsList, FieldDetail } from "./FieldsPanel";
import { squareRing } from "../../domain/selection";
import type { Field } from "../../domain/fields";

const ring = squareRing(-33.96, -60.69, 500);
const field = (name: string, zones: Field["zones"] = [],
               geom: Field["geom"] = [[ring]]): Field =>
  ({ id: name, name, geom, zones, createdAt: "" });
const wrap = (el: React.ReactElement) => render(<I18nProvider>{el}</I18nProvider>);
const detailFns = () => ({ onChoose: vi.fn(), onAnalyze: vi.fn(),
  onDrawZone: vi.fn(), onSaveZone: vi.fn(), onDiscardZone: vi.fn(),
  onUpdateZone: vi.fn(), onRemoveZone: vi.fn(), onBack: vi.fn() });

describe("FieldsList", () => {
  it("lists fields with editable names and actions", () => {
    const fns = { onOpen: vi.fn(), onZones: vi.fn(), onAnalyze: vi.fn(),
                  onRename: vi.fn(), onDelete: vi.fn(), onClose: vi.fn() };
    wrap(<FieldsList fields={[field("Campo A"), field("Campo B")]} {...fns} />);
    const names = screen.getAllByRole("textbox", { name: /nombre del campo/i });
    expect(names.map((n) => (n as HTMLInputElement).value))
      .toEqual(["Campo A", "Campo B"]);
    fireEvent.change(names[0], { target: { value: "Los Álamos" } });
    fireEvent.blur(names[0]);
    expect(fns.onRename).toHaveBeenCalledWith(
      expect.objectContaining({ id: "Campo A" }), "Los Álamos");
    fireEvent.click(screen.getAllByRole("button", { name: /ver en el mapa/i })[1]);
    expect(fns.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "Campo B" }));
    expect(screen.getAllByText(/100 ha · 1 pieza\(s\) · 0 parcela\(s\)/)).toHaveLength(2);
  });
  it("explains the empty state", () => {
    wrap(<FieldsList fields={[]} onOpen={vi.fn()} onZones={vi.fn()}
                     onAnalyze={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()}
                     onClose={vi.fn()} />);
    expect(screen.getByText(/todavía no guardaste campos/i)).toBeInTheDocument();
  });
});

describe("FieldDetail", () => {
  it("previews a clipped zone and saves it; name and crop are optional", () => {
    const fns = detailFns();
    wrap(<FieldDetail field={field("Los Álamos")} choice="all" {...fns}
           pending={{ geom: [[ring]], ha: 48.2 }} />);
    expect(screen.getByText(/nueva zona: 48,2 ha/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /nombre de la zona/i }),
      { target: { value: "Norte" } });
    fireEvent.change(screen.getByRole("combobox", { name: /cultivo/i }),
      { target: { value: "maíz" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar zona/i }));
    expect(fns.onSaveZone).toHaveBeenCalledWith("Norte", "maíz");
  });
  it("saves a zone with no name or crop", () => {
    const fns = detailFns();
    wrap(<FieldDetail field={field("A")} choice="all" {...fns}
           pending={{ geom: [[ring]], ha: 10 }} />);
    fireEvent.click(screen.getByRole("button", { name: /guardar zona/i }));
    expect(fns.onSaveZone).toHaveBeenCalledWith("", "");
  });

  // regression (review #3): "Analizar" used the largest piece as if it
  // were the whole field; now every option says what it covers
  it("lets the user choose the whole field, a piece or a zone to analyse", () => {
    const fns = detailFns();
    const second = squareRing(-33.9, -60.69, 250);              // 25 ha
    wrap(<FieldDetail field={field("Los Álamos",
           [{ id: "n", name: "Norte", crop: "maíz", geom: [[second]] }],
           [[ring], [second]])}
           choice="p1" {...fns} pending={null} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.closest("label")!.textContent)).toEqual([
      "Todo el campo125 ha", "Pieza 1100 ha", "Pieza 225 ha",
      "Zona Norte (maíz)25 ha"]);
    expect(radios[2]).toBeChecked();
    fireEvent.click(radios[3]);
    expect(fns.onChoose).toHaveBeenCalledWith("z:n");
    fireEvent.click(screen.getByRole("button", { name: /analizar esta área \(25 ha\)/i }));
    expect(fns.onAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", kind: "piece", ha: expect.any(Number) }));
  });

  it("lists existing zones and offers both drawing methods", () => {
    const fns = detailFns();
    wrap(<FieldDetail field={field("Los Álamos", [
           { id: "n", name: "Norte", crop: "maíz", geom: [[ring]] },
           { id: "s", name: "", crop: "soja", geom: [[ring]] }])}
           choice="all" {...fns} pending={null} />);
    const names = screen.getAllByRole("textbox", { name: /nombre de la zona/i });
    expect(names.map((n) => (n as HTMLInputElement).value)).toEqual(["Norte", ""]);
    expect(names[1]).toHaveAttribute("placeholder", "Zona 2");
    fireEvent.click(screen.getByRole("button", { name: /zona a mano alzada/i }));
    fireEvent.click(screen.getByRole("button", { name: /zona punto por punto/i }));
    expect(fns.onDrawZone.mock.calls).toEqual([["free"], ["draw"]]);
  });
});

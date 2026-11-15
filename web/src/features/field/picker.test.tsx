import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { FieldPicker } from "./FieldPicker";

const noop = () => {};
const renderPicker = (draw: "none" | "draw" | "point", points = 0,
                      extra = {}) => render(
  <I18nProvider>
    <FieldPicker draw={draw} points={points} onPick={noop} onDemo={noop}
                 onFinish={noop} onUndo={noop} onCancel={noop} onGo={noop}
                 {...extra} />
  </I18nProvider>);

describe("FieldPicker", () => {
  it("explains the three ways to mark a field", () => {
    const onPick = vi.fn(), onDemo = vi.fn();
    renderPicker("none", 0, { onPick, onDemo });
    expect(screen.getByText(/cada esquina del lote/i)).toBeInTheDocument();
    expect(screen.getByText(/aproximada de 50 ha/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /punto por punto/i }));
    fireEvent.click(screen.getByRole("button", { name: /tocar un punto/i }));
    fireEvent.click(screen.getByRole("button", { name: /ejemplo de pergamino/i }));
    expect(onPick.mock.calls).toEqual([["draw"], ["point"]]);
    expect(onDemo).toHaveBeenCalledOnce();
  });

  it("while drawing, counts points and blocks finishing below 3", () => {
    renderPicker("draw", 2);
    expect(screen.getByText(/puntos marcados: 2/i)).toBeInTheDocument();
    expect(screen.getByText(/faltan 1 para poder terminar/i))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: /terminar contorno/i }))
      .toBeDisabled();
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeEnabled();
  });

  it("enables finishing at 3 points and offers undo and cancel", () => {
    const onFinish = vi.fn(), onUndo = vi.fn(), onCancel = vi.fn();
    renderPicker("draw", 3, { onFinish, onUndo, onCancel });
    expect(screen.getByText(/ya podés terminar/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /terminar contorno/i }));
    fireEvent.click(screen.getByRole("button", { name: /borrar último punto/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onFinish).toHaveBeenCalledOnce();
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("in point mode, tells the user to tap the field's center", () => {
    renderPicker("point");
    expect(screen.getByText(/tocá el centro de tu lote/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();
  });
});

describe("FieldPicker place finder", () => {
  it("offers going to the user's area before choosing a method", () => {
    const onGo = vi.fn();
    Object.defineProperty(navigator, "geolocation", { configurable: true,
      value: { getCurrentPosition: vi.fn((ok) =>
        ok({ coords: { latitude: -31.4, longitude: -64.2 } })) } });
    renderPicker("none", 0, { onGo });
    expect(screen.getByText(/llevá el mapa a tu zona/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /usar mi ubicación/i }));
    expect(onGo).toHaveBeenCalledWith(-31.4, -64.2);
  });
  it("keeps it reachable while drawing", () => {
    renderPicker("draw", 1);
    expect(screen.getByText(/llevá el mapa a tu zona/i, { selector: "summary" }))
      .toBeInTheDocument();
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { PlaceFinder } from "./PlaceFinder";

const renderFinder = (onGo = vi.fn()) => {
  render(<I18nProvider><PlaceFinder onGo={onGo} /></I18nProvider>);
  return onGo;
};

afterEach(() => { vi.unstubAllGlobals(); });

describe("PlaceFinder", () => {
  it("uses the browser location to fly to the user's area", () => {
    Object.defineProperty(navigator, "geolocation", { configurable: true,
      value: { getCurrentPosition: vi.fn((ok) =>
        ok({ coords: { latitude: -34.1, longitude: -59.9 } })) } });
    const onGo = renderFinder();
    fireEvent.click(screen.getByRole("button", { name: /usar mi ubicación/i }));
    expect(onGo).toHaveBeenCalledWith(-34.1, -59.9);
  });

  it("says so when the location is denied, and keeps the search", async () => {
    Object.defineProperty(navigator, "geolocation", { configurable: true,
      value: { getCurrentPosition: vi.fn((_ok, err) => err({})) } });
    const onGo = renderFinder();
    fireEvent.click(screen.getByRole("button", { name: /usar mi ubicación/i }));
    expect(await screen.findByText(/no pudimos usar tu ubicación/i))
      .toBeInTheDocument();
    expect(onGo).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("searches a place on OpenStreetMap and flies to the picked hit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({
      hits: [{ lat: -33.89, lon: -60.57, name: "Pergamino, Buenos Aires" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const onGo = renderFinder();
    fireEvent.change(screen.getByRole("textbox"),
      { target: { value: "Pergamino" } });
    fireEvent.click(screen.getByRole("button", { name: /buscar/i }));
    fireEvent.click(await screen.findByRole("button",
      { name: /pergamino, buenos aires/i }));
    expect(fetchMock.mock.calls[0][0]).toContain("/api/geocode?q=Pergamino");
    expect(onGo).toHaveBeenCalledWith(-33.89, -60.57);
  });

  it("tells the user when nothing was found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      { json: async () => ({ hits: [] }) }));
    renderFinder();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "zzz" } });
    fireEvent.click(screen.getByRole("button", { name: /buscar/i }));
    expect(await screen.findByText(/no encontramos ese lugar/i))
      .toBeInTheDocument();
  });
});

describe("PlaceFinder coordinates", () => {
  it("goes straight to pasted coordinates without searching", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onGo = renderFinder();
    fireEvent.change(screen.getByRole("textbox"),
      { target: { value: "-33.9600, -60.6900" } });
    fireEvent.click(screen.getByRole("button", { name: /buscar/i }));
    expect(onGo).toHaveBeenCalledWith(-33.96, -60.69);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

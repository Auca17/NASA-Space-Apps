/** Task 26 (trimmed by task 49): emergency numbers table, message
 * template, call block rendering and clipboard fallback. The
 * live-detection domain (distance/direction/points) left with the
 * Live view. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import es from "../../i18n/es.json";
import en from "../../i18n/en.json";
import {
  EMERGENCY_BY_COUNTRY, EU_NUMBER, EU_MEMBERS, numbersFor,
} from "../../content/emergency";
import { emergencyMessage, mapLink } from "../../domain/emergency";
import { EmergencyBlock } from "./EmergencyBlock";

const t = (k: string, v?: Record<string, string | number>) => {
  let s = (es as Record<string, string>)[k] ?? k;
  for (const [key, val] of Object.entries(v ?? {})) {
    s = s.replaceAll(`{${key}}`, String(val));
  }
  return s;
};

// --------------------------------------------------- country table --
describe("emergency country table", () => {
  const required = ["AR", "CL", "UY", "PY", "BR", "BO", "MX", "US", "CA",
                    "ES", "PT", "AU"];
  it("covers the required countries", () => {
    for (const c of required) {
      expect(EMERGENCY_BY_COUNTRY[c], c).toBeTruthy();
      expect(EMERGENCY_BY_COUNTRY[c].length).toBeGreaterThan(0);
    }
  });
  it("every row has a number of 2-4 digits and an https URL", () => {
    for (const [c, rows] of Object.entries(EMERGENCY_BY_COUNTRY)) {
      for (const r of rows) {
        expect(r.number, `${c}/${r.service}`).toMatch(/^[0-9]{2,4}$/);
        expect(r.source, `${c}/${r.service}`).toMatch(/^https?:\/\//);
        expect((es as Record<string, string>)[r.service],
               `${c}/${r.service}`).toBeTruthy();
        expect((en as Record<string, string>)[r.service],
               `${c}/${r.service}`).toBeTruthy();
      }
    }
    expect(EU_NUMBER.number).toMatch(/^[0-9]{2,4}$/);
    expect(EU_NUMBER.source).toMatch(/^https?:\/\//);
  });
  it("EU members without an own row still get 112", () => {
    const fr = numbersFor("FR");
    expect(fr).toEqual([EU_NUMBER]);
    expect(EU_MEMBERS.has("FR")).toBe(true);
  });
  it("unknown countries get no invented number", () => {
    expect(numbersFor("XX")).toEqual([]);
    expect(numbersFor(null)).toEqual([]);
  });
  it("Argentina keeps the PRD numbers", () => {
    const ar = numbersFor("AR").map((r) => r.number);
    expect(ar).toContain("100");
    expect(ar).toContain("911");
  });
});

// ---------------------------------------------------------- domain --
describe("emergency message", () => {
  it("builds an OSM link the operator can open", () => {
    expect(mapLink(-33.5, -60.25)).toBe(
      "https://www.openstreetmap.org/?mlat=-33.50000" +
      "&mlon=-60.25000#map=14/-33.50000/-60.25000");
  });
  it("includes the location for the operator", () => {
    const m = emergencyMessage({
      lat: -33.5, lon: -60.25, source: "map" }, t);
    expect(m).toContain("posible foco de fuego");
    expect(m).toContain("-33.5000");
    expect(m).toContain("openstreetmap.org");
    expect(m).toContain("centro del mapa");
  });
  it("says the location is the user's own when shared", () => {
    const m = emergencyMessage(
      { lat: -33, lon: -60, source: "user" }, t);
    expect(m).toContain("Mi ubicación");
    expect(m).not.toContain("centro del mapa");
  });
  it("omits missing fields instead of inventing them", () => {
    const m = emergencyMessage(
      { lat: -33, lon: -60, source: "map" }, t);
    expect(m).not.toContain("Viento");
    const m2 = emergencyMessage({
      lat: -33, lon: -60, source: "map",
      wind: "norte 25 km/h",
    }, t);
    expect(m2).toContain("Viento: norte 25 km/h");
  });
});

// ---------------------------------------------------------- render --
function block(props: Partial<Parameters<typeof EmergencyBlock>[0]> = {}) {
  return render(<I18nProvider>
    <EmergencyBlock country={props.country ?? "AR"}
                    mapCenter={props.mapCenter ?? { lat: -33, lon: -60 }}
                    lead={props.lead} />
  </I18nProvider>);
}

describe("EmergencyBlock", () => {
  it("renders tel links and the numbers as text for AR", () => {
    block();
    const fire = screen.getByRole("link", { name: /bomberos \(100\)/i });
    expect(fire).toHaveAttribute("href", "tel:100");
    const em = screen.getByRole("link", { name: /emergencias \(911\)/i });
    expect(em).toHaveAttribute("href", "tel:911");
    expect(screen.getByText(/bomberos 100 · emergencias 911/i))
      .toBeInTheDocument();
  });
  it("shows the generic line for an unknown country, never a guess", () => {
    block({ country: "XX" });
    expect(screen.getByText(/número de emergencias de tu país/i))
      .toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /llamar/i })).toBeNull();
  });
  it("copies the message and confirms visibly", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard",
      { value: { writeText: write }, configurable: true });
    block();
    fireEvent.click(screen.getByRole("button",
      { name: /copiar lo que tengo que decir/i }));
    await waitFor(() => expect(write).toHaveBeenCalledOnce());
    expect(write.mock.calls[0][0]).toContain("posible foco de fuego");
    expect(await screen.findByText(/copiado/i)).toBeInTheDocument();
  });
  it("falls back to selectable text when the clipboard is blocked",
     async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true });
    block();
    fireEvent.click(screen.getByRole("button",
      { name: /copiar lo que tengo que decir/i }));
    const area = await screen.findByRole("textbox");
    expect((area as HTMLTextAreaElement).value)
      .toContain("posible foco de fuego");
    expect(screen.getByText(/copialo a mano/i)).toBeInTheDocument();
  });
  it("always shows the satellite-not-confirmed notice and privacy", () => {
    block();
    expect(screen.getByText(/no es un incendio confirmado/i))
      .toBeInTheDocument();
    expect(screen.getByText(/llamá igual/i)).toBeInTheDocument();
    expect(screen.getByText(/no se envía a ningún servidor/i))
      .toBeInTheDocument();
  });
  it("says the message uses the map centre without shared location", () => {
    block();
    expect(screen.getAllByText(/centro del mapa/i).length)
      .toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /usar mi ubicación/i }))
      .toBeInTheDocument();
  });
  it("keyboard: links and buttons are real focusable controls", () => {
    block();
    for (const el of screen.getAllByRole("link")
        .concat(screen.getAllByRole("button"))) {
      expect(el.tagName === "A" || el.tagName === "BUTTON").toBe(true);
    }
  });
});

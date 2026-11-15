import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrinCard, SyntheticBanner } from "./OrinCard";
import es from "../../i18n/es.json";
import en from "../../i18n/en.json";
import type { OrinValidation } from "../../api/types";

const t = (k: string, v?: Record<string, string | number>) => {
  let s = (es as Record<string, string>)[k] ?? k;
  if (v) for (const [kk, vv] of Object.entries(v)) {
    s = s.replaceAll(`{${kk}}`, String(vv));
  }
  return s;
};
const fmt = new Intl.NumberFormat("es", { maximumFractionDigits: 1 });

const data = (synthetic: boolean): OrinValidation => ({
  version: "v1", synthetic,
  variables: [{
    id: "temp_max",
    satellite: { dataset: "NASA POWER T2M_MAX", resolution: "0.5°",
                 period: "2025" },
    field: { source: "Estaciones Orin DCC", n_sites: 67 },
    n: 371, rmse: 2.4, bias: -1.1, r: 0.94, unit: "°C",
    quality: "good",
  }, {
    id: "soil_moisture",
    satellite: { dataset: "NASA SMAP L3", resolution: "9 km",
                 period: "2025" },
    field: { source: "Muestreos", n_sites: 8 },
    n: 31, rmse: 0.09, bias: 0.05, r: 0.52, unit: "m3/m3",
    quality: "poor",
  }],
});

describe("OrinCard", () => {
  it("shows the banner + muted numbers when synthetic", () => {
    render(<OrinCard data={data(true)} t={t} fmt={fmt} />);
    expect(screen.getByRole("status").textContent)
      .toContain("Datos de ejemplo, no reales");
    expect(document.querySelector(".orin-synth")).toBeTruthy();
    expect(screen.getByText(/Qué tan bien ve el satélite/))
      .toBeInTheDocument();
  });
  it("hides the banner when synthetic is false", () => {
    render(<OrinCard data={data(false)} t={t} fmt={fmt} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector(".orin-synth")).toBeNull();
    expect(screen.getByText(/se equivoca en promedio 2,4 °C/))
      .toBeInTheDocument();
    expect(screen.getByText(/marca 1,1 °C menos/)).toBeInTheDocument();
    expect(screen.getByText(/no distingue diferencias dentro del lote/))
      .toBeInTheDocument();
  });
  it("reads fine with the real stations numbers (67 sites, 742)", () => {
    const real = data(false);
    real.variables[0].n = 742;
    render(<OrinCard data={real} t={t} fmt={fmt} />);
    expect(screen.getByText(/67 estaciones y 742 mediciones/))
      .toBeInTheDocument();
  });
  it("hides entirely when the file is missing", () => {
    const { container } = render(
      <OrinCard data={null} t={t} fmt={fmt} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("exact numbers are inside keyboard-operable native details", () => {
    render(<OrinCard data={data(true)} t={t} fmt={fmt} />);
    const ds = [...document.querySelectorAll("details.orin-details")];
    expect(ds).toHaveLength(2);
    for (const d of ds) {
      expect(d.querySelector("summary")).toBeTruthy();
      expect(d.hasAttribute("open")).toBe(false);
    }
    expect(screen.getAllByText(/RMSE/).length).toBe(2);
  });
});

describe("SyntheticBanner", () => {
  it("is icon + text, role=status, in both languages", () => {
    render(<SyntheticBanner t={t} />);
    const b = screen.getByRole("status");
    expect(b.querySelector(".orin-banner-icon")).toBeTruthy();
    expect(b.textContent).toContain("Datos de ejemplo");
    expect((en as Record<string, string>)["orin.banner"]).toBeTruthy();
  });
});

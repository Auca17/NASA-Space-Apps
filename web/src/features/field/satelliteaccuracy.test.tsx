import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nProvider } from "../../i18n";
import { SatelliteAccuracy } from "./SatelliteAccuracy";

const wrap = (ui: ReactElement) =>
  render(<I18nProvider>{ui}</I18nProvider>);

const FULL = {
  temp_rmse_c: 2.9, temp_rmse_adjusted_c: 1.8,
  rain_bias_mm_month: 22.1, rain_rmse_mm_month: 51.2, rain_r: 0.59,
  stations: { temperature: 53, rain: 25 },
  note: "La lluvia satelital suele sobrestimar en zonas de montaña.",
  sources: ["orin_validation", "siga_rain_validation"],
};

describe("SatelliteAccuracy", () => {
  it("renders every line from the accuracy contract", () => {
    wrap(<SatelliteAccuracy accuracy={FULL} tempAdjustC={-0.6}
                            elevationM={860} cellElevationM={720} />);
    expect(screen.getByText(/ve el satélite tu lote/)).toBeInTheDocument();
    const text = document.querySelector(".acc-card")!.textContent!;
    expect(text).toContain("±2,9 °C");
    expect(text).toContain("±1,8 °C con la corrección de altura");
    expect(text).toContain("±51,2 mm/mes");
    expect(text).toContain("Sesgo: +22,1 mm/mes");
    expect(text).toContain("r = 0,6");
    expect(text).toContain("diferencia lote–celda: 140 m");
    expect(text).toContain("53 estaciones de temperatura y 25 de lluvia");
    expect(text).toContain("sobrestimar en zonas de montaña");
    expect(text).toContain("validación Orin");
    expect(text).toContain("validación SIGA");
  });

  it("shows the generic limits text when accuracy is missing", () => {
    wrap(<SatelliteAccuracy accuracy={null} />);
    expect(screen.getByText(/Límites típicos/)).toBeInTheDocument();
    expect(screen.queryByText(/Contrastado con/)).toBeNull();
    expect(screen.getByText(/ve el satélite tu lote/)).toBeInTheDocument();
  });

  it("still shows the generic card when the field is absent", () => {
    wrap(<SatelliteAccuracy />);
    expect(screen.getByText(/Límites típicos/)).toBeInTheDocument();
  });

  it("offers the satellite-vs-ground glossary term", () => {
    wrap(<SatelliteAccuracy accuracy={FULL} />);
    expect(screen.getByRole("button", { name: /satélite vs\. campo\?/ }))
      .toBeInTheDocument();
  });
});

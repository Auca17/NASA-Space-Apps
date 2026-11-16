import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { Strategy } from "../../api/types";
import { I18nProvider, useT } from "../../i18n";
import { RotationPlan } from "./RotationPlan";

const crop = (id: string, name: string, role: "grain" | "cover" | "pasture", extra = {}) => ({
  id, name: { es: name, en: name }, family: "F", role, n_fixation: false, residue_t_ha: 3,
  root_depth_cm: 100, water_mm_cycle: 500, ph_min: null, ph_max: null, ...extra,
});
const strategy = {
  id: "soja-centeno", name: "Soja + centeno", is_current: false, score: .5, confidence: "medium",
  indicators: { water_balance_mm: -185, bare_soil_days: 35, erosion_risk: "bajo", infiltration: "alta",
                residue_t_ha_yr: 8.3, families: 2, pest_break: 0 },
  why: "", evidence: [], benefits: {}, gaps: [], risks: [],
  sequence: [{ crop: "centeno", start: "04-15", end: "09-30", cover: true },
             { crop: "soja", start: "11-01", end: "04-10", cover: true }],
  crops_info: [crop("centeno", "Centeno", "cover"),
               crop("soja", "Soja", "grain", { n_fixation: true, ph_min: 5.5, ph_max: 7 })],
} as Strategy;

function View({ ph }: { ph?: number }) {
  const { t } = useT();
  return <RotationPlan s={strategy} soilPh={ph} t={t} />;
}

it("explains the rotation month by month for someone who does not know it", () => {
  render(<I18nProvider><View ph={5.2} /></I18nProvider>);
  expect(screen.getByText(/se repite cada 1 año/i)).toBeInTheDocument();
  expect(screen.getByText(/15 abr.*30 sept?.*centeno.*cultivo de cobertura/i)).toBeInTheDocument();
  expect(screen.getByText(/1 oct.*31 oct.*barbecho \(31 días\)/i)).toBeInTheDocument();
  expect(screen.getByText(/1 nov.*10 abr.*soja/i)).toBeInTheDocument();
  expect(screen.getByText(/después.*vuelve a empezar con centeno/i)).toBeInTheDocument();
  expect(screen.getByText(/soja es una leguminosa/i)).toBeInTheDocument();
  expect(screen.getByText(/pH 5,2.*por debajo.*5,5–7.*encalar/i)).toBeInTheDocument();
  expect(screen.getByText(/faltan 185 mm por año/i)).toBeInTheDocument();
  expect(screen.getByText("Barbecho")).toBeInTheDocument();
});

it("explains the month-by-month bar with a legend and the crop names", async () => {
  const { SeqBar } = await import("./FieldLens");
  function Bar() {
    const { t } = useT();
    return <SeqBar s={strategy} t={t} />;
  }
  render(<I18nProvider><Bar /></I18nProvider>);
  expect(screen.getByText(/cómo leerlo/i)).toBeInTheDocument();
  expect(screen.getByText("Cultivo en el lote")).toBeInTheDocument();
  expect(screen.getByText(/sin este cultivo \(barbecho/i)).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /soja: en el lote de nov.* → abr/i })).toBeInTheDocument();
  expect(screen.queryByText("cubierto")).not.toBeInTheDocument();
});

it("says what to do with the land in the months without a crop", async () => {
  const { SeqBar } = await import("./FieldLens");
  function Bar() {
    const { t } = useT();
    return <SeqBar s={strategy} t={t} soilPh={6.4} />;
  }
  render(<I18nProvider><Bar /></I18nProvider>);
  expect(screen.getByRole("heading", { name: /meses sin cultivo: qué hacer/i })).toBeInTheDocument();
  expect(screen.getByText(/1 oct.*31 oct.*\(31 días sin cultivo\)/i)).toBeInTheDocument();
  expect(screen.getByText(/después de centeno y antes de soja/i)).toBeInTheDocument();
  expect(screen.getByText(/controlar las malezas/i)).toBeInTheDocument();
  expect(screen.getByText(/unas semanas antes de sembrar soja/i)).toBeInTheDocument();
});

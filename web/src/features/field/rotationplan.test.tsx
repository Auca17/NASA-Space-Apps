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
  expect(screen.getByRole("heading", { name: /por qué está cada cultivo/i })).toBeInTheDocument();
  expect(screen.getByText(/es una leguminosa: fija nitrógeno del aire, así que centeno/i)).toBeInTheDocument();
  expect(screen.getByText(/^cultivo de cobertura: no se cosecha. ocupa el lote/i)).toBeInTheDocument();
  expect(screen.getByText(/pH del suelo 5,2: por debajo de su rango \(5,5–7\)\. Hay que encalar/i)).toBeInTheDocument();
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
  expect(screen.getByText(/verde: el cultivo de esa fila.*centeno \(abr → sept?\.?\), soja \(nov → abr\)/i)).toBeInTheDocument();
  expect(screen.getByText(/marrón: barbecho.*1 oct → 31 oct/i)).toBeInTheDocument();
  expect(screen.getByText(/gris: en esos meses el lote lo ocupa otro cultivo/i)).toBeInTheDocument();
  // the soy row names the crop that fills its other months
  const soy = screen.getByRole("img", { name: /soja: en el lote/i });
  expect(soy).toHaveAccessibleName(/may–sept?\.?: centeno.*oct–oct\.?: barbecho/i);
  expect(soy).toHaveTextContent("centeno");
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
  expect(screen.getByText(/con la cobertura de centeno ya secada/i)).toBeInTheDocument();
  expect(screen.getByText(/barbecho químico final/i)).toBeInTheDocument();
  const sow = screen.getByText(/^sembrar soja\.$/i);
  expect(sow.closest("li")).toHaveTextContent(/1 nov.*sembrar soja/i);
});

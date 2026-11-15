import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MeasuresCard, RotationResults } from "./FieldLens";
import es from "../../i18n/es.json";
import type { CaseEntry, DiagnoseResponse, Measure,
              RotationsResponse, Strategy } from "../../api/types";

const t = (k: string, v?: Record<string, string | number>) => {
  let s = (es as Record<string, string>)[k] ?? k;
  if (v) for (const [kk, vv] of Object.entries(v)) {
    s = s.replaceAll(`{${kk}}`, String(vv));
  }
  return s;
};

const strat = (id: string, extra = {}): Strategy => ({
  id, name: id, is_current: false, score: 0.5, confidence: "high",
  indicators: {}, why: "", evidence: [], benefits: {}, gaps: [],
  risks: [], sequence: [{ crop: "soja", start: "11-01", end: "04-15" }],
  ...extra,
} as Strategy);

const patagonia: DiagnoseResponse = {
  diagnosis_id: "d", area_ha: 50, centroid: [-54.8, -68.3],
  zone: "patagonia", province: "Tierra del Fuego", country: "AR",
  h3_r5: [], h3_r6: [], cards: [],
  calendar: { months: [], rows: [] },
};

describe("RotationResults (task 15.1 regression)", () => {
  it("shows the empty-zone notice and no strategy cards", () => {
    const rots: RotationsResponse = {
      strategies: [], disclaimer: "", confidence: "low",
      gaps: ["sin rotaciones validadas para esta zona"],
    };
    render(<RotationResults rots={rots} diag={patagonia}
                            explain={{}} t={t} />);
    expect(screen.getAllByText(/sin rotaciones validadas/i).length)
      .toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/agrónomo\/a/i)).toBeInTheDocument();
    expect(document.querySelectorAll(".strategy")).toHaveLength(0);
    expect(screen.getByText(/Zona: Patagonia/)).toBeInTheDocument();
  });

  it("shows the zone's documented reference when the API sends one", () => {
    const rots: RotationsResponse = {
      strategies: [], disclaimer: "", confidence: "low",
      gaps: ["sin rotaciones validadas para esta zona"],
      zone_references: [{
        zone: "patagonia",
        text: "Referencia de INTA para el Valle Inferior del Río Negro "
          + "bajo riego: 4 a 5 ciclos de pastura de alfalfa, 2 de "
          + "cebolla y 2 de maíz. No la calculamos todavía.",
        source: "INTA Valle Inferior del Río Negro",
      }],
    };
    render(<RotationResults rots={rots} diag={patagonia}
                            explain={{}} t={t} />);
    expect(screen.getAllByText(/Valle Inferior del Río Negro/).length)
      .toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/No la calculamos todavía/))
      .toBeInTheDocument();
    // still no computed rotation
    expect(document.querySelectorAll(".strategy")).toHaveLength(0);
  });
});

describe("strategy card sections (P1-3.3)", () => {
  const rots: RotationsResponse = {
    disclaimer: "", confidence: "high",
    strategies: [
      strat("soja-soja", { is_current: true }),
      strat("trigo-soja", {
        evidence: [{ text: "ev", indicator: "x" }],
        gaps: ["g1"], risks: ["r1"],
        measures: [{ id: "m1", name: "M" }],
      }),
    ],
  };
  it("keeps why/benefits open, other sections as native details", () => {
    render(<RotationResults rots={rots} diag={patagonia}
                            explain={{}} t={t} />);
    const secs = [...document.querySelectorAll("details.sec")];
    expect(secs.length).toBeGreaterThanOrEqual(4);
    // every section is a native details/summary (keyboard operable)
    for (const d of secs) {
      expect(d.querySelector("summary")).toBeTruthy();
    }
    // evidence/gaps/risks/measures start collapsed with a count badge
    const alt = document.querySelectorAll(".strategy")[1];
    const evd = [...alt.querySelectorAll("details.sec")].find((d) =>
      d.querySelector("summary")?.textContent?.includes("Evidencia"));
    expect(evd?.hasAttribute("open")).toBe(false);
    expect(evd?.querySelector(".count")?.textContent?.trim()).toBe("1");
  });
  it("renders the comparison table and the afinidad bar", () => {
    render(<RotationResults rots={rots} diag={patagonia}
                            explain={{}} t={t} />);
    expect(document.querySelector(".aff-bar")).toBeTruthy();
    expect(screen.getByText(/Comparada con tu rotación actual/))
      .toBeInTheDocument();
    expect(document.querySelectorAll(".seqbar").length)
      .toBeGreaterThan(0);
  });
});

const sanGenaro: CaseEntry = {
  id: "san-genaro-2026-05-04",
  place: "San Genaro, Santa Fe",
  date: "2026-05-04",
  summary: "Una cosechadora se prendió fuego y el incendio se propagó "
    + "al lote de soja.",
  source: {
    title: "Reporte del incendio (MDR)",
    url: "https://mdr.ar/contenido/51738/x",
  },
  lessons: ["Ubicación exacta y acceso al lote"],
  kind: "news_report",
};

const meas = (id: string, extra = {}): Measure => ({
  id, name: id, why: "porque", ...extra,
} as Measure);

describe("MeasuresCard + real case (task 21.5)", () => {
  it("shows 'Un caso real' when clean_harvester is in the list", () => {
    render(<MeasuresCard measures={[meas("clean_harvester")]}
                         cases={[sanGenaro]} t={t} />);
    expect(screen.getByText(/Un caso real/)).toBeInTheDocument();
    expect(screen.getByText(/San Genaro, Santa Fe/)).toBeInTheDocument();
    expect(screen.getByText(/cosechadora se prendió fuego/))
      .toBeInTheDocument();
    expect(screen.getByText(/Reporte periodístico/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Reporte del incendio/ });
    expect(link).toHaveAttribute("href", sanGenaro.source.url);
    expect(screen.getByText(/Ubicación exacta/)).toBeInTheDocument();
  });

  it("shows the case for harvest_timing too, but not for other "
     + "measures", () => {
    const first = render(<MeasuresCard measures={[meas("harvest_timing")]}
                                       cases={[sanGenaro]} t={t} />);
    expect(screen.getByText(/Un caso real/)).toBeInTheDocument();
    first.unmount();
    render(<MeasuresCard measures={[meas("maintain_firebreak")]}
                         cases={[sanGenaro]} t={t} />);
    expect(screen.queryByText(/Un caso real/)).not.toBeInTheDocument();
  });

  it("renders the checks and the firebreak reference width", () => {
    const m = meas("maintain_firebreak", {
      requires: { people: 2, reference_width_m: 30,
                  reference_width_note: "referencia prudente" },
      checks: ["revisar el matachispas del escape"],
    });
    render(<MeasuresCard measures={[m]} cases={[]} t={t} />);
    expect(screen.getByText(/ancho de referencia: 30/))
      .toBeInTheDocument();
    expect(screen.getByText(/referencia prudente/)).toBeInTheDocument();
    expect(screen.getByText(/matachispas/)).toBeInTheDocument();
  });
});

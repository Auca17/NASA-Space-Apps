import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RotationResults } from "./FieldLens";
import es from "../../i18n/es.json";
import type { DiagnoseResponse, RotationsResponse,
              Strategy } from "../../api/types";

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

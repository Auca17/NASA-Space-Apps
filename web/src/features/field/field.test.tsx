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

describe("reference scenario labels (No sé)", () => {
  const rots: RotationsResponse = {
    disclaimer: "", confidence: "high",
    strategies: [
      strat("soja-maiz", { is_current: true,
        why: "Es tu rotación actual; sirve de referencia." }),
      strat("trigo-soja"),
    ],
  };
  const explain = {
    "soja-maiz": "soja-maiz: es tu rotación actual; los cambios se miden contra ella.",
    "trigo-soja": "trigo-soja: x. Cambios frente a la actual: Rastrojo +2.",
  };

  it("labels the baseline as Escenario de referencia in card, explanation and table", () => {
    render(<RotationResults rots={rots} diag={patagonia}
                            explain={explain} t={t} reference />);
    const cur = document.querySelector(".strategy.current")!;
    expect(cur.querySelector(".badge.role")).toHaveTextContent(
      "Escenario de referencia");
    expect(cur).not.toHaveTextContent(/tu rotación actual/i);
    expect(cur).toHaveTextContent(/rotación más común en tu zona/);
    expect(screen.getByText(/Comparada con el escenario de referencia/))
      .toBeInTheDocument();
    expect(document.querySelector("table.cmp thead th"))
      .toHaveTextContent("Escenario de referencia: soja-maiz");
    expect(screen.getByText(/frente al escenario de referencia/))
      .toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/frente a la actual/);
  });

  it("uses Tu rotación actual when the user picked their rotation", () => {
    render(<RotationResults rots={rots} diag={patagonia}
                            explain={explain} t={t} />);
    const cur = document.querySelector(".strategy.current")!;
    expect(cur.querySelector(".badge.role")).toHaveTextContent(
      "Tu rotación actual");
    expect(document.body).not.toHaveTextContent(/escenario de referencia/i);
  });
});

describe("diagnosis tile values", () => {
  it("shows backend ids such as flat or bajo as words", async () => {
    const { DiagTileForTest } = await import("./FieldLens");
    const fmt = new Intl.NumberFormat("es");
    const c = (id: string, value: string) => ({ id, value, text: "",
      source: "", confidence: "high" as const });
    render(<>
      <DiagTileForTest c={c("water_trend", "flat")} t={t} fmt={fmt} />
      <DiagTileForTest c={c("fire", "muy_alto")} t={t} fmt={fmt} />
    </>);
    const vals = [...document.querySelectorAll(".dtile-value")]
      .map((e) => e.textContent);
    expect(vals).toEqual(["estable", "muy alto"]);
  });
});

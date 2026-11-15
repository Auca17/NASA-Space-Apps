import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import es from "../../i18n/es.json";
import { I18nProvider } from "../../i18n";
import { DiagTile } from "./DiagTile";
import type { Card as DiagCard } from "../../api/types";

const t = (k: string, v?: Record<string, string | number>) => {
  let s = (es as Record<string, string>)[k] ?? k;
  if (v) for (const [kk, vv] of Object.entries(v)) {
    s = s.replaceAll(`{${kk}}`, String(vv));
  }
  return s;
};
const fmt = new Intl.NumberFormat("es");
const card = (id: string): DiagCard => ({
  id, value: 1, text: "", source: "", confidence: "high" });

describe("DiagTile glossary placement", () => {
  const wrap = (id: string) =>
    render(<I18nProvider><DiagTile c={card(id)} t={t} fmt={fmt} />
           </I18nProvider>);

  it("adds a ? per mapped term next to the card title", () => {
    wrap("frost");
    const label = document.querySelector(".dtile-label")!;
    expect(label.querySelectorAll(".glossary-btn").length).toBe(2);
    expect(screen.getByRole("button", { name: "helada?" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ventana libre de heladas?" }))
      .toBeInTheDocument();
  });

  it("maps the soil moisture card to the anomaly term", () => {
    wrap("soil_moisture");
    expect(screen.getByRole("button",
      { name: "anomalía de humedad del suelo?" })).toBeInTheDocument();
  });

  it("adds no ? to unmapped cards", () => {
    wrap("slope");
    expect(document.querySelector(".dtile-label .glossary-btn")).toBeNull();
  });
});

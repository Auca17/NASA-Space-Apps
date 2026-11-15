import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Glossary, GLOSS_TERMS } from "./Glossary";
import { I18nProvider, useT } from "../i18n";
import es from "../i18n/es.json";
import en from "../i18n/en.json";
import { Welcome } from "../features/welcome/Welcome";

describe("Glossary", () => {
  it("has i18n text for every term in both languages", () => {
    for (const term of GLOSS_TERMS) {
      for (const lang of [es, en]) {
        expect(lang[`gloss.${term}`]?.length).toBeGreaterThan(0);
        expect(lang[`gloss.def.${term}`]?.length).toBeGreaterThan(10);
      }
    }
  });
  it("opens a tooltip with the term text", () => {
    render(<I18nProvider><Glossary term="ndvi" /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "NDVI?" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent(/verdor/);
  });
});

describe("Welcome", () => {
  it("leads with Analizar mi campo and offers the Mendoza demo", () => {
    const onAnalyze = vi.fn(), onDemo = vi.fn(), onLocate = vi.fn();
    render(
      <I18nProvider>
        <Welcome onAnalyze={onAnalyze} onDemo={onDemo}
                 onLocate={onLocate} />
      </I18nProvider>);
    const primary = document.querySelector("button.primary");
    expect(primary).toHaveTextContent("Analizar mi campo");
    fireEvent.click(primary!);
    expect(onAnalyze).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /mendoza/i }));
    expect(onDemo).toHaveBeenCalledOnce();
    // retired modes are gone; the disclosure keeps only my-zone +
    // city search, both feeding the field flow via onLocate
    (document.querySelector("details.welcome-more") as HTMLDetailsElement)
      .open = true;
    expect(screen.queryByRole("button",
      { name: /mapa de fuego|focos en vivo|fire map|live hotspots/i }))
      .not.toBeInTheDocument();
    const geo = { getCurrentPosition: vi.fn((ok) => ok?.(
      { coords: { latitude: -34.5, longitude: -58.5 } })) };
    Object.defineProperty(navigator, "geolocation", {
      value: geo, configurable: true });
    fireEvent.click(screen.getByRole("button", { name: /zona/i }));
    expect(onLocate).toHaveBeenCalledWith(-34.5, -58.5);
  });
  it("falls back to city search when geolocation denied", async () => {
    // simulate geolocation denied
    const geo = { getCurrentPosition: vi.fn((_ok, err) => err?.({})) };
    Object.defineProperty(navigator, "geolocation", {
      value: geo, configurable: true });
    render(
      <I18nProvider>
        <Welcome onAnalyze={() => {}} onDemo={() => {}}
                 onLocate={() => {}} />
      </I18nProvider>);
    (document.querySelector("details.welcome-more") as HTMLDetailsElement)
      .open = true;
    fireEvent.click(screen.getByRole("button", { name: /zona/i }));
    expect(await screen.findByText(/sin gps/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/buscar ciudad/i)).toBeInTheDocument();
  });
});

function LangProbe() {
  const { t } = useT();
  return <span>{t("emerg.copy")}</span>;
}

describe("i18n", () => {
  it("defaults to Spanish and translates", () => {
    render(<I18nProvider><LangProbe /></I18nProvider>);
    expect(screen.getByText(es["emerg.copy"])).toBeInTheDocument();
  });
});

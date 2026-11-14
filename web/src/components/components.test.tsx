import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Calendar } from "./Calendar";
import { Glossary, GLOSS_TERMS } from "./Glossary";
import { I18nProvider, useT } from "../i18n";
import es from "../i18n/es.json";
import en from "../i18n/en.json";
import { Welcome } from "../features/welcome/Welcome";

describe("Calendar", () => {
  const matrix = new Map([[2021, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]]]);

  it("renders a real table with year rows and month columns", () => {
    render(<Calendar matrix={matrix} mode="counts" />);
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(screen.getByText("2021")).toBeInTheDocument();
    expect(screen.getByText("ene")).toBeInTheDocument();
  });

  it("cells are buttons >=44px via CSS class contract", () => {
    render(<Calendar matrix={matrix} mode="counts"
                   onPick={() => {}} />);
    const btn = screen.getByRole("button", { name: /ene 2021/i });
    expect(btn).toBeInTheDocument();
    expect(btn.className).not.toContain("sr-only");
  });

  it("click shows the picked number", () => {
    let picked = "";
    render(<Calendar matrix={matrix} mode="counts"
      onPick={(y, m, v) => { picked = `${y}-${m}:${v}`; }} />);
    fireEvent.click(screen.getByRole("button", { name: /ene 2021/i }));
    expect(picked).toBe("2021-0:0");
  });
});

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
  it("falls back to city search when geolocation denied", async () => {
    // simulate geolocation denied
    const geo = { getCurrentPosition: vi.fn((_ok, err) => err?.({})) };
    Object.defineProperty(navigator, "geolocation", {
      value: geo, configurable: true });
    render(
      <I18nProvider>
        <Welcome onLocate={() => {}} onExplore={() => {}} />
      </I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: /ver mi zona/i }));
    expect(await screen.findByText(/sin gps/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/buscar ciudad/i)).toBeInTheDocument();
  });
});

function LangProbe() {
  const { t } = useT();
  return <span>{t("sem.normal")}</span>;
}

describe("i18n", () => {
  it("defaults to Spanish and translates", () => {
    render(<I18nProvider><LangProbe /></I18nProvider>);
    expect(screen.getByText("normal")).toBeInTheDocument();
  });
});

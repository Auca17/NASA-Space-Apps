import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nProvider } from "../../i18n";
import { Timeline, TimelinePeek, normalFor } from "./Timeline";
import type { DiagTimeline } from "../../api/types";

const wrap = (ui: ReactElement) =>
  render(<I18nProvider>{ui}</I18nProvider>);

/** 24 complete months ending 2025-12 + a partial 2026-01. */
const MONTHS = ["2024-02","2024-03","2024-04","2024-05","2024-06","2024-07",
  "2024-08","2024-09","2024-10","2024-11","2024-12","2025-01","2025-02",
  "2025-03","2025-04","2025-05","2025-06","2025-07","2025-08","2025-09",
  "2025-10","2025-11","2025-12","2026-01"];

const arr = (v: number, nullAt: number[] = []): (number | null)[] =>
  MONTHS.map((_, i) => nullAt.includes(i) ? null : v);

const fixture = (): DiagTimeline => ({
  months: [...MONTHS],
  partial_last: true,
  headline: "En los últimos 3 meses llovió 35 % menos de lo normal.",
  series: {
    rain_mm: {
      values: arr(80, [3]),
      normal: [110, 100, 90, 70, 40, 30, 25, 30, 50, 80, 95, 105],
      anomaly_pct: arr(-5, [3]),
    },
    tmax_c: {
      values: arr(30),
      normal: [31, 30, 28, 24, 20, 17, 16, 18, 21, 25, 28, 30],
      anomaly_c: arr(0.4),
    },
    root_moisture: {
      // contract: GWETROOT monthly mean 0-1; UI scales to %
      values: arr(0.55),
      normal: [0.60, 0.58, 0.55, 0.52, 0.48, 0.45, 0.44, 0.46,
               0.50, 0.54, 0.58, 0.60],
      anomaly_pct: arr(-2),
    },
    heat_days_35: { values: arr(2) },
    frost_days: { values: arr(1) },
  },
  normals_period: "2001-2020",
  basis: "Las normales son el promedio mensual 2001-2020 de esta celda.",
  source: "NASA POWER daily",
});

describe("normalFor", () => {
  it("expands 12 normals over the month list by calendar month", () => {
    const n = normalFor({ values: [],
      normal: [1,2,3,4,5,6,7,8,9,10,11,12] }, ["2025-01","2025-07","2025-12"]);
    expect(n).toEqual([1, 7, 12]);
  });
});

describe("Timeline", () => {
  it("leads with the API headline", () => {
    wrap(<Timeline timeline={fixture()} />);
    expect(screen.getByText(/llovió 35 % menos de lo normal/))
      .toBeInTheDocument();
  });

  it("renders the four panels with plain titles and units", () => {
    wrap(<Timeline timeline={fixture()} />);
    expect(screen.getAllByText("Lluvia por mes").length)
      .toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Temperatura máxima").length)
      .toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Humedad del suelo en la raíz").length)
      .toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Días de calor y de helada").length)
      .toBeGreaterThanOrEqual(1);
  });

  it("marks anomalous months with hatch rects, not color alone", () => {
    const tl = fixture();
    tl.series.rain_mm!.values![10] = 20;   // 2024-12, normal 105 -> -81 %
    tl.series.rain_mm!.anomaly_pct![10] = -81;
    const { container } = wrap(<Timeline timeline={tl} />);
    expect(container.querySelectorAll("rect.tl-anom").length)
      .toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll("rect.tl-bar.rain.anom").length)
      .toBe(1);
    // the one-line reading names the last complete month
    expect(screen.getByText(/diciembre: 5 % menos de lo normal/i))
      .toBeInTheDocument();
  });

  it("flags the current partial month with a dashed marker and label", () => {
    const { container } = wrap(<Timeline timeline={fixture()} />);
    expect(container.querySelectorAll("rect.tl-partial").length)
      .toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll(".tl-bar.partial").length)
      .toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/mes en curso/).length)
      .toBeGreaterThanOrEqual(1);
  });

  it("leaves gaps on null months and notes missing data", () => {
    const { container } = wrap(<Timeline timeline={fixture()} />);
    // index 3 is null -> 24 rain bars for 25 months
    expect(container.querySelectorAll("rect.tl-bar.rain").length)
      .toBe(MONTHS.length - 1);
    expect(screen.getAllByText("sin datos suficientes").length)
      .toBeGreaterThanOrEqual(1);
  });

  it("carries the same data in a visually hidden table per panel", () => {
    const { container } = wrap(<Timeline timeline={fixture()} />);
    const tables = container.querySelectorAll("table.sr-only");
    expect(tables.length).toBe(4);
    const rain = tables[0];
    expect(rain.textContent).toContain("2024-12");
    expect(rain.textContent).toContain("80");          // value
    expect(rain.textContent).toContain("105");         // december normal
    expect(rain.querySelectorAll("th[scope=row]").length)
      .toBe(MONTHS.length);
  });

  it("shows exact values on focus of a column", () => {
    const { container } = wrap(<Timeline timeline={fixture()} />);
    const cols = container.querySelectorAll(".tl-col");
    fireEvent.focus(cols[11]);                         // 2025-01
    expect(screen.getAllByText(/enero: 80 mm/i).length)
      .toBeGreaterThanOrEqual(1);
  });

  it("renders nothing when the series block is absent", () => {
    const tl = { ...fixture(), series: undefined as never };
    const { container } = wrap(<Timeline timeline={tl} />);
    expect(container.querySelector(".tl")).toBeNull();
  });
});

describe("TimelinePeek", () => {
  it("shows headline + sparkline collapsed and the chart on expand", () => {
    const { container } = wrap(<TimelinePeek timeline={fixture()} />);
    expect(screen.getByText("Cómo viene el año")).toBeInTheDocument();
    expect(container.querySelector(".tl-spark")).toBeTruthy();
    const det = container.querySelector("details.tl-more")!;
    expect(det).not.toHaveAttribute("open");
  });
});

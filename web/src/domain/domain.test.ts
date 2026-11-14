import { describe, it, expect } from "vitest";
import {
  cellsInCircle, cellsInPolygon, cellAt, groupByShard,
} from "./h3area";
import {
  aggregateMonthly, yearMonthMatrix, fireSeasonMatrix,
  rowTotals, toCsv, type CalShard,
} from "./fireSeries";
import { monthlyBaseline, quantile } from "./baseline";
import {
  semaphoreOf, sumDaily, windowStats, semaphoreFromDaily,
  type DailyShard, type SemaphoreConfig,
} from "./semaphore";
import { presentRisk } from "./risk";
import { countT, viridis, rdBu } from "./colors";

const CFG: SemaphoreConfig = {
  windowDays: 30,
  categories: {
    normal: [0, 50], sobre_lo_normal: [50, 80],
    alto: [80, 95], extremo: [95, 100],
  },
  ratioMinMedian: 5,
  baselineStart: "2003-01-01",
  baselineEnd: "2022-12-31",
};

describe("h3area", () => {
  it("50 km circle covers the center cell and groups by r2 shard", () => {
    const cells = cellsInCircle(-33.89, -60.57, 50);
    expect(cells.length).toBeGreaterThan(30);
    const shards = groupByShard(cells);
    expect(shards.size).toBeGreaterThanOrEqual(1);
    const all = [...shards.values()].flat();
    expect(new Set(all).size).toBe(all.length);
    // center cell belongs to one of the shards
    const [center] = cellAt(-33.89, -60.57);
    expect(cells.includes(center)).toBe(true);
    // r2 parents are valid 15-char h3 ids
    const parents = all.map((c) => c.slice(0, 2));
    expect(parents.every((p) => p === "82" || p === "85")).toBe(true);
  });

  it("polygon cells stay inside the polygon area", () => {
    // ~1 deg square: several res-5 centroids must fall inside
    const cells = cellsInPolygon([
      [-34.5, -61], [-34.5, -60], [-33.5, -60], [-33.5, -61],
    ]);
    expect(cells.length).toBeGreaterThan(10);
  });
});

describe("fireSeries", () => {
  const shard: CalShard = {
    shard: "82a967fffffffff",
    months: ["2021-01", "2021-07", "2022-01"],
    cells: {
      a: { m: [5, 3, 7] },
      b: { m: [2, 1, 1] },
      c: { m: [9, 9, 9] }, // outside selection
    },
  };

  it("sums only selected cells into a monthly series", () => {
    const s = aggregateMonthly([shard], new Set(["a", "b"]));
    expect(s.months).toEqual(["2021-01", "2021-07", "2022-01"]);
    expect(s.values).toEqual([7, 4, 8]);
  });

  it("builds a year x month matrix and fire-season view", () => {
    const s = aggregateMonthly([shard], new Set(["a", "b"]));
    const m = yearMonthMatrix(s);
    expect(m.get(2021)![0]).toBe(7);
    expect(m.get(2021)![6]).toBe(4);
    const fs = fireSeasonMatrix(m);
    // Jan 2022 belongs to season 2021 (Jul2021-Jun2022), position 6
    expect(fs.get(2021)![6]).toBe(8);
    // Jul 2021 is position 0 of season 2021
    expect(fs.get(2021)![0]).toBe(4);
    expect(rowTotals(fs).get(2021)).toBe(12);
  });

  it("serializes CSV", () => {
    const csv = toCsv({ months: ["2021-01"], values: [3] });
    expect(csv).toBe("month,n\n2021-01,3\n");
  });
});

describe("baseline", () => {
  it("quantile and monthly baseline over 2003-2022 only", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    const months = ["2002-12", "2003-01", "2004-01", "2023-01"];
    const s = { months, values: [999, 10, 20, 999] };
    const st = monthlyBaseline(s);
    expect(st[0].median).toBe(15); // Jan: 10,20 (2002/2023 excluded)
    expect(st[0].n).toBe(2);
  });
});

describe("semaphore", () => {
  const daily: DailyShard = {
    shard: "x", epoch: "2000-01-01",
    cells: {
      a: { d: [[100, 2], [200, 3]] },
      b: { d: [[100, 1]] },
    },
  };

  it("sums cells per day", () => {
    const m = sumDaily([daily], new Set(["a", "b"]));
    expect(m.get(100)).toBe(3);
    expect(m.get(200)).toBe(3);
  });

  it("categories from percentile", () => {
    const cfg = CFG;
    expect(semaphoreOf(0, Array(20).fill(0), cfg).category)
      .toBe("normal"); // value 0 & median 0 -> normal
    expect(semaphoreOf(10, Array(20).fill(0).concat([5, 6, 7]),
        cfg).category).not.toBe("normal");
    const high = semaphoreOf(99, Array(20).fill(1), cfg);
    expect(["alto", "extremo"]).toContain(high.category);
  });

  it("ratio hidden when median < min; text flag set", () => {
    const r = semaphoreOf(3, Array(20).fill(2), CFG);
    expect(r.ratio).toBeNull();
    expect(r.lowBaseline).toBe(true);
    const r2 = semaphoreOf(20, Array(20).fill(10), CFG);
    expect(r2.ratio).toBe(2);
    expect(r2.lowBaseline).toBe(false);
  });

  it("windowStats never compares against current year", () => {
    const daily2: DailyShard = {
      shard: "x", epoch: "2000-01-01",
      cells: { a: { d: [] } },
    };
    const m = sumDaily([daily2], new Set(["a"]));
    const { base } = windowStats(m, "2000-01-01", "2020-06-15", CFG);
    expect(base.length).toBeLessThanOrEqual(19); // 2003..2022 minus 2020
  });

  it("end-to-end with zero data returns normal", () => {
    const r = semaphoreFromDaily([daily], new Set(["a"]), "2020-01-15", CFG);
    expect(r.category).toBe("normal");
    expect(r.value).toBe(0);
  });
});

describe("risk presentation", () => {
  it("historial + ratio 1 => normal para la época", () => {
    const v = presentRisk({
      p: 0.03, clim: 0.03, ratio: 1, cat: "bajo",
      level: "historial", reasons: ["a"],
    });
    expect(v.normalForSeason).toBe(true);
    expect(v.headline).toBe("normal");
  });
  it("clima con ratio muestra ratioText", () => {
    const v = presentRisk({
      p: 0.2, clim: 0.1, ratio: 2.6, cat: "alto",
      level: "clima", reasons: [],
    });
    expect(v.normalForSeason).toBe(false);
    expect(v.ratioText).toBe("2.6×");
    expect(v.icon).toBe("▲");
  });
});

describe("colors", () => {
  it("countT sqrt-normalizes", () => {
    expect(countT(0, 10)).toBe(0);
    expect(countT(10, 10)).toBe(1);
    expect(countT(100, 10)).toBe(1);
  });
  it("rdBu centers at 0", () => {
    expect(viridis(0)).toBeDefined();
    expect(rdBu(0)).toEqual([247, 247, 247]);
  });
});

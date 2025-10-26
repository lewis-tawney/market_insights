import { describe, expect, it } from "vitest";
import {
  formatCompactNumber,
  sortLeaderboardRows,
  type LeaderboardRow,
} from "../src/lib/sectorLeaderboard";

describe("formatCompactNumber", () => {
  it("returns placeholder for nullish values", () => {
    expect(formatCompactNumber(null)).toBe("—");
    expect(formatCompactNumber(undefined)).toBe("—");
  });

  it("leaves small numbers unchanged", () => {
    expect(formatCompactNumber(950)).toBe("950");
  });

  it("formats thousands, millions, and billions with suffixes", () => {
    expect(formatCompactNumber(1_000)).toBe("1K");
    expect(formatCompactNumber(1_250_000)).toBe("1.3M");
    expect(formatCompactNumber(2_000_000_000)).toBe("2B");
  });
});

describe("sortLeaderboardRows", () => {
  const rows: LeaderboardRow[] = [
    {
      id: "alpha",
      name: "Alpha",
      tickers: [],
      metrics: {
        oneDayChange: 1.2,
        relVol10: 2.05,
        volume: 0,
        avgVolume10: 0,
        volumeMomentum: 0.15,
        sparkline: [],
        leaders: [],
      },
    },
    {
      id: "beta",
      name: "Beta",
      tickers: [],
      metrics: {
        oneDayChange: 3.4,
        relVol10: 1.5,
        volume: 0,
        avgVolume10: 0,
        volumeMomentum: 0.22,
        sparkline: [],
        leaders: [],
      },
    },
    {
      id: "gamma",
      name: "Gamma",
      tickers: [],
      metrics: {
        oneDayChange: null,
        relVol10: null,
        volume: 0,
        avgVolume10: 0,
        volumeMomentum: null,
        sparkline: [],
        leaders: [],
      },
    },
  ];

  it("sorts by relative volume descending with nulls last", () => {
    const sorted = sortLeaderboardRows(rows, "relVol10");
    expect(sorted.map((row) => row.id)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("sorts by one-day change descending with nulls last", () => {
    const sorted = sortLeaderboardRows(rows, "oneDayChange");
    expect(sorted.map((row) => row.id)).toEqual(["beta", "alpha", "gamma"]);
  });

  it("sorts by volume momentum descending with nulls last", () => {
    const sorted = sortLeaderboardRows(rows, "volumeMomentum");
    expect(sorted.map((row) => row.id)).toEqual(["beta", "alpha", "gamma"]);
  });
});

import { describe, expect, it } from "vitest";
import { computeSnapshotPL } from "./bankroll-snapshots";

const NOW = new Date(2026, 4, 19, 12, 0, 0);

function daysAgo(n: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d;
}

describe("computeSnapshotPL", () => {
  it("returns daily/weekly/monthly realized P/L for the snapshot instant", () => {
    const settled = [
      { settledAt: daysAgo(0), actualProfitLoss: 25, actualProfitLossCents: 2525 },
      { settledAt: daysAgo(3), actualProfitLoss: -10 },
      { settledAt: daysAgo(8), actualProfitLoss: 40 },
      { settledAt: daysAgo(20), actualProfitLoss: -5 },
      { settledAt: daysAgo(45), actualProfitLoss: 100 },
    ];

    const out = computeSnapshotPL(settled, NOW);

    expect(out.dailyPL).toBe(25.25);
    expect(out.weeklyPL).toBe(15.25);
    expect(out.monthlyPL).toBe(50.25);
  });

  it("ignores rows with missing settledAt or non-finite P/L", () => {
    const settled = [
      { settledAt: daysAgo(0), actualProfitLoss: 20 },
      { settledAt: null, actualProfitLoss: 999 },
      { settledAt: daysAgo(0), actualProfitLoss: Number.NaN },
    ];

    const out = computeSnapshotPL(settled, NOW);

    expect(out.dailyPL).toBe(20);
    expect(out.weeklyPL).toBe(20);
    expect(out.monthlyPL).toBe(20);
  });
});

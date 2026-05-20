import { describe, expect, it } from "vitest";
import {
  buildBankrollSeries,
  buildDailyExpectedActualSeries,
  buildMonthlyProfitSeries,
  computeDashboardMetrics,
  type AnalyticsTradeLike,
} from "./analytics";

function trade(overrides: Partial<AnalyticsTradeLike>): AnalyticsTradeLike {
  return {
    status: "locked_paper_trade",
    tradeDate: new Date("2026-05-20T12:00:00Z"),
    totalStakeExposure: 100,
    worstCasePL: 5,
    result: null,
    ...overrides,
  };
}

describe("computeDashboardMetrics", () => {
  it("does not count verification candidates or failed verification as locked exposure", () => {
    const metrics = computeDashboardMetrics([
      trade({ status: "locked_paper_trade", totalStakeExposure: 100, worstCasePL: 10 }),
      trade({ status: "pending_verification", totalStakeExposure: 200, worstCasePL: 20 }),
      trade({ status: "not_placed_odds_moved", totalStakeExposure: 300, worstCasePL: 30 }),
    ]);

    expect(metrics.visibleTrades).toHaveLength(2);
    expect(metrics.openExposure).toBe(100);
    expect(metrics.candidateExposure).toBe(200);
    expect(metrics.expectedOpenProfit).toBe(10);
  });

  it("computes realized P/L and ROI only from settled visible trades", () => {
    const metrics = computeDashboardMetrics([
      trade({ status: "settled_win", totalStakeExposure: 100, result: { actualProfitLoss: 12 } }),
      trade({ status: "settled_loss", totalStakeExposure: 50, result: { actualProfitLoss: -6 } }),
      trade({ status: "locked_paper_trade", totalStakeExposure: 100, worstCasePL: 8 }),
    ]);

    expect(metrics.actualPL).toBe(6);
    expect(metrics.settledStaked).toBe(150);
    expect(metrics.roiPct).toBeCloseTo(4);
    expect(metrics.winsCount).toBe(1);
    expect(metrics.lossCount).toBe(1);
  });
});

describe("database-backed chart series helpers", () => {
  it("builds monthly realized profit buckets without placeholder data", () => {
    const series = buildMonthlyProfitSeries(
      [
        trade({ status: "settled_win", tradeDate: new Date("2026-04-05T00:00:00Z"), result: { actualProfitLoss: 25 } }),
        trade({ status: "settled_loss", tradeDate: new Date("2026-05-05T00:00:00Z"), result: { actualProfitLoss: -5 } }),
      ],
      2,
      new Date("2026-05-20T00:00:00Z")
    );

    expect(series).toEqual([
      { m: "Apr", v: 25 },
      { m: "May", v: -5 },
    ]);
  });

  it("builds expected vs actual daily buckets", () => {
    const series = buildDailyExpectedActualSeries(
      [
        trade({ status: "locked_paper_trade", tradeDate: new Date("2026-05-19T12:00:00Z"), worstCasePL: 4 }),
        trade({ status: "settled_win", tradeDate: new Date("2026-05-20T12:00:00Z"), worstCasePL: 8, result: { actualProfitLoss: 10 } }),
      ],
      2,
      new Date("2026-05-20T23:00:00Z")
    );

    expect(series).toEqual([
      { d: "May 19", expected: 4, actual: 0 },
      { d: "May 20", expected: 8, actual: 10 },
    ]);
  });

  it("builds a running bankroll series from settled results", () => {
    const series = buildBankrollSeries(
      [
        trade({ status: "settled_win", tradeDate: new Date("2026-05-18T12:00:00Z"), result: { actualProfitLoss: 10 } }),
        trade({ status: "settled_loss", tradeDate: new Date("2026-05-20T12:00:00Z"), result: { actualProfitLoss: -3 } }),
      ],
      1000,
      3,
      new Date("2026-05-20T23:00:00Z")
    );

    expect(series).toEqual([
      { d: "May 18", v: 1010 },
      { d: "May 19", v: 1010 },
      { d: "May 20", v: 1007 },
    ]);
  });
});

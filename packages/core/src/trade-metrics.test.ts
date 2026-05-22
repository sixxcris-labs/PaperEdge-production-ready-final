import { describe, it, expect } from "vitest";
import {
  getConservativeExpectedProfit,
  getOptimisticExpectedProfit,
  getOpenExposure,
  getCandidateExposure,
  getActualProfitLoss,
  getSettledStake,
  sumOpenExposure,
  sumCandidateExposure,
  sumConservativeExpectedProfit,
  sumActualProfitLoss,
  getRealizedRoiPct,
  getLargestExposurePct,
  getTradeMetricState,
  type TradeMetricInput,
} from "./trade-metrics";

// Tiny factory so tests stay readable.
function trade(o: Partial<TradeMetricInput>): TradeMetricInput {
  return { status: "paper_traded", ...o };
}

// ─── getConservativeExpectedProfit ──────────────────────────────────────────

describe("getConservativeExpectedProfit", () => {
  it("prefers cents-backed worst-case values when present", () => {
    expect(
      getConservativeExpectedProfit(
        trade({
          worstCasePLCents: 499,
          worstCasePL: 4.35,
          expectedProfitIfA: 10,
          expectedProfitIfB: 5,
        }),
      ),
    ).toBe(4.99);
  });

  it("uses worstCasePL when present", () => {
    expect(
      getConservativeExpectedProfit(
        trade({ worstCasePL: 4.35, expectedProfitIfA: 10, expectedProfitIfB: 5 }),
      ),
    ).toBe(4.35);
  });

  it("falls back to min(profitIfA, profitIfB)", () => {
    expect(
      getConservativeExpectedProfit(
        trade({ expectedProfitIfA: 10, expectedProfitIfB: 5 }),
      ),
    ).toBe(5);
  });

  it("uses the available leg when only one is set", () => {
    expect(
      getConservativeExpectedProfit(trade({ expectedProfitIfA: 7 })),
    ).toBe(7);
    expect(
      getConservativeExpectedProfit(trade({ expectedProfitIfB: 9 })),
    ).toBe(9);
  });

  it("returns 0 when no profit fields are present", () => {
    expect(getConservativeExpectedProfit(trade({}))).toBe(0);
  });

  it("ignores non-finite worstCasePL", () => {
    expect(
      getConservativeExpectedProfit(
        trade({
          worstCasePL: Number.NaN,
          expectedProfitIfA: 3,
          expectedProfitIfB: 8,
        }),
      ),
    ).toBe(3);
  });

  it("zeros out for draft / excluded / failed / settled", () => {
    const base = { worstCasePL: 4.35 };
    expect(getConservativeExpectedProfit(trade({ status: "draft", ...base }))).toBe(0);
    expect(getConservativeExpectedProfit(trade({ status: "replaced_removed", ...base }))).toBe(0);
    expect(getConservativeExpectedProfit(trade({ status: "cancelled", ...base }))).toBe(0);
    expect(getConservativeExpectedProfit(trade({ status: "not_placed_odds_moved", ...base }))).toBe(0);
    expect(getConservativeExpectedProfit(trade({ status: "settled_won", ...base }))).toBe(0);
  });
});

// ─── getOptimisticExpectedProfit ────────────────────────────────────────────

describe("getOptimisticExpectedProfit", () => {
  it("uses bestCasePL when present", () => {
    expect(
      getOptimisticExpectedProfit(
        trade({ bestCasePL: 12, expectedProfitIfA: 10, expectedProfitIfB: 5 }),
      ),
    ).toBe(12);
  });

  it("falls back to max(profitIfA, profitIfB)", () => {
    expect(
      getOptimisticExpectedProfit(
        trade({ expectedProfitIfA: 10, expectedProfitIfB: 5 }),
      ),
    ).toBe(10);
  });

  it("falls through to conservative when no leg data exists", () => {
    expect(
      getOptimisticExpectedProfit(trade({ worstCasePL: 2.5 })),
    ).toBe(2.5);
  });
});

// ─── getOpenExposure / getCandidateExposure ─────────────────────────────────

describe("exposure helpers", () => {
  it("getOpenExposure returns stake for locked / pending statuses only", () => {
    expect(
      getOpenExposure(
        trade({ status: "paper_traded", totalStakeExposureCents: 20050 }),
      ),
    ).toBe(200.5);
    expect(getOpenExposure(trade({ status: "paper_traded", totalStakeExposure: 200 }))).toBe(200);
    expect(getOpenExposure(trade({ status: "locked_paper_trade", totalStakeExposure: 150 }))).toBe(150);
    expect(getOpenExposure(trade({ status: "locked_paper_trade_upgraded", totalStakeExposure: 300 }))).toBe(300);
    expect(getOpenExposure(trade({ status: "pending_result", totalStakeExposure: 100 }))).toBe(100);
    expect(getOpenExposure(trade({ status: "locked", totalStakeExposure: 75 }))).toBe(75); // legacy alias
  });

  it("getOpenExposure is zero for candidate / settled / failed / excluded", () => {
    const stake = { totalStakeExposure: 500 };
    expect(getOpenExposure(trade({ status: "unverified", ...stake }))).toBe(0);
    expect(getOpenExposure(trade({ status: "verified", ...stake }))).toBe(0);
    expect(getOpenExposure(trade({ status: "settled_won", ...stake }))).toBe(0);
    expect(getOpenExposure(trade({ status: "not_placed_line_moved", ...stake }))).toBe(0);
    expect(getOpenExposure(trade({ status: "replaced_removed", ...stake }))).toBe(0);
  });

  it("getCandidateExposure covers unverified + ready, not locked", () => {
    const stake = { totalStakeExposure: 80 };
    expect(getCandidateExposure(trade({ status: "unverified", ...stake }))).toBe(80);
    expect(getCandidateExposure(trade({ status: "verifying", ...stake }))).toBe(80);
    expect(getCandidateExposure(trade({ status: "pending_verification", ...stake }))).toBe(80);
    expect(getCandidateExposure(trade({ status: "verified", ...stake }))).toBe(80);
    expect(getCandidateExposure(trade({ status: "ready", ...stake }))).toBe(80);

    expect(getCandidateExposure(trade({ status: "paper_traded", ...stake }))).toBe(0);
    expect(getCandidateExposure(trade({ status: "settled_won", ...stake }))).toBe(0);
  });

  it("treats missing / non-finite stake as zero", () => {
    expect(getOpenExposure(trade({ status: "paper_traded" }))).toBe(0);
    expect(getOpenExposure(trade({ status: "paper_traded", totalStakeExposure: null }))).toBe(0);
    expect(getOpenExposure(trade({ status: "paper_traded", totalStakeExposure: Number.NaN }))).toBe(0);
  });
});

// ─── getActualProfitLoss / getSettledStake ──────────────────────────────────

describe("settled metrics", () => {
  it("prefers cents-backed realized P/L when both representations exist", () => {
    expect(
      getActualProfitLoss(
        trade({
          status: "settled_won",
          result: { actualProfitLoss: 9.99, actualProfitLossCents: 875 },
        }),
      ),
    ).toBe(8.75);
  });

  it("pulls actualProfitLoss from the result relation for settled trades", () => {
    expect(
      getActualProfitLoss(trade({ status: "settled_won", result: { actualProfitLoss: 42 } })),
    ).toBe(42);
    expect(
      getActualProfitLoss(trade({ status: "settled_loss", result: { actualProfitLoss: -15 } })),
    ).toBe(-15);
    expect(
      getActualProfitLoss(trade({ status: "settled_push_void", result: { actualProfitLoss: 0 } })),
    ).toBe(0);
    expect(
      getActualProfitLoss(trade({ status: "voided", result: { actualProfitLoss: -3 } })), // legacy
    ).toBe(-3);
  });

  it("returns 0 for non-settled trades regardless of result presence", () => {
    expect(
      getActualProfitLoss(trade({ status: "paper_traded", result: { actualProfitLoss: 999 } })),
    ).toBe(0);
    expect(
      getActualProfitLoss(trade({ status: "unverified", result: null })),
    ).toBe(0);
  });

  it("getSettledStake counts only settled rows", () => {
    expect(getSettledStake(trade({ status: "settled_won", totalStakeExposure: 200 }))).toBe(200);
    expect(getSettledStake(trade({ status: "paper_traded", totalStakeExposure: 200 }))).toBe(0);
  });
});

// ─── Portfolio aggregates ───────────────────────────────────────────────────

describe("portfolio aggregates", () => {
  const portfolio: TradeMetricInput[] = [
    // 2 open (one locked, one pending) → total open exposure 350
    { status: "paper_traded", totalStakeExposure: 200, worstCasePL: 4.35 },
    { status: "pending_result", totalStakeExposure: 150, worstCasePL: 6.10 },
    // 1 candidate → 80 candidate exposure
    { status: "unverified", totalStakeExposure: 80, worstCasePL: 3.00 },
    // 2 settled → +50, -20 net +30, total settled stake 400
    { status: "settled_won", totalStakeExposure: 200, result: { actualProfitLoss: 50 } },
    { status: "settled_loss", totalStakeExposure: 200, result: { actualProfitLoss: -20 } },
    // failed + excluded should not contribute
    { status: "not_placed_odds_moved", totalStakeExposure: 999, worstCasePL: 5 },
    { status: "replaced_removed", totalStakeExposure: 999, worstCasePL: 5 },
  ];

  it("sumOpenExposure ignores everything except locked + pending", () => {
    expect(sumOpenExposure(portfolio)).toBe(350);
  });

  it("sumCandidateExposure ignores locked and settled", () => {
    expect(sumCandidateExposure(portfolio)).toBe(80);
  });

  it("sumConservativeExpectedProfit covers candidate + open, excludes settled / failed / excluded", () => {
    // candidate(3) + locked(4.35) + pending(6.10) = 13.45
    expect(sumConservativeExpectedProfit(portfolio)).toBeCloseTo(13.45, 4);
  });

  it("sumActualProfitLoss covers only settled", () => {
    expect(sumActualProfitLoss(portfolio)).toBe(30);
  });

  it("getRealizedRoiPct = realized P&L / settled stake", () => {
    // 30 / 400 = 7.5%
    expect(getRealizedRoiPct(portfolio)).toBeCloseTo(7.5, 4);
  });

  it("getRealizedRoiPct returns 0 with no settled stake", () => {
    expect(getRealizedRoiPct([{ status: "paper_traded", totalStakeExposure: 200 }])).toBe(0);
    expect(getRealizedRoiPct([])).toBe(0);
  });
});

// ─── getLargestExposurePct ──────────────────────────────────────────────────

describe("getLargestExposurePct", () => {
  it("returns max open exposure as percent of bankroll", () => {
    const trades: TradeMetricInput[] = [
      { status: "paper_traded", totalStakeExposure: 100 },
      { status: "paper_traded", totalStakeExposure: 250 },
      { status: "pending_result", totalStakeExposure: 80 },
      { status: "unverified", totalStakeExposure: 9999 }, // ignored
    ];
    expect(getLargestExposurePct(trades, 1000)).toBe(25);
  });

  it("returns 0 when bankroll is non-positive or non-finite", () => {
    const trades = [{ status: "paper_traded", totalStakeExposure: 100 }];
    expect(getLargestExposurePct(trades, 0)).toBe(0);
    expect(getLargestExposurePct(trades, -50)).toBe(0);
    expect(getLargestExposurePct(trades, Number.NaN)).toBe(0);
  });

  it("returns 0 when no trade has open exposure", () => {
    const trades: TradeMetricInput[] = [
      { status: "unverified", totalStakeExposure: 500 },
      { status: "settled_won", totalStakeExposure: 500 },
    ];
    expect(getLargestExposurePct(trades, 1000)).toBe(0);
  });
});

// ─── getTradeMetricState ────────────────────────────────────────────────────

describe("getTradeMetricState", () => {
  it("classifies a locked open trade", () => {
    const s = getTradeMetricState(
      trade({ status: "paper_traded", totalStakeExposure: 200, worstCasePL: 4.35 }),
    );
    expect(s).toEqual({ kind: "open", exposure: 200, expected: 4.35, actual: 0 });
  });

  it("classifies a candidate trade", () => {
    const s = getTradeMetricState(
      trade({ status: "unverified", totalStakeExposure: 80, worstCasePL: 3 }),
    );
    expect(s).toEqual({ kind: "candidate", exposure: 80, expected: 3, actual: 0 });
  });

  it("classifies a settled trade — exposure & expected zero, actual carried", () => {
    const s = getTradeMetricState(
      trade({
        status: "settled_loss",
        totalStakeExposure: 200,
        worstCasePL: 4.35,
        result: { actualProfitLoss: -12 },
      }),
    );
    expect(s).toEqual({ kind: "settled", exposure: 0, expected: 0, actual: -12 });
  });

  it("classifies failed verification with all zeros", () => {
    const s = getTradeMetricState(
      trade({
        status: "not_placed_market_unavailable",
        totalStakeExposure: 500,
        worstCasePL: 9,
      }),
    );
    expect(s).toEqual({ kind: "failed", exposure: 0, expected: 0, actual: 0 });
  });

  it("classifies excluded with all zeros", () => {
    const s = getTradeMetricState(
      trade({
        status: "replaced_removed",
        totalStakeExposure: 500,
        worstCasePL: 9,
      }),
    );
    expect(s).toEqual({ kind: "excluded", exposure: 0, expected: 0, actual: 0 });
  });
});

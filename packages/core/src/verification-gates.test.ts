import { describe, expect, it } from "vitest";

import {
  allVerificationGatesPass,
  evaluateManualLockChecklistFailures,
  evaluateVerificationGate,
  evaluateVerificationGates,
  type ManualLockChecklistInput,
  type VerificationTradeInput,
} from "./verification-gates";

const NOW = new Date("2026-05-20T12:00:00.000Z");

function passingTrade(overrides: Partial<VerificationTradeInput> = {}): VerificationTradeInput {
  const base: VerificationTradeInput = {
    goal: "profit",
    tradeType: "arbitrage",
    bonusType: "cash",
    calculatorUsed: "arbitrage",
    bankroll: 10_000,
    maxStakePct: 5,
    oddsVerifiedAt: new Date(NOW.getTime() - 10_000),
    oddsFreshnessSeconds: 30,
    rolloverAmount: 0,
    rolloverMultiple: 0,
    rolloverUnknownOrNA: false,
    oppositeSideConfirmed: true,
    legA: {
      bookId: "book-a",
      bookName: "Book A",
      event: "Team A vs Team B",
      market: "moneyline",
      period: "full game",
      side: "home",
      oddsAmerican: 120,
      stake: 100,
      line: null,
    },
    legB: {
      bookId: "book-b",
      bookName: "Book B",
      event: "Team A vs Team B",
      market: "moneyline",
      period: "full game",
      side: "away",
      oddsAmerican: -110,
      stake: 110,
      line: null,
    },
  };

  return {
    ...base,
    ...overrides,
    legA: { ...base.legA, ...(overrides.legA ?? {}) },
    legB: { ...base.legB, ...(overrides.legB ?? {}) },
  };
}

describe("verification gates", () => {
  it("passes all gates for a complete clean trade", () => {
    const trade = passingTrade();

    expect(allVerificationGatesPass(trade, NOW)).toBe(true);
  });

  it("fails same event when events differ", () => {
    const gate = evaluateVerificationGate(
      "same_event",
      passingTrade({ legB: { event: "Different Event" } }),
      NOW,
    );

    expect(gate.status).toBe("fail");
  });

  it("returns unknown for missing event", () => {
    const gate = evaluateVerificationGate(
      "same_event",
      passingTrade({ legA: { event: "" } }),
      NOW,
    );

    expect(gate.status).toBe("unknown");
  });

  it("passes spread line when signs are opposite", () => {
    const gate = evaluateVerificationGate(
      "same_line",
      passingTrade({
        legA: { market: "spread", line: -2.5 },
        legB: { market: "spread", line: 2.5 },
      }),
      NOW,
    );

    expect(gate.status).toBe("pass");
  });

  it("fails spread line when signs are not opposite", () => {
    const gate = evaluateVerificationGate(
      "same_line",
      passingTrade({
        legA: { market: "spread", line: -2.5 },
        legB: { market: "spread", line: -2.5 },
      }),
      NOW,
    );

    expect(gate.status).toBe("fail");
  });

  it("passes total line when the same numeric line is used", () => {
    const gate = evaluateVerificationGate(
      "same_line",
      passingTrade({
        legA: { market: "total", side: "over", line: 8.5 },
        legB: { market: "total", side: "under", line: 8.5 },
        oppositeSideConfirmed: false,
      }),
      NOW,
    );

    expect(gate.status).toBe("pass");
  });

  it("fails stale odds", () => {
    const gate = evaluateVerificationGate(
      "odds_verified_live",
      passingTrade({ oddsVerifiedAt: new Date(NOW.getTime() - 31_000) }),
      NOW,
    );

    expect(gate.status).toBe("fail");
  });

  it("fails when the wrong calculator is used for promo/free play", () => {
    const gate = evaluateVerificationGate(
      "correct_calculator",
      passingTrade({
        bonusType: "promo free play",
        calculatorUsed: "arbitrage",
      }),
      NOW,
    );

    expect(gate.status).toBe("fail");
  });

  it("fails when stake exposure is above bankroll limit", () => {
    const gate = evaluateVerificationGate(
      "stake_within_bankroll",
      passingTrade({
        bankroll: 1_000,
        maxStakePct: 5,
        legA: { stake: 100 },
        legB: { stake: 100 },
      }),
      NOW,
    );

    expect(gate.status).toBe("fail");
  });

  it("passes rollover gate when rollover is marked unknown or not applicable", () => {
    const gate = evaluateVerificationGate(
      "rollover_understood",
      passingTrade({
        rolloverAmount: null,
        rolloverMultiple: null,
        rolloverUnknownOrNA: true,
      }),
      NOW,
    );

    expect(gate.status).toBe("pass");
  });

  it("fails trackable when required fields are missing", () => {
    const gate = evaluateVerificationGate(
      "trackable",
      passingTrade({ legA: { stake: null } }),
      NOW,
    );

    expect(gate.status).toBe("fail");
  });

  it("always returns exactly ten gates in product order", () => {
    const gates = evaluateVerificationGates(passingTrade(), NOW);

    expect(gates.map((gate) => gate.id)).toEqual([
      "same_event",
      "same_market",
      "same_period",
      "same_line",
      "opposite_sides",
      "odds_verified_live",
      "correct_calculator",
      "stake_within_bankroll",
      "rollover_understood",
      "trackable",
    ]);
  });
});

describe("manual lock checklist failures", () => {
  const passingChecklist: ManualLockChecklistInput = {
    bookAVerified: true,
    bookBVerified: true,
    sameEventConfirmed: true,
    sameMarketConfirmed: true,
    samePlayerOrTeamConfirmed: true,
    requiresSamePlayerOrTeam: true,
    samePeriodConfirmed: true,
    sameLineConfirmed: true,
    isMiddleTrade: false,
    oppositeSidesConfirmed: true,
    oddsAcceptedConfirmed: true,
    stakeAcceptedConfirmed: true,
    liquidityEnoughConfirmed: true,
    recalculatedConfirmed: true,
    userFinalConfirm: true,
  };

  it("returns an empty list when all checklist conditions pass", () => {
    expect(evaluateManualLockChecklistFailures(passingChecklist)).toEqual([]);
  });

  it("uses middle-trade wording for same-line failure when middle is enabled", () => {
    const failures = evaluateManualLockChecklistFailures({
      ...passingChecklist,
      sameLineConfirmed: false,
      isMiddleTrade: true,
    });
    expect(failures).toContain("Middle gap not confirmed");
    expect(failures).not.toContain("Same line not confirmed");
  });

  it("skips same player/team requirement when not required", () => {
    const failures = evaluateManualLockChecklistFailures({
      ...passingChecklist,
      requiresSamePlayerOrTeam: false,
      samePlayerOrTeamConfirmed: false,
    });
    expect(failures).toEqual([]);
  });
});

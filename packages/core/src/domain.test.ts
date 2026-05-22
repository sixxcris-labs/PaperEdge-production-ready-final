import { describe, expect, it } from "vitest";

import {
  STATUS,
  normalizeBonusType,
  normalizeCalculatorId,
  normalizePaperTradeStatus,
  normalizeTradeType,
} from "./domain";

describe("domain normalization", () => {
  it("normalizes known bonus/calculator/trade values", () => {
    expect(normalizeBonusType("promo_free_play")).toBe("promo_free_play");
    expect(normalizeCalculatorId("middle")).toBe("middle");
    expect(normalizeTradeType("rollover_clearing")).toBe("rollover_clearing");
  });

  it("falls back to safe defaults for unknown inputs", () => {
    expect(normalizeBonusType("bad-bonus")).toBe("none");
    expect(normalizeCalculatorId("bad-calc")).toBe("arbitrage");
    expect(normalizeTradeType("bad-trade")).toBe("cash_arbitrage");
    expect(normalizePaperTradeStatus("bad-status")).toBe(STATUS.draft);
  });

  it("trims incoming values before matching", () => {
    expect(normalizeBonusType("  cash_bonus ")).toBe("cash_bonus");
    expect(normalizePaperTradeStatus("  pending_result ")).toBe("pending_result");
  });
});

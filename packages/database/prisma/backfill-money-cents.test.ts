import { describe, expect, it } from "vitest";
import {
  MONEY_CENTS_BACKFILL_PAIRS,
  buildBackfillSql,
} from "./backfill-money-cents";

describe("money cents backfill metadata", () => {
  it("includes every expected model/column pair", () => {
    const keys = new Set(
      MONEY_CENTS_BACKFILL_PAIRS.map(
        (pair) => `${pair.table}.${pair.centsColumn}:${pair.dollarsColumn}`,
      ),
    );

    expect(keys).toContain(
      "UserSettings.startingBankrollCents:startingBankroll",
    );
    expect(keys).toContain("TradeLeg.stakeCents:stake");
    expect(keys).toContain("Result.actualProfitLossCents:actualProfitLoss");
    expect(keys).toContain(
      "BankrollSnapshot.currentBankrollCents:currentBankroll",
    );
    expect(keys).toContain("TradeOpportunity.stakeACents:stakeA");
  });

  it("generates deterministic nullable-only update SQL", () => {
    expect(
      buildBackfillSql({
        table: "PaperTrade",
        centsColumn: "worstCasePLCents",
        dollarsColumn: "worstCasePL",
      }),
    ).toBe(
      'UPDATE "PaperTrade" SET "worstCasePLCents" = CAST(ROUND("worstCasePL" * 100.0) AS INTEGER) WHERE "worstCasePLCents" IS NULL AND "worstCasePL" IS NOT NULL;',
    );
  });
});

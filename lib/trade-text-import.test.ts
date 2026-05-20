import { describe, expect, it } from "vitest";
import { normalizeTradePaste, parseTradeBlock } from "./trade-text-import";

const LEG_ONLY_PASTE = `Book A: Limitless Exchange
Side A: PARIVISION Moneyline
Odds A: -233
Stake A: $1,000.00
Book B: GGBet
Side B: MIBR Moneyline
Odds B: +236
Stake B: $425.35`;

describe("trade text import parsing", () => {
  it("auto-formats a labeled leg-only paste into a complete trade block", () => {
    const normalized = normalizeTradePaste(
      LEG_ONLY_PASTE,
      new Date("2026-05-20T12:00:00Z")
    );

    expect(normalized).toContain("Trade ID: PARIVISION-MIBR-20260520");
    expect(normalized).toContain("Date: 2026-05-20");
    expect(normalized).toContain("Event: PARIVISION vs MIBR");
    expect(normalized).toContain("Market: Moneyline");
    expect(normalized).toContain("Line: 0");
    expect(normalized).toContain("Status: Pending Verification");
    expect(normalized).toContain("Book A: Limitless Exchange");
    expect(normalized).toContain("Stake B: $425.35");
  });

  it("parses the auto-formatted leg-only paste into usable trade fields", () => {
    const parsed = parseTradeBlock(
      LEG_ONLY_PASTE,
      new Date("2026-05-20T12:00:00Z")
    );

    expect(parsed).toMatchObject({
      customTradeId: "PARIVISION-MIBR-20260520",
      eventName: "PARIVISION vs MIBR",
      marketType: "Moneyline",
      lineValue: 0,
      bookAName: "Limitless Exchange",
      sideA: "PARIVISION Moneyline",
      oddsA: -233,
      stakeA: 1000,
      bookBName: "GGBet",
      sideB: "MIBR Moneyline",
      oddsB: 236,
      stakeB: 425.35,
      status: "pending_verification",
    });
  });
});

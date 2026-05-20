import { describe, it, expect } from "vitest";
import {
  isSettlementBlock,
  parseSignedAmount,
  parseSettlementBlock,
  settledStatusFor,
} from "./import-settlement";

const TRADE_BLOCK = `Trade ID: CHET-AST-001
Date: May 18, 2026
Event: San Antonio Spurs vs Oklahoma City Thunder
Book A: Novig
Side A: Over 1.5 Assists
Odds A: +128
Stake A: $398
Book B: Sportzino
Side B: Under 1.5 Assists
Odds B: -110
Stake B: $470
Status: Locked Paper Trade`;

const SETTLEMENT_BLOCK = `Trade ID: CHET-AST-001
Result: Settled Win
Winning Side: Sportzino, Under 1.5 Assists
Final Stat: Chet Holmgren finished with 0 assists
Actual Paper Profit/Loss: +$29.27
Settlement Notes: Under 1.5 Assists won. Sportzino -110 stake $470 returned $427.27 profit.
Novig $398 stake lost.`;

describe("isSettlementBlock", () => {
  it("treats a block with Book A as a trade block", () => {
    expect(isSettlementBlock(TRADE_BLOCK)).toBe(false);
  });

  it("treats a Result/Winning Side block with no Book A as settlement", () => {
    expect(isSettlementBlock(SETTLEMENT_BLOCK)).toBe(true);
  });

  it("does not misfire on an empty/notes-only block", () => {
    expect(isSettlementBlock("Trade ID: X\nNotes: nothing here")).toBe(false);
  });
});

describe("parseSignedAmount", () => {
  it("parses a positive amount with + and $", () => {
    expect(parseSignedAmount("+$29.27")).toBe(29.27);
  });

  it("parses a bare positive amount", () => {
    expect(parseSignedAmount("$66.19")).toBe(66.19);
  });

  it("parses a leading-minus negative", () => {
    expect(parseSignedAmount("-$12.00")).toBe(-12);
  });

  it("parses accounting-parenthesis negative", () => {
    expect(parseSignedAmount("($5.10)")).toBe(-5.1);
  });

  it("treats the word 'loss' as negative", () => {
    expect(parseSignedAmount("$8.00 loss")).toBe(-8);
  });

  it("returns null for empty / non-numeric input", () => {
    expect(parseSignedAmount("")).toBeNull();
    expect(parseSignedAmount("   ")).toBeNull();
    expect(parseSignedAmount("n/a")).toBeNull();
  });
});

describe("parseSettlementBlock", () => {
  it("extracts every field including multiline notes", () => {
    const s = parseSettlementBlock(SETTLEMENT_BLOCK);
    expect(s.customTradeId).toBe("CHET-AST-001");
    expect(s.winningSide).toBe("Sportzino, Under 1.5 Assists");
    expect(s.finalStat).toBe("Chet Holmgren finished with 0 assists");
    expect(s.actualProfitLoss).toBe(29.27);
    expect(s.resultNotes).toContain("returned $427.27 profit");
    expect(s.resultNotes).toContain("Novig $398 stake lost.");
  });

  it("leaves actualProfitLoss null when the text omits it", () => {
    const s = parseSettlementBlock(
      "Trade ID: ABC\nWinning Side: Novig, Over 0.5\nResult: Settled Win"
    );
    expect(s.actualProfitLoss).toBeNull();
    expect(s.customTradeId).toBe("ABC");
  });
});

describe("settledStatusFor", () => {
  it("returns settled_win on positive P/L", () => {
    expect(settledStatusFor("Sportzino, Under 1.5", 29.27)).toBe("settled_win");
  });

  it("returns settled_loss on negative P/L", () => {
    expect(settledStatusFor("Novig, Over 0.5", -12)).toBe("settled_loss");
  });

  it("returns settled_push_void when the side says push or void", () => {
    expect(settledStatusFor("Push — line landed", 0)).toBe("settled_push_void");
    expect(settledStatusFor("Voided by book", 0)).toBe("settled_push_void");
  });
});

import { describe, expect, it } from "vitest";
import { parseAmericanOdds, parseMoney, parseNumber, parseOpportunityText } from "./opportunity-parser";

describe("parseOpportunityText", () => {
  it("parses structured OddsJam-style text", () => {
    const parsed = parseOpportunityText(`Trade ID: TEST-1
Event: Spurs vs Thunder
Sport: NBA
Market: Player Assists
Player: Chet Holmgren
Period: Full Game
Book A: Novig
Side A: Over 1.5 Assists
Odds A: +128
Stake A: $398
Book B: Sportzino
Side B: Under 1.5 Assists
Odds B: -110
Stake B: $470
Expected Profit Range: $29.27 to $39.44`);

    expect(parsed.customId).toBe("TEST-1");
    expect(parsed.event).toBe("Spurs vs Thunder");
    expect(parsed.market).toBe("player_assists");
    expect(parsed.period).toBe("full_game");
    expect(parsed.bookAName).toBe("Novig");
    expect(parsed.oddsA).toBe(128);
    expect(parsed.lineA).toBe(1.5);
    expect(parsed.stakeB).toBe(470);
    expect(parsed.expectedProfitMin).toBeCloseTo(29.27);
    expect(parsed.expectedProfitMax).toBeCloseTo(39.44);
  });

  it("keeps safe defaults when fields are missing", () => {
    const parsed = parseOpportunityText("Random pasted row with no labels");
    expect(parsed.event).toBe("Pending verification");
    expect(parsed.market).toBe("moneyline");
    expect(parsed.tradeType).toBe("cash_arbitrage");
  });
});

describe("parser numeric helpers", () => {
  it("parses odds, money, and numeric values", () => {
    expect(parseAmericanOdds("+125")).toBe(125);
    expect(parseAmericanOdds("-110")).toBe(-110);
    expect(parseMoney("$1,234.50")).toBe(1234.5);
    expect(parseNumber("line 7.5")).toBe(7.5);
  });
});

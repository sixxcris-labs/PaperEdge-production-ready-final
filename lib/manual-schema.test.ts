import { describe, expect, it } from "vitest";
import { ManualTradeSchema } from "@/app/trades/new/manual-schema";

const base = {
  customTradeId: "T-1",
  tradeDate: "2026-05-20T12:00",
  eventName: "Team A vs Team B",
  marketType: "Moneyline",
  player: "",
  lineValue: "0",
  bookAId: "book-a",
  sideA: "Team A",
  oddsA: "+120",
  stakeA: "100",
  bookBId: "book-b",
  sideB: "Team B",
  oddsB: "-110",
  stakeB: "109.09",
  expectedProfitRange: "$1-$5",
  status: "pending_verification",
  notes: "",
};

describe("ManualTradeSchema", () => {
  it("accepts a valid manual trade and coerces numbers", () => {
    const parsed = ManualTradeSchema.parse(base);
    expect(parsed.oddsA).toBe(120);
    expect(parsed.stakeB).toBe(109.09);
  });

  it("rejects same-book trades", () => {
    expect(() => ManualTradeSchema.parse({ ...base, bookBId: "book-a" })).toThrow("Book A and Book B must be different");
  });

  it("rejects unsafe status strings", () => {
    expect(() => ManualTradeSchema.parse({ ...base, status: "settled win" })).toThrow("Status must use lowercase snake_case");
  });
});

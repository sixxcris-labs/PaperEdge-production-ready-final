import { describe, expect, it } from "vitest";
import type { NormalizedMarket } from "./market-normalization";
import { validateNormalizedRow, validateNormalizedRows } from "./normalized-market.schema";

function goodRow(overrides: Partial<NormalizedMarket> = {}): NormalizedMarket {
  return {
    source: "novig",
    sourceEventId: "evt-1",
    sourceMarketId: "mkt-1",
    sourceOutcomeId: "out-1",
    event_id: "evt-1",
    event_name: "oklahoma city thunder @ san antonio spurs",
    sport: "basketball",
    league: "nba",
    market_type: "spread",
    player: null,
    side: "okc",
    line: -2.5,
    odds_american: 123,
    implied_probability: 0.449,
    liquidity: null,
    timestamp: "2026-05-22T14:00:00.000Z",
    status: "open",
    live: false,
    period: "full_game",
    ...overrides,
  };
}

describe("validateNormalizedRow", () => {
  it("accepts a well-formed row", () => {
    expect(validateNormalizedRow(goodRow())).toEqual([]);
  });

  it("accepts a row with null odds and null implied probability", () => {
    expect(validateNormalizedRow(goodRow({ odds_american: null, implied_probability: null }))).toEqual([]);
  });

  it("flags an invalid source and status", () => {
    const issues = validateNormalizedRow(goodRow({ source: "draftkings" as never, status: "weird" as never }));
    expect(issues.some((i) => i.field === "source")).toBe(true);
    expect(issues.some((i) => i.field === "status")).toBe(true);
  });

  it("flags missing required strings", () => {
    const issues = validateNormalizedRow(goodRow({ event_name: "" as never, side: undefined as never }));
    expect(issues.some((i) => i.field === "event_name")).toBe(true);
    expect(issues.some((i) => i.field === "side")).toBe(true);
  });

  it("flags implied probability outside (0,1)", () => {
    expect(validateNormalizedRow(goodRow({ implied_probability: 1.2 })).some((i) => i.field === "implied_probability")).toBe(true);
    expect(validateNormalizedRow(goodRow({ implied_probability: 0 })).some((i) => i.field === "implied_probability")).toBe(true);
  });

  it("flags odds/implied presence mismatch", () => {
    const issues = validateNormalizedRow(goodRow({ odds_american: 110, implied_probability: null }));
    expect(issues.some((i) => i.field.includes("odds_american/implied_probability"))).toBe(true);
  });

  it("flags non-number line/liquidity", () => {
    const issues = validateNormalizedRow(goodRow({ line: "x" as never, liquidity: "y" as never }));
    expect(issues.some((i) => i.field === "line")).toBe(true);
    expect(issues.some((i) => i.field === "liquidity")).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(validateNormalizedRow(null).length).toBeGreaterThan(0);
    expect(validateNormalizedRow([] as never).length).toBeGreaterThan(0);
  });
});

describe("validateNormalizedRows", () => {
  it("aggregates issues across rows with indices", () => {
    const result = validateNormalizedRows([goodRow(), goodRow({ live: "no" as never })]);
    expect(result.checked).toBe(2);
    expect(result.valid).toBe(false);
    expect(result.issues.every((i) => typeof i.index === "number")).toBe(true);
    expect(result.issues.some((i) => i.index === 1 && i.field === "live")).toBe(true);
  });

  it("returns valid for an all-good batch", () => {
    const result = validateNormalizedRows([goodRow(), goodRow({ source: "bovada" })]);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });
});

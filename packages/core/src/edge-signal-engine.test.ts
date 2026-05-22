import { describe, expect, it } from "vitest";
import { detectEdgeSignals } from "./edge-signal-engine";
import type { NormalizedMarket } from "./market-normalization";
const CREATED_AT = "2026-05-22T14:00:00.000Z";
const FRESH_TS = "2026-05-22T13:59:45.000Z";
function market(overrides: Partial<NormalizedMarket> = {}): NormalizedMarket {
  return {
    source: "unknown",
    sourceEventId: "evt-1",
    sourceMarketId: "mkt-1",
    sourceOutcomeId: "out-1",
    event_id: "evt-1",
    event_name: "Yankees @ Red Sox",
    sport: "baseball",
    league: "mlb",
    market_type: "player_hits",
    player: "aaron judge",
    side: "Over",
    line: 1.5,
    odds_american: 110,
    implied_probability: 0.01,
    liquidity: null,
    timestamp: FRESH_TS,
    status: "open",
    live: false,
    period: "full_game",
    raw: {},
    ...overrides,
  };
}
function candidateSignals(rows: NormalizedMarket[]) {
  return detectEdgeSignals(rows, { createdAt: CREATED_AT });
}
describe("detectEdgeSignals", () => {
  it("creates a true arb candidate only when combined implied from odds_american is under 100%", () => {
    const signals = candidateSignals([
      market({ source: "novig", side: "Over", line: 1.5, odds_american: 125, implied_probability: 0.99 }),
      market({ source: "bovada", side: "Under", line: 1.5, odds_american: 125, implied_probability: 0.99 }),
    ]);
    const arb = signals.find((s) => s.type === "same_line_opposite_side");
    expect(arb?.severity).toBe("candidate");
    expect(arb?.classification).toBe("true_arb_candidate");
    expect(arb?.arbCheck?.trueArb).toBe(true);
    expect(arb?.arbCheck?.combinedImplied).toBeLessThan(1);
  });
  it("+280 and -345 is not an arb even when imported implied_probability is bad", () => {
    const signals = candidateSignals([
      market({ source: "novig", side: "Over", line: 1.5, odds_american: 280, implied_probability: 0.01 }),
      market({ source: "bovada", side: "Under", line: 1.5, odds_american: -345, implied_probability: 0.01 }),
    ]);
    const evaluated = signals.find((s) => s.type === "same_line_opposite_side");
    expect(evaluated?.classification).toBe("not_arb");
    expect(evaluated?.severity).not.toBe("candidate");
    expect(evaluated?.arbCheck?.trueArb).toBe(false);
    expect(evaluated?.arbCheck?.combinedImplied).toBeGreaterThanOrEqual(1);
  });
  it("+141 and -164 is not an arb even when imported implied_probability is bad", () => {
    const signals = candidateSignals([
      market({ source: "novig", side: "Over", line: 1.5, odds_american: 141, implied_probability: 0.01 }),
      market({ source: "bovada", side: "Under", line: 1.5, odds_american: -164, implied_probability: 0.01 }),
    ]);
    const evaluated = signals.find((s) => s.type === "same_line_opposite_side");
    expect(evaluated?.classification).toBe("not_arb");
    expect(evaluated?.arbCheck?.trueArb).toBe(false);
    expect(evaluated?.arbCheck?.combinedImplied).toBeGreaterThanOrEqual(1);
  });
  it("rejects same-book pairs", () => {
    const signals = candidateSignals([
      market({ source: "bovada", sourceOutcomeId: "a", side: "Over", line: 1.5, odds_american: 130 }),
      market({ source: "bovada", sourceOutcomeId: "b", side: "Under", line: 1.5, odds_american: 130 }),
    ]);
    expect(signals.some((s) => s.type === "market_mismatch_reject" && s.rejectionReason?.includes("same book"))).toBe(true);
    expect(signals.some((s) => s.severity === "candidate")).toBe(false);
  });
  it("rejects same-side pairs", () => {
    const signals = candidateSignals([
      market({ source: "novig", side: "Over", line: 1.5, odds_american: 125 }),
      market({ source: "bovada", side: "Over", line: 1.5, odds_american: 125 }),
    ]);
    expect(signals.some((s) => s.type === "market_mismatch_reject" && s.rejectionReason?.includes("same side"))).toBe(true);
    expect(signals.some((s) => s.severity === "candidate")).toBe(false);
  });
  it("evaluates cross-book opposite-side same-market pairs without forcing NBA-specific logic", () => {
    const signals = candidateSignals([
      market({ source: "novig", sport: "hockey", league: "nhl", event_name: "Dallas Stars @ Minnesota Wild", market_type: "moneyline", player: null, side: "Stars", line: null, odds_american: 110 }),
      market({ source: "bovada", sport: "hockey", league: "nhl", event_name: "Minnesota Wild vs Dallas Stars", market_type: "moneyline", player: null, side: "Wild", line: null, odds_american: -110 }),
    ]);
    const evaluated = signals.find((s) => s.type === "same_line_opposite_side");
    expect(evaluated?.arbCheck).toBeDefined();
    expect(evaluated?.classification).toBe("not_arb");
  });
  it("creates line-split middle candidate for over 1.5 vs under 2.5", () => {
    const signals = candidateSignals([
      market({ source: "novig", side: "Over", line: 1.5, odds_american: 115 }),
      market({ source: "bovada", side: "Under", line: 2.5, odds_american: 105 }),
    ]);
    expect(signals.some((s) => s.type === "line_split_middle" && s.severity === "candidate")).toBe(true);
    expect(signals.some((s) => s.type === "same_line_opposite_side" && s.severity === "candidate")).toBe(false);
  });
  it("rejects bad over-under line relationship (over 3.5 vs under 1.5)", () => {
    const signals = candidateSignals([
      market({ source: "novig", side: "Over", line: 3.5 }),
      market({ source: "bovada", side: "Under", line: 1.5 }),
    ]);
    expect(signals.some((s) => s.type === "line_split_middle")).toBe(false);
    expect(signals.some((s) => s.type === "market_mismatch_reject" && s.severity === "reject")).toBe(true);
  });
  it("creates rejection for different player", () => {
    const signals = candidateSignals([
      market({ source: "novig", player: "aaron judge" }),
      market({ source: "bovada", player: "rafael devers", side: "Under" }),
    ]);
    expect(signals.some((s) => s.type === "market_mismatch_reject")).toBe(true);
  });
  it("creates rejection for different period", () => {
    const signals = candidateSignals([
      market({ source: "novig", period: "full_game" }),
      market({ source: "bovada", period: "first_half", side: "Under" }),
    ]);
    expect(signals.some((s) => s.type === "market_mismatch_reject")).toBe(true);
  });
  it("creates exchange stale liquidity watch when exchange side has liquidity", () => {
    const signals = candidateSignals([
      market({ source: "novig", side: "Over", liquidity: 200, odds_american: 105 }),
      market({ source: "bovada", side: "Under", liquidity: null, odds_american: -115 }),
    ]);
    expect(signals.some((s) => s.type === "exchange_stale_liquidity_watch" && s.severity === "watch")).toBe(true);
  });
  it("does not emit exchange liquidity watch when exchange side has no liquidity", () => {
    const signals = candidateSignals([
      market({ source: "novig", side: "Over", liquidity: 0, odds_american: null, implied_probability: null }),
      market({ source: "bovada", side: "Under", liquidity: null, odds_american: -115 }),
    ]);
    expect(signals.some((s) => s.type === "exchange_stale_liquidity_watch")).toBe(false);
    expect(signals.some((s) => s.severity === "candidate")).toBe(false);
  });
  it("emits a liquidity warning for exchange-style pairs with no visible liquidity", () => {
    const signals = candidateSignals([
      market({ source: "novig", side: "Over", liquidity: 0, odds_american: 125 }),
      market({ source: "bovada", side: "Under", liquidity: null, odds_american: -120 }),
    ]);
    expect(signals.some((s) => s.type === "insufficient_data_watch" && s.reason.includes("no visible liquidity"))).toBe(true);
  });
  it("does not treat Bovada displayed odds as liquidity", () => {
    const signals = candidateSignals([
      market({ source: "bovada", side: "Over", liquidity: null, odds_american: 125 }),
      market({ source: "novig", side: "Under", liquidity: 0, odds_american: -125 }),
    ]);
    expect(signals.some((s) => s.type === "exchange_stale_liquidity_watch")).toBe(false);
  });
  it("emits insufficient_data_watch for missing timestamps instead of false candidate pass", () => {
    const signals = candidateSignals([
      market({ source: "novig", side: "Over", timestamp: "", odds_american: 130 }),
      market({ source: "bovada", side: "Under", timestamp: "", odds_american: 130 }),
    ]);
    expect(signals.some((s) => s.type === "same_line_opposite_side" && s.severity === "candidate")).toBe(false);
    expect(signals.some((s) => s.type === "insufficient_data_watch" && s.severity === "watch")).toBe(true);
  });
});

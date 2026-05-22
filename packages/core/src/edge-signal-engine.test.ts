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
    event_name: "Knicks vs Cavs",
    sport: "basketball",
    league: "nba",
    market_type: "player_points",
    player: "landry shamet",
    side: "Over",
    line: 27.5,
    odds_american: 110,
    implied_probability: 0.476,
    liquidity: null,
    timestamp: FRESH_TS,
    status: "open",
    live: false,
    period: "full_game",
    raw: {},
    ...overrides,
  };
}

describe("detectEdgeSignals", () => {
  it("creates same-line opposite-side candidate signal", () => {
    const signals = detectEdgeSignals(
      [
        market({ source: "novig", side: "Over", line: 27.5, odds_american: 115 }),
        market({ source: "prophetx", side: "Under", line: 27.5, odds_american: -110 }),
      ],
      { createdAt: CREATED_AT },
    );

    expect(signals.some((s) => s.type === "same_line_opposite_side" && s.severity === "candidate")).toBe(true);
  });

  it("creates same-line opposite-side candidate for cross-book moneyline (team sides)", () => {
    const signals = detectEdgeSignals(
      [
        market({ source: "novig", market_type: "moneyline", player: null, side: "OKC", line: null, odds_american: 116 }),
        market({ source: "bovada", market_type: "moneyline", player: null, side: "SAS", line: null, odds_american: -135 }),
      ],
      { createdAt: CREATED_AT },
    );

    expect(signals.some((s) => s.type === "same_line_opposite_side" && s.severity === "candidate")).toBe(true);
  });

  it("creates same-line opposite-side candidate for cross-book mirror-line spread", () => {
    const signals = detectEdgeSignals(
      [
        market({ source: "novig", market_type: "spread", player: null, side: "OKC", line: -2.5, odds_american: 123 }),
        market({ source: "bovada", market_type: "spread", player: null, side: "SAS", line: 2.5, odds_american: -170 }),
      ],
      { createdAt: CREATED_AT },
    );

    expect(signals.some((s) => s.type === "same_line_opposite_side" && s.severity === "candidate")).toBe(true);
  });

  it("does not create a candidate for the same team across books", () => {
    const signals = detectEdgeSignals(
      [
        market({ source: "novig", market_type: "moneyline", player: null, side: "OKC", line: null, odds_american: 116 }),
        market({ source: "bovada", market_type: "moneyline", player: null, side: "OKC", line: null, odds_american: 120 }),
      ],
      { createdAt: CREATED_AT },
    );

    expect(signals.some((s) => s.severity === "candidate")).toBe(false);
  });

  it("creates line-split middle candidate for over 27.5 vs under 28.5", () => {
    const signals = detectEdgeSignals(
      [
        market({ source: "novig", side: "Over", line: 27.5, odds_american: 115 }),
        market({ source: "prophetx", side: "Under", line: 28.5, odds_american: 105 }),
      ],
      { createdAt: CREATED_AT },
    );

    expect(signals.some((s) => s.type === "line_split_middle" && s.severity === "candidate")).toBe(true);
  });

  it("rejects bad over-under line relationship (over 32.5 vs under 27.5)", () => {
    const signals = detectEdgeSignals(
      [
        market({ source: "novig", side: "Over", line: 32.5 }),
        market({ source: "prophetx", side: "Under", line: 27.5 }),
      ],
      { createdAt: CREATED_AT },
    );

    expect(signals.some((s) => s.type === "line_split_middle")).toBe(false);
    expect(signals.some((s) => s.type === "market_mismatch_reject" && s.severity === "reject")).toBe(true);
  });

  it("does not create candidate for same-side markets", () => {
    const signals = detectEdgeSignals(
      [
        market({ source: "novig", side: "Over", line: 27.5 }),
        market({ source: "prophetx", side: "Over", line: 27.5 }),
      ],
      { createdAt: CREATED_AT },
    );

    expect(signals.some((s) => s.severity === "candidate")).toBe(false);
  });

  it("creates rejection for different player", () => {
    const signals = detectEdgeSignals(
      [
        market({ source: "novig", player: "landry shamet" }),
        market({ source: "prophetx", player: "jalen brunson" }),
      ],
      { createdAt: CREATED_AT },
    );

    expect(signals.some((s) => s.type === "market_mismatch_reject")).toBe(true);
  });

  it("creates rejection for different period", () => {
    const signals = detectEdgeSignals(
      [
        market({ source: "novig", period: "full_game" }),
        market({ source: "prophetx", period: "first_half" }),
      ],
      { createdAt: CREATED_AT },
    );

    expect(signals.some((s) => s.type === "market_mismatch_reject")).toBe(true);
  });

  it("creates exchange stale liquidity watch when exchange side has liquidity", () => {
    const signals = detectEdgeSignals(
      [
        market({ source: "novig", side: "Over", liquidity: 200, odds_american: 105 }),
        market({ source: "bovada", side: "Under", liquidity: null, odds_american: -115 }),
      ],
      { createdAt: CREATED_AT },
    );

    expect(signals.some((s) => s.type === "exchange_stale_liquidity_watch" && s.severity === "watch")).toBe(true);
  });

  it("does not emit exchange liquidity watch when exchange side has no liquidity", () => {
    const signals = detectEdgeSignals(
      [
        market({ source: "novig", side: "Over", liquidity: 0, odds_american: null, implied_probability: null }),
        market({ source: "bovada", side: "Under", liquidity: null, odds_american: -115 }),
      ],
      { createdAt: CREATED_AT },
    );

    expect(signals.some((s) => s.type === "exchange_stale_liquidity_watch")).toBe(false);
    expect(signals.some((s) => s.severity === "candidate")).toBe(false);
  });

  it("does not treat Bovada displayed odds as liquidity", () => {
    const signals = detectEdgeSignals(
      [
        market({ source: "bovada", side: "Over", liquidity: null, odds_american: 125 }),
        market({ source: "novig", side: "Under", liquidity: 0, odds_american: -125 }),
      ],
      { createdAt: CREATED_AT },
    );

    expect(signals.some((s) => s.type === "exchange_stale_liquidity_watch")).toBe(false);
  });

  it("emits insufficient_data_watch for missing timestamps instead of false candidate pass", () => {
    const signals = detectEdgeSignals(
      [
        market({ source: "novig", side: "Over", timestamp: "", odds_american: 110 }),
        market({ source: "prophetx", side: "Under", timestamp: "", odds_american: -110 }),
      ],
      { createdAt: CREATED_AT },
    );

    expect(signals.some((s) => s.type === "same_line_opposite_side")).toBe(false);
    expect(signals.some((s) => s.type === "insufficient_data_watch" && s.severity === "watch")).toBe(true);
  });
});

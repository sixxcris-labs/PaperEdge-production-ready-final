import { describe, expect, it } from "vitest";
import {
  americanToImpliedProbability,
  assessMarketRelationship,
  decimalToAmerican,
  isOppositeSide,
  normalizeText,
  probabilityToAmerican,
  type NormalizedMarket,
} from "./market-normalization";

function buildMarket(overrides: Partial<NormalizedMarket> = {}): NormalizedMarket {
  return {
    source: "unknown",
    event_id: "event-1",
    event_name: "Knicks vs Cavs",
    sport: "basketball",
    league: "nba",
    market_type: "player points",
    player: "Landry Shamet",
    side: "Over",
    line: 27.5,
    odds_american: -110,
    implied_probability: null,
    liquidity: null,
    timestamp: "2026-05-22T00:00:00.000Z",
    status: "open",
    live: false,
    period: "full game",
    ...overrides,
  };
}

describe("market-normalization", () => {
  it("converts American odds to implied probability", () => {
    const pos = americanToImpliedProbability(150);
    const neg = americanToImpliedProbability(-200);
    expect(pos).not.toBeNull();
    expect(neg).not.toBeNull();
    expect(pos!).toBeCloseTo(0.4, 6);
    expect(neg!).toBeCloseTo(0.666666, 5);
  });

  it("converts probability price to American odds", () => {
    expect(probabilityToAmerican(0.4)).toBe(150);
    expect(probabilityToAmerican(0.6)).toBe(-150);
    expect(probabilityToAmerican(1)).toBeNull();
  });

  it("converts decimal odds to American odds", () => {
    expect(decimalToAmerican(2.5)).toBe(150);
    expect(decimalToAmerican(1.5)).toBe(-200);
    expect(decimalToAmerican(1)).toBeNull();
  });

  it("normalizes text across case and spacing differences", () => {
    expect(normalizeText("  Player   Points  ")).toBe("player points");
    expect(normalizeText("PLAYER POINTS")).toBe("player points");
  });

  it("detects opposite sides for over-under and yes-no", () => {
    expect(isOppositeSide(buildMarket({ side: "Over" }), buildMarket({ side: "Under" }))).toBe(true);
    expect(isOppositeSide(buildMarket({ side: "Yes" }), buildMarket({ side: "No" }))).toBe(true);
  });

  it("classifies same-line opposite-side markets as comparable", () => {
    const assessment = assessMarketRelationship(
      buildMarket({ side: "Over", line: 27.5 }),
      buildMarket({ side: "Under", line: 27.5 }),
    );
    expect(assessment.kind).toBe("same_line_opposite_side");
    expect(assessment.comparable).toBe(true);
  });

  it("classifies over 27.5 vs under 28.5 as middle_line_split", () => {
    const assessment = assessMarketRelationship(
      buildMarket({ side: "Over", line: 27.5 }),
      buildMarket({ side: "Under", line: 28.5 }),
    );
    expect(assessment.kind).toBe("middle_line_split");
    expect(assessment.comparable).toBe(true);
  });

  it("rejects over 32.5 vs under 27.5 as invalid middle", () => {
    const assessment = assessMarketRelationship(
      buildMarket({ side: "Over", line: 32.5 }),
      buildMarket({ side: "Under", line: 27.5 }),
    );
    expect(assessment.kind).toBe("unknown");
    expect(assessment.comparable).toBe(false);
  });

  it("rejects same-side markets", () => {
    const assessment = assessMarketRelationship(
      buildMarket({ side: "Over", line: 27.5 }),
      buildMarket({ side: "Over", line: 27.5 }),
    );
    expect(assessment.kind).toBe("same_side");
    expect(assessment.comparable).toBe(false);
  });

  it("returns explicit mismatch assessments for player, period, and event differences", () => {
    const playerMismatch = assessMarketRelationship(
      buildMarket({ player: "Landry Shamet" }),
      buildMarket({ player: "Jalen Brunson" }),
    );
    expect(playerMismatch.kind).toBe("player_mismatch");

    const periodMismatch = assessMarketRelationship(
      buildMarket({ period: "full game" }),
      buildMarket({ period: "first half" }),
    );
    expect(periodMismatch.kind).toBe("period_mismatch");

    const eventMismatch = assessMarketRelationship(
      buildMarket({ event_id: "event-1", event_name: "Knicks vs Cavs" }),
      buildMarket({ event_id: "event-2", event_name: "Lakers vs Celtics" }),
    );
    expect(eventMismatch.kind).toBe("event_mismatch");
  });
});

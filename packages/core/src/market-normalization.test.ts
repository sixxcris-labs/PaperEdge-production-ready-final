import { describe, expect, it } from "vitest";
import {
  americanToImpliedProbability,
  assessMarketRelationship,
  decimalToAmerican,
  impliedFromAmerican,
  isOppositeSide,
  normalizeEventKey,
  normalizePeriod,
  normalizeText,
  probabilityToAmerican,
  type NormalizedMarket,
} from "./market-normalization";
function buildMarket(overrides: Partial<NormalizedMarket> = {}): NormalizedMarket {
  return {
    source: "novig",
    event_id: "event-1",
    event_name: "Yankees @ Red Sox",
    sport: "baseball",
    league: "mlb",
    market_type: "player_hits",
    player: "Aaron Judge",
    side: "Over",
    line: 1.5,
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
    expect(impliedFromAmerican(150)).toBeCloseTo(0.4, 6);
    expect(impliedFromAmerican(-200)).toBeCloseTo(0.666666, 5);
  });
  it("maps full-game period aliases (incl. 4c's 'Full Time') to full_game", () => {
    expect(normalizePeriod("Full Time")).toBe("full_game");
    expect(normalizePeriod("fulltime")).toBe("full_game");
    expect(normalizePeriod("FT")).toBe("full_game");
    expect(normalizePeriod("full game")).toBe("full_game");
    expect(normalizePeriod("1st half")).toBe("first_half");
    expect(normalizePeriod("", "full_game")).toBe("full_game");
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
  it("normalizes event names across @/vs order differences", () => {
    expect(normalizeEventKey("Stars @ Wild")).toBe(normalizeEventKey("Wild vs Stars"));
    expect(normalizeEventKey("Yankees @ Red Sox")).toBe("red sox vs yankees");
  });
  it("detects opposite sides for over-under and yes-no", () => {
    expect(isOppositeSide(buildMarket({ side: "Over" }), buildMarket({ source: "bovada", side: "Under" }))).toBe(true);
    expect(isOppositeSide(buildMarket({ side: "Yes" }), buildMarket({ source: "bovada", side: "No" }))).toBe(true);
  });
  it("classifies same-line opposite-side markets as comparable", () => {
    const assessment = assessMarketRelationship(
      buildMarket({ source: "novig", side: "Over", line: 1.5 }),
      buildMarket({ source: "bovada", side: "Under", line: 1.5 }),
    );
    expect(assessment.kind).toBe("same_line_opposite_side");
    expect(assessment.comparable).toBe(true);
  });
  it("classifies over 1.5 vs under 2.5 as middle_line_split", () => {
    const assessment = assessMarketRelationship(
      buildMarket({ source: "novig", side: "Over", line: 1.5 }),
      buildMarket({ source: "bovada", side: "Under", line: 2.5 }),
    );
    expect(assessment.kind).toBe("middle_line_split");
    expect(assessment.comparable).toBe(true);
  });
  it("rejects over 3.5 vs under 1.5 as invalid middle", () => {
    const assessment = assessMarketRelationship(
      buildMarket({ source: "novig", side: "Over", line: 3.5 }),
      buildMarket({ source: "bovada", side: "Under", line: 1.5 }),
    );
    expect(assessment.kind).toBe("line_mismatch");
    expect(assessment.comparable).toBe(false);
  });
  it("rejects same-side markets", () => {
    const assessment = assessMarketRelationship(
      buildMarket({ source: "novig", side: "Over", line: 1.5 }),
      buildMarket({ source: "bovada", side: "Over", line: 1.5 }),
    );
    expect(assessment.kind).toBe("same_side");
    expect(assessment.comparable).toBe(false);
  });
  it("rejects same-book pairs before arb classification", () => {
    const assessment = assessMarketRelationship(
      buildMarket({ source: "bovada", side: "Over", line: 1.5 }),
      buildMarket({ source: "bovada", side: "Under", line: 1.5 }),
    );
    expect(assessment.kind).toBe("same_book");
    expect(assessment.comparable).toBe(false);
  });
  it("treats two distinct teams as opposite sides and the same team as not", () => {
    expect(isOppositeSide(buildMarket({ side: "Yankees" }), buildMarket({ source: "bovada", side: "Red Sox" }))).toBe(true);
    expect(isOppositeSide(buildMarket({ side: "Yankees" }), buildMarket({ source: "bovada", side: "Yankees" }))).toBe(false);
  });
  it("classifies moneyline opposite teams (no line) as same-line opposite-side", () => {
    const assessment = assessMarketRelationship(
      buildMarket({ source: "novig", market_type: "moneyline", player: null, side: "Yankees", line: null }),
      buildMarket({ source: "bovada", market_type: "moneyline", player: null, side: "Red Sox", line: null }),
    );
    expect(assessment.kind).toBe("same_line_opposite_side");
    expect(assessment.comparable).toBe(true);
  });
  it("classifies mirror-line spreads as same-line opposite-side", () => {
    const assessment = assessMarketRelationship(
      buildMarket({ source: "novig", market_type: "spread", player: null, side: "Yankees", line: -1.5 }),
      buildMarket({ source: "bovada", market_type: "spread", player: null, side: "Red Sox", line: 1.5 }),
    );
    expect(assessment.kind).toBe("same_line_opposite_side");
    expect(assessment.comparable).toBe(true);
  });
  it("does not treat non-mirror team spreads as same-line opposite-side", () => {
    const assessment = assessMarketRelationship(
      buildMarket({ source: "novig", market_type: "spread", player: null, side: "Yankees", line: -1.5 }),
      buildMarket({ source: "bovada", market_type: "spread", player: null, side: "Red Sox", line: 2.5 }),
    );
    expect(assessment.kind).not.toBe("same_line_opposite_side");
    expect(assessment.comparable).toBe(false);
  });
  it("returns explicit mismatch assessments for player, period, and event differences", () => {
    const playerMismatch = assessMarketRelationship(
      buildMarket({ source: "novig", player: "Aaron Judge" }),
      buildMarket({ source: "bovada", player: "Rafael Devers" }),
    );
    expect(playerMismatch.kind).toBe("player_mismatch");
    const periodMismatch = assessMarketRelationship(
      buildMarket({ source: "novig", period: "full game" }),
      buildMarket({ source: "bovada", period: "first half" }),
    );
    expect(periodMismatch.kind).toBe("period_mismatch");
    const eventMismatch = assessMarketRelationship(
      buildMarket({ source: "novig", event_id: "event-1", event_name: "Yankees @ Red Sox" }),
      buildMarket({ source: "bovada", event_id: "event-2", event_name: "Dodgers @ Giants" }),
    );
    expect(eventMismatch.kind).toBe("event_mismatch");
  });
});

import { describe, expect, it } from "vitest";
import { derivePlayerPropDetails, normalizePlayerName, normalizePlayerPropMarketType } from "./player-props";

describe("player prop normalization helpers", () => {
  it("normalizes comma-separated player names", () => {
    expect(normalizePlayerName("Gilgeous-Alexander, Shai")).toBe("shai gilgeous-alexander");
  });
  it("maps multi-sport stat names to canonical player market types", () => {
    expect(normalizePlayerPropMarketType("Player Points")).toBe("player_points");
    expect(normalizePlayerPropMarketType("Pitcher Strikeouts")).toBe("player_strikeouts");
    expect(normalizePlayerPropMarketType("Shots On Goal")).toBe("player_shots_on_goal");
    expect(normalizePlayerPropMarketType("Receiving Yards")).toBe("player_receiving_yards");
  });
  it("extracts player, side, line, and stat from a combined prop label", () => {
    const prop = derivePlayerPropDetails({
      marketText: "Player Hits",
      outcomeText: "Aaron Judge Over 1.5 Hits",
    });
    expect(prop.marketType).toBe("player_hits");
    expect(prop.player).toBe("aaron judge");
    expect(prop.side).toBe("over");
    expect(prop.line).toBe(1.5);
  });
});

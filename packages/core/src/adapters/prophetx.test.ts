import { describe, expect, it } from "vitest";
import { normalizeProphetXMarkets } from "./prophetx";

const baseRaw = {
  eventId: "evt-123",
  eventName: "Knicks vs Cavs",
  market: {
    id: "market-1",
    displayName: "Player Points",
    name: "Player Points",
    selections: [
      {
        id: "sel-1",
        name: "Over",
        player: "Landry Shamet",
        line: 27.5,
        displayOdds: "+115",
        stake: 250,
        updatedAt: "2026-05-22T13:00:00.000Z",
      },
      {
        id: "sel-2",
        name: "Under",
        player: "Landry Shamet",
        line: 27.5,
        displayOdds: "-135",
        stake: 180,
        updatedAt: "2026-05-22T13:00:02.000Z",
      },
    ],
  },
};

describe("normalizeProphetXMarkets", () => {
  it("normalizes a market with selections into rows", () => {
    const rows = normalizeProphetXMarkets(baseRaw);
    expect(rows.length).toBe(2);
  });

  it("sets source as prophetx", () => {
    const [row] = normalizeProphetXMarkets(baseRaw);
    expect(row.source).toBe("prophetx");
  });

  it("maps eventId to event_id", () => {
    const [row] = normalizeProphetXMarkets(baseRaw);
    expect(row.event_id).toBe("evt-123");
  });

  it("maps market.id to sourceMarketId", () => {
    const [row] = normalizeProphetXMarkets(baseRaw);
    expect(row.sourceMarketId).toBe("market-1");
  });

  it("maps selection.id to sourceOutcomeId", () => {
    const [row] = normalizeProphetXMarkets(baseRaw);
    expect(row.sourceOutcomeId).toBe("sel-1");
  });

  it("parses displayOdds +115 to 115", () => {
    const [row] = normalizeProphetXMarkets(baseRaw);
    expect(row.odds_american).toBe(115);
  });

  it("parses displayOdds -135 to -135", () => {
    const rows = normalizeProphetXMarkets(baseRaw);
    expect(rows[1].odds_american).toBe(-135);
  });

  it("maps stake to liquidity", () => {
    const [row] = normalizeProphetXMarkets(baseRaw);
    expect(row.liquidity).toBe(250);
  });

  it("does not throw when stake is missing", () => {
    const rows = normalizeProphetXMarkets({
      ...baseRaw,
      market: {
        ...baseRaw.market,
        selections: [
          {
            ...baseRaw.market.selections[0],
            stake: undefined,
          },
        ],
      },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].liquidity).toBeNull();
  });

  it("normalizes known market display names to canonical market types", () => {
    const rows = normalizeProphetXMarkets({
      ...baseRaw,
      market: {
        ...baseRaw.market,
        displayName: "Player Rebounds",
      },
    });
    expect(rows[0].market_type).toBe("player_rebounds");
  });

  it("keeps raw to a minimal slice without the full market tree", () => {
    const [row] = normalizeProphetXMarkets(baseRaw);
    const raw = row.raw as { marketId: string; selection: Record<string, unknown> };
    expect(raw.marketId).toBe("market-1");
    expect(raw.selection.id).toBe("sel-1");
    // raw must not embed the parent market (which carries every selection)
    expect(raw).not.toHaveProperty("market");
    expect(raw.selection).not.toHaveProperty("selections");
  });

  it("supports captured data.markets wrapper with selections as nested arrays", () => {
    const rows = normalizeProphetXMarkets({
      data: {
        markets: [
          {
            id: 64,
            name: "First Half Moneyline",
            type: "moneyline",
            subType: "first_half_moneyline",
            sportEventId: 20023807,
            selections: [
              [
                {
                  id: 4,
                  name: "San Antonio Spurs -140",
                  displayOdds: "-140",
                  odds: -140,
                  line: 0,
                  stake: 83.33,
                  lineID: "line-home",
                },
              ],
              [
                {
                  id: 5,
                  name: "Oklahoma City Thunder -107",
                  displayOdds: "-107",
                  odds: -107,
                  line: 0,
                  stake: 96.62,
                  lineID: "line-away",
                },
              ],
            ],
          },
        ],
      },
    });

    expect(rows.length).toBe(2);
    expect(rows[0].source).toBe("prophetx");
    expect(rows[0].market_type).toBe("moneyline");
  });
});

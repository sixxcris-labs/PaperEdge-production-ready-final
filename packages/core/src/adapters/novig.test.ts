import { describe, expect, it } from "vitest";
import { normalizeNovigMarkets } from "./novig";

const baseRaw = {
  market: {
    id: "mkt-1",
    eventId: "evt-1",
    eventName: "knicks vs cavs",
    name: "player points",
    period: "full game",
  },
  outcomes: [
    { id: "out-over", name: "Over", line: 27.5, player: "Landry Shamet" },
    { id: "out-under", name: "Under", line: 27.5, player: "Landry Shamet" },
  ],
  ladders: [
    {
      id: "ladder-1",
      outcomeId: "out-over",
      marketId: "mkt-1",
      price: 0.451,
      qty: 420,
      timestamp: "2026-05-22T12:00:00.000Z",
      status: "active",
    },
  ],
  sport: "basketball",
  league: "nba",
};

describe("normalizeNovigMarkets", () => {
  it("normalizes a minimal batch response to one or more rows", () => {
    const rows = normalizeNovigMarkets(baseRaw);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("sets source to novig", () => {
    const [row] = normalizeNovigMarkets(baseRaw);
    expect(row.source).toBe("novig");
  });

  it("converts probability 0.451 to positive American odds", () => {
    const [row] = normalizeNovigMarkets(baseRaw);
    expect(row.implied_probability).toBeCloseTo(0.451, 6);
    expect(row.odds_american).not.toBeNull();
    expect(row.odds_american!).toBeGreaterThan(0);
  });

  it("converts probability 0.521 to negative American odds", () => {
    const rows = normalizeNovigMarkets({
      ...baseRaw,
      ladders: [{ ...baseRaw.ladders[0], price: 0.521 }],
    });
    expect(rows[0].odds_american).not.toBeNull();
    expect(rows[0].odds_american!).toBeLessThan(0);
  });

  it("maps qty to liquidity", () => {
    const [row] = normalizeNovigMarkets(baseRaw);
    expect(row.liquidity).toBe(420);
  });

  it("maps ladder timestamp to normalized timestamp", () => {
    const [row] = normalizeNovigMarkets(baseRaw);
    expect(row.timestamp).toBe("2026-05-22t12:00:00.000z");
  });

  it("accepts empty asks without rejecting rows", () => {
    const rows = normalizeNovigMarkets({
      market: baseRaw.market,
      outcomes: [
        {
          id: "out-yes",
          name: "Yes",
          line: null,
          asks: [],
          bids: [
            {
              id: "bid-1",
              outcomeId: "out-yes",
              marketId: "mkt-1",
              price: 0.49,
              qty: 100,
              timestamp: "2026-05-22T12:10:00.000Z",
              status: "active",
            },
          ],
        },
      ],
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it("does not throw when price is missing", () => {
    const rows = normalizeNovigMarkets({
      ...baseRaw,
      ladders: [{ ...baseRaw.ladders[0], price: undefined }],
    });
    expect(rows[0].odds_american).toBeNull();
    expect(rows[0].implied_probability).toBeNull();
  });

  it("does not throw when liquidity is missing and avoids open usable assumption", () => {
    const rows = normalizeNovigMarkets({
      ...baseRaw,
      ladders: [{ ...baseRaw.ladders[0], qty: undefined, status: "active" }],
    });
    expect(rows[0].liquidity).toBeNull();
    expect(rows[0].status).not.toBe("open");
  });

  it("uses options to override missing event/sport/league/market/period/live fields", () => {
    const rows = normalizeNovigMarkets(
      {
        market: {
          id: "mkt-2",
        },
        outcomes: [{ id: "out-1", name: "Over" }],
        ladders: [{ outcomeId: "out-1", marketId: "mkt-2", price: 0.49, qty: 50 }],
      },
      {
        eventId: "evt-option",
        eventName: "option event",
        sport: "basketball",
        league: "nba",
        marketType: "player points",
        period: "first half",
        live: true,
        receivedAt: "2026-05-22T12:20:00.000Z",
      },
    );

    expect(rows[0].event_id).toBe("evt-option");
    expect(rows[0].event_name).toBe("option event");
    expect(rows[0].sport).toBe("basketball");
    expect(rows[0].league).toBe("nba");
    expect(rows[0].market_type).toBe("player points");
    expect(rows[0].period).toBe("first_half");
    expect(rows[0].live).toBe(true);
    expect(rows[0].timestamp).toBe("2026-05-22t12:20:00.000z");
  });

  it("keeps raw to a minimal slice without the full market tree", () => {
    const [row] = normalizeNovigMarkets(baseRaw);
    const raw = row.raw as {
      marketId: string;
      outcome: Record<string, unknown>;
      ladder: Record<string, unknown>;
    };
    expect(raw.marketId).toBe("mkt-1");
    expect(raw.outcome.id).toBe("out-over");
    expect(raw.ladder.id).toBe("ladder-1");
    // raw must not embed the parent market (which carries every outcome)
    expect(raw).not.toHaveProperty("market");
    expect(raw.outcome).not.toHaveProperty("outcomes");
  });
});

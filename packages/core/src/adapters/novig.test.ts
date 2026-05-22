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

const eventShapeRaw = {
  data: {
    event: [
      {
        id: "evt-okc-sas",
        description: "Oklahoma City Thunder @ San Antonio Spurs",
        status: "OPEN_PREGAME",
        scheduled_start: "2026-05-23T00:35:00+00:00",
        game: {
          league: "NBA",
          sport: "Basketball",
          awayTeam: { name: "Oklahoma City Thunder", symbol: "OKC" },
          homeTeam: { name: "San Antonio Spurs", symbol: "SA" },
        },
        markets: [
          {
            id: "mkt-spread-25",
            type: "SPREAD",
            strike: 2.5,
            status: "OPEN",
            player: null,
            outcomes: [
              { id: "oc-okc", description: "OKC -2.5", available: 0.449 },
              { id: "oc-sas", description: "SAS +2.5", available: 0.595 },
            ],
          },
          {
            id: "mkt-money",
            type: "MONEY",
            strike: 0,
            status: "OPEN",
            player: null,
            outcomes: [{ id: "oc-ml-okc", description: "OKC", available: 0.7 }],
          },
          {
            id: "mkt-dd",
            type: "DOUBLE_DOUBLE",
            strike: 0.5,
            status: "OPEN",
            player: { full_name: "Alex Caruso", __typename: "player" },
            outcomes: [
              { id: "oc-over", description: "Over 0.5", available: 0.021 },
              { id: "oc-under", description: "Under 0.5", available: null },
            ],
          },
          {
            id: "mkt-total-1h",
            type: "TOTAL_1H",
            strike: 110.5,
            status: "OPEN",
            player: null,
            outcomes: [{ id: "oc-1h-over", description: "Over 110.5", available: 0.52 }],
          },
        ],
      },
    ],
  },
};

describe("normalizeNovigMarkets — captured GraphQL event shape", () => {
  it("flattens data.event[].markets[].outcomes[] into rows", () => {
    const rows = normalizeNovigMarkets(eventShapeRaw);
    // 2 + 1 + 2 + 1 outcomes
    expect(rows.length).toBe(6);
    expect(rows.every((r) => r.source === "novig")).toBe(true);
  });

  it("converts outcome.available into implied probability and American odds", () => {
    const rows = normalizeNovigMarkets(eventShapeRaw);
    const okc = rows.find((r) => r.sourceOutcomeId === "oc-okc")!;
    expect(okc.implied_probability).toBe(0.449);
    expect(okc.odds_american).toBe(123); // probabilityToAmerican(0.449)
  });

  it("maps type, strike, and side correctly", () => {
    const rows = normalizeNovigMarkets(eventShapeRaw);
    const sas = rows.find((r) => r.sourceOutcomeId === "oc-sas")!;
    expect(sas.market_type).toBe("spread");
    expect(sas.line).toBe(2.5);
    expect(sas.side).toBe("sas +2.5");
  });

  it("nulls the line for moneyline and normalizes over/under sides", () => {
    const rows = normalizeNovigMarkets(eventShapeRaw);
    const ml = rows.find((r) => r.sourceOutcomeId === "oc-ml-okc")!;
    expect(ml.market_type).toBe("moneyline");
    expect(ml.line).toBeNull();

    const over = rows.find((r) => r.sourceOutcomeId === "oc-over")!;
    expect(over.side).toBe("over");
    expect(over.market_type).toBe("double_double");
    expect(over.player).toBe("alex caruso");
  });

  it("derives event/sport/league and first-half period from type suffix", () => {
    const rows = normalizeNovigMarkets(eventShapeRaw);
    const row = rows[0];
    expect(row.event_name).toBe("oklahoma city thunder @ san antonio spurs");
    expect(row.sport).toBe("basketball");
    expect(row.league).toBe("nba");

    const h1 = rows.find((r) => r.sourceOutcomeId === "oc-1h-over")!;
    expect(h1.period).toBe("first_half");
  });

  it("sets liquidity null and leaves missing prices as null odds", () => {
    const rows = normalizeNovigMarkets(eventShapeRaw);
    expect(rows.every((r) => r.liquidity === null)).toBe(true);
    const under = rows.find((r) => r.sourceOutcomeId === "oc-under")!;
    expect(under.implied_probability).toBeNull();
    expect(under.odds_american).toBeNull();
  });
});

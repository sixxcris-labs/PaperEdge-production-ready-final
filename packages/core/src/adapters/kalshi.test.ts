import { describe, expect, it } from "vitest";

import { normalizeKalshiMarkets, normalizeKalshiTradeTape } from "./kalshi";

describe("normalizeKalshiMarkets", () => {
  it("normalizes a market snapshot shape to rows", () => {
    const rows = normalizeKalshiMarkets({
      event: {
        id: "evt-1",
        title: "Knicks make conference finals",
        status: "open",
      },
      markets: [
        {
          id: "mkt-1",
          ticker: "KXNBA-26-NYK",
          title: "Knicks yes/no",
          yes_price: 41,
          no_price: 59,
          updated_at: "2026-05-22T12:00:00.000Z",
          status: "open",
        },
      ],
    });

    expect(rows.length).toBe(2);
    expect(rows.every((row) => row.source === "kalshi")).toBe(true);
    expect(rows[0].sourceMarketId).toBe("mkt-1");
  });
});

describe("normalizeKalshiTradeTape", () => {
  const trade = {
    trade_id: "tr-1",
    market_id: "mkt-1",
    ticker: "KXNBA-26-NYK",
    price: 41,
    count: 208,
    taker_side: "yes",
    create_date: "2026-05-22T10:02:37.269383Z",
  };

  it("normalizes trade tape rows", () => {
    const rows = normalizeKalshiTradeTape({ trades: [trade] });
    expect(rows.length).toBe(1);
  });

  it("sets source as kalshi", () => {
    const [row] = normalizeKalshiTradeTape({ trades: [trade] });
    expect(row.source).toBe("kalshi");
  });

  it("maps ids and ticker fields", () => {
    const [row] = normalizeKalshiTradeTape({ trades: [trade] });
    expect(row.sourceMarketId).toBe("mkt-1");
    expect(row.sourceOutcomeId).toBe("tr-1");
    expect(row.event_name).toBe("kxnba-26-nyk");
  });

  it("converts cents-style price 41 to implied probability 0.41", () => {
    const [row] = normalizeKalshiTradeTape({ trades: [trade] });
    expect(row.implied_probability).toBeCloseTo(0.41, 6);
    expect(row.odds_american).toBe(144);
  });

  it("uses price_dollars when available", () => {
    const [row] = normalizeKalshiTradeTape({
      trades: [
        {
          ...trade,
          price: undefined,
          price_dollars: "0.59",
        },
      ],
    });
    expect(row.implied_probability).toBeCloseTo(0.59, 6);
    expect(row.odds_american).toBe(-144);
  });

  it("maps count as executed size and create_date to timestamp", () => {
    const [row] = normalizeKalshiTradeTape({ trades: [trade] });
    expect(row.liquidity).toBe(208);
    expect(row.timestamp).toBe("2026-05-22t10:02:37.269383z");
  });

  it("does not throw when event metadata is missing", () => {
    const rows = normalizeKalshiTradeTape({ trades: [{ trade_id: "tr-2" }] });
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("unknown");
  });

  it("keeps trade rows conservative (not open liquidity)", () => {
    const [row] = normalizeKalshiTradeTape({ trades: [trade] });
    expect(row.status).toBe("unknown");
  });
});

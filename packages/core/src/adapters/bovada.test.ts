import { describe, expect, it } from "vitest";
import { normalizeBovadaMarkets } from "./bovada";

const baseRaw = {
  event: {
    id: "evt-1",
    description: "Knicks vs Cavs",
    live: true,
    status: "O",
    markets: [
      {
        id: "mkt-1",
        description: "Player Points",
        period: "Game",
        status: "O",
        outcomes: [
          {
            id: "out-1",
            description: "Over",
            status: "O",
            type: "over",
            price: {
              american: "+115",
              handicap: "27.5",
            },
          },
          {
            id: "out-2",
            description: "Under",
            status: "S",
            type: "under",
            price: {
              american: "-135",
              handicap2: "27.5",
            },
          },
          {
            id: "out-3",
            description: "Alt",
            status: "U",
            type: "alt",
            price: {
              decimal: "1.87",
              handicap: "28.5",
            },
          },
        ],
      },
    ],
  },
};

describe("normalizeBovadaMarkets", () => {
  it("normalizes Bovada event markets and outcomes into rows", () => {
    const rows = normalizeBovadaMarkets(baseRaw.event);
    expect(rows.length).toBe(3);
  });

  it("sets source to bovada", () => {
    const [row] = normalizeBovadaMarkets(baseRaw.event);
    expect(row.source).toBe("bovada");
  });

  it("preserves event, market, and outcome IDs", () => {
    const [row] = normalizeBovadaMarkets(baseRaw.event);
    expect(row.sourceEventId).toBe("evt-1");
    expect(row.sourceMarketId).toBe("mkt-1");
    expect(row.sourceOutcomeId).toBe("out-1");
  });

  it("parses American odds correctly", () => {
    const rows = normalizeBovadaMarkets(baseRaw.event);
    expect(rows[0].odds_american).toBe(115);
    expect(rows[1].odds_american).toBe(-135);
  });

  it("converts decimal odds when American odds are missing", () => {
    const rows = normalizeBovadaMarkets(baseRaw.event);
    expect(rows[2].odds_american).not.toBeNull();
    expect(rows[2].odds_american!).toBeLessThan(0);
  });

  it("maps handicap fields to line", () => {
    const rows = normalizeBovadaMarkets(baseRaw.event);
    expect(rows[0].line).toBe(27.5);
    expect(rows[1].line).toBe(27.5);
    expect(rows[2].line).toBe(28.5);
  });

  it("maps status O to open", () => {
    const [row] = normalizeBovadaMarkets(baseRaw.event);
    expect(row.status).toBe("open");
  });

  it("maps status S to suspended", () => {
    const rows = normalizeBovadaMarkets(baseRaw.event);
    expect(rows[1].status).toBe("suspended");
  });

  it("maps status U to upcoming", () => {
    const rows = normalizeBovadaMarkets(baseRaw.event);
    expect(rows[2].status).toBe("upcoming");
  });

  it("always sets liquidity to null", () => {
    const rows = normalizeBovadaMarkets(baseRaw.event);
    expect(rows.every((row) => row.liquidity === null)).toBe(true);
  });

  it("keeps raw to a minimal slice without the full event tree", () => {
    const [row] = normalizeBovadaMarkets(baseRaw.event);
    const raw = row.raw as { eventId: string; marketId: string; outcome: Record<string, unknown> };
    expect(raw.eventId).toBe("evt-1");
    expect(raw.marketId).toBe("mkt-1");
    expect(raw.outcome.id).toBe("out-1");
    // raw must not embed the whole event/markets tree (the quadratic-bloat regression)
    expect(raw).not.toHaveProperty("event");
    expect(raw).not.toHaveProperty("markets");
    expect(raw.outcome).not.toHaveProperty("markets");
    expect(raw.outcome).not.toHaveProperty("outcomes");
  });
});

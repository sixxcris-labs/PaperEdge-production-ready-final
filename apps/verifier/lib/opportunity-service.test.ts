import { describe, expect, it, vi } from "vitest";

import { createOpportunityFromRaw } from "@/lib/opportunity-service";

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      upsert: vi.fn().mockResolvedValue({ id: "user-1", email: "local@paperedge.app" }),
    },
    book: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(({ data }) => ({ id: `${data.name}-id`, ...data })),
    },
    tradeOpportunity: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "opp-1", status: "queued_for_verification" }),
    },
    ...overrides,
  } as any;
}

describe("createOpportunityFromRaw", () => {
  it("rejects incomplete imports with missing required fields", async () => {
    const client = makeClient();
    await expect(
      createOpportunityFromRaw(
        `Event: Celtics vs Knicks
Book A: Novig
Side A: Celtics ML
Odds A: +120
Stake A: $100`,
        client,
      ),
    ).rejects.toThrow("Import missing required fields:");
    expect(client.tradeOpportunity.create).not.toHaveBeenCalled();
  });

  it("rejects duplicates before creating a new opportunity", async () => {
    const client = makeClient({
      tradeOpportunity: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "opp-existing",
            event: "Celtics vs Knicks",
            market: "moneyline",
            period: "full_game",
            tradeType: "cash_arbitrage",
            sport: "unknown",
            source: "oddsjam_paste",
            startTime: null,
            bookA: { name: "Novig" },
            sideA: "Celtics ML",
            oddsA: 120,
            lineA: null,
            stakeA: 100,
            liquidityA: null,
            bookB: { name: "Sportzino" },
            sideB: "Knicks ML",
            oddsB: -110,
            lineB: null,
            stakeB: 110,
            liquidityB: null,
          },
        ]),
        create: vi.fn(),
      },
    });
    (client.book.findFirst as any)
      .mockResolvedValueOnce({ id: "a-book", name: "Novig" })
      .mockResolvedValueOnce({ id: "b-book", name: "Sportzino" });

    await expect(
      createOpportunityFromRaw(
        `Event: Celtics vs Knicks
Market: Moneyline
Book A: Novig
Side A: Celtics ML
Odds A: +120
Stake A: $100
Book B: Sportzino
Side B: Knicks ML
Odds B: -110
Stake B: $110`,
        client,
      ),
    ).rejects.toThrow("Duplicate opportunity detected");
    expect(client.tradeOpportunity.create).not.toHaveBeenCalled();
  });
});

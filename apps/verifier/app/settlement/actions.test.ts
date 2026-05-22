import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  db: { $transaction: vi.fn() },
  getLocalUser: vi.fn().mockResolvedValue({
    id: "u1",
    email: "local@paperedge.app",
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@paperedge/database", () => ({ db: mocks.db }));
vi.mock("@/lib/opportunity-service", () => ({
  getLocalUser: mocks.getLocalUser,
}));

import { confirmSettlementSuggestion } from "./actions";

describe("confirmSettlementSuggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks confirming when trade already has a settlement result", async () => {
    const tx = {
      settlementSuggestion: {
        findUnique: vi.fn().mockResolvedValue({
          id: "s1",
          status: "pending",
          suggestedWinningSide: "A",
          suggestedProfitLoss: 10,
          reason: "stub",
          paperTradeId: "t1",
          paperTrade: {
            id: "t1",
            userId: "u1",
            result: { id: "r1" },
            legs: [],
          },
        }),
      },
    };
    mocks.db.$transaction.mockImplementation(
      async (fn: (arg: typeof tx) => Promise<void>) => fn(tx),
    );

    const formData = new FormData();
    formData.set("suggestionId", "s1");

    await expect(confirmSettlementSuggestion(formData)).rejects.toThrow(
      "already has a settlement result",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

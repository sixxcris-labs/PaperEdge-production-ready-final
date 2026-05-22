import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  computeSnapshotPL: vi.fn(),
  getDashboardLocalUser: vi.fn(),
  db: {
    paperTrade: { findUnique: vi.fn() },
    tradeMistake: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@paperedge/core/bankroll-snapshots", () => ({
  computeSnapshotPL: mocks.computeSnapshotPL,
}));
vi.mock("@paperedge/database", () => ({ db: mocks.db }));
vi.mock("@/apps/dashboard/lib/local-user", () => ({
  getDashboardLocalUser: mocks.getDashboardLocalUser,
}));

import { settleTrade } from "./settle-actions";

function makeFormData() {
  const formData = new FormData();
  formData.set("winningSide", "A");
  formData.set("actualPayout", "110");
  formData.set("actualProfitLoss", "10");
  formData.set("matchedExpectedOutcome", "true");
  formData.set("finalStat", "");
  formData.set("resultNotes", "");
  formData.set("mistakeNotes", "");
  return formData;
}

describe("settleTrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDashboardLocalUser.mockResolvedValue({
      id: "u1",
      email: "local@paperedge.app",
    });
    mocks.computeSnapshotPL.mockReturnValue({
      dailyPL: 1.25,
      weeklyPL: 2.5,
      monthlyPL: 5,
    });
  });

  it("blocks double-settle when trade status is already settled", async () => {
    mocks.db.paperTrade.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      status: "settled_won",
      result: { settledAt: new Date("2026-05-20T00:00:00.000Z") },
    });

    await expect(settleTrade("t1", makeFormData())).rejects.toThrow(
      "already settled",
    );
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects settlement and skips bankroll writes when tx sees existing result", async () => {
    mocks.db.paperTrade.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      status: "paper_traded",
      result: { settledAt: new Date("2026-05-20T00:00:00.000Z") },
    });

    const tx = {
      result: { upsert: vi.fn(), findMany: vi.fn() },
      paperTrade: {
        findUnique: vi.fn().mockResolvedValue({
          id: "t1",
          userId: "u1",
          status: "paper_traded",
          result: { settledAt: new Date("2026-05-20T00:00:00.000Z") },
        }),
        update: vi.fn(),
      },
      userSettings: { findUnique: vi.fn(), upsert: vi.fn() },
      bankrollSnapshot: { create: vi.fn() },
      tradeMistake: { createMany: vi.fn() },
    };
    mocks.db.$transaction.mockImplementation(
      async (fn: (arg: typeof tx) => Promise<void>) => fn(tx),
    );

    await expect(settleTrade("t1", makeFormData())).rejects.toThrow(
      "already settled",
    );

    expect(tx.result.upsert).not.toHaveBeenCalled();
    expect(tx.paperTrade.update).not.toHaveBeenCalled();
    expect(tx.userSettings.upsert).not.toHaveBeenCalled();
    expect(tx.bankrollSnapshot.create).not.toHaveBeenCalled();
  });

  it("writes bankroll snapshot fields when settling a fresh trade", async () => {
    mocks.db.paperTrade.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      status: "paper_traded",
      result: null,
    });

    const tx = {
      result: { upsert: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      paperTrade: {
        findUnique: vi.fn().mockResolvedValue({
          id: "t1",
          userId: "u1",
          status: "paper_traded",
          result: null,
        }),
        update: vi.fn(),
      },
      userSettings: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ currentBankroll: 1000, currentBankrollCents: 100000 }),
        upsert: vi.fn().mockResolvedValue({ currentBankroll: 1010 }),
      },
      bankrollSnapshot: { create: vi.fn() },
      tradeMistake: { createMany: vi.fn() },
    };
    mocks.db.$transaction.mockImplementation(
      async (fn: (arg: typeof tx) => Promise<void>) => fn(tx),
    );

    await settleTrade("t1", makeFormData());

    expect(tx.bankrollSnapshot.create).toHaveBeenCalledTimes(1);
    expect(tx.bankrollSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentBankroll: 1010,
          currentBankrollCents: 101000,
          dailyPL: 1.25,
          dailyPLCents: 125,
          weeklyPL: 2.5,
          weeklyPLCents: 250,
          monthlyPL: 5,
          monthlyPLCents: 500,
        }),
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("blocks stale concurrent settle when transaction sees trade already settled", async () => {
    mocks.db.paperTrade.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      status: "paper_traded",
      result: null,
    });

    const tx = {
      paperTrade: {
        findUnique: vi.fn().mockResolvedValue({
          id: "t1",
          userId: "u1",
          status: "settled_win",
          result: { settledAt: new Date("2026-05-21T00:00:00.000Z") },
        }),
        update: vi.fn(),
      },
      result: { upsert: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      userSettings: { findUnique: vi.fn(), upsert: vi.fn() },
      bankrollSnapshot: { create: vi.fn() },
      tradeMistake: { createMany: vi.fn() },
    };
    mocks.db.$transaction.mockImplementation(
      async (fn: (arg: typeof tx) => Promise<void>) => fn(tx),
    );

    await expect(settleTrade("t1", makeFormData())).rejects.toThrow(
      "already settled",
    );
    expect(tx.result.upsert).not.toHaveBeenCalled();
    expect(tx.userSettings.upsert).not.toHaveBeenCalled();
    expect(tx.bankrollSnapshot.create).not.toHaveBeenCalled();
  });
});

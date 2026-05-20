import { describe, expect, it } from "vitest";
import { applyBankrollDelta } from "./bankroll";

describe("applyBankrollDelta", () => {
  it("increments current bankroll and writes a snapshot", async () => {
    const calls: unknown[] = [];
    const client = {
      userSettings: {
        upsert: async (args: unknown) => {
          calls.push({ type: "settings", args });
          return { currentBankroll: 1025 };
        },
      },
      bankrollSnapshot: {
        create: async (args: unknown) => {
          calls.push({ type: "snapshot", args });
          return args;
        },
      },
    };

    const value = await applyBankrollDelta(client as any, "user-1", 25, new Date("2026-05-20T12:00:00Z"));

    expect(value).toBe(1025);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      type: "settings",
      args: { where: { userId: "user-1" }, update: { currentBankroll: { increment: 25 } } },
    });
    expect(calls[1]).toMatchObject({
      type: "snapshot",
      args: { data: { userId: "user-1", currentBankroll: 1025, dailyPL: 25 } },
    });
  });
});

import type { db } from "./db";
import { DEFAULT_STARTING_BANKROLL } from "./config";

export type BankrollDbClient = Pick<typeof db, "userSettings" | "bankrollSnapshot">;

export async function applyBankrollDelta(
  client: BankrollDbClient,
  userId: string,
  delta: number,
  snapshotDate = new Date()
): Promise<number> {
  const settings = await client.userSettings.upsert({
    where: { userId },
    update: { currentBankroll: { increment: delta } },
    create: {
      userId,
      startingBankroll: DEFAULT_STARTING_BANKROLL,
      currentBankroll: DEFAULT_STARTING_BANKROLL + delta,
    },
  });

  await client.bankrollSnapshot.create({
    data: {
      userId,
      snapshotDate,
      currentBankroll: settings.currentBankroll,
      dailyPL: delta,
      weeklyPL: null,
      monthlyPL: null,
      drawdown: null,
    },
  });

  return settings.currentBankroll;
}

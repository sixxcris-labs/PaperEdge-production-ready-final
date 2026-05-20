"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@paperedge/database";
import { STATUS, isSettled } from "@paperedge/core/status";
import { computeSnapshotPL } from "@paperedge/core/bankroll-snapshots";

const LOCAL_USER_EMAIL = "local@paperedge.app";

/** Statuses that cannot be re-settled or mutated. */
const isLocked = (status: string) => isSettled(status) || status === STATUS.cancelled;

const SettleSchema = z.object({
  winningSide: z.string(),
  finalStat: z.string().optional(),
  actualPayout: z.coerce.number().default(0),
  losingStake: z.coerce.number().default(0),   // was: losingSake (typo fixed)
  actualProfitLoss: z.coerce.number(),
  resultNotes: z.string().optional(),
  matchedExpectedOutcome: z.coerce.boolean().default(false),
  mistakeTagIds: z.array(z.string()).default([]),
  mistakeNotes: z.string().optional(),
});

export async function settleTrade(tradeId: string, formData: FormData) {
  // Verify ownership and guard against re-settling a locked trade.
  const user = await db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });
  const trade = await db.paperTrade.findUnique({
    where: { id: tradeId },
    include: { result: true },
  });

  if (!trade) throw new Error("Trade not found");
  if (trade.userId !== user.id) throw new Error("Unauthorised");
  if (isLocked(trade.status)) {
    throw new Error("This trade is already settled and cannot be changed.");
  }

  const raw = {
    winningSide:            formData.get("winningSide"),
    finalStat:              formData.get("finalStat"),
    actualPayout:           formData.get("actualPayout"),
    losingStake:            formData.get("losingStake") ?? formData.get("losingSake") ?? "0",
    actualProfitLoss:       formData.get("actualProfitLoss"),
    matchedExpectedOutcome: formData.get("matchedExpectedOutcome") === "true",
    resultNotes:            formData.get("resultNotes"),
    mistakeTagIds:          formData.getAll("mistakeTagIds"),
    mistakeNotes:           formData.get("mistakeNotes"),
  };
  const data = SettleSchema.parse(raw);

  const winningSide = data.winningSide;
  let status: string;
  if (winningSide === "push" || winningSide === "void") {
    status = "settled_push_void";
  } else if (data.actualProfitLoss < 0) {
    status = "settled_loss";
  } else {
    status = "settled_win";
  }

  const settledAt = new Date();
  await db.$transaction(async (tx) => {
    await tx.result.upsert({
      where: { tradeId },
      update: {
        winningSide,
        finalStat: data.finalStat ?? null,
        actualPayout: data.actualPayout,
        actualProfitLoss: data.actualProfitLoss,
        matchedExpectedOutcome: data.matchedExpectedOutcome,
        resultNotes: data.resultNotes,
        settledAt,
      },
      create: {
        tradeId,
        winningSide,
        finalStat: data.finalStat ?? null,
        actualPayout: data.actualPayout,
        actualProfitLoss: data.actualProfitLoss,
        matchedExpectedOutcome: data.matchedExpectedOutcome,
        resultNotes: data.resultNotes,
        settledAt,
      },
    });

    await tx.paperTrade.update({
      where: { id: tradeId },
      data: { status },
    });

    // Re-settlement is blocked above; this guard keeps bankroll safe if that
    // rule changes later.
    if (trade.result?.settledAt) return;

    const settings = await tx.userSettings.upsert({
      where: { userId: user.id },
      update: { currentBankroll: { increment: data.actualProfitLoss } },
      create: {
        userId: user.id,
        currentBankroll: 1000 + data.actualProfitLoss,
      },
    });

    const monthStart = new Date(settledAt);
    monthStart.setDate(monthStart.getDate() - 29);
    monthStart.setHours(0, 0, 0, 0);

    const recentSettled = await tx.result.findMany({
      where: {
        settledAt: { gte: monthStart, lte: settledAt },
        trade: { userId: user.id },
      },
      select: {
        settledAt: true,
        actualProfitLoss: true,
      },
    });

    const { dailyPL, weeklyPL, monthlyPL } = computeSnapshotPL(recentSettled, settledAt);

    await tx.bankrollSnapshot.create({
      data: {
        userId: user.id,
        snapshotDate: settledAt,
        currentBankroll: settings.currentBankroll,
        dailyPL,
        weeklyPL,
        monthlyPL,
      },
    });
  });

  // Log mistakes
  if (data.mistakeTagIds.length > 0) {
    await db.tradeMistake.createMany({
      data: data.mistakeTagIds.map((tagId) => ({
        tradeId,
        mistakeTagId: tagId,
        notes: data.mistakeNotes ?? null,
      })),
    });
  }

  revalidatePath(`/trades/${tradeId}`);
  revalidatePath("/trades");
  revalidatePath("/");
}

export async function updateTradeStatus(tradeId: string, status: string) {
  // Prevent mutating already-settled trades through this shortcut.
  const trade = await db.paperTrade.findUnique({ where: { id: tradeId } });
  if (trade && isLocked(trade.status)) {
    throw new Error("Cannot change status of a settled trade.");
  }
  await db.paperTrade.update({ where: { id: tradeId }, data: { status } });
  revalidatePath(`/trades/${tradeId}`);
  revalidatePath("/trades");
}

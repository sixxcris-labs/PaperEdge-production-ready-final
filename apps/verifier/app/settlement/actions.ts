"use server";

import { revalidatePath } from "next/cache";
import { computeSnapshotPL } from "@paperedge/core/bankroll-snapshots";
import { db } from "@paperedge/database";
import {
  dollarsFromCentsOrNumber,
  dollarsFromCentsOrNumberOrNull,
} from "@paperedge/core/money-fields";
import { toCents } from "@paperedge/core/money";
import { getLocalUser } from "@/lib/opportunity-service";

export async function confirmSettlementSuggestion(formData: FormData) {
  const suggestionId = requireSuggestionId(formData);
  const user = await getLocalUser();
  const settledAt = new Date();

  await db.$transaction(async (tx) => {
    const suggestion = await tx.settlementSuggestion.findUnique({
      where: { id: suggestionId },
      include: {
        paperTrade: {
          include: {
            result: true,
            legs: { select: { stake: true, stakeCents: true } },
          },
        },
      },
    });

    if (!suggestion) throw new Error("Settlement suggestion not found");
    if (suggestion.paperTrade.userId !== user.id) throw new Error("Unauthorised");
    if (suggestion.status !== "pending") throw new Error(`Suggestion is already ${suggestion.status}`);
    if (suggestion.paperTrade.result) throw new Error("Trade already has a settlement result");
    if (!suggestion.suggestedWinningSide) throw new Error("Suggestion has no winning side to confirm");
    if (suggestion.suggestedProfitLoss == null || !Number.isFinite(suggestion.suggestedProfitLoss)) {
      throw new Error("Suggestion has no valid profit/loss to confirm");
    }

    const winningSide = normalizeWinningSide(suggestion.suggestedWinningSide);
    const profitLoss = suggestion.suggestedProfitLoss;
    const totalExposure = dollarsFromCentsOrNumberOrNull(
      suggestion.paperTrade.totalStakeExposureCents,
      suggestion.paperTrade.totalStakeExposure,
    ) ??
      suggestion.paperTrade.legs.reduce(
        (sum, leg) =>
          sum + dollarsFromCentsOrNumber(leg.stakeCents, leg.stake),
        0,
      );
    const actualPayout = totalExposure + profitLoss;

    await tx.result.create({
      data: {
        tradeId: suggestion.paperTradeId,
        winningSide,
        actualPayout,
        actualPayoutCents: toCents(actualPayout),
        actualProfitLoss: profitLoss,
        actualProfitLossCents: toCents(profitLoss),
        matchedExpectedOutcome: null,
        resultNotes: `Confirmed settlement suggestion: ${suggestion.reason}`,
        finalStat: null,
        settledAt,
      },
    });

    await tx.paperTrade.update({
      where: { id: suggestion.paperTradeId },
      data: {
        status: settlementStatus(winningSide, profitLoss),
        needsManualSettle: false,
      },
    });

    await tx.settlementSuggestion.update({
      where: { id: suggestion.id },
      data: {
        status: "confirmed",
        reviewedAt: settledAt,
        reviewedBy: user.id,
      },
    });

    const existingSettings = await tx.userSettings.findUnique({
      where: { userId: user.id },
    });
    const baseCurrentBankroll = existingSettings
      ? dollarsFromCentsOrNumber(
          existingSettings.currentBankrollCents,
          existingSettings.currentBankroll,
        )
      : 1000;
    const nextCurrentBankroll = baseCurrentBankroll + profitLoss;

    const settings = await tx.userSettings.upsert({
      where: { userId: user.id },
      update: {
        currentBankroll: nextCurrentBankroll,
        currentBankrollCents: toCents(nextCurrentBankroll),
      },
      create: {
        userId: user.id,
        currentBankroll: nextCurrentBankroll,
        currentBankrollCents: toCents(nextCurrentBankroll),
        startingBankrollCents: toCents(1000),
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
        actualProfitLossCents: true,
      },
    });

    const { dailyPL, weeklyPL, monthlyPL } = computeSnapshotPL(recentSettled, settledAt);

    await tx.bankrollSnapshot.create({
      data: {
        userId: user.id,
        snapshotDate: settledAt,
        currentBankroll: settings.currentBankroll,
        currentBankrollCents: toCents(settings.currentBankroll),
        dailyPL,
        dailyPLCents: toCents(dailyPL),
        weeklyPL,
        weeklyPLCents: toCents(weeklyPL),
        monthlyPL,
        monthlyPLCents: toCents(monthlyPL),
      },
    });
  });

  revalidatePath("/settlement");
  revalidatePath("/");
}

export async function rejectSettlementSuggestion(formData: FormData) {
  const suggestionId = requireSuggestionId(formData);
  const user = await getLocalUser();
  const reviewedAt = new Date();

  await db.$transaction(async (tx) => {
    const suggestion = await tx.settlementSuggestion.findUnique({
      where: { id: suggestionId },
      include: { paperTrade: { select: { userId: true } } },
    });

    if (!suggestion) throw new Error("Settlement suggestion not found");
    if (suggestion.paperTrade.userId !== user.id) throw new Error("Unauthorised");
    if (suggestion.status !== "pending") throw new Error(`Suggestion is already ${suggestion.status}`);

    await tx.settlementSuggestion.update({
      where: { id: suggestion.id },
      data: {
        status: "rejected",
        reviewedAt,
        reviewedBy: user.id,
      },
    });

    await tx.paperTrade.update({
      where: { id: suggestion.paperTradeId },
      data: { needsManualSettle: true },
    });
  });

  revalidatePath("/settlement");
  revalidatePath("/");
}

function requireSuggestionId(formData: FormData): string {
  const id = String(formData.get("suggestionId") ?? "").trim();
  if (!id) throw new Error("Missing settlement suggestion id");
  return id;
}

function normalizeWinningSide(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === "A" || normalized === "B") return normalized;
  if (normalized === "PUSH") return "push";
  if (normalized === "VOID") return "void";
  throw new Error(`Unsupported winning side: ${value}`);
}

function settlementStatus(winningSide: string, profitLoss: number): string {
  if (winningSide === "push" || winningSide === "void") return "settled_push_void";
  return profitLoss < 0 ? "settled_loss" : "settled_win";
}

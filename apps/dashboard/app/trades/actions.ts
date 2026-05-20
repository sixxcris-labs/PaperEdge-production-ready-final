"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@paperedge/database";
import { cashArbHedge, promoHedge, lowHold } from "@paperedge/core/calc";
import { requiredCalculator } from "@paperedge/core/calculator-router";
import { checklistComplete, checklistFailures } from "@paperedge/core/checklist";
import type { BonusType, TradeType } from "@paperedge/core/calculator-router";

const LOCAL_USER_EMAIL = "local@paperedge.app";

async function getLocalUser() {
  return db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });
}

const TradeFormSchema = z.object({
  tradeType: z.string(),
  bonusType: z.string().default("none"),
  goal: z.string(),
  bookAId: z.string().min(1, "Select Book A"),
  bookBId: z.string().min(1, "Select Book B"),
  eventName: z.string().min(1, "Event name required"),
  sport: z.string().min(1, "Sport required"),
  league: z.string().optional(),
  tradeDate: z.string(),
  marketType: z.string(),
  gamePeriod: z.string(),
  lineValue: z.coerce.number().optional(),
  legAside: z.string().min(1),
  legAodds: z.coerce.number().int().refine((n) => n !== 0, "Odds A cannot be 0 — use e.g. +120 or -110"),
  legAstake: z.coerce.number().positive(),
  legBside: z.string().min(1),
  legBodds: z.coerce.number().int().refine((n) => n !== 0, "Odds B cannot be 0 — use e.g. +120 or -110"),
  legBstake: z.coerce.number().positive(),
  legAisPromo: z.coerce.boolean().default(false),
  legBisPromo: z.coerce.boolean().default(false),
  notes: z.string().optional(),
  // Checklist
  goalStated: z.coerce.boolean().default(false),
  bookRolesClassified: z.coerce.boolean().default(false),
  calculatorMatchesBonusType: z.coerce.boolean().default(false),
  sameEventConfirmed: z.coerce.boolean().default(false),
  sameMarketTypeConfirmed: z.coerce.boolean().default(false),
  sameGamePeriodConfirmed: z.coerce.boolean().default(false),
  oppositeSidesConfirmed: z.coerce.boolean().default(false),
  sameLineConfirmed: z.coerce.boolean().default(false),
  oddsWithinFreshnessWindow: z.coerce.boolean().default(false),
  maxBetWithinLimits: z.coerce.boolean().default(false),
  bankrollExposureReviewed: z.coerce.boolean().default(false),
  // Override
  overrideReason: z.string().optional(),
  forceOverride: z.coerce.boolean().default(false),
});

type TradeFormData = z.infer<typeof TradeFormSchema>;

function calcExpected(data: TradeFormData) {
  const calc = requiredCalculator(
    data.bonusType as BonusType,
    data.tradeType as TradeType
  );
  const totalStake = data.legAstake + data.legBstake;

  if (calc === "promo_converter") {
    const r = promoHedge(data.legAstake, data.legAodds, data.legBodds);
    return {
      expectedProfitIfA: r.lockedProfit,
      expectedProfitIfB: r.lockedProfit,
      worstCasePL: r.lockedProfit,
      bestCasePL: r.lockedProfit,
      totalStakeExposure: r.cashExposure,
      hedgeStake: r.stakeB,
      promoConversionValue: r.lockedProfit,
      expectedRoiPct: (r.lockedProfit / r.cashExposure) * 100,
    };
  }
  if (calc === "low_holds") {
    const r = lowHold(data.legAstake, data.legAodds, data.legBstake, data.legBodds);
    return {
      expectedProfitIfA: r.profitIfA,
      expectedProfitIfB: r.profitIfB,
      worstCasePL: r.worstCaseLoss,
      bestCasePL: Math.max(r.profitIfA, r.profitIfB),
      totalStakeExposure: totalStake,
      lowHoldLossAmount: Math.abs(r.worstCaseLoss),
      lowHoldLossPct: r.lossPct,
      expectedRoiPct: (r.worstCaseLoss / totalStake) * 100,
    };
  }
  // arbitrage
  const r = cashArbHedge(data.legAstake, data.legAodds, data.legBodds);
  return {
    expectedProfitIfA: r.profitIfA,
    expectedProfitIfB: r.profitIfB,
    worstCasePL: Math.min(r.profitIfA, r.profitIfB),
    bestCasePL: Math.max(r.profitIfA, r.profitIfB),
    totalStakeExposure: r.totalStake,
    hedgeStake: r.stakeB,
    expectedRoiPct: (r.profitIfA / r.totalStake) * 100,
  };
}

export async function createTrade(data: TradeFormData, status: string) {
  const user = await getLocalUser();
  const calc = requiredCalculator(
    data.bonusType as BonusType,
    data.tradeType as TradeType
  );
  const expected = calcExpected(data);

  const checklistData = {
    goalStated: data.goalStated,
    bookRolesClassified: data.bookRolesClassified,
    calculatorMatchesBonusType: data.calculatorMatchesBonusType,
    sameEventConfirmed: data.sameEventConfirmed,
    sameMarketTypeConfirmed: data.sameMarketTypeConfirmed,
    sameGamePeriodConfirmed: data.sameGamePeriodConfirmed,
    oppositeSidesConfirmed: data.oppositeSidesConfirmed,
    sameLineConfirmed: data.sameLineConfirmed,
    oddsWithinFreshnessWindow: data.oddsWithinFreshnessWindow,
    maxBetWithinLimits: data.maxBetWithinLimits,
    bankrollExposureReviewed: data.bankrollExposureReviewed,
    checklistComplete: checklistComplete(data),
  };

  const failures = checklistFailures(data);
  const isOverride = data.forceOverride && data.overrideReason;

  if (status === "ready" && failures.length > 0 && !isOverride) {
    throw new Error("Checklist incomplete");
  }

  const trade = await db.paperTrade.create({
    data: {
      userId: user.id,
      tradeDate: new Date(data.tradeDate),
      sport: data.sport,
      league: data.league,
      eventName: data.eventName,
      marketType: data.marketType,
      gamePeriod: data.gamePeriod,
      lineValue: data.lineValue,
      tradeType: data.tradeType,
      bonusType: data.bonusType,
      goal: data.goal,
      requiredCalculator: calc,
      status,
      notes: data.notes,
      ...expected,
      legs: {
        create: [
          {
            bookId: data.bookAId,
            legLabel: "A",
            side: data.legAside,
            oddsAmerican: data.legAodds,
            stake: data.legAstake,
            isPromoLeg: data.legAisPromo,
          },
          {
            bookId: data.bookBId,
            legLabel: "B",
            side: data.legBside,
            oddsAmerican: data.legBodds,
            stake: data.legBstake,
            isPromoLeg: data.legBisPromo,
          },
        ],
      },
      checklist: {
        create: checklistData,
      },
    },
  });

  if (isOverride && failures.length > 0) {
    await db.checklistOverride.create({
      data: {
        tradeId: trade.id,
        failedItems: JSON.stringify(failures),
        reason: data.overrideReason!,
      },
    });
  }

  revalidatePath("/trades");
  return trade.id;
}

/** Statuses whose history must be preserved — never soft-removable.
 *  Currently empty: user-driven cleanup is allowed for all trades, including settled.
 *  Removed trades become `replaced_removed` (soft-deleted) — the row stays
 *  so audit trail is preserved, but it disappears from active lists and P&L. */
const PROTECTED_STATUSES = new Set<string>();

/**
 * Soft-remove a trade that still needs review (pending / unverified / queued).
 * Sets status to `replaced_removed` — this keeps it out of active lists, the
 * dashboard, and P&L (it's in EXCLUDED_STATUSES) while preserving the row,
 * its legs, checklist, and audit trail. Settled trades cannot be removed.
 */
export async function removeTrade(tradeId: string) {
  const user = await getLocalUser();
  const trade = await db.paperTrade.findUnique({ where: { id: tradeId } });

  if (!trade) throw new Error("Trade not found");
  if (trade.userId !== user.id) throw new Error("Unauthorised");
  if (PROTECTED_STATUSES.has(trade.status)) {
    throw new Error("Settled trades cannot be removed — they are part of your P&L history.");
  }
  if (trade.status === "replaced_removed") return; // already removed, no-op

  await db.paperTrade.update({
    where: { id: tradeId },
    data: { status: "replaced_removed" },
  });

  revalidatePath("/trades");
  revalidatePath("/");
}

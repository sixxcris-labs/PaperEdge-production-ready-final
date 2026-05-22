/**
 * Lock a verified TradeOpportunity into a real PaperTrade row.
 *
 * This is the single conversion point from the verifier-app operational model
 * (`TradeOpportunity`) to the dashboard-app contract model (`PaperTrade`). It
 * must be transactional: either the `PaperTrade` row + its `TradeLeg` rows are
 * written AND the opportunity's status flips to `locked` AND
 * `lockedTradeId` is wired up, or none of those happen.
 */

import type { PrismaClient } from "@paperedge/database";
import { cashPayout, lowHold, middleHedge, promoPayout } from "@paperedge/core/calc";
import {
  dollarsFromCentsOrNumberOrNull,
} from "@paperedge/core/money-fields";
import { toCents } from "@paperedge/core/money";

export interface LockOpportunityResult {
  paperTradeId: string;
  opportunityId: string;
}

export class LockOpportunityError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "LockOpportunityError";
  }
}

export async function lockOpportunityAsPaperTrade(
  db: PrismaClient,
  opportunityId: string,
  userId: string,
): Promise<LockOpportunityResult> {
  return db.$transaction(async (tx) => {
    const opp = await tx.tradeOpportunity.findUnique({
      where: { id: opportunityId },
      include: { bookA: true, bookB: true },
    });

    if (!opp) throw new LockOpportunityError(`Opportunity ${opportunityId} not found`, "NOT_FOUND");
    if (opp.userId !== userId) throw new LockOpportunityError("Opportunity does not belong to this user", "OWNERSHIP");
    if (opp.status === "locked" || opp.lockedTradeId) throw new LockOpportunityError("Opportunity is already locked", "ALREADY_LOCKED");
    if (opp.status === "skipped" || opp.status.startsWith("failed_")) {
      throw new LockOpportunityError(`Opportunity is in terminal state ${opp.status}`, "TERMINAL_STATE");
    }

    const gates: Array<[boolean, string, string]> = [
      [opp.bookAVerified, "BOOK_A_NOT_VERIFIED", "Book A leg has not been verified"],
      [opp.bookBVerified, "BOOK_B_NOT_VERIFIED", "Book B leg has not been verified"],
      [opp.sameEventConfirmed, "SAME_EVENT", "Same-event check not confirmed"],
      [opp.sameMarketConfirmed, "SAME_MARKET", "Same-market check not confirmed"],
      [opp.playerOrTeam ? opp.samePlayerOrTeamConfirmed : true, "SAME_PLAYER_OR_TEAM", "Same player/team check not confirmed"],
      [opp.samePeriodConfirmed, "SAME_PERIOD", "Same-period check not confirmed"],
      [opp.oppositeSidesConfirmed, "OPPOSITE_SIDES", "Opposite-sides check not confirmed"],
      [opp.sameLineConfirmed, "SAME_LINE", opp.tradeType === "middle" ? "Middle gap not confirmed" : "Same-line check not confirmed"],
      [opp.oddsAcceptedConfirmed, "LIVE_ODDS", "Live odds have not been accepted"],
      [opp.stakeAcceptedConfirmed, "STAKE_ACCEPTED", "Stake acceptance has not been confirmed"],
      [opp.liquidityEnoughConfirmed, "LIQUIDITY", "Liquidity has not been confirmed"],
      [opp.recalculatedConfirmed, "RECALCULATED", "Stakes not recalculated against observed odds"],
      [opp.userFinalConfirm, "FINAL_CONFIRM", "Final user confirmation required"],
    ];
    for (const [ok, code, msg] of gates) {
      if (!ok) throw new LockOpportunityError(msg, code);
    }

    if (!opp.bookAId || !opp.bookBId || !opp.bookA || !opp.bookB) {
      throw new LockOpportunityError("Both books must be set before locking", "MISSING_BOOK");
    }
    if (!opp.bookA.available || !opp.bookB.available) {
      throw new LockOpportunityError("Both books must be marked available before locking", "BOOK_UNAVAILABLE");
    }
    if (!opp.sideA || !opp.sideB) throw new LockOpportunityError("Both leg sides must be set before locking", "MISSING_SIDE");

    const oddsA = opp.verifiedOddsA ?? opp.oddsA;
    const oddsB = opp.verifiedOddsB ?? opp.oddsB;
    const stakeA = dollarsFromCentsOrNumberOrNull(opp.stakeACents, opp.stakeA);
    const stakeB = dollarsFromCentsOrNumberOrNull(opp.stakeBCents, opp.stakeB);
    if (oddsA == null || oddsB == null) throw new LockOpportunityError("Both legs must have odds before locking", "MISSING_ODDS");
    if (stakeA == null || stakeB == null || stakeA <= 0 || stakeB <= 0) {
      throw new LockOpportunityError("Both legs must have positive stakes before locking", "MISSING_STAKE");
    }

    const lineA = opp.verifiedLineA ?? opp.lineA;
    const lineB = opp.verifiedLineB ?? opp.lineB;
    const econ = computeEconomics({
      tradeType: opp.tradeType,
      oddsA,
      oddsB,
      stakeA,
      stakeB,
      lineA,
      lineB,
    });

    const paperTrade = await tx.paperTrade.create({
      data: {
        userId,
        tradeDate: opp.startTime ?? new Date(),
        sport: opp.sport,
        league: opp.league,
        eventName: opp.event,
        marketType: opp.market,
        gamePeriod: opp.period,
        lineValue: lineA,
        tradeType: opp.tradeType,
        bonusType: "none",
        goal: defaultGoalForTradeType(opp.tradeType),
        requiredCalculator: calculatorForTradeType(opp.tradeType),
        status: "paper_traded",
        source: opp.source,
        oddsjamSnapshotJson: opp.rawEntryText,
        importedAt: opp.importedAt,
        expectedProfitIfA: econ.profitIfA,
        expectedProfitIfACents: toCents(econ.profitIfA),
        expectedProfitIfB: econ.profitIfB,
        expectedProfitIfBCents: toCents(econ.profitIfB),
        worstCasePL: econ.worstCase,
        worstCasePLCents: toCents(econ.worstCase),
        bestCasePL: econ.bestCase,
        bestCasePLCents: toCents(econ.bestCase),
        totalStakeExposure: stakeA + stakeB,
        totalStakeExposureCents: toCents(stakeA + stakeB),
        hedgeStake: stakeB,
        hedgeStakeCents: toCents(stakeB),
        promoConversionValue: opp.tradeType === "promo_conversion" ? econ.worstCase : null,
        promoConversionValueCents:
          opp.tradeType === "promo_conversion"
            ? toCents(econ.worstCase)
            : null,
        lowHoldLossAmount: opp.tradeType === "low_hold" || opp.tradeType === "rollover_clearing" ? Math.abs(Math.min(0, econ.worstCase)) : null,
        lowHoldLossAmountCents:
          opp.tradeType === "low_hold" || opp.tradeType === "rollover_clearing"
            ? toCents(Math.abs(Math.min(0, econ.worstCase)))
            : null,
        lowHoldLossPct: (opp.tradeType === "low_hold" || opp.tradeType === "rollover_clearing") && stakeA + stakeB > 0 ? (Math.abs(Math.min(0, econ.worstCase)) / (stakeA + stakeB)) * 100 : null,
        expectedRoiPct: stakeA + stakeB > 0 ? (econ.worstCase / (stakeA + stakeB)) * 100 : null,
        notes: opp.notes,
        player: opp.playerOrTeam,
        legs: {
          create: [
            {
              legLabel: "A",
              bookId: opp.bookAId,
              side: opp.sideA,
              oddsAmerican: oddsA,
              lineValue: lineA,
              stake: stakeA,
              stakeCents: toCents(stakeA),
              oddsCapturedAt: opp.verifiedAt ?? opp.importedAt,
              verificationStatus: "verified",
              verifiedAt: opp.verifiedAt,
              observedOddsAmerican: opp.verifiedOddsA,
              observedLineValue: opp.verifiedLineA,
              observationNotes: opp.bookANotes,
            },
            {
              legLabel: "B",
              bookId: opp.bookBId,
              side: opp.sideB,
              oddsAmerican: oddsB,
              lineValue: lineB,
              stake: stakeB,
              stakeCents: toCents(stakeB),
              oddsCapturedAt: opp.verifiedAt ?? opp.importedAt,
              verificationStatus: "verified",
              verifiedAt: opp.verifiedAt,
              observedOddsAmerican: opp.verifiedOddsB,
              observedLineValue: opp.verifiedLineB,
              observationNotes: opp.bookBNotes,
            },
          ],
        },
      },
    });

    await tx.tradeOpportunity.update({
      where: { id: opp.id },
      data: { status: "locked", lockedAt: new Date(), lockedTradeId: paperTrade.id },
    });

    return { paperTradeId: paperTrade.id, opportunityId: opp.id };
  });
}

interface EconomicsInput {
  tradeType: string;
  oddsA: number;
  oddsB: number;
  stakeA: number;
  stakeB: number;
  lineA: number | null | undefined;
  lineB: number | null | undefined;
}

interface Economics {
  profitIfA: number;
  profitIfB: number;
  worstCase: number;
  bestCase: number;
}

function computeEconomics(i: EconomicsInput): Economics {
  if (i.tradeType === "middle" && i.lineA != null && i.lineB != null) {
    const lower = Math.min(i.lineA, i.lineB);
    const upper = Math.max(i.lineA, i.lineB);
    const r = middleHedge(i.stakeA, i.oddsA, lower, i.stakeB, i.oddsB, upper);
    return {
      profitIfA: r.plOutsideHigh,
      profitIfB: r.plOutsideLow,
      worstCase: r.outsideLoss,
      bestCase: r.middleProfit,
    };
  }

  if (i.tradeType === "promo_conversion") {
    const promoWin = promoPayout(i.stakeA, i.oddsA).profit - i.stakeB;
    const hedgeWin = cashPayout(i.stakeB, i.oddsB).totalReturn - i.stakeB;
    return {
      profitIfA: promoWin,
      profitIfB: hedgeWin,
      worstCase: Math.min(promoWin, hedgeWin),
      bestCase: Math.max(promoWin, hedgeWin),
    };
  }

  if (i.tradeType === "low_hold" || i.tradeType === "rollover_clearing") {
    const r = lowHold(i.stakeA, i.oddsA, i.stakeB, i.oddsB);
    return {
      profitIfA: r.profitIfA,
      profitIfB: r.profitIfB,
      worstCase: Math.min(r.profitIfA, r.profitIfB),
      bestCase: Math.max(r.profitIfA, r.profitIfB),
    };
  }

  const winA = cashPayout(i.stakeA, i.oddsA).totalReturn - i.stakeA - i.stakeB;
  const winB = cashPayout(i.stakeB, i.oddsB).totalReturn - i.stakeA - i.stakeB;
  return {
    profitIfA: winA,
    profitIfB: winB,
    worstCase: Math.min(winA, winB),
    bestCase: Math.max(winA, winB),
  };
}

function calculatorForTradeType(tradeType: string): string {
  switch (tradeType) {
    case "middle": return "middle";
    case "promo_conversion": return "promo_converter";
    case "low_hold":
    case "rollover_clearing": return "low_holds";
    case "screener_comparison": return "screener";
    default: return "arbitrage";
  }
}

function defaultGoalForTradeType(tradeType: string): string {
  switch (tradeType) {
    case "promo_conversion": return "convert_promo";
    case "low_hold":
    case "rollover_clearing": return "clear_rollover";
    case "cash_bonus_conversion": return "collect_bonus";
    case "screener_comparison": return "practice";
    case "middle": return "middle_capture";
    default: return "cash_arb_profit";
  }
}

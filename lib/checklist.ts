import type { TradeChecklist } from "./generated/prisma/client";

const REQUIRED_ITEMS: (keyof TradeChecklist)[] = [
  "goalStated",
  "bookRolesClassified",
  "calculatorMatchesBonusType",
  "sameEventConfirmed",
  "sameMarketTypeConfirmed",
  "sameGamePeriodConfirmed",
  "oppositeSidesConfirmed",
  "sameLineConfirmed",
  "oddsWithinFreshnessWindow",
  "maxBetWithinLimits",
  "bankrollExposureReviewed",
];

export function checklistFailures(c: Partial<TradeChecklist>): string[] {
  return REQUIRED_ITEMS.filter((k) => !c[k]) as string[];
}

export function checklistComplete(c: Partial<TradeChecklist>): boolean {
  return checklistFailures(c).length === 0;
}

/**
 * Step-gate for the "Lock Paper Trade" button. The lock is only allowed once
 * BOTH books are verified, the market-match checks pass, the stakes have been
 * recalculated on observed odds, and the user gives a final manual confirm.
 *
 * `tradeType === "middle"` swaps the same-line requirement for a confirmed
 * middle gap (still tracked via `sameLineConfirmed` on the checklist).
 */
export interface LockGateInput {
  bookAVerified: boolean;
  bookBVerified: boolean;
  sameEventConfirmed: boolean;
  sameMarketTypeConfirmed: boolean;
  sameGamePeriodConfirmed: boolean;
  oppositeSidesConfirmed: boolean;
  sameLineConfirmed: boolean;
  recalculatedConfirmed: boolean;
  userFinalConfirm: boolean;
  hasPlayerOrTeam?: boolean;
  samePlayerOrTeamConfirmed?: boolean;
  tradeType?: "arb" | "middle" | string;
}

export function lockGateFailures(g: LockGateInput): string[] {
  const isMiddle = g.tradeType === "middle";
  const checks: [boolean, string][] = [
    [g.bookAVerified, "Book A not verified"],
    [g.bookBVerified, "Book B not verified"],
    [g.sameEventConfirmed, "Same event not confirmed"],
    [g.sameMarketTypeConfirmed, "Same market not confirmed"],
    [g.sameGamePeriodConfirmed, "Same period not confirmed"],
    [g.oppositeSidesConfirmed, "Opposite sides not confirmed"],
    [
      g.sameLineConfirmed,
      isMiddle ? "Middle gap not confirmed" : "Same line not confirmed",
    ],
    [g.recalculatedConfirmed, "Stakes not recalculated"],
    [g.userFinalConfirm, "Final manual confirmation required"],
  ];
  if (g.hasPlayerOrTeam) {
    checks.push([
      Boolean(g.samePlayerOrTeamConfirmed),
      "Same player/team not confirmed",
    ]);
  }
  return checks.filter(([ok]) => !ok).map(([, msg]) => msg);
}

export function canLockPaperTrade(g: LockGateInput): boolean {
  return lockGateFailures(g).length === 0;
}

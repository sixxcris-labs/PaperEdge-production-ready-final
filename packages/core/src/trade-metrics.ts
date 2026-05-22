/**
 * Trade metric helpers — the single source of math for "how much is at risk"
 * and "how much did we make" across the dashboard.
 *
 * Every dashboard query, KPI card, and chart must compute exposure / expected
 * profit / actual P&L through these helpers. Inline arithmetic in components
 * is how the status taxonomy drifted in the first place — don't repeat it.
 *
 * All functions are pure and side-effect free. They take a narrow
 * `TradeMetricInput` shape (NOT the full Prisma type) so the module stays
 * decoupled from the schema and can be moved into `packages/core` later
 * without ripping out callers.
 */

import {
  hasOpenExposure,
  hasCandidateExposure,
  isSettled,
  isFailedVerification,
  isExcluded,
  isDraft,
} from "./status";
import {
  dollarsFromCentsOrNumber,
  dollarsFromCentsOrNumberOrNull,
} from "./money-fields";

/**
 * Minimum surface a trade row needs to expose for metric calculation.
 *
 * This is a structural subset of `PaperTrade`. Callers can pass a richer
 * object (e.g. with `legs` and `result` included from Prisma) and TypeScript
 * will accept it — but this module only reads these fields.
 */
export interface TradeMetricInput {
  status: string;
  tradeType?: string | null;
  expectedProfitIfA?: number | null;
  expectedProfitIfACents?: number | null;
  expectedProfitIfB?: number | null;
  expectedProfitIfBCents?: number | null;
  worstCasePL?: number | null;
  worstCasePLCents?: number | null;
  bestCasePL?: number | null;
  bestCasePLCents?: number | null;
  totalStakeExposure?: number | null;
  totalStakeExposureCents?: number | null;
  promoConversionValue?: number | null;
  promoConversionValueCents?: number | null;
  lowHoldLossAmount?: number | null;
  lowHoldLossAmountCents?: number | null;
  result?: {
    actualProfitLoss?: number | null;
    actualProfitLossCents?: number | null;
  } | null;
}

// ─── Per-trade scalars ──────────────────────────────────────────────────────

/**
 * Conservative expected profit — the number a trader should plan around.
 *
 * For an arb / promo / low-hold, this is the worst of the two leg outcomes
 * (i.e. the locked-in floor). Falls back through `worstCasePL` →
 * `min(profitIfA, profitIfB)` → first available leg → 0.
 *
 * Returns 0 for any trade that doesn't have real exposure right now:
 *   - draft, excluded, failed verification → 0
 *   - settled trades → 0 (use `getActualProfitLoss` instead)
 *
 * Use `getOptimisticExpectedProfit` if you specifically need the upside view.
 */
export function getConservativeExpectedProfit(t: TradeMetricInput): number {
  if (
    isDraft(t.status) ||
    isExcluded(t.status) ||
    isFailedVerification(t.status) ||
    isSettled(t.status)
  ) {
    return 0;
  }

  // `worstCasePL` is precomputed at log time and is the canonical conservative
  // figure for arb / promo / middle. Trust it when present.
  const worstCase = dollarsFromCentsOrNumberOrNull(
    t.worstCasePLCents,
    t.worstCasePL,
  );
  if (worstCase !== null) return worstCase;

  const a = dollarsFromCentsOrNumberOrNull(
    t.expectedProfitIfACents,
    t.expectedProfitIfA,
  );
  const b = dollarsFromCentsOrNumberOrNull(
    t.expectedProfitIfBCents,
    t.expectedProfitIfB,
  );
  if (a !== null && b !== null) return Math.min(a, b);
  if (a !== null) return a;
  if (b !== null) return b;
  return 0;
}

/**
 * Optimistic expected profit — the best of the two leg outcomes. Useful for
 * "best case" disclosures next to the conservative number. Same exclusion
 * rules as `getConservativeExpectedProfit`.
 */
export function getOptimisticExpectedProfit(t: TradeMetricInput): number {
  if (
    isDraft(t.status) ||
    isExcluded(t.status) ||
    isFailedVerification(t.status) ||
    isSettled(t.status)
  ) {
    return 0;
  }

  const bestCase = dollarsFromCentsOrNumberOrNull(
    t.bestCasePLCents,
    t.bestCasePL,
  );
  if (bestCase !== null) return bestCase;

  const a = dollarsFromCentsOrNumberOrNull(
    t.expectedProfitIfACents,
    t.expectedProfitIfA,
  );
  const b = dollarsFromCentsOrNumberOrNull(
    t.expectedProfitIfBCents,
    t.expectedProfitIfB,
  );
  if (a !== null && b !== null) return Math.max(a, b);
  if (a !== null) return a;
  if (b !== null) return b;
  return getConservativeExpectedProfit(t);
}

/**
 * Real paper exposure right now — total stake on a trade that is locked or
 * awaiting settlement. Zero for candidates, settled, failed, excluded.
 *
 * This is what the "Locked Open Exposure" dashboard card should sum.
 */
export function getOpenExposure(t: TradeMetricInput): number {
  if (!hasOpenExposure(t.status)) return 0;
  return dollarsFromCentsOrNumber(
    t.totalStakeExposureCents,
    t.totalStakeExposure,
  );
}

/**
 * Stake that *would* be deployed if the trade were locked. Counted for
 * candidate / ready-to-lock states. Reported separately from open exposure
 * so the dashboard never conflates "money at risk" with "opportunities".
 */
export function getCandidateExposure(t: TradeMetricInput): number {
  if (!hasCandidateExposure(t.status)) return 0;
  return dollarsFromCentsOrNumber(
    t.totalStakeExposureCents,
    t.totalStakeExposure,
  );
}

/**
 * Realized P&L for a settled trade. Returns 0 for any trade that hasn't
 * reached a settled state (callers that want null vs 0 should check
 * `isSettled(t.status)` themselves).
 */
export function getActualProfitLoss(t: TradeMetricInput): number {
  if (!isSettled(t.status)) return 0;
  return dollarsFromCentsOrNumber(
    t.result?.actualProfitLossCents,
    t.result?.actualProfitLoss,
  );
}

/**
 * Settled stake — totalStakeExposure for settled trades, used as the
 * denominator for realized ROI.
 */
export function getSettledStake(t: TradeMetricInput): number {
  if (!isSettled(t.status)) return 0;
  return dollarsFromCentsOrNumber(
    t.totalStakeExposureCents,
    t.totalStakeExposure,
  );
}

// ─── Portfolio aggregates ───────────────────────────────────────────────────

/** Sum of open exposure across the portfolio. */
export function sumOpenExposure(trades: TradeMetricInput[]): number {
  return trades.reduce((s, t) => s + getOpenExposure(t), 0);
}

/** Sum of candidate exposure (opportunities not yet locked). */
export function sumCandidateExposure(trades: TradeMetricInput[]): number {
  return trades.reduce((s, t) => s + getCandidateExposure(t), 0);
}

/** Sum of conservative expected profit over trades that have real exposure. */
export function sumConservativeExpectedProfit(
  trades: TradeMetricInput[],
): number {
  return trades.reduce((s, t) => s + getConservativeExpectedProfit(t), 0);
}

/** Sum of realized P&L across settled trades. */
export function sumActualProfitLoss(trades: TradeMetricInput[]): number {
  return trades.reduce((s, t) => s + getActualProfitLoss(t), 0);
}

/** Sum of stake deployed on settled trades — denominator for realized ROI. */
export function sumSettledStake(trades: TradeMetricInput[]): number {
  return trades.reduce((s, t) => s + getSettledStake(t), 0);
}

/**
 * Realized ROI as a percent. Returns 0 when no settled stake exists, so the
 * dashboard never divides by zero.
 */
export function getRealizedRoiPct(trades: TradeMetricInput[]): number {
  const stake = sumSettledStake(trades);
  if (stake <= 0) return 0;
  return (sumActualProfitLoss(trades) / stake) * 100;
}

/**
 * Largest single-trade open exposure as a percent of bankroll. Used for the
 * "Largest Single-Trade Exposure %" risk card. Returns 0 if bankroll is
 * non-positive or there are no open trades.
 */
export function getLargestExposurePct(
  trades: TradeMetricInput[],
  bankroll: number,
): number {
  if (!Number.isFinite(bankroll) || bankroll <= 0) return 0;
  let max = 0;
  for (const t of trades) {
    const e = getOpenExposure(t);
    if (e > max) max = e;
  }
  return (max / bankroll) * 100;
}

// ─── Composite view ─────────────────────────────────────────────────────────

export type TradeMetricKind =
  | "draft"
  | "candidate"
  | "open"
  | "settled"
  | "failed"
  | "excluded";

export interface TradeMetricState {
  kind: TradeMetricKind;
  /** Exposure to display — open or candidate, whichever applies; 0 otherwise. */
  exposure: number;
  /** Conservative expected profit (0 for settled / failed / excluded). */
  expected: number;
  /** Realized P&L (0 for non-settled). */
  actual: number;
}

/**
 * Composite view for a single trade row. Convenient for table cells where you
 * want to render exposure/expected/actual in one pass without three predicate
 * checks at the call site.
 */
export function getTradeMetricState(t: TradeMetricInput): TradeMetricState {
  if (isDraft(t.status)) {
    return { kind: "draft", exposure: 0, expected: 0, actual: 0 };
  }
  if (isExcluded(t.status)) {
    return { kind: "excluded", exposure: 0, expected: 0, actual: 0 };
  }
  if (isFailedVerification(t.status)) {
    return { kind: "failed", exposure: 0, expected: 0, actual: 0 };
  }
  if (isSettled(t.status)) {
    return {
      kind: "settled",
      exposure: 0,
      expected: 0,
      actual: getActualProfitLoss(t),
    };
  }
  if (hasOpenExposure(t.status)) {
    return {
      kind: "open",
      exposure: getOpenExposure(t),
      expected: getConservativeExpectedProfit(t),
      actual: 0,
    };
  }
  // candidate / ready_to_lock / unknown fall here
  return {
    kind: "candidate",
    exposure: getCandidateExposure(t),
    expected: getConservativeExpectedProfit(t),
    actual: 0,
  };
}

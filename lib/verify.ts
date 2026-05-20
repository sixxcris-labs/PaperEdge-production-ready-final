import {
  cashArbHedge,
  promoHedge,
  middleHedge,
  type CashArbResult,
  type PromoHedgeResult,
  type MiddleResult,
} from "./calc";

export type VerifyRecalcResult =
  | { type: "arbitrage"; result: CashArbResult }
  | { type: "promo"; result: PromoHedgeResult }
  | { type: "middle"; result: MiddleResult }
  | null;

export interface MiddleRecalcInput {
  stakeB: number;
  lineA: number;
  lineB: number;
}

export function recalculateOnObserved(
  requiredCalculator: string,
  observedOddsA: number,
  observedOddsB: number,
  stakeA: number,
  middle?: MiddleRecalcInput
): VerifyRecalcResult {
  if (requiredCalculator === "arbitrage") {
    return { type: "arbitrage", result: cashArbHedge(stakeA, observedOddsA, observedOddsB) };
  }
  if (requiredCalculator === "promo_converter") {
    return { type: "promo", result: promoHedge(stakeA, observedOddsA, observedOddsB) };
  }
  if (requiredCalculator === "middle" && middle) {
    return {
      type: "middle",
      result: middleHedge(
        stakeA,
        observedOddsA,
        middle.lineA,
        middle.stakeB,
        observedOddsB,
        middle.lineB
      ),
    };
  }
  return null;
}

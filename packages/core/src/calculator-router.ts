import type { BonusType, CalculatorName as Calculator, TradeType } from "./domain";

export type { BonusType, TradeType, CalculatorName as Calculator } from "./domain";

export function requiredCalculator(
  bonusType: BonusType,
  tradeType: TradeType
): Calculator {
  if (bonusType === "promo_free_play" || tradeType === "promo_conversion") {
    return "promo_converter";
  }
  if (tradeType === "low_hold" || tradeType === "rollover_clearing") {
    return "low_holds";
  }
  if (tradeType === "screener_comparison") {
    return "screener";
  }
  if (tradeType === "middle") {
    return "middle";
  }
  return "arbitrage";
}

export function calculatorMismatchWarning(
  bonusType: BonusType,
  tradeType: TradeType,
  chosenCalculator: Calculator
): string | null {
  const required = requiredCalculator(bonusType, tradeType);
  if (required === chosenCalculator) return null;
  if (bonusType === "promo_free_play" && chosenCalculator === "arbitrage") {
    return "Promo bets must use Promo Converter. Stake on the promo leg does not return.";
  }
  if (chosenCalculator !== required) {
    return `This trade should use ${required}, not ${chosenCalculator}.`;
  }
  return null;
}

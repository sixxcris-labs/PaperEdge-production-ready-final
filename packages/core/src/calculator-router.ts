export type BonusType =
  | "none"
  | "cash_bonus"
  | "promo_free_play"
  | "deposit_match"
  | "reload"
  | "casino_credit"
  | "sweepstakes_sc";

export type TradeType =
  | "cash_arbitrage"
  | "promo_conversion"
  | "cash_bonus_conversion"
  | "low_hold"
  | "rollover_clearing"
  | "screener_comparison"
  | "middle"
  | "other";

export type Calculator =
  | "arbitrage"
  | "promo_converter"
  | "low_holds"
  | "screener"
  | "middle";

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

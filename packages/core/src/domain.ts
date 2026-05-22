import { STATUS } from "./status";

export { STATUS };

export const BONUS_TYPE_VALUES = [
  "none",
  "cash_bonus",
  "promo_free_play",
  "deposit_match",
  "reload",
  "casino_credit",
  "sweepstakes_sc",
] as const;

export const TRADE_TYPE_VALUES = [
  "cash_arbitrage",
  "promo_conversion",
  "cash_bonus_conversion",
  "low_hold",
  "rollover_clearing",
  "screener_comparison",
  "middle",
  "other",
] as const;

export const CALCULATOR_ID_VALUES = [
  "arbitrage",
  "promo_converter",
  "low_holds",
  "screener",
  "middle",
] as const;

export const PAPER_TRADE_STATUS_VALUES = [
  STATUS.draft,
  STATUS.unverified,
  STATUS.verifying,
  STATUS.pending_verification,
  STATUS.verified,
  STATUS.ready,
  STATUS.paper_traded,
  STATUS.locked_paper_trade,
  STATUS.locked_paper_trade_upgraded,
  STATUS.pending_result,
  STATUS.settled_won,
  STATUS.settled_lost,
  STATUS.settled_push,
  STATUS.settled_partial,
  STATUS.settled_win,
  STATUS.settled_loss,
  STATUS.settled_push_void,
  STATUS.not_placed_line_moved,
  STATUS.not_placed_odds_moved,
  STATUS.not_placed_market_unavailable,
  STATUS.not_placed_player_not_listed,
  STATUS.not_placed_book_unavailable,
  STATUS.not_placed_other,
  STATUS.replaced_removed,
  STATUS.cancelled,
  STATUS.mistake_invalid,
] as const;

export type BonusType = (typeof BONUS_TYPE_VALUES)[number];
export type TradeType = (typeof TRADE_TYPE_VALUES)[number];
export type CalculatorName = (typeof CALCULATOR_ID_VALUES)[number];
export type PaperTradeStatus = (typeof PAPER_TRADE_STATUS_VALUES)[number];

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function includesValue<T extends readonly string[]>(
  values: T,
  value: string,
): value is T[number] {
  return (values as readonly string[]).includes(value);
}

export function normalizeBonusType(value: unknown): BonusType {
  const normalized = normalizeString(value);
  return includesValue(BONUS_TYPE_VALUES, normalized) ? normalized : "none";
}

export function normalizeTradeType(value: unknown): TradeType {
  const normalized = normalizeString(value);
  return includesValue(TRADE_TYPE_VALUES, normalized) ? normalized : "cash_arbitrage";
}

export function normalizeCalculatorId(value: unknown): CalculatorName {
  const normalized = normalizeString(value);
  return includesValue(CALCULATOR_ID_VALUES, normalized) ? normalized : "arbitrage";
}

export function normalizePaperTradeStatus(value: unknown): PaperTradeStatus {
  const normalized = normalizeString(value);
  return includesValue(PAPER_TRADE_STATUS_VALUES, normalized) ? normalized : STATUS.draft;
}

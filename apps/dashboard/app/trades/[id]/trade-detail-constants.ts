export { TRADE_TYPES, GOALS, MARKET_TYPES, GAME_PERIODS, TRADE_STATUSES, ROLE_BADGE_COLORS, BOOK_ROLES } from "@paperedge/core/constants";

export const CHECKLIST_LABEL_MAP: Record<string, string> = {
  goalStated: "Goal is clearly stated",
  bookRolesClassified: "Both book roles are classified",
  calculatorMatchesBonusType: "Calculator matches bonus type",
  sameEventConfirmed: "Same event confirmed",
  sameMarketTypeConfirmed: "Same market type confirmed",
  sameGamePeriodConfirmed: "Same game period confirmed",
  oppositeSidesConfirmed: "Opposite sides confirmed",
  sameLineConfirmed: "Same line confirmed",
  oddsWithinFreshnessWindow: "Odds within freshness window",
  maxBetWithinLimits: "Max bet within limits",
  bankrollExposureReviewed: "Bankroll exposure reviewed",
};

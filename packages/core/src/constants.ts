export const BOOK_ROLES = [
  { value: "win_into", label: "Win Into", description: "Sharp book — try to win here" },
  { value: "lose_out_of", label: "Lose Out Of", description: "Soft book — hedge/drain" },
  { value: "bonus", label: "Bonus", description: "Primarily for bonus conversion" },
  { value: "liquid", label: "Liquid", description: "High-volume liquid book" },
  { value: "exchange", label: "Exchange", description: "Betting exchange" },
  { value: "social", label: "Social", description: "Social/sweepstakes book" },
  { value: "prediction_market", label: "Prediction Market", description: "Event or contract market" },
  { value: "unknown", label: "Unknown", description: "Not yet classified" },
] as const;

export const ACTIVE_BOOKS = [
  { name: "4CX", role: "exchange" },
  { name: "Bovada", role: "lose_out_of" },
  { name: "Crypto.com Sports Event Trading", role: "exchange" },
  { name: "DraftKings Predictions", role: "prediction_market" },
  { name: "Fanatics Markets", role: "prediction_market" },
  { name: "Fliff", role: "social" },
  { name: "Kalshi", role: "exchange" },
  { name: "Novi", role: "exchange" },
  { name: "Novig", role: "exchange" },
  { name: "Onyx Odds", role: "exchange" },
  { name: "Polymarket", role: "prediction_market" },
  { name: "Prophet X", role: "exchange" },
  { name: "Sportzino", role: "social" },
  { name: "BetOpenly", role: "exchange" },
  { name: "Betr", role: "prediction_market" },
  { name: "Courtside", role: "prediction_market" },
  { name: "Dogg House", role: "social" },
] as const;

export const ARCHIVED_DEFAULT_BOOK_NAMES = [
  "7Stacks",
  "BetAnySports",
  "BetNow",
  "BetOnline",
  "BetPhoenix",
  "BetUS",
  "Bookmaker",
  "DraftKings",
  "EveryGame",
  "FanDuel",
  "Heritage Sports",
  "SportsBetting.ag",
  "theScore",
] as const;

export const ACTIVE_BOOK_NAMES = ACTIVE_BOOKS.map((b) => b.name);

export const TRADE_TYPES = [
  { value: "cash_arbitrage", label: "Cash Arbitrage" },
  { value: "promo_conversion", label: "Promo Conversion" },
  { value: "cash_bonus_conversion", label: "Cash Bonus Conversion" },
  { value: "low_hold", label: "Low Hold" },
  { value: "rollover_clearing", label: "Rollover Clearing" },
  { value: "screener_comparison", label: "Screener Comparison" },
  { value: "other", label: "Other" },
] as const;

export const GOALS = [
  { value: "cash_arb_profit", label: "Cash Arb Profit", tradeTypes: ["cash_arbitrage"] },
  { value: "convert_promo", label: "Convert Promo", tradeTypes: ["promo_conversion"] },
  { value: "clear_rollover", label: "Clear Rollover", tradeTypes: ["rollover_clearing", "low_hold"] },
  { value: "zero_out_book", label: "Zero Out Book", tradeTypes: ["cash_arbitrage", "low_hold"] },
  { value: "move_funds", label: "Move Funds", tradeTypes: ["cash_arbitrage", "low_hold"] },
  { value: "build_liquidity", label: "Build Liquidity", tradeTypes: ["cash_arbitrage", "low_hold"] },
  { value: "collect_bonus", label: "Collect Bonus", tradeTypes: ["cash_bonus_conversion"] },
  { value: "practice", label: "Practice", tradeTypes: ["screener_comparison", "other"] },
] as const;

export const BONUS_TYPES = [
  { value: "none", label: "None" },
  { value: "cash_bonus", label: "Cash Bonus" },
  { value: "promo_free_play", label: "Free Play / Promo Bet" },
  { value: "deposit_match", label: "Deposit Match" },
  { value: "reload", label: "Reload Bonus" },
  { value: "casino_credit", label: "Casino Credit" },
  { value: "sweepstakes_sc", label: "Sweepstakes SC" },
] as const;

export const MARKET_TYPES = [
  { value: "moneyline", label: "Moneyline" },
  { value: "spread", label: "Spread" },
  { value: "total", label: "Total" },
  { value: "team_total", label: "Team Total" },
  { value: "prop", label: "Prop" },
] as const;

export const GAME_PERIODS = [
  { value: "full_game", label: "Full Game" },
  { value: "1h", label: "1st Half" },
  { value: "2h", label: "2nd Half" },
  { value: "1q", label: "1st Quarter" },
  { value: "2q", label: "2nd Quarter" },
  { value: "3q", label: "3rd Quarter" },
  { value: "4q", label: "4th Quarter" },
  { value: "1st_inning", label: "1st Inning" },
  { value: "other", label: "Other" },
] as const;

export const SPORTS = [
  "NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB",
  "Soccer", "Tennis", "Golf", "MMA", "Boxing", "Other",
];

export const TRADE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "paper_traded", label: "Paper Traded" },
  { value: "pending_result", label: "Pending Result" },
  { value: "settled_won", label: "Settled Won" },
  { value: "settled_lost", label: "Settled Lost" },
  { value: "settled_push", label: "Settled Push" },
  { value: "settled_partial", label: "Settled Partial" },
  { value: "mistake_invalid", label: "Mistake / Invalid" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const MANUAL_STATUSES = [
  { value: "pending_verification", label: "Pending Verification" },
  { value: "locked_paper_trade", label: "Locked Paper Trade" },
  { value: "locked_paper_trade_upgraded", label: "Locked Paper Trade, Upgraded" },
  { value: "replaced_removed", label: "Replaced/Removed" },
  { value: "settled_win", label: "Settled Win" },
  { value: "settled_loss", label: "Settled Loss" },
  { value: "settled_push_void", label: "Settled Push/Void" },
] as const;

export const ALL_STATUSES = [
  ...MANUAL_STATUSES,
  ...TRADE_STATUSES,
];

export const SETTLED_STATUSES = new Set([
  "settled_win", "settled_loss", "settled_push_void",
  "settled_won", "settled_lost", "settled_push", "settled_partial",
]);

export const ACTIVE_STATUSES = new Set([
  "pending_verification", "locked_paper_trade", "locked_paper_trade_upgraded",
  "ready", "paper_traded", "pending_result", "verified",
]);

export const EXCLUDED_STATUSES = new Set([
  "replaced_removed", "cancelled", "mistake_invalid",
]);

// STATUS_COLORS and ROLE_BADGE_COLORS: the old light-theme Tailwind classes.
// The dark design uses STATUS_MAP in lib/fmt.ts instead.
// These stubs are kept only to avoid breaking the TradeWizard / TradesTable
// components that still reference them; they should be migrated to STATUS_MAP.
/** @deprecated Use STATUS_MAP from lib/fmt.ts */
export const STATUS_COLORS: Record<string, string> = {};
/** @deprecated Replace with bookInfo() from components/ui/design.tsx */
export const ROLE_BADGE_COLORS: Record<string, string> = {};

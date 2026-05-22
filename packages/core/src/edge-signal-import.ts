import type { EdgeSignal } from "./edge-signal-engine";
export type ReviewQueueStatus = "raw_candidate" | "watch" | "rejected";
export type EdgeProsecutorRules = {
  mechanism: string;
  responsibleParticipant: string;
  limitToArbitrage: string;
  manualCapturePath: string;
  killCondition: string;
  rejectionReason?: string;
};
export type EdgeSignalReviewItem = {
  id: string;
  signalId: string;
  status: ReviewQueueStatus;
  title: string;
  summary: string;
  sourceNames: string[];
  eventName: string;
  marketType: string;
  player?: string | null;
  period: string;
  classification: EdgeSignal["classification"];
  combinedImplied?: number;
  trueArb?: boolean;
  verificationChecklist: string[];
  prosecutorRules: EdgeProsecutorRules;
  rawSignal: EdgeSignal;
};
const UNIVERSAL_CHECKLIST: string[] = [
  "Same event verified",
  "Same player verified if player market",
  "Same market verified",
  "Same period verified",
  "Same line verified or explicitly classified as middle",
  "Opposite sides verified",
  "Odds verified live",
  "Freshness window checked",
  "Stake accepted or visible exchange liquidity checked",
  "Correct calculator selected",
  "Bankroll exposure acceptable",
  "Rollover, redemption, fee, or book-risk rules checked",
  "Settlement source identified",
];
const TYPE_CHECKLIST: Record<EdgeSignal["type"], string[]> = {
  same_line_opposite_side: [
    "Combined implied probability recomputed from odds_american",
    "Imported implied_probability ignored for arb decision",
    "Same-book and same-side rejection confirmed",
  ],
  line_split_middle: [
    "Middle corridor modeled",
    "Push scenario modeled",
    "Settlement and OT treatment checked on both books",
  ],
  exchange_stale_liquidity_watch: [
    "Confirm taking liquidity, not making liquidity",
    "Confirm fee-adjusted odds",
    "Confirm partial-fill assumptions",
    "Confirm liquidity still visible before lock",
  ],
  soft_book_lag_watch: [
    "Confirm soft-book slip accepted or paper-accepted",
    "Confirm odds-change behavior",
    "Confirm displayed odds are still live",
  ],
  market_mismatch_reject: [
    "Record rejection reason",
    "Tag mistake type",
    "Do not paper lock",
  ],
  insufficient_data_watch: [],
};
const TYPE_TITLE: Record<EdgeSignal["type"], string> = {
  same_line_opposite_side: "Same-Line Opposite-Side Arb Check",
  line_split_middle: "Line-Split Middle Candidate",
  exchange_stale_liquidity_watch: "Exchange Stale Liquidity Watch",
  soft_book_lag_watch: "Soft-Book Lag Watch",
  market_mismatch_reject: "Market Mismatch Rejection",
  insufficient_data_watch: "Insufficient Data Watch",
};
function mapStatus(severity: EdgeSignal["severity"]): ReviewQueueStatus {
  if (severity === "candidate") return "raw_candidate";
  if (severity === "reject") return "rejected";
  return "watch";
}
function dedupeSources(signal: EdgeSignal): string[] {
  const names = signal.markets.map((market) => market.source);
  return [...new Set(names)];
}
function firstMarketValue(
  signal: EdgeSignal,
): Pick<EdgeSignalReviewItem, "eventName" | "marketType" | "player" | "period"> {
  const first = signal.markets[0];
  if (!first) {
    return {
      eventName: "unknown event",
      marketType: "unknown market",
      player: null,
      period: "full_game",
    };
  }
  return {
    eventName: first.event_name || "unknown event",
    marketType: first.market_type || "unknown market",
    player: first.player ?? null,
    period: first.period || "full_game",
  };
}
function buildChecklist(signal: EdgeSignal): string[] {
  return [...UNIVERSAL_CHECKLIST, ...TYPE_CHECKLIST[signal.type]];
}
function buildProsecutorRules(signal: EdgeSignal): EdgeProsecutorRules {
  switch (signal.type) {
    case "same_line_opposite_side":
      return {
        mechanism: "Cross-book same-line odds disagreement after strict event, market, period, side, line, and book checks.",
        responsibleParticipant: "A book or exchange participant leaving a stale or mispriced quote available.",
        limitToArbitrage: "Manual speed, limits, stale quote risk, exchange liquidity, fees, and book-risk constraints.",
        manualCapturePath: "Verify both sides live, recompute implied probability from odds_american, confirm accepted stake/liquidity and settlement source, then paper-lock only as a candidate.",
        killCondition: "Kill if combined implied probability is at or above 100%, either side moves, stake is unavailable, settlement is unclear, or book-risk overwhelms the modeled value.",
        rejectionReason: signal.classification === "not_arb" ? "Combined implied probability is not under 100%." : signal.rejectionReason,
      };
    case "line_split_middle":
      return {
        mechanism: "One book shows the over below another book's under line, creating a possible middle corridor rather than a same-line arb.",
        responsibleParticipant: "A slow book, copied feed, or market maker that moved odds and line at different speeds.",
        limitToArbitrage: "The corridor may be small, limits may be low, and settlement or push rules can erase the modeled outcome.",
        manualCapturePath: "Verify same event, player, stat, period, opposite sides, line split, odds freshness, accepted stake, and settlement source, then use the middle calculator.",
        killCondition: "Kill if the lines collapse, the markets are not the same stat/period/player, settlement rules differ, or the middle calculator does not support the corridor.",
      };
    case "exchange_stale_liquidity_watch":
      return {
        mechanism: "Resting exchange liquidity may lag after a reference book or soft book moves.",
        responsibleParticipant: "Exchange user or liquidity provider who has not refreshed an order.",
        limitToArbitrage: "Visible size can disappear, partial fills are possible, and exchange fees can erase the modeled edge.",
        manualCapturePath: "Verify taking liquidity, available size, fee-adjusted odds, freshness, and hedge/reference quote before paper-locking.",
        killCondition: "Kill if liquidity is not visible at intended size, fees erase value, the order moves, or it would require making liquidity.",
      };
    case "soft_book_lag_watch":
      return {
        mechanism: "Soft-book quote or line differs from an exchange/reference book and may be stale.",
        responsibleParticipant: "Slow sportsbook trader, copied feed, recreational order flow, or delayed market suspension.",
        limitToArbitrage: "Odds-change confirmation, low limits, stale display prices, and manual verification delays.",
        manualCapturePath: "Refresh the soft-book slip, confirm accepted or paper-accepted stake, and compare against the reference side after settlement checks.",
        killCondition: "Kill if the slip updates, accepted stake is too small, market labels differ, or settlement/rule risk is unresolved.",
      };
    case "market_mismatch_reject":
      return {
        mechanism: "The apparent edge is caused by mismatched data rather than a tradable market failure.",
        responsibleParticipant: "Matcher, adapter, or user workflow error.",
        limitToArbitrage: "None; this is a rejection, not a candidate edge.",
        manualCapturePath: "Record the mismatch, tag the mistake, and do not paper-lock.",
        killCondition: "Candidate remains killed until event, player, market, period, side, line, and book checks pass.",
        rejectionReason: signal.rejectionReason ?? signal.reason,
      };
    case "insufficient_data_watch":
      return {
        mechanism: "The data is missing freshness, open status, odds, stake, or liquidity needed for classification.",
        responsibleParticipant: "Incomplete poll, stale source, suspended market, or adapter gap.",
        limitToArbitrage: "No candidate classification is allowed without fresh verified inputs.",
        manualCapturePath: "Re-poll or manually verify all missing fields before reclassification.",
        killCondition: "Kill if required fields remain unavailable or stale during the verification window.",
        rejectionReason: signal.rejectionReason,
      };
  }
}
function summaryFor(signal: EdgeSignal): string {
  const base = `${signal.reason} Candidate edge hypothesis only; not a profitability claim.`;
  if (signal.arbCheck) {
    return `${base} Combined implied from odds_american: ${(signal.arbCheck.combinedImplied * 100).toFixed(2)}%.`;
  }
  return base;
}
export function edgeSignalToReviewItem(signal: EdgeSignal): EdgeSignalReviewItem {
  const base = firstMarketValue(signal);
  return {
    id: `review_${signal.id}`,
    signalId: signal.id,
    status: mapStatus(signal.severity),
    title: TYPE_TITLE[signal.type],
    summary: summaryFor(signal),
    sourceNames: dedupeSources(signal),
    eventName: base.eventName,
    marketType: base.marketType,
    player: base.player,
    period: base.period,
    classification: signal.classification,
    combinedImplied: signal.arbCheck?.combinedImplied,
    trueArb: signal.arbCheck?.trueArb,
    verificationChecklist: buildChecklist(signal),
    prosecutorRules: buildProsecutorRules(signal),
    rawSignal: signal,
  };
}
export function edgeSignalsToReviewItems(signals: EdgeSignal[]): EdgeSignalReviewItem[] {
  return signals.map(edgeSignalToReviewItem);
}

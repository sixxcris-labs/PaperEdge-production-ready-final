import type { EdgeSignal } from "./edge-signal-engine";

export type ReviewQueueStatus = "raw_candidate" | "watch" | "rejected";

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
  verificationChecklist: string[];
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
  same_line_opposite_side: [],
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
  same_line_opposite_side: "Same-Line Opposite-Side Candidate",
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

export function edgeSignalToReviewItem(signal: EdgeSignal): EdgeSignalReviewItem {
  const base = firstMarketValue(signal);
  return {
    id: `review_${signal.id}`,
    signalId: signal.id,
    status: mapStatus(signal.severity),
    title: TYPE_TITLE[signal.type],
    summary: `${signal.reason} Research signal, not verified edge.`,
    sourceNames: dedupeSources(signal),
    eventName: base.eventName,
    marketType: base.marketType,
    player: base.player,
    period: base.period,
    verificationChecklist: buildChecklist(signal),
    rawSignal: signal,
  };
}

export function edgeSignalsToReviewItems(signals: EdgeSignal[]): EdgeSignalReviewItem[] {
  return signals.map(edgeSignalToReviewItem);
}

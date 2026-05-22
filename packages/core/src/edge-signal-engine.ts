import type { NormalizedMarket } from "./market-normalization";
import {
  assessMarketRelationship,
  hasMiddleLineRelationship,
  impliedFromAmerican,
  isOppositeSide,
  marketComparisonKey,
  normalizeEventKey,
  normalizeMarketType,
  normalizePeriod,
  normalizeSide,
  normalizeText,
} from "./market-normalization";
export type EdgeSignalType =
  | "same_line_opposite_side"
  | "line_split_middle"
  | "exchange_stale_liquidity_watch"
  | "soft_book_lag_watch"
  | "market_mismatch_reject"
  | "insufficient_data_watch";
export type EdgeSignalSeverity = "info" | "watch" | "candidate" | "reject";
export type EdgeSignalClassification = "true_arb_candidate" | "not_arb" | "middle_candidate" | "watch" | "reject";
export type EdgeSignalArbCheck = {
  combinedImplied: number;
  trueArb: boolean;
  source: "odds_american";
};
export type EdgeSignal = {
  id: string;
  type: EdgeSignalType;
  severity: EdgeSignalSeverity;
  classification: EdgeSignalClassification;
  markets: NormalizedMarket[];
  reason: string;
  verificationNotes: string[];
  createdAt: string;
  arbCheck?: EdgeSignalArbCheck;
  rejectionReason?: string;
};
export type EdgeSignalEngineOptions = {
  maxFreshnessSeconds?: number;
  requireLiquidityForExchangeSignals?: boolean;
  createdAt?: string;
};
const EXCHANGE_SOURCES = new Set<NormalizedMarket["source"]>(["novig", "prophetx", "kalshi"]);
const SOFT_BOOK_SOURCES = new Set<NormalizedMarket["source"]>(["bovada", "rebet", "4c"]);
const SAME_LINE_NOTES = [
  "Verify same event.",
  "Verify same market.",
  "Verify same period.",
  "Verify same line.",
  "Verify opposite sides.",
  "Verify live odds.",
  "Recompute implied probability from odds_american; do not trust imported implied_probability.",
  "Reject same-book pairs.",
  "Verify accepted stake or visible limit.",
  "Verify settlement source.",
  "Use standard arb calculator before paper lock.",
];
const NOT_ARB_NOTES = [
  "Cross-book opposite-side market was evaluated but combined implied probability is not under 100%.",
  "Do not classify as an arb candidate.",
  "Continue only as a watch or comparison row if there is another testable mechanism.",
];
const MIDDLE_NOTES = [
  "Classify as middle, not standard arb.",
  "Use middle calculator.",
  "Check push and middle corridor.",
  "Verify same event, player, market, period, and settlement source.",
  "Verify OT treatment and stat correction rules.",
];
const EXCHANGE_STALE_NOTES = [
  "Exchange-side liquidity may be stale; verify current visible depth manually.",
  "Do not assume display depth is executable size.",
  "Verify fees before any paper-lock classification.",
  "Verify freshness and timestamp recency.",
];
const SOFT_BOOK_LAG_NOTES = [
  "Soft-book lag is a watch signal only.",
  "Verify market label and settlement alignment.",
  "Re-check odds manually before any paper-lock action.",
];
const REJECT_NOTES = [
  "Reject this candidate until market alignment is fixed.",
  "Check event, market, player, period, side, book, and line compatibility.",
  "Do not paper-lock mismatched markets.",
];
const INSUFFICIENT_NOTES = [
  "Missing or stale data detected; manual verification required.",
  "Do not classify as candidate until timestamps and limits are confirmed.",
];
function eventGroupKey(market: NormalizedMarket): string {
  const sport = normalizeText(market.sport) || "unknown_sport";
  const league = normalizeText(market.league) || "unknown_league";
  const eventName = normalizeEventKey(market.event_name);
  if (eventName) return `${sport}|${league}|name:${eventName}`;
  const eventId = (market.event_id ?? "").trim().toLowerCase();
  if (eventId) return `${sport}|${league}|id:${eventId}`;
  return `${sport}|${league}|unknown_event`;
}
function parseTimestamp(value: string | undefined): number | null {
  if (!value || typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
type FreshnessResult =
  | { ok: true }
  | { ok: false; missing: boolean; reason: string };
function freshnessCheck(
  a: NormalizedMarket,
  b: NormalizedMarket,
  nowIso: string,
  maxFreshnessSeconds: number,
): FreshnessResult {
  const now = Date.parse(nowIso);
  const aTs = parseTimestamp(a.timestamp);
  const bTs = parseTimestamp(b.timestamp);
  if (aTs === null || bTs === null || !Number.isFinite(now)) {
    return {
      ok: false,
      missing: true,
      reason: "Missing or invalid timestamps prevent freshness validation.",
    };
  }
  const maxAgeMs = maxFreshnessSeconds * 1000;
  const aAge = now - aTs;
  const bAge = now - bTs;
  if (aAge > maxAgeMs || bAge > maxAgeMs) {
    return {
      ok: false,
      missing: false,
      reason: `Stale timestamps exceed freshness threshold (${maxFreshnessSeconds}s).`,
    };
  }
  return { ok: true };
}
function createSignal(args: {
  id: string;
  type: EdgeSignalType;
  severity: EdgeSignalSeverity;
  classification: EdgeSignalClassification;
  markets: NormalizedMarket[];
  reason: string;
  verificationNotes: string[];
  createdAt: string;
  arbCheck?: EdgeSignalArbCheck;
  rejectionReason?: string;
}): EdgeSignal {
  return args;
}
function oddsOrLineDiscrepancy(a: NormalizedMarket, b: NormalizedMarket): boolean {
  const lineDiff =
    a.line !== null &&
    a.line !== undefined &&
    b.line !== null &&
    b.line !== undefined &&
    a.line !== b.line;
  const oddsDiff =
    a.odds_american !== null &&
    a.odds_american !== undefined &&
    b.odds_american !== null &&
    b.odds_american !== undefined &&
    a.odds_american !== b.odds_american;
  return lineDiff || oddsDiff;
}
function isOverUnderPair(a: NormalizedMarket, b: NormalizedMarket): boolean {
  const sa = normalizeSide(a.side);
  const sb = normalizeSide(b.side);
  return (sa === "over" && sb === "under") || (sa === "under" && sb === "over");
}
function isBadOverUnderLineRelationship(a: NormalizedMarket, b: NormalizedMarket): boolean {
  if (!isOverUnderPair(a, b)) return false;
  if (a.line === null || a.line === undefined || b.line === null || b.line === undefined) return false;
  const over = normalizeSide(a.side) === "over" ? a : b;
  const under = normalizeSide(a.side) === "under" ? a : b;
  if (normalizeSide(over.side) !== "over" || normalizeSide(under.side) !== "under") return false;
  if (over.line === null || over.line === undefined || under.line === null || under.line === undefined) {
    return false;
  }
  return over.line >= under.line;
}
function hasAmericanOdds(a: NormalizedMarket, b: NormalizedMarket): a is NormalizedMarket & { odds_american: number } {
  return (
    typeof a.odds_american === "number" &&
    Number.isFinite(a.odds_american) &&
    a.odds_american !== 0 &&
    typeof b.odds_american === "number" &&
    Number.isFinite(b.odds_american) &&
    b.odds_american !== 0
  );
}
function arbCheck(a: NormalizedMarket, b: NormalizedMarket): EdgeSignalArbCheck | null {
  if (!hasAmericanOdds(a, b)) return null;
  const combinedImplied = impliedFromAmerican(a.odds_american) + impliedFromAmerican(b.odds_american as number);
  return { combinedImplied, trueArb: combinedImplied < 1, source: "odds_american" };
}

function samePlayerKey(a: NormalizedMarket, b: NormalizedMarket): boolean {
  return normalizeText(a.player) === normalizeText(b.player);
}
function sameLineValue(a: NormalizedMarket, b: NormalizedMarket): boolean {
  const aMissing = a.line === null || a.line === undefined;
  const bMissing = b.line === null || b.line === undefined;
  if (aMissing && bMissing) return true;
  if (aMissing || bMissing) return false;
  return a.line === b.line;
}
function hasBothLines(a: NormalizedMarket, b: NormalizedMarket): boolean {
  return a.line !== null && a.line !== undefined && b.line !== null && b.line !== undefined;
}
function shouldEmitRejectSignal(
  a: NormalizedMarket,
  b: NormalizedMarket,
  kind: string,
  looseKeyMatch: boolean,
): boolean {
  if (kind === "event_mismatch") return false;
  if (kind === "same_book" || kind === "same_side" || kind === "line_mismatch") return looseKeyMatch;
  const samePeriod = normalizePeriod(a.period) === normalizePeriod(b.period);
  const sameMarket = normalizeMarketType(a.market_type) === normalizeMarketType(b.market_type);
  const samePlayer = samePlayerKey(a, b);
  const lineRelevant = sameLineValue(a, b) || hasBothLines(a, b);
  const sidesOpposite = isOppositeSide(a, b);
  if (kind === "player_mismatch") return sameMarket && samePeriod && lineRelevant && sidesOpposite;
  if (kind === "period_mismatch") return sameMarket && samePlayer && lineRelevant && sidesOpposite;
  if (kind === "market_mismatch") return samePeriod && samePlayer && lineRelevant && sidesOpposite;
  return looseKeyMatch;
}

function rejectReasonForKind(kind: string): string {
  switch (kind) {
    case "same_book":
      return "Rejected because both sides come from the same book.";
    case "same_side":
      return "Rejected because both rows are the same side, not opposite sides.";
    case "line_mismatch":
      return "Rejected because lines do not match and do not form a valid middle.";
    case "event_mismatch":
      return "Rejected because events do not match.";
    case "market_mismatch":
      return "Rejected because market types do not match.";
    case "period_mismatch":
      return "Rejected because periods do not match.";
    case "player_mismatch":
      return "Rejected because players do not match.";
    default:
      return `Rejected candidate due to ${kind}.`;
  }
}
export function detectEdgeSignals(
  markets: NormalizedMarket[],
  options?: EdgeSignalEngineOptions,
): EdgeSignal[] {
  const createdAt = options?.createdAt ?? new Date().toISOString();
  const maxFreshnessSeconds = options?.maxFreshnessSeconds ?? 30;
  const requireLiquidityForExchangeSignals = options?.requireLiquidityForExchangeSignals ?? true;
  const signals: EdgeSignal[] = [];
  let counter = 0;
  const eventGroups = new Map<string, { market: NormalizedMarket; index: number }[]>();
  markets.forEach((market, index) => {
    const key = eventGroupKey(market);
    const current = eventGroups.get(key);
    if (current) {
      current.push({ market, index });
      return;
    }
    eventGroups.set(key, [{ market, index }]);
  });
  for (const group of eventGroups.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i].market;
        const b = group[j].market;
        const looseKeyMatch = marketComparisonKey(a) === marketComparisonKey(b);
        const relationship = assessMarketRelationship(a, b);
        const pairId = `${group[i].index}_${group[j].index}`;
        const bothOpen = a.status === "open" && b.status === "open";
        const rejectKinds = new Set([
          "event_mismatch",
          "market_mismatch",
          "period_mismatch",
          "player_mismatch",
          "same_side",
          "same_book",
          "line_mismatch",
        ]);
        const shouldRejectByRelationship =
          rejectKinds.has(relationship.kind) ||
          (relationship.kind === "unknown" && isBadOverUnderLineRelationship(a, b));
        if (shouldRejectByRelationship && shouldEmitRejectSignal(a, b, relationship.kind, looseKeyMatch)) {
          counter += 1;
          const rejectionReason = rejectReasonForKind(relationship.kind);
          signals.push(
            createSignal({
              id: `sig_${counter}_${pairId}`,
              type: "market_mismatch_reject",
              severity: "reject",
              classification: "reject",
              markets: [a, b],
              reason: rejectionReason,
              verificationNotes: REJECT_NOTES,
              createdAt,
              rejectionReason,
            }),
          );
          continue;
        }
        if (looseKeyMatch && relationship.kind === "same_line_opposite_side") {
          const pricing = arbCheck(a, b);
          if (pricing) {
            const freshness = freshnessCheck(a, b, createdAt, maxFreshnessSeconds);
            if (freshness.ok && bothOpen && pricing.trueArb) {
              counter += 1;
              signals.push(
                createSignal({
                  id: `sig_${counter}_${pairId}`,
                  type: "same_line_opposite_side",
                  severity: "candidate",
                  classification: "true_arb_candidate",
                  markets: [a, b],
                  reason: "Same-line opposite-side arb candidate detected with combined implied probability under 100%.",
                  verificationNotes: SAME_LINE_NOTES,
                  createdAt,
                  arbCheck: pricing,
                }),
              );
            } else if (freshness.ok && bothOpen) {
              counter += 1;
              signals.push(
                createSignal({
                  id: `sig_${counter}_${pairId}`,
                  type: "same_line_opposite_side",
                  severity: "info",
                  classification: "not_arb",
                  markets: [a, b],
                  reason: "Same-line opposite-side pair evaluated; combined implied probability is not under 100%.",
                  verificationNotes: NOT_ARB_NOTES,
                  createdAt,
                  arbCheck: pricing,
                }),
              );
            } else {
              counter += 1;
              let reason = "Market status is not open on both sides; cannot classify as candidate.";
              if ("reason" in freshness) reason = freshness.reason;
              signals.push(
                createSignal({
                  id: `sig_${counter}_${pairId}`,
                  type: "insufficient_data_watch",
                  severity: "watch",
                  classification: "watch",
                  markets: [a, b],
                  reason,
                  verificationNotes: INSUFFICIENT_NOTES,
                  createdAt,
                }),
              );
            }
          }
        }
        if (
          looseKeyMatch &&
          bothOpen &&
          hasMiddleLineRelationship(a, b) &&
          typeof a.odds_american === "number" &&
          typeof b.odds_american === "number"
        ) {
          counter += 1;
          signals.push(
            createSignal({
              id: `sig_${counter}_${pairId}`,
              type: "line_split_middle",
              severity: "candidate",
              classification: "middle_candidate",
              markets: [a, b],
              reason: "Line-split middle candidate detected from opposite sides; not a guaranteed same-line arb.",
              verificationNotes: MIDDLE_NOTES,
              createdAt,
            }),
          );
        }
        if (looseKeyMatch) {
          const aExchange = EXCHANGE_SOURCES.has(a.source);
          const bExchange = EXCHANGE_SOURCES.has(b.source);
          const aSoft = SOFT_BOOK_SOURCES.has(a.source);
          const bSoft = SOFT_BOOK_SOURCES.has(b.source);
          const hasExchangeSoftPair = (aExchange && bSoft) || (bExchange && aSoft);
          if (hasExchangeSoftPair) {
            const exchangeMarket = aExchange ? a : b;
            const liquidity = exchangeMarket.liquidity ?? 0;
            const hasLiquidity = liquidity > 0;
            const comparableOrOpposite = relationship.comparable || isOppositeSide(a, b);
            if (comparableOrOpposite && (!requireLiquidityForExchangeSignals || hasLiquidity)) {
              counter += 1;
              signals.push(
                createSignal({
                  id: `sig_${counter}_${pairId}`,
                  type: "exchange_stale_liquidity_watch",
                  severity: "watch",
                  classification: "watch",
                  markets: [a, b],
                  reason: "Exchange/source vs soft-book comparison with visible exchange-side liquidity.",
                  verificationNotes: EXCHANGE_STALE_NOTES,
                  createdAt,
                }),
              );
            } else if (comparableOrOpposite && requireLiquidityForExchangeSignals && !hasLiquidity) {
              counter += 1;
              signals.push(
                createSignal({
                  id: `sig_${counter}_${pairId}`,
                  type: "insufficient_data_watch",
                  severity: "watch",
                  classification: "watch",
                  markets: [a, b],
                  reason: "Exchange-style side has no visible liquidity; cannot classify as an executable candidate.",
                  verificationNotes: INSUFFICIENT_NOTES,
                  createdAt,
                }),
              );
            }
            if (oddsOrLineDiscrepancy(a, b)) {
              counter += 1;
              signals.push(
                createSignal({
                  id: `sig_${counter}_${pairId}`,
                  type: "soft_book_lag_watch",
                  severity: "watch",
                  classification: "watch",
                  markets: [a, b],
                  reason: "Soft-book lag watch triggered by line/odds discrepancy versus exchange reference.",
                  verificationNotes: SOFT_BOOK_LAG_NOTES,
                  createdAt,
                }),
              );
            }
          }
        }
      }
    }
  }
  return signals;
}

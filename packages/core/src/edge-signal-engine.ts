import type { NormalizedMarket } from "./market-normalization";
import {
  assessMarketRelationship,
  hasMiddleLineRelationship,
  hasSameLineRelationship,
  isOppositeSide,
  marketComparisonKey,
  normalizeSide,
} from "./market-normalization";

export type EdgeSignalType =
  | "same_line_opposite_side"
  | "line_split_middle"
  | "exchange_stale_liquidity_watch"
  | "soft_book_lag_watch"
  | "market_mismatch_reject"
  | "insufficient_data_watch";

export type EdgeSignalSeverity = "info" | "watch" | "candidate" | "reject";

export type EdgeSignal = {
  id: string;
  type: EdgeSignalType;
  severity: EdgeSignalSeverity;
  markets: NormalizedMarket[];
  reason: string;
  verificationNotes: string[];
  createdAt: string;
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
  "Verify live odds.",
  "Verify accepted stake or visible limit.",
  "Verify settlement source.",
  "Use standard arb calculator before paper lock.",
];

const MIDDLE_NOTES = [
  "Classify as middle, not standard arb.",
  "Use middle calculator.",
  "Check push and middle corridor.",
  "Verify settlement source and OT treatment.",
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
  "Check event, market, player, period, and side compatibility.",
  "Do not paper-lock mismatched markets.",
];

const INSUFFICIENT_NOTES = [
  "Missing or stale data detected; manual verification required.",
  "Do not classify as candidate until timestamps and limits are confirmed.",
];

function eventGroupKey(market: NormalizedMarket): string {
  const eventId = (market.event_id ?? "").trim().toLowerCase();
  if (eventId) return `id:${eventId}`;
  const eventName = (market.event_name ?? "").trim().toLowerCase();
  return `name:${eventName}`;
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

function createSignal(
  id: string,
  type: EdgeSignalType,
  severity: EdgeSignalSeverity,
  markets: NormalizedMarket[],
  reason: string,
  verificationNotes: string[],
  createdAt: string,
): EdgeSignal {
  return { id, type, severity, markets, reason, verificationNotes, createdAt };
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

        if (looseKeyMatch && hasSameLineRelationship(a, b)) {
          if (a.odds_american !== null && a.odds_american !== undefined && b.odds_american !== null && b.odds_american !== undefined) {
            const freshness = freshnessCheck(a, b, createdAt, maxFreshnessSeconds);
            if (freshness.ok && bothOpen) {
              counter += 1;
              signals.push(
                createSignal(
                  `sig_${counter}_${pairId}`,
                  "same_line_opposite_side",
                  "candidate",
                  [a, b],
                  "Same-line opposite-side comparison candidate detected.",
                  SAME_LINE_NOTES,
                  createdAt,
                ),
              );
            } else {
              counter += 1;
              signals.push(
                createSignal(
                  `sig_${counter}_${pairId}`,
                  "insufficient_data_watch",
                  "watch",
                  [a, b],
                  freshness.ok
                    ? "Market status is not open on both sides; cannot classify as candidate."
                    : freshness.reason,
                  INSUFFICIENT_NOTES,
                  createdAt,
                ),
              );
            }
          }
        }

        if (
          looseKeyMatch &&
          bothOpen &&
          hasMiddleLineRelationship(a, b) &&
          a.odds_american !== null &&
          a.odds_american !== undefined &&
          b.odds_american !== null &&
          b.odds_american !== undefined
        ) {
          counter += 1;
          signals.push(
            createSignal(
              `sig_${counter}_${pairId}`,
              "line_split_middle",
              "candidate",
              [a, b],
              "Line-split middle candidate detected from opposite sides.",
              MIDDLE_NOTES,
              createdAt,
            ),
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
                createSignal(
                  `sig_${counter}_${pairId}`,
                  "exchange_stale_liquidity_watch",
                  "watch",
                  [a, b],
                  "Exchange/source vs soft-book comparison with visible exchange-side liquidity.",
                  EXCHANGE_STALE_NOTES,
                  createdAt,
                ),
              );
            }

            if (oddsOrLineDiscrepancy(a, b)) {
              counter += 1;
              signals.push(
                createSignal(
                  `sig_${counter}_${pairId}`,
                  "soft_book_lag_watch",
                  "watch",
                  [a, b],
                  "Soft-book lag watch triggered by line/odds discrepancy versus exchange reference.",
                  SOFT_BOOK_LAG_NOTES,
                  createdAt,
                ),
              );
            }
          }
        }

        const rejectKinds = new Set([
          "market_mismatch",
          "period_mismatch",
          "player_mismatch",
          "same_side",
        ]);
        const shouldRejectByRelationship =
          rejectKinds.has(relationship.kind) ||
          (relationship.kind === "unknown" && isBadOverUnderLineRelationship(a, b));

        if (shouldRejectByRelationship) {
          counter += 1;
          signals.push(
            createSignal(
              `sig_${counter}_${pairId}`,
              "market_mismatch_reject",
              "reject",
              [a, b],
              `Rejected candidate due to ${relationship.kind}.`,
              REJECT_NOTES,
              createdAt,
            ),
          );
        }
      }
    }
  }

  return signals;
}

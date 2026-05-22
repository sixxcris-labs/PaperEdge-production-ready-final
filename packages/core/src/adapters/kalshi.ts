import type { NormalizedMarket, NormalizedMarketStatus } from "../market-normalization";
import {
  normalizePeriod,
  normalizeSide,
  normalizeText,
  probabilityToAmerican,
} from "../market-normalization";

export type KalshiRawMarket = unknown;
export type KalshiRawTrade = unknown;

export type KalshiNormalizeOptions = {
  sport?: string;
  league?: string;
  eventName?: string;
  eventId?: string;
  marketType?: string;
  period?: string;
  live?: boolean;
  receivedAt?: string;
};

type UnknownRecord = Record<string, unknown>;

type KalshiMarketRow = {
  event: UnknownRecord;
  market: UnknownRecord;
  side: "yes" | "no";
  probability: number | null;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecordArray(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseProbability(value: unknown): number | null {
  const numeric = parseNumber(value);
  if (numeric === null) return null;

  const scaled = numeric >= 1 && numeric <= 100 ? numeric / 100 : numeric;
  if (scaled > 0 && scaled < 1) return scaled;
  return null;
}

function mapStatus(value: unknown): NormalizedMarketStatus {
  const normalized = normalizeText(value);
  if (!normalized) return "unknown";
  if (["open", "active", "live", "trading"].includes(normalized)) return "open";
  if (["suspended", "paused", "halted", "inactive"].includes(normalized)) return "suspended";
  if (["closed", "settled", "resolved", "final"].includes(normalized)) return "closed";
  if (["upcoming", "pending", "scheduled", "pre"].includes(normalized)) return "upcoming";
  return "unknown";
}

function deriveMarketType(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return "binary";
  if (text.includes("winner") || text.includes("moneyline")) return "moneyline";
  if (text.includes("spread") || text.includes("handicap")) return "spread";
  if (text.includes("total")) return "total";
  return text.replace(/\s+/g, "_");
}

function collectMarketRows(raw: KalshiRawMarket | KalshiRawMarket[]): KalshiMarketRow[] {
  const containers = Array.isArray(raw) ? raw : [raw];
  const rows: KalshiMarketRow[] = [];

  for (const containerCandidate of containers) {
    if (!isRecord(containerCandidate)) continue;
    const container = containerCandidate;

    const rootEvent = isRecord(container.event) ? container.event : container;
    const markets = asRecordArray(container.markets);
    const marketRows = markets.length > 0 ? markets : isRecord(container.market) ? [container.market] : [];

    for (const market of marketRows) {
      const yesProb = parseProbability(market.yes_price ?? market.yesPrice);
      const noProb = parseProbability(market.no_price ?? market.noPrice);
      rows.push({ event: rootEvent, market, side: "yes", probability: yesProb });
      rows.push({ event: rootEvent, market, side: "no", probability: noProb });
    }
  }

  return rows;
}

export function normalizeKalshiMarkets(
  raw: KalshiRawMarket | KalshiRawMarket[],
  options?: KalshiNormalizeOptions,
): NormalizedMarket[] {
  const rows = collectMarketRows(raw);

  return rows.map(({ event, market, side, probability }) => {
    const sourceMarketId = firstString(market.market_id, market.id, market.ticker);
    const sourceEventId = firstString(options?.eventId, event.id, event.event_id, market.event_id);
    const eventId = sourceEventId ?? sourceMarketId ?? "unknown";
    const timestamp =
      firstString(options?.receivedAt, market.updated_at, market.updatedAt, market.created_at, market.createdAt) ??
      new Date().toISOString();
    const sport = firstString(options?.sport, event.sport, market.sport) ?? "unknown";
    const league = firstString(options?.league, event.league, market.league) ?? "unknown";

    return {
      source: "kalshi",
      sourceEventId,
      sourceMarketId,
      sourceOutcomeId: sourceMarketId ? `${sourceMarketId}:${side}` : null,
      event_id: eventId,
      event_name:
        firstString(options?.eventName, event.title, event.name, market.title, market.name, market.ticker, eventId) ??
        eventId,
      sport,
      league,
      market_type: deriveMarketType(options?.marketType ?? market.title ?? market.name ?? market.market_type),
      player: null,
      side,
      line: parseNumber(market.line),
      odds_american: probability === null ? null : probabilityToAmerican(probability),
      implied_probability: probability,
      liquidity:
        parseNumber(market.liquidity) ??
        parseNumber(market.open_interest) ??
        parseNumber(market.openInterest) ??
        null,
      timestamp,
      status: mapStatus(market.status ?? event.status),
      live: typeof options?.live === "boolean" ? options.live : Boolean(market.live ?? event.live ?? false),
      period: normalizePeriod(options?.period ?? market.period, "full_game"),
      raw: {
        eventId: sourceEventId,
        marketId: sourceMarketId,
        side,
      },
    };
  });
}

function collectTrades(raw: KalshiRawTrade | KalshiRawTrade[]): UnknownRecord[] {
  const containers = Array.isArray(raw) ? raw : [raw];
  const trades: UnknownRecord[] = [];

  for (const containerCandidate of containers) {
    if (!isRecord(containerCandidate)) continue;
    const container = containerCandidate;

    const fromTrades = asRecordArray(container.trades);
    if (fromTrades.length > 0) {
      trades.push(...fromTrades);
      continue;
    }

    trades.push(container);
  }

  return trades;
}

export function normalizeKalshiTradeTape(
  raw: KalshiRawTrade | KalshiRawTrade[],
  options?: KalshiNormalizeOptions,
): NormalizedMarket[] {
  const trades = collectTrades(raw);

  return trades.map((trade) => {
    const sourceMarketId = firstString(trade.market_id, trade.marketId, trade.ticker);
    const ticker = firstString(trade.ticker);
    const eventId = firstString(options?.eventId, sourceMarketId, ticker) ?? "unknown";

    const probability = parseProbability(trade.price_dollars) ?? parseProbability(trade.price);
    const odds = probability === null ? null : probabilityToAmerican(probability);

    // Trade tape count is executed size, not resting executable liquidity.
    const liquidity = parseNumber(trade.count) ?? parseNumber(trade.count_fp);

    return {
      source: "kalshi",
      sourceEventId: firstString(options?.eventId),
      sourceMarketId,
      sourceOutcomeId: firstString(trade.trade_id, trade.id),
      event_id: eventId,
      event_name: firstString(options?.eventName, ticker, sourceMarketId, eventId) ?? eventId,
      sport: firstString(options?.sport) ?? "unknown",
      league: firstString(options?.league) ?? "unknown",
      market_type: deriveMarketType(options?.marketType),
      player: null,
      side:
        normalizeSide(firstString(trade.taker_side, trade.taker_action, trade.side) ?? "unknown") ||
        firstString(trade.taker_side, trade.taker_action, trade.side) ||
        "unknown",
      line: null,
      odds_american: odds,
      implied_probability: probability,
      liquidity,
      timestamp: firstString(trade.create_date, trade.created_at, options?.receivedAt) ?? new Date().toISOString(),
      status: "unknown",
      live: typeof options?.live === "boolean" ? options.live : false,
      period: normalizePeriod(options?.period, "full_game"),
      raw: {
        tradeId: firstString(trade.trade_id, trade.id),
        marketId: sourceMarketId,
        ticker,
      },
    };
  });
}

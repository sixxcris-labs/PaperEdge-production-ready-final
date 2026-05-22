import type { NormalizedMarket } from "../market-normalization";
import {
  americanToImpliedProbability,
  decimalToAmerican,
  normalizePeriod,
  normalizeSide,
  normalizeText,
} from "../market-normalization";

export type ProphetXRawMarket = unknown;

export type ProphetXNormalizeOptions = {
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

type ProphetXEntry = {
  root: UnknownRecord;
  market: UnknownRecord;
  selections: UnknownRecord[];
};

const MARKET_TYPE_MAP: Record<string, string> = {
  moneyline: "moneyline",
  spread: "spread",
  total: "total",
  "player points": "player_points",
  "player rebounds": "player_rebounds",
  "player assists": "player_assists",
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecordArray(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function firstNonEmptyText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
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

function parseAmericanLike(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= -100 || value >= 100) return Math.round(value);
    if (value > 1) return decimalToAmerican(value);
    return null;
  }

  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, "");
  if (!cleaned) return null;

  if (/^[+-]\d+$/.test(cleaned)) return Number.parseInt(cleaned, 10);
  if (/^\d+$/.test(cleaned)) return Number.parseInt(cleaned, 10);

  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const decimal = Number.parseFloat(cleaned);
    if (decimal > 1) return decimalToAmerican(decimal);
  }

  return null;
}

function normalizeMarketType(rawName: unknown): string {
  const text = normalizeText(rawName);
  if (!text) return "unknown";
  return MARKET_TYPE_MAP[text] ?? text.replace(/\s+/g, "_");
}

function deriveEntries(raw: ProphetXRawMarket | ProphetXRawMarket[]): ProphetXEntry[] {
  const roots = Array.isArray(raw) ? raw : [raw];
  const entries: ProphetXEntry[] = [];

  for (const rootCandidate of roots) {
    if (!isRecord(rootCandidate)) continue;
    const root = rootCandidate;

    const nestedMarket = isRecord(root.market) ? root.market : null;
    const listMarkets = asRecordArray(root.markets);

    if (nestedMarket) {
      const selections =
        asRecordArray(nestedMarket.selections).length > 0
          ? asRecordArray(nestedMarket.selections)
          : asRecordArray(root.selections);
      entries.push({ root, market: nestedMarket, selections });
      continue;
    }

    if (listMarkets.length > 0) {
      for (const market of listMarkets) {
        const selections =
          asRecordArray(market.selections).length > 0
            ? asRecordArray(market.selections)
            : asRecordArray(root.selections);
        entries.push({ root, market, selections });
      }
      continue;
    }

    if (asRecordArray(root.selections).length > 0) {
      entries.push({
        root,
        market: root,
        selections: asRecordArray(root.selections),
      });
    }
  }

  return entries;
}

function resolveSide(selection: UnknownRecord): string {
  const raw = firstNonEmptyText(
    selection.side,
    selection.outcomeSide,
    selection.name,
    selection.team,
    selection.competitor,
    selection.player,
  );
  if (!raw) return "unknown";
  return normalizeSide(raw) || normalizeText(raw) || "unknown";
}

export function normalizeProphetXMarkets(
  raw: ProphetXRawMarket | ProphetXRawMarket[],
  options?: ProphetXNormalizeOptions,
): NormalizedMarket[] {
  const entries = deriveEntries(raw);
  const normalized: NormalizedMarket[] = [];

  for (const entry of entries) {
    const { root, market, selections } = entry;
    const eventId =
      firstNonEmptyText(options?.eventId, root.eventId, market.eventId, market.id) ?? "unknown";
    const eventName = firstNonEmptyText(
      options?.eventName,
      root.eventName,
      root.name,
      market.eventName,
      market.name,
      eventId,
    )!;
    const marketType = normalizeMarketType(
      options?.marketType ?? market.displayName ?? market.name ?? market.type,
    );
    const liveRaw =
      typeof options?.live === "boolean"
        ? options.live
        : Boolean(root.live ?? market.live ?? false);
    const period = normalizePeriod(options?.period ?? market.period, "full_game");

    for (const selection of selections) {
      const oddsAmerican = parseAmericanLike(selection.displayOdds ?? selection.odds);
      const impliedProbability =
        oddsAmerican === null ? null : americanToImpliedProbability(oddsAmerican);
      const liquidity = parseNumber(selection.stake);
      const line = parseNumber(selection.line ?? selection.value);

      const playerRaw = firstNonEmptyText(selection.player, selection.competitor);
      const player = playerRaw ? normalizeText(playerRaw) : null;

      normalized.push({
        source: "prophetx",
        sourceMarketId: firstNonEmptyText(market.id, market.marketId),
        sourceOutcomeId: firstNonEmptyText(selection.id, selection.lineID),
        sourceEventId: firstNonEmptyText(root.eventId, market.eventId),
        event_id: normalizeText(eventId) || eventId,
        event_name: normalizeText(eventName) || eventName,
        sport: normalizeText(options?.sport ?? root.sport ?? market.sport) || "unknown",
        league: normalizeText(options?.league ?? root.league ?? market.league) || "unknown",
        market_type: marketType,
        player,
        side: resolveSide(selection),
        line,
        odds_american: oddsAmerican,
        implied_probability: impliedProbability,
        liquidity,
        timestamp:
          firstNonEmptyText(selection.updatedAt, options?.receivedAt) ?? new Date().toISOString(),
        status: liquidity !== null && oddsAmerican !== null ? "open" : "unknown",
        live: liveRaw,
        period,
        raw: {
          marketId: firstNonEmptyText(market.id, market.marketId),
          selection,
        },
      });
    }
  }

  return normalized;
}

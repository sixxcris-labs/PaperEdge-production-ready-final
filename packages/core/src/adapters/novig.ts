import type { NormalizedMarket, NormalizedMarketStatus } from "../market-normalization";
import {
  normalizePeriod,
  normalizeSide,
  normalizeText,
  probabilityToAmerican,
} from "../market-normalization";

export type NovigBatchBookResponse = unknown;

export type NovigNormalizeOptions = {
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

type NovigEntry = {
  market: UnknownRecord;
  outcomes: UnknownRecord[];
  ladders: UnknownRecord[];
  root: UnknownRecord;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toRecordArray(value: unknown): UnknownRecord[] {
  return asArray(value).filter(isRecord);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = normalizeText(value);
    if (normalized === "true" || normalized === "yes" || normalized === "1" || normalized === "live") {
      return true;
    }
    if (normalized === "false" || normalized === "no" || normalized === "0") {
      return false;
    }
  }
  return null;
}

function normalizeStatus(value: unknown): NormalizedMarketStatus {
  const normalized = normalizeText(value);
  if (!normalized) return "unknown";
  if (["open", "active", "live", "trading", "fillable"].includes(normalized)) return "open";
  if (["suspended", "paused", "halted", "inactive"].includes(normalized)) return "suspended";
  if (["closed", "settled", "complete", "completed"].includes(normalized)) return "closed";
  if (["upcoming", "pending", "scheduled", "pre"].includes(normalized)) return "upcoming";
  return "unknown";
}

function buildEntry(marketCandidate: unknown, root: UnknownRecord): NovigEntry | null {
  if (!isRecord(marketCandidate)) return null;
  const market = marketCandidate;
  const marketOutcomes = toRecordArray(market.outcomes);
  const rootOutcomes = toRecordArray(root.outcomes);
  const outcomes = marketOutcomes.length > 0 ? marketOutcomes : rootOutcomes;

  const directLadders = toRecordArray(root.ladders).concat(toRecordArray(market.ladders));
  const outcomeLadders = outcomes.flatMap((outcome) => toRecordArray(outcome.ladders));
  const bids = outcomes.flatMap((outcome) => toRecordArray(outcome.bids));
  const asks = outcomes.flatMap((outcome) => toRecordArray(outcome.asks));
  const ladders = directLadders.length > 0 ? directLadders : [...outcomeLadders, ...bids, ...asks];

  return { market, outcomes, ladders, root };
}

function extractEntries(raw: NovigBatchBookResponse): NovigEntry[] {
  const containers = Array.isArray(raw) ? raw : [raw];
  const entries: NovigEntry[] = [];

  for (const container of containers) {
    if (!isRecord(container)) continue;

    const fromMarkets = toRecordArray(container.markets);
    if (fromMarkets.length > 0) {
      for (const market of fromMarkets) {
        const entry = buildEntry(market, container);
        if (entry) entries.push(entry);
      }
      continue;
    }

    if (isRecord(container.market)) {
      const entry = buildEntry(container.market, container);
      if (entry) entries.push(entry);
      continue;
    }

    const entry = buildEntry(container, container);
    if (entry) entries.push(entry);
  }

  return entries;
}

function resolveOutcome(entry: NovigEntry, ladder: UnknownRecord): UnknownRecord {
  const ladderOutcomeId = firstString(ladder.outcomeId);
  if (!ladderOutcomeId) return entry.outcomes[0] ?? {};
  const match = entry.outcomes.find((outcome) => firstString(outcome.id, outcome.outcomeId) === ladderOutcomeId);
  return match ?? entry.outcomes[0] ?? {};
}

function deriveSide(outcome: UnknownRecord, ladder: UnknownRecord): string {
  const side = firstString(
    outcome.side,
    outcome.name,
    outcome.label,
    outcome.title,
    outcome.selection,
    ladder.side,
  );
  if (side) return normalizeSide(side) || side;
  return "unknown";
}

function deriveLine(market: UnknownRecord, outcome: UnknownRecord, ladder: UnknownRecord): number | null {
  return (
    toNumber(outcome.line) ??
    toNumber(outcome.selectionLine) ??
    toNumber(market.line) ??
    toNumber(market.selectionLine) ??
    toNumber(ladder.line)
  );
}

function resolveMarketType(market: UnknownRecord, root: UnknownRecord, options?: NovigNormalizeOptions): string {
  const fromOption = firstString(options?.marketType);
  if (fromOption) return fromOption;
  return firstString(market.displayName, market.type, market.name, root.marketType, root.market) ?? "unknown";
}

function resolveSport(market: UnknownRecord, root: UnknownRecord, options?: NovigNormalizeOptions): string {
  return firstString(options?.sport, market.sport, root.sport) ?? "unknown";
}

function resolveLeague(market: UnknownRecord, root: UnknownRecord, options?: NovigNormalizeOptions): string {
  return firstString(options?.league, market.league, root.league) ?? "unknown";
}

function resolveEventId(market: UnknownRecord, options?: NovigNormalizeOptions): string {
  return firstString(options?.eventId, market.eventId, market.id, market.marketId) ?? "unknown";
}

function resolveEventName(market: UnknownRecord, eventId: string, options?: NovigNormalizeOptions): string {
  return firstString(options?.eventName, market.eventName, market.name) ?? eventId;
}

function resolveLive(market: UnknownRecord, root: UnknownRecord, options?: NovigNormalizeOptions): boolean {
  if (typeof options?.live === "boolean") return options.live;
  return toBoolean(market.live) ?? toBoolean(root.live) ?? false;
}

function resolvePeriod(market: UnknownRecord, outcome: UnknownRecord, options?: NovigNormalizeOptions): string {
  return normalizePeriod(options?.period ?? outcome.period ?? market.period, "full_game");
}

function resolveTimestamp(ladder: UnknownRecord, options?: NovigNormalizeOptions): string {
  const fromLadder = firstString(ladder.timestamp, ladder.updatedAt, ladder.createdAt);
  if (fromLadder) return fromLadder;
  const fromOptions = firstString(options?.receivedAt);
  if (fromOptions) return fromOptions;
  return new Date().toISOString();
}

function resolveStatus(ladder: UnknownRecord, outcome: UnknownRecord, market: UnknownRecord): NormalizedMarketStatus {
  return normalizeStatus(ladder.status ?? outcome.status ?? market.status);
}

export function normalizeNovigMarkets(
  raw: NovigBatchBookResponse,
  options?: NovigNormalizeOptions,
): NormalizedMarket[] {
  const entries = extractEntries(raw);
  const normalized: NormalizedMarket[] = [];

  for (const entry of entries) {
    const { market, root, ladders } = entry;
    const rows = ladders.length > 0 ? ladders : [{}];

    for (const ladder of rows) {
      const parsedLadder = isRecord(ladder) ? ladder : {};
      const outcome = resolveOutcome(entry, parsedLadder);
      const eventId = resolveEventId(market, options);
      const eventName = resolveEventName(market, eventId, options);
      const sourceMarketId = firstString(parsedLadder.marketId, market.id, market.marketId);
      const sourceOutcomeId = firstString(parsedLadder.outcomeId, outcome.id, outcome.outcomeId);
      const sourceEventId = firstString(options?.eventId, market.eventId);
      const line = deriveLine(market, outcome, parsedLadder);
      const side = deriveSide(outcome, parsedLadder);
      const probability = toNumber(parsedLadder.price);
      const impliedProbability =
        probability !== null && probability > 0 && probability < 1 ? probability : null;
      const oddsAmerican =
        impliedProbability !== null ? probabilityToAmerican(impliedProbability) : null;
      const liquidity = toNumber(parsedLadder.qty);

      let status = resolveStatus(parsedLadder, outcome, market);
      if ((liquidity === null || liquidity <= 0) && status === "open") {
        status = "unknown";
      }

      normalized.push({
        source: "novig",
        sourceMarketId,
        sourceOutcomeId,
        sourceEventId,
        event_id: eventId,
        event_name: eventName,
        sport: resolveSport(market, root, options),
        league: resolveLeague(market, root, options),
        market_type: resolveMarketType(market, root, options),
        player: firstString(outcome.player, market.player, outcome.participant, market.participant),
        side,
        line,
        odds_american: oddsAmerican,
        implied_probability: impliedProbability,
        liquidity,
        timestamp: resolveTimestamp(parsedLadder, options),
        status,
        live: resolveLive(market, root, options),
        period: resolvePeriod(market, outcome, options),
        raw: {
          marketId: firstString(market.id, market.marketId),
          outcome,
          ladder: parsedLadder,
        },
      });
    }
  }

  return normalized;
}

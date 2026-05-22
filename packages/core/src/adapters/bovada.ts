import type { NormalizedMarket, NormalizedMarketStatus } from "../market-normalization";
import {
  americanToImpliedProbability,
  decimalToAmerican,
  normalizePeriod,
  normalizeSide,
  normalizeText,
} from "../market-normalization";

export type BovadaRawEvent = unknown;

export type BovadaNormalizeOptions = {
  sport?: string;
  league?: string;
  receivedAt?: string;
};

type UnknownRecord = Record<string, unknown>;

type BovadaEntry = {
  event: UnknownRecord;
  market: UnknownRecord;
  outcome: UnknownRecord;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecordArray(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
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

function parseAmerican(price: UnknownRecord): number | null {
  const american = parseNumber(price.american);
  if (american !== null) return Math.trunc(american);

  const decimal = parseNumber(price.decimal);
  if (decimal !== null) return decimalToAmerican(decimal);
  return null;
}

function mapStatus(value: unknown): NormalizedMarketStatus {
  const normalized = normalizeText(value);
  if (normalized === "o" || normalized === "open") return "open";
  if (normalized === "s" || normalized === "suspended") return "suspended";
  if (normalized === "u" || normalized === "upcoming") return "upcoming";
  if (normalized === "closed" || normalized === "c") return "closed";
  return "unknown";
}

function deriveEventName(event: UnknownRecord): string {
  const direct = firstText(event.description, event.name);
  if (direct) return normalizeText(direct) || direct;

  const competitors = asRecordArray(event.competitors)
    .map((competitor) => firstText(competitor.name, competitor.description))
    .filter((v): v is string => Boolean(v));
  if (competitors.length > 0) return normalizeText(competitors.join(" vs ")) || competitors.join(" vs ");
  return "unknown event";
}

function collectMarkets(event: UnknownRecord): UnknownRecord[] {
  const direct = asRecordArray(event.markets);
  if (direct.length > 0) return direct;

  const displayGroups = asRecordArray(event.displayGroups);
  const nested = displayGroups.flatMap((group) => asRecordArray(group.markets));
  if (nested.length > 0) return nested;

  if (isRecord(event.market)) return [event.market];
  return [];
}

function collectOutcomes(market: UnknownRecord): UnknownRecord[] {
  const direct = asRecordArray(market.outcomes);
  if (direct.length > 0) return direct;

  const displayGroups = asRecordArray(market.displayGroups);
  const nested = displayGroups.flatMap((group) => asRecordArray(group.outcomes));
  return nested;
}

function deriveEntries(raw: BovadaRawEvent | BovadaRawEvent[]): BovadaEntry[] {
  const roots = Array.isArray(raw) ? raw : [raw];
  const entries: BovadaEntry[] = [];

  for (const root of roots) {
    if (!isRecord(root)) continue;

    const events = asRecordArray(root.events);
    const eventList = events.length > 0 ? events : [root];
    for (const event of eventList) {
      const markets = collectMarkets(event);
      for (const market of markets) {
        const outcomes = collectOutcomes(market);
        for (const outcome of outcomes) {
          entries.push({ event, market, outcome });
        }
      }
    }
  }

  return entries;
}

export function normalizeBovadaMarkets(
  raw: BovadaRawEvent | BovadaRawEvent[],
  options?: BovadaNormalizeOptions,
): NormalizedMarket[] {
  const entries = deriveEntries(raw);
  const now = new Date().toISOString();

  return entries.map(({ event, market, outcome }) => {
    const price = isRecord(outcome.price) ? outcome.price : {};
    const americanOdds = parseAmerican(price);
    const implied = americanOdds === null ? null : americanToImpliedProbability(americanOdds);
    const line = parseNumber(price.handicap) ?? parseNumber(price.handicap2);
    const marketType =
      normalizeText(firstText(market.description, market.key, market.type)) || "unknown";

    return {
      source: "bovada",
      sourceEventId: firstText(event.id),
      sourceMarketId: firstText(market.id),
      sourceOutcomeId: firstText(outcome.id),
      event_id: firstText(event.id) ?? "unknown",
      event_name: deriveEventName(event),
      sport: normalizeText(options?.sport ?? event.sport ?? market.sport) || "unknown",
      league: normalizeText(options?.league ?? event.league ?? market.league) || "unknown",
      market_type: marketType,
      player: null,
      side:
        normalizeSide(firstText(outcome.description, outcome.type)) ||
        normalizeText(firstText(outcome.description, outcome.type)) ||
        "unknown",
      line,
      odds_american: americanOdds,
      implied_probability: implied,
      liquidity: null,
      timestamp: options?.receivedAt ?? now,
      status: mapStatus(outcome.status ?? market.status ?? event.status),
      live: Boolean(event.live),
      period: normalizePeriod(market.period, "full_game"),
      raw: {
        eventId: firstText(event.id),
        marketId: firstText(market.id),
        outcome,
      },
    };
  });
}

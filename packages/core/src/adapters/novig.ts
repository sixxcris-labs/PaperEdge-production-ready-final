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

function isLikelyLadderRow(value: UnknownRecord): boolean {
  return (
    toNumber(value.price) !== null ||
    toNumber(value.qty) !== null ||
    firstString(value.outcomeId, value.marketId, value.id) !== null
  );
}

function ladderDedupKey(value: UnknownRecord): string {
  return firstString(value.id)
    ?? [
      firstString(value.outcomeId) ?? "",
      firstString(value.marketId) ?? "",
      String(toNumber(value.price) ?? ""),
      String(toNumber(value.qty) ?? ""),
      firstString(value.timestamp, value.updatedAt, value.createdAt) ?? "",
      String(toBoolean(value.isBid) ?? ""),
    ].join("|");
}

function dedupeLadderRows(rows: UnknownRecord[]): UnknownRecord[] {
  const seen = new Set<string>();
  const unique: UnknownRecord[] = [];

  for (const row of rows) {
    const key = ladderDedupKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }

  return unique;
}

function extractLadderRows(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) {
    return dedupeLadderRows(value.filter(isRecord));
  }

  if (!isRecord(value)) return [];

  const rows: UnknownRecord[] = [];
  if (isLikelyLadderRow(value)) rows.push(value);

  rows.push(...toRecordArray(value.bids));
  rows.push(...toRecordArray(value.asks));
  rows.push(...toRecordArray(value.ladders));

  for (const nested of Object.values(value)) {
    if (Array.isArray(nested)) {
      rows.push(...toRecordArray(nested));
      continue;
    }
    if (!isRecord(nested)) continue;
    if (isLikelyLadderRow(nested)) rows.push(nested);
    rows.push(...toRecordArray(nested.bids));
    rows.push(...toRecordArray(nested.asks));
  }

  return dedupeLadderRows(rows);
}

function buildEntry(marketCandidate: unknown, root: UnknownRecord): NovigEntry | null {
  if (!isRecord(marketCandidate)) return null;
  const market = marketCandidate;
  const marketOutcomes = toRecordArray(market.outcomes);
  const rootOutcomes = toRecordArray(root.outcomes);
  const outcomes = marketOutcomes.length > 0 ? marketOutcomes : rootOutcomes;

  const directLadders = extractLadderRows(root.ladders).concat(extractLadderRows(market.ladders));
  const outcomeLadders = outcomes.flatMap((outcome) => extractLadderRows(outcome.ladders));
  const bids = outcomes.flatMap((outcome) => extractLadderRows(outcome.bids));
  const asks = outcomes.flatMap((outcome) => extractLadderRows(outcome.asks));
  const ladders = dedupeLadderRows(
    directLadders.length > 0 ? directLadders : [...outcomeLadders, ...bids, ...asks],
  );

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

// ---------------------------------------------------------------------------
// Captured GraphQL event-markets shape
//   { data: { event: [ { id, description, game, markets: [ { type, strike,
//     description, status, player, outcomes: [ { id, description, available } ]
//   } ] } ] } }
// Prices live on `outcome.available` as an implied probability. This shape has
// no order book, so liquidity is null. Handled as a separate path so the
// existing ladder-based normalization is left untouched.
// ---------------------------------------------------------------------------

const NOVIG_MARKET_TYPE_MAP: Record<string, string> = {
  MONEY: "moneyline",
  MONEY_1H: "moneyline",
  SPREAD: "spread",
  SPREAD_1H: "spread",
  TOTAL: "total",
  TOTAL_1H: "total",
  TEAM_TOTAL: "team_total",
  POINTS: "player_points",
  REBOUNDS: "player_rebounds",
  ASSISTS: "player_assists",
  POINTS_REBOUNDS: "player_points_rebounds",
  POINTS_ASSISTS: "player_points_assists",
  REBOUNDS_ASSISTS: "player_rebounds_assists",
  POINTS_REBOUNDS_ASSISTS: "player_points_rebounds_assists",
  THREE_POINTERS_MADE: "player_threes_made",
  STEALS: "player_steals",
  BLOCKS: "player_blocks",
  DOUBLE_DOUBLE: "double_double",
  TRIPLE_DOUBLE: "triple_double",
  FIRST_BASKET: "first_basket",
};

function eventMarketType(type: unknown): string {
  const raw = typeof type === "string" ? type.trim() : "";
  if (!raw) return "unknown";
  const mapped = NOVIG_MARKET_TYPE_MAP[raw.toUpperCase()];
  if (mapped) return mapped;
  return raw.toLowerCase().replace(/\s+/g, "_");
}

function eventPeriodFromType(type: unknown): string {
  const raw = typeof type === "string" ? type.toUpperCase() : "";
  if (raw.endsWith("_1H")) return "first_half";
  if (raw.endsWith("_2H")) return "second_half";
  if (raw.endsWith("_1Q")) return "first_quarter";
  if (raw.endsWith("_2Q")) return "second_quarter";
  if (raw.endsWith("_3Q")) return "third_quarter";
  if (raw.endsWith("_4Q")) return "fourth_quarter";
  return "full_game";
}

function isMoneyType(type: unknown): boolean {
  const raw = typeof type === "string" ? type.toUpperCase() : "";
  return raw === "MONEY" || raw.startsWith("MONEY_") || raw.startsWith("MONEY");
}

function eventPlayerName(market: UnknownRecord): string | null {
  const player = market.player;
  if (isRecord(player)) return firstString(player.full_name, player.name, player.description);
  if (typeof player === "string") return normalizeText(player) || null;
  return null;
}

function eventSide(outcome: UnknownRecord): string {
  const text = normalizeText(firstString(outcome.description, outcome.name));
  if (!text) return "unknown";
  if (text === "over" || text.startsWith("over ")) return "over";
  if (text === "under" || text.startsWith("under ")) return "under";
  if (text === "yes" || text.startsWith("yes ")) return "yes";
  if (text === "no" || text.startsWith("no ")) return "no";
  return normalizeSide(text) || text;
}

type EventMarketPair = { event: UnknownRecord; market: UnknownRecord };

/**
 * Detect and flatten the captured GraphQL shape into (event, market) pairs.
 * Returns null when `raw` is not that shape so the caller falls back to the
 * existing ladder-based path.
 */
function extractEventMarketPairs(raw: unknown): EventMarketPair[] | null {
  if (!isRecord(raw)) return null;
  const data = isRecord(raw.data) ? raw.data : null;
  if (!data) return null;

  const events = toRecordArray(data.event);
  if (events.length > 0) {
    const pairs: EventMarketPair[] = [];
    for (const event of events) {
      for (const market of toRecordArray(event.markets)) {
        pairs.push({ event, market });
      }
    }
    if (pairs.length > 0) return pairs;
  }

  // Single-market query: each market carries its own nested `event`.
  const markets = toRecordArray(data.market);
  if (markets.length > 0) {
    return markets.map((market) => ({
      event: isRecord(market.event) ? market.event : {},
      market,
    }));
  }

  return null;
}

/**
 * Detect the live-event-ticker shape ({ liveEvents, upcomingEvents }) and the
 * featured-markets shape ({ markets: [{ ..., event, outcomes }] }). Both price
 * via `outcome.available` like the GraphQL event shape, so they reuse
 * buildEventRow. Returns null when `raw` is neither so the caller falls back.
 */
function extractAvailabilityPairs(raw: unknown): EventMarketPair[] | null {
  if (!isRecord(raw)) return null;

  // live-event-ticker: events grouped under liveEvents / upcomingEvents.
  if ("liveEvents" in raw || "upcomingEvents" in raw) {
    const events = [...toRecordArray(raw.liveEvents), ...toRecordArray(raw.upcomingEvents)];
    const pairs: EventMarketPair[] = [];
    for (const event of events) {
      for (const market of toRecordArray(event.markets)) {
        pairs.push({ event, market });
      }
    }
    return pairs;
  }

  // featured-markets: top-level markets carrying their own nested event and
  // outcomes priced via `available`.
  const markets = toRecordArray(raw.markets);
  if (
    markets.length > 0 &&
    markets.some(
      (market) =>
        isRecord(market.event) &&
        toRecordArray(market.outcomes).some((outcome) => toNumber(outcome.available) !== null),
    )
  ) {
    return markets.map((market) => ({
      event: isRecord(market.event) ? market.event : {},
      market,
    }));
  }

  return null;
}

function buildEventRow(
  event: UnknownRecord,
  market: UnknownRecord,
  outcome: UnknownRecord,
  options?: NovigNormalizeOptions,
): NormalizedMarket {
  const game = isRecord(event.game) ? event.game : {};
  const away = isRecord(game.awayTeam) ? game.awayTeam : {};
  const home = isRecord(game.homeTeam) ? game.homeTeam : {};

  const available = toNumber(outcome.available);
  const impliedProbability = available !== null && available > 0 && available < 1 ? available : null;
  const oddsAmerican = impliedProbability !== null ? probabilityToAmerican(impliedProbability) : null;

  const strike = toNumber(market.strike);
  const line = isMoneyType(market.type) ? null : strike;

  const awayName = firstString(away.name, away.shortName, away.symbol);
  const homeName = firstString(home.name, home.shortName, home.symbol);
  const eventName =
    firstString(options?.eventName, event.description) ??
    (awayName && homeName ? `${awayName} @ ${homeName}` : null) ??
    firstString(event.id) ??
    "unknown";

  const liveText = normalizeText(firstString(event.status, game.status));
  const live = /live|in[_ ]?progress|in[_ ]?play/.test(liveText);

  // Two-outcome markets without an explicit type are moneylines.
  const rawMarketType = firstString(options?.marketType) ?? eventMarketType(market.type);
  const marketType =
    rawMarketType === "unknown" && toRecordArray(market.outcomes).length === 2
      ? "moneyline"
      : rawMarketType;

  // Some shapes (live-event-ticker) carry no per-outcome description; fall back
  // to the home/away team for the outcome's index (index 0 = home, 1 = away).
  let side = eventSide(outcome);
  if (side === "unknown") {
    const idx = toNumber(outcome.index);
    const team = idx === 0 ? home : idx === 1 ? away : {};
    const teamSide = firstString(team.shortName, team.symbol, team.name);
    if (teamSide) side = normalizeSide(teamSide) || normalizeText(teamSide) || "unknown";
  }

  const statusText = normalizeText(firstString(market.status, outcome.status, event.status, game.status));
  let status = normalizeStatus(statusText);
  if (status === "unknown" && statusText.includes("open")) status = "open";

  return {
    source: "novig",
    sourceEventId: firstString(event.id),
    sourceMarketId: firstString(market.id),
    sourceOutcomeId: firstString(outcome.id),
    event_id: firstString(event.id) ?? "unknown",
    event_name: eventName,
    sport: firstString(options?.sport, game.sport, event.sport) ?? "unknown",
    league: firstString(options?.league, game.league, event.league) ?? "unknown",
    market_type: marketType,
    player: eventPlayerName(market),
    side,
    line,
    odds_american: oddsAmerican,
    implied_probability: impliedProbability,
    liquidity: null,
    timestamp: firstString(options?.receivedAt) ?? new Date().toISOString(),
    status,
    live: typeof options?.live === "boolean" ? options.live : live,
    period: options?.period ? normalizePeriod(options.period, "full_game") : eventPeriodFromType(market.type),
    raw: {
      eventId: firstString(event.id),
      marketId: firstString(market.id),
      outcome,
    },
  };
}

export function normalizeNovigMarkets(
  raw: NovigBatchBookResponse,
  options?: NovigNormalizeOptions,
): NormalizedMarket[] {
  // Captured GraphQL event-markets shape (price via outcome.available).
  const eventPairs = extractEventMarketPairs(raw) ?? extractAvailabilityPairs(raw);
  if (eventPairs) {
    const rows: NormalizedMarket[] = [];
    for (const { event, market } of eventPairs) {
      for (const outcome of toRecordArray(market.outcomes)) {
        rows.push(buildEventRow(event, market, outcome, options));
      }
    }
    return rows;
  }

  // Order-book / batch-book shape (price via ladder entries).
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

import type { NormalizedMarket, NormalizedMarketStatus } from "../market-normalization";
import {
  americanToImpliedProbability,
  decimalToAmerican,
  normalizePeriod,
  normalizeSide,
  normalizeText,
} from "../market-normalization";

export type RebetRawMarket = unknown;

export type RebetNormalizeOptions = {
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

type RebetEntry = {
  root: UnknownRecord;
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

function parseAmerican(outcome: UnknownRecord): number | null {
  const displayOdds = isRecord(outcome.display_odds) ? outcome.display_odds : {};
  const american = parseNumber(displayOdds.american);
  if (american !== null) return Math.trunc(american);

  const decimal = parseNumber(displayOdds.decimal) ?? parseNumber(outcome.odds);
  if (decimal !== null) return decimalToAmerican(decimal);
  return null;
}

const PLAYER_STAT_TYPES: Record<string, string> = {
  points: "player_points",
  rebounds: "player_rebounds",
  assists: "player_assists",
  "3-point field goals": "player_threes",
  "3 point field goals": "player_threes",
  threes: "player_threes",
  steals: "player_steals",
  blocks: "player_blocks",
  "points + rebounds + assists": "player_points_rebounds_assists",
  "points + rebounds": "player_points_rebounds",
  "points + assists": "player_points_assists",
  "rebounds + assists": "player_rebounds_assists",
};

/** "fox, de'aaron" -> "de'aaron fox" so player matches other books' "first last". */
function reorderName(name: string): string {
  const parts = name.split(",").map((s) => s.trim());
  if (parts.length === 2 && parts[0] && parts[1]) return `${parts[1]} ${parts[0]}`;
  return name;
}

function statToType(stat: string): string {
  const s = stat.trim();
  return PLAYER_STAT_TYPES[s] ?? `player_${s.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

const PERIOD_WORDS: Record<string, string> = {
  "1st half": "first_half",
  "2nd half": "second_half",
  "1st quarter": "first_quarter",
  "2nd quarter": "second_quarter",
  "3rd quarter": "third_quarter",
  "4th quarter": "fourth_quarter",
};

/**
 * Resolve market_type, player, and period from a rebet market name. Rebet labels
 * distinct markets with descriptive names that all contain "total"; collapsing
 * them loses identity and conflates markets (producing fake arbs). We split out:
 *   - player props ("Lastname, Firstname total <stat>")  -> player_<stat> + player
 *   - team totals ("<Team> total")                       -> team_total
 *   - derivatives ("... maximum consecutive points")     -> own type
 *   - period prefixes ("1st quarter - total")            -> period set
 * Only the plain game total ("Total (incl. overtime)") stays market_type "total".
 */
function deriveMarket(market: UnknownRecord): { marketType: string; player: string | null; period: string | null } {
  const text = firstString(market.name, market.tab_name, market.market_type, market.type);
  if (!text) return { marketType: "unknown", player: null, period: null };
  if (text.includes("winner") || text.includes("moneyline")) return { marketType: "moneyline", player: null, period: null };
  if (text.includes("handicap") || text.includes("spread")) return { marketType: "spread", player: null, period: null };

  let body = text.replace(/\s*\(incl\.?\s*overtime\)\s*$/, "").trim();

  // leading period prefix, e.g. "1st quarter - total"
  let period: string | null = null;
  const periodMatch = body.match(/^(1st half|2nd half|1st quarter|2nd quarter|3rd quarter|4th quarter)\s*-\s*/);
  if (periodMatch) {
    period = PERIOD_WORDS[periodMatch[1]] ?? null;
    body = body.slice(periodMatch[0].length).trim();
  }

  // player total prop: "lastname, firstname total <stat>"
  const prop = body.match(/^(.+?,\s*.+?)\s+total\s+(.+)$/);
  if (prop) {
    return { marketType: statToType(prop[2]), player: reorderName(prop[1]), period };
  }

  // derivative totals (keep them out of the plain-total bucket)
  if (body.includes("maximum consecutive points")) {
    return { marketType: "max_consecutive_points", player: null, period };
  }

  if (body.includes("total")) {
    // "<team> total" => team total; bare "total" => game total
    const scope = body.replace(/\s*total.*$/, "").trim();
    if (scope) return { marketType: "team_total", player: scope, period };
    return { marketType: "total", player: null, period };
  }

  return { marketType: body.replace(/\s+/g, "_"), player: null, period };
}

function deriveEventName(root: UnknownRecord): string {
  const competitors = asRecordArray(root.competitors);
  const home = competitors.find((item) => firstString(item.qualifier) === "home");
  const away = competitors.find((item) => firstString(item.qualifier) === "away");
  const homeName = firstString(home?.name);
  const awayName = firstString(away?.name);
  if (awayName && homeName) return `${awayName} @ ${homeName}`;

  const fromRoot = firstString(root.event_name, root.name, root.id);
  return fromRoot ?? "unknown";
}

function extractLine(text: string): number | null {
  const fromParen = text.match(/\(([+-]?\d+(?:\.\d+)?)\)/);
  if (fromParen) {
    const parsed = Number(fromParen[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const trailing = text.match(/([+-]?\d+(?:\.\d+)?)$/);
  if (trailing) {
    const parsed = Number(trailing[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function deriveSideAndLine(outcome: UnknownRecord): { side: string; line: number | null } {
  const label = firstString(outcome.name, outcome.label, outcome.description) ?? "unknown";

  if (label.startsWith("over")) return { side: "over", line: extractLine(label) };
  if (label.startsWith("under")) return { side: "under", line: extractLine(label) };
  if (label === "yes" || label.startsWith("yes ")) return { side: "yes", line: extractLine(label) };
  if (label === "no" || label.startsWith("no ")) return { side: "no", line: extractLine(label) };

  return {
    side: normalizeSide(label) || label,
    line: extractLine(label),
  };
}

function isActive(value: unknown): boolean | null {
  const text = firstString(value);
  if (text === "1" || text === "true" || text === "active") return true;
  if (text === "0" || text === "false" || text === "inactive") return false;
  return null;
}

function mapStatus(market: UnknownRecord, outcome: UnknownRecord): NormalizedMarketStatus {
  const marketOpen = isActive(market.status);
  const outcomeOpen = isActive(outcome.active);

  if (marketOpen === true && (outcomeOpen === true || outcomeOpen === null)) return "open";
  if (marketOpen === false || outcomeOpen === false) return "suspended";
  return "unknown";
}

function collectEntries(raw: RebetRawMarket | RebetRawMarket[]): RebetEntry[] {
  const containers = Array.isArray(raw) ? raw : [raw];
  const entries: RebetEntry[] = [];

  const pushEntriesFromRoot = (root: UnknownRecord): void => {
    // Legacy/event-market payload.
    const marketData = asRecordArray(root.market_data);
    for (const marketDataRow of marketData) {
      for (const card of asRecordArray(marketDataRow.cards)) {
        for (const market of asRecordArray(card.markets)) {
          for (const outcome of asRecordArray(market.outcome)) {
            entries.push({ root, market, outcome });
          }
        }
      }
    }

    // Rebet sportsbook list payload: odds.market where market is keyed object.
    const odds = isRecord(root.odds) ? root.odds : null;
    const oddsMarket = odds?.market;
    const marketRows = asRecordArray(oddsMarket);
    const mappedRows =
      marketRows.length > 0 ? marketRows : isRecord(oddsMarket) ? Object.values(oddsMarket).filter(isRecord) : [];
    for (const market of mappedRows) {
      for (const outcome of asRecordArray(market.outcome)) {
        entries.push({ root, market, outcome });
      }
    }
  };

  for (const rootCandidate of containers) {
    if (!isRecord(rootCandidate)) continue;

    const root = isRecord(rootCandidate.data) ? rootCandidate.data : rootCandidate;
    const eventRoots = asRecordArray(root.events);
    if (eventRoots.length > 0) {
      for (const eventRoot of eventRoots) pushEntriesFromRoot(eventRoot);
      continue;
    }

    pushEntriesFromRoot(root);
  }

  return entries;
}

export function normalizeRebetMarkets(
  raw: RebetRawMarket | RebetRawMarket[],
  options?: RebetNormalizeOptions,
): NormalizedMarket[] {
  const entries = collectEntries(raw);

  return entries.map(({ root, market, outcome }) => {
    const oddsAmerican = parseAmerican(outcome);
    // outcome.probabilities is Rebet's internal no-vig fair prob, not the
    // vig-included market price. Always derive from the displayed American odds.
    const impliedProbability = oddsAmerican === null ? null : americanToImpliedProbability(oddsAmerican);

    const sideAndLine = deriveSideAndLine(outcome);
    const derived = options?.marketType
      ? { marketType: normalizeText(options.marketType) || "unknown", player: null, period: null }
      : deriveMarket(market);
    const timestamp =
      firstString(options?.receivedAt, outcome.updated_at, market.updated_at, root.updated_at) ??
      new Date().toISOString();

    return {
      source: "rebet",
      sourceEventId: firstString(options?.eventId, root.id),
      sourceMarketId: firstString(market.id),
      sourceOutcomeId: firstString(outcome.id),
      event_id: firstString(options?.eventId, root.id) ?? "unknown",
      event_name: firstString(options?.eventName) ?? deriveEventName(root),
      sport: firstString(options?.sport, root.sport_name, root.sport) ?? "unknown",
      league: firstString(options?.league, root.league_name, root.league) ?? "unknown",
      market_type: derived.marketType,
      player: derived.player,
      side: sideAndLine.side,
      line: sideAndLine.line,
      odds_american: oddsAmerican,
      implied_probability:
        impliedProbability !== null && impliedProbability > 0 && impliedProbability < 1 ? impliedProbability : null,
      liquidity: null,
      timestamp,
      status: mapStatus(market, outcome),
      live: typeof options?.live === "boolean" ? options.live : Boolean(root.is_live),
      period: normalizePeriod(options?.period ?? derived.period ?? market.period, "full_game"),
      raw: {
        marketId: firstString(market.id),
        outcome,
      },
    };
  });
}

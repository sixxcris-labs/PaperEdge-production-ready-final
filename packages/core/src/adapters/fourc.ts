import type { NormalizedMarket, NormalizedMarketStatus } from "../market-normalization";
import {
  americanToImpliedProbability,
  normalizePeriod,
  normalizeSide,
  normalizeText,
} from "../market-normalization";

export type FourCRawMarket = unknown;

export type FourCNormalizeOptions = {
  sport?: string;
  league?: string;
  eventName?: string;
  eventId?: string;
  period?: string;
  live?: boolean;
  receivedAt?: string;
};

type UnknownRecord = Record<string, unknown>;

type FourCEntry = {
  game: UnknownRecord;
  offer: UnknownRecord;
  marketType: "moneyline" | "spread" | "total";
  side: string;
  line: number | null;
  marketId: string | null;
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

function parseStatus(game: UnknownRecord, offer: UnknownRecord): NormalizedMarketStatus {
  if (game.ended === true) return "closed";

  const offerStatus = firstString(offer.status, game.status);
  if (offerStatus === "suspended" || offerStatus === "paused" || offerStatus === "halted") {
    return "suspended";
  }

  if (offerStatus === "closed" || offerStatus === "settled") return "closed";
  return "open";
}

function mapParticipantNames(game: UnknownRecord): Map<string, string> {
  const result = new Map<string, string>();
  for (const participant of asRecordArray(game.participants)) {
    const id = firstString(participant.id);
    const name = firstString(participant.longName, participant.name, participant.shortName);
    if (id && name) result.set(id, name);
  }
  return result;
}

function collectFromLineMap(
  game: UnknownRecord,
  lineMap: UnknownRecord,
  marketType: "spread" | "total",
  side: string,
  participantNames: Map<string, string>,
): FourCEntry[] {
  const entries: FourCEntry[] = [];

  for (const [lineKey, offersValue] of Object.entries(lineMap)) {
    const offers = asRecordArray(offersValue);
    const lineFromKey = parseNumber(lineKey);

    for (const offer of offers) {
      const line =
        parseNumber(offer.spread) ?? parseNumber(offer.total) ?? parseNumber(offer.line) ?? lineFromKey ?? null;

      const offerSide =
        side === "over" || side === "under"
          ? side
          : participantNames.get(firstString(offer.participantID, offer.participantId) ?? "") ??
            side;

      const marketId =
        marketType === "spread"
          ? `spread:${line ?? "na"}`
          : `total:${line ?? "na"}`;

      entries.push({
        game,
        offer,
        marketType,
        side: offerSide,
        line,
        marketId,
      });
    }
  }

  return entries;
}

function collectEntries(raw: FourCRawMarket | FourCRawMarket[]): FourCEntry[] {
  const containers = Array.isArray(raw) ? raw : [raw];
  const entries: FourCEntry[] = [];

  for (const containerCandidate of containers) {
    if (!isRecord(containerCandidate)) continue;

    const data = isRecord(containerCandidate.data) ? containerCandidate.data : containerCandidate;
    const game = isRecord(data.game) ? data.game : data;
    const participantNames = mapParticipantNames(game);

    for (const offer of asRecordArray(game.awayMoneylines)) {
      const side =
        participantNames.get(firstString(offer.participantID, offer.participantId) ?? "") ??
        firstString(game.awayTeamName, game.awayTeam, "away") ??
        "away";

      entries.push({
        game,
        offer,
        marketType: "moneyline",
        side,
        line: null,
        marketId: "moneyline",
      });
    }

    for (const offer of asRecordArray(game.homeMoneylines)) {
      const side =
        participantNames.get(firstString(offer.participantID, offer.participantId) ?? "") ??
        firstString(game.homeTeamName, game.homeTeam, "home") ??
        "home";

      entries.push({
        game,
        offer,
        marketType: "moneyline",
        side,
        line: null,
        marketId: "moneyline",
      });
    }

    if (isRecord(game.awaySpreads)) {
      entries.push(
        ...collectFromLineMap(game, game.awaySpreads, "spread", firstString(game.awayTeamName, "away") ?? "away", participantNames),
      );
    }

    if (isRecord(game.homeSpreads)) {
      entries.push(
        ...collectFromLineMap(game, game.homeSpreads, "spread", firstString(game.homeTeamName, "home") ?? "home", participantNames),
      );
    }

    if (isRecord(game.over)) {
      entries.push(...collectFromLineMap(game, game.over, "total", "over", participantNames));
    }

    if (isRecord(game.under)) {
      entries.push(...collectFromLineMap(game, game.under, "total", "under", participantNames));
    }
  }

  return entries;
}

function normalizeFourCPeriod(value: unknown): string {
  const period = normalizePeriod(value, "full_game");
  if (period === "full-time" || period === "full_time") return "full_game";
  return period;
}

export function normalizeFourCMarkets(
  raw: FourCRawMarket | FourCRawMarket[],
  options?: FourCNormalizeOptions,
): NormalizedMarket[] {
  const entries = collectEntries(raw);

  return entries.map(({ game, offer, marketType, side, line, marketId }) => {
    const odds = parseNumber(offer.odds);
    const timestamp =
      firstString(options?.receivedAt, offer.createdAt, offer.updatedAt, game.start) ?? new Date().toISOString();

    return {
      source: "4c",
      sourceEventId: firstString(options?.eventId, game.id, offer.gameID, offer.gameId),
      sourceMarketId: marketId,
      sourceOutcomeId: firstString(offer.id),
      event_id: firstString(options?.eventId, game.id, offer.gameID, offer.gameId) ?? "unknown",
      event_name: firstString(options?.eventName, game.eventName, game.name) ?? "unknown",
      sport: firstString(options?.sport, game.sport) ?? "unknown",
      league: firstString(options?.league, game.league) ?? "unknown",
      market_type: marketType,
      player: null,
      side: normalizeSide(side) || side,
      line,
      odds_american: odds,
      implied_probability: odds === null ? null : americanToImpliedProbability(odds),
      liquidity: parseNumber(offer.sumUntaken),
      timestamp,
      status: parseStatus(game, offer),
      live: typeof options?.live === "boolean" ? options.live : Boolean(game.live),
      period: normalizeFourCPeriod(options?.period ?? game.periodName),
      raw: {
        marketType,
        offer,
      },
    };
  });
}

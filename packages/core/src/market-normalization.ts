export type MarketSource = "novig" | "prophetx" | "bovada" | "kalshi" | "rebet" | "4c" | "unknown";

export type NormalizedMarketStatus = "open" | "suspended" | "closed" | "upcoming" | "unknown";

export type NormalizedMarket = {
  source: MarketSource;
  sourceMarketId?: string | null;
  sourceOutcomeId?: string | null;
  sourceEventId?: string | null;
  event_id: string;
  event_name: string;
  sport: string;
  league: string;
  market_type: string;
  player?: string | null;
  side: string;
  line?: number | null;
  odds_american?: number | null;
  implied_probability?: number | null;
  liquidity?: number | null;
  timestamp: string;
  status: NormalizedMarketStatus;
  live: boolean;
  period: string;
  raw?: unknown;
};

export type MarketRelationshipKind =
  | "same_line_opposite_side"
  | "middle_line_split"
  | "same_side"
  | "market_mismatch"
  | "period_mismatch"
  | "player_mismatch"
  | "event_mismatch"
  | "unknown";

export type MarketRelationshipAssessment = {
  kind: MarketRelationshipKind;
  comparable: boolean;
  reason: string;
};

export function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeSide(value: unknown): string {
  const normalized = normalizeText(value);
  if (normalized === "o" || normalized === "over") return "over";
  if (normalized === "u" || normalized === "under") return "under";
  if (normalized === "y" || normalized === "yes") return "yes";
  if (normalized === "n" || normalized === "no") return "no";
  return normalized;
}

/**
 * Canonical period normalizer shared by the engine and every adapter.
 * Accepts either spacing convention ("full game" or "full_game") and always
 * emits the underscore form. `fallback` is returned for empty/missing input so
 * adapters can opt into the "missing period means full game" policy.
 */
export function normalizePeriod(value: unknown, fallback = "unknown"): string {
  const normalized = normalizeText(value).replace(/_/g, " ");
  if (!normalized) return fallback;
  switch (normalized) {
    case "fg":
    case "game":
    case "full game":
    case "full time":
    case "fulltime":
    case "ft":
      return "full_game";
    case "1h":
    case "first half":
    case "1st half":
      return "first_half";
    case "2h":
    case "second half":
    case "2nd half":
      return "second_half";
    case "1q":
    case "first quarter":
    case "1st quarter":
      return "first_quarter";
    case "2q":
    case "second quarter":
    case "2nd quarter":
      return "second_quarter";
    case "3q":
    case "third quarter":
    case "3rd quarter":
      return "third_quarter";
    case "4q":
    case "fourth quarter":
    case "4th quarter":
      return "fourth_quarter";
    case "regulation":
      return "regulation";
    default:
      return normalized.replace(/\s+/g, "_");
  }
}

export function normalizeMarketType(value: unknown): string {
  const normalized = normalizeText(value);
  if (!normalized) return "unknown";
  return normalized;
}

export function americanToImpliedProbability(oddsAmerican: number): number | null {
  if (!Number.isFinite(oddsAmerican) || oddsAmerican === 0) return null;
  if (oddsAmerican > 0) return 100 / (oddsAmerican + 100);
  const absOdds = Math.abs(oddsAmerican);
  return absOdds / (absOdds + 100);
}

export function probabilityToAmerican(probability: number): number | null {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) return null;
  if (probability < 0.5) return Math.round((100 * (1 - probability)) / probability);
  return Math.round((-100 * probability) / (1 - probability));
}

export function decimalToAmerican(decimalOdds: number): number | null {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return null;
  if (decimalOdds >= 2) return Math.round((decimalOdds - 1) * 100);
  return Math.round(-100 / (decimalOdds - 1));
}

function lineKey(line: number | null | undefined): string {
  if (line === null || line === undefined || !Number.isFinite(line)) return "na";
  return String(line);
}

export function marketComparisonKey(market: NormalizedMarket): string {
  return [
    normalizeText(market.sport),
    normalizeText(market.league),
    normalizeText(market.event_name),
    normalizeMarketType(market.market_type),
    normalizeText(market.player),
    normalizePeriod(market.period),
  ].join("|");
}

export function strictMarketComparisonKey(market: NormalizedMarket): string {
  return `${marketComparisonKey(market)}|${lineKey(market.line)}`;
}

export function groupMarketsByComparisonKey(markets: NormalizedMarket[]): Map<string, NormalizedMarket[]> {
  const grouped = new Map<string, NormalizedMarket[]>();
  for (const market of markets) {
    const key = marketComparisonKey(market);
    const current = grouped.get(key);
    if (current) {
      current.push(market);
      continue;
    }
    grouped.set(key, [market]);
  }
  return grouped;
}

const STRUCTURED_SIDES = new Set(["over", "under", "yes", "no"]);

function isStructuredSide(side: string): boolean {
  return STRUCTURED_SIDES.has(side);
}

/**
 * A "team side" is any concrete outcome that is not an over/under or yes/no
 * leg — i.e. a moneyline or spread selection identified by team. Assumes team
 * identity has been normalized upstream (the same team resolves to the same
 * string); otherwise the same team across books could look like opposites.
 */
function isTeamSide(side: string): boolean {
  return side !== "" && side !== "unknown" && !isStructuredSide(side);
}

export function isOppositeSide(a: NormalizedMarket, b: NormalizedMarket): boolean {
  const sideA = normalizeSide(a.side);
  const sideB = normalizeSide(b.side);
  if (
    (sideA === "over" && sideB === "under") ||
    (sideA === "under" && sideB === "over") ||
    (sideA === "yes" && sideB === "no") ||
    (sideA === "no" && sideB === "yes")
  ) {
    return true;
  }
  // Team-vs-team: two distinct normalized team identities are the opposite
  // outcomes of a 2-way market (moneyline, spread).
  return isTeamSide(sideA) && isTeamSide(sideB) && sideA !== sideB;
}

export function hasSameLineRelationship(a: NormalizedMarket, b: NormalizedMarket): boolean {
  if (!isOppositeSide(a, b)) return false;

  const sideA = normalizeSide(a.side);
  const sideB = normalizeSide(b.side);

  // Over/under & yes/no: opposite legs share the same numeric line.
  if (isStructuredSide(sideA) && isStructuredSide(sideB)) {
    if (a.line === null || a.line === undefined || b.line === null || b.line === undefined) return false;
    return a.line === b.line;
  }

  // Team sides: moneyline has no line on either leg; a spread's two sides carry
  // mirror lines (e.g. -2.5 and +2.5).
  const aNull = a.line === null || a.line === undefined;
  const bNull = b.line === null || b.line === undefined;
  if (aNull && bNull) return true;
  if (!aNull && !bNull) return a.line === -(b.line as number);
  return false;
}

export function hasMiddleLineRelationship(a: NormalizedMarket, b: NormalizedMarket): boolean {
  if (!isOppositeSide(a, b)) return false;
  if (a.line === null || a.line === undefined || b.line === null || b.line === undefined) return false;

  const over = normalizeSide(a.side) === "over" ? a : b;
  const under = normalizeSide(a.side) === "under" ? a : b;

  if (normalizeSide(over.side) !== "over" || normalizeSide(under.side) !== "under") {
    return false;
  }

  if (over.line === null || over.line === undefined || under.line === null || under.line === undefined) {
    return false;
  }

  return over.line < under.line;
}

function sameEvent(a: NormalizedMarket, b: NormalizedMarket): boolean {
  const sourceEventA = normalizeText(a.sourceEventId);
  const sourceEventB = normalizeText(b.sourceEventId);
  if (sourceEventA && sourceEventB) return sourceEventA === sourceEventB;

  const eventIdA = normalizeText(a.event_id);
  const eventIdB = normalizeText(b.event_id);
  if (eventIdA && eventIdB) return eventIdA === eventIdB;

  return normalizeText(a.event_name) === normalizeText(b.event_name);
}

export function assessMarketRelationship(a: NormalizedMarket, b: NormalizedMarket): MarketRelationshipAssessment {
  if (!sameEvent(a, b)) {
    return { kind: "event_mismatch", comparable: false, reason: "Events do not match." };
  }

  if (normalizeMarketType(a.market_type) !== normalizeMarketType(b.market_type)) {
    return { kind: "market_mismatch", comparable: false, reason: "Market types do not match." };
  }

  if (normalizePeriod(a.period) !== normalizePeriod(b.period)) {
    return { kind: "period_mismatch", comparable: false, reason: "Periods do not match." };
  }

  const playerA = normalizeText(a.player);
  const playerB = normalizeText(b.player);
  if ((playerA || playerB) && playerA !== playerB) {
    return { kind: "player_mismatch", comparable: false, reason: "Players do not match." };
  }

  if (!isOppositeSide(a, b)) {
    return { kind: "same_side", comparable: false, reason: "Outcomes are not opposite sides." };
  }

  if (hasSameLineRelationship(a, b)) {
    return {
      kind: "same_line_opposite_side",
      comparable: true,
      reason: "Opposite sides on the same line.",
    };
  }

  if (hasMiddleLineRelationship(a, b)) {
    return {
      kind: "middle_line_split",
      comparable: true,
      reason: "Opposite sides with a valid middle-line split.",
    };
  }

  return {
    kind: "unknown",
    comparable: false,
    reason: "Comparable inputs did not match same-line or valid middle-line relationships.",
  };
}

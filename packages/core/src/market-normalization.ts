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
  | "same_book"
  | "line_mismatch"
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
  return normalized.replace(/\s+/g, "_");
}
export function impliedFromAmerican(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}
export function americanToImpliedProbability(oddsAmerican: number): number | null {
  if (!Number.isFinite(oddsAmerican) || oddsAmerican === 0) return null;
  return impliedFromAmerican(oddsAmerican);
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
export function normalizeEventKey(value: unknown): string {
  const normalized = normalizeText(value)
    .replace(/\bvs\.\b/g, " vs ")
    .replace(/\bv\.\b/g, " vs ")
    .replace(/\s+@\s+/g, " vs ")
    .replace(/\s+at\s+/g, " vs ")
    .replace(/\s+versus\s+/g, " vs ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  const parts = normalized.split(/\s+vs\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 2) return [...parts].sort().join(" vs ");
  return normalized;
}
export function marketComparisonKey(market: NormalizedMarket): string {
  return [
    normalizeText(market.sport),
    normalizeText(market.league),
    normalizeEventKey(market.event_name) || normalizeText(market.event_id),
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
  return isTeamSide(sideA) && isTeamSide(sideB) && sideA !== sideB;
}
export function hasSameLineRelationship(a: NormalizedMarket, b: NormalizedMarket): boolean {
  if (!isOppositeSide(a, b)) return false;
  const sideA = normalizeSide(a.side);
  const sideB = normalizeSide(b.side);
  if (isStructuredSide(sideA) && isStructuredSide(sideB)) {
    if (a.line === null || a.line === undefined || b.line === null || b.line === undefined) return false;
    return a.line === b.line;
  }
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
  const sportA = normalizeText(a.sport);
  const sportB = normalizeText(b.sport);
  if (sportA && sportB && sportA !== sportB) return false;
  const leagueA = normalizeText(a.league);
  const leagueB = normalizeText(b.league);
  if (leagueA && leagueB && leagueA !== leagueB) return false;
  const eventNameA = normalizeEventKey(a.event_name);
  const eventNameB = normalizeEventKey(b.event_name);
  if (eventNameA && eventNameB && eventNameA === eventNameB) return true;
  const eventIdA = normalizeText(a.event_id);
  const eventIdB = normalizeText(b.event_id);
  if (eventIdA && eventIdB && eventIdA === eventIdB) return true;
  const sourceEventA = normalizeText(a.sourceEventId);
  const sourceEventB = normalizeText(b.sourceEventId);
  if (a.source === b.source && sourceEventA && sourceEventB) return sourceEventA === sourceEventB;
  return false;
}
export function assessMarketRelationship(a: NormalizedMarket, b: NormalizedMarket): MarketRelationshipAssessment {
  if (a.source === b.source) {
    return { kind: "same_book", comparable: false, reason: "Same-book pairs cannot be arbitrage candidates." };
  }
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
    kind: "line_mismatch",
    comparable: false,
    reason: "Line relationship is neither same-line nor a valid middle.",
  };
}

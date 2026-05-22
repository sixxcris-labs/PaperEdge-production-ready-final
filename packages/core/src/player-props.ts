import { normalizePeriod, normalizeSide, normalizeText } from "./market-normalization";

type Unknownish = unknown;

export type PlayerPropDetails = {
  marketType?: string;
  player?: string | null;
  side?: string;
  line?: number | null;
  period?: string | null;
};

export type PlayerPropInput = {
  marketText?: Unknownish;
  outcomeText?: Unknownish;
  player?: Unknownish;
  stat?: Unknownish;
  marketType?: Unknownish;
  period?: Unknownish;
  line?: number | null;
};

const STAT_ALIASES: Array<[string, string]> = [
  ["points rebounds assists", "player_points_rebounds_assists"],
  ["points + rebounds + assists", "player_points_rebounds_assists"],
  ["points rebounds", "player_points_rebounds"],
  ["points + rebounds", "player_points_rebounds"],
  ["points assists", "player_points_assists"],
  ["points + assists", "player_points_assists"],
  ["rebounds assists", "player_rebounds_assists"],
  ["rebounds + assists", "player_rebounds_assists"],
  ["3 point field goals", "player_threes_made"],
  ["3-point field goals", "player_threes_made"],
  ["three point field goals", "player_threes_made"],
  ["three pointers made", "player_threes_made"],
  ["threes made", "player_threes_made"],
  ["three pointers", "player_threes_made"],
  ["3 pointers", "player_threes_made"],
  ["3pm", "player_threes_made"],
  ["home runs", "player_home_runs"],
  ["total bases", "player_total_bases"],
  ["runs batted in", "player_rbis"],
  ["rbis", "player_rbis"],
  ["runs", "player_runs"],
  ["hits", "player_hits"],
  ["strikeouts", "player_strikeouts"],
  ["pitcher strikeouts", "player_strikeouts"],
  ["pitching outs", "player_pitching_outs"],
  ["earned runs", "player_earned_runs"],
  ["walks", "player_walks"],
  ["shots on goal", "player_shots_on_goal"],
  ["saves", "player_saves"],
  ["goals", "player_goals"],
  ["passing yards", "player_passing_yards"],
  ["rushing yards", "player_rushing_yards"],
  ["receiving yards", "player_receiving_yards"],
  ["receptions", "player_receptions"],
  ["touchdowns", "player_touchdowns"],
  ["passing touchdowns", "player_passing_touchdowns"],
  ["completions", "player_completions"],
  ["attempts", "player_attempts"],
  ["double double", "player_double_double"],
  ["triple double", "player_triple_double"],
  ["first basket", "player_first_basket"],
  ["points", "player_points"],
  ["rebounds", "player_rebounds"],
  ["assists", "player_assists"],
  ["steals", "player_steals"],
  ["blocks", "player_blocks"],
  ["turnovers", "player_turnovers"],
];

const GENERIC_PLAYER_WORDS = new Set([
  "player",
  "players",
  "prop",
  "props",
  "total",
  "totals",
  "game",
  "full",
  "regular",
  "time",
  "including",
  "incl",
  "overtime",
  "ot",
  "over",
  "under",
  "yes",
  "no",
]);

function asText(value: unknown): string {
  return normalizeText(value).replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
}

function cleanStatSearchText(value: unknown): string {
  return asText(value)
    .replace(/\b(incl|including)\.?\s+overtime\b/g, " ")
    .replace(/\bregular\s+time\b/g, " ")
    .replace(/\bplayer\s+props?\b/g, " ")
    .replace(/\bplayer\b/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactStatText(value: string): string {
  return value.replace(/[+&/]/g, " ").replace(/\s+/g, " ").trim();
}

function aliasMatches(text: string, alias: string): boolean {
  const compactText = compactStatText(text);
  const compactAlias = compactStatText(alias);
  if (!compactAlias) return false;
  const boundary = new RegExp(`(^|\\b)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}(\\b|$)`);
  return boundary.test(text) || compactText.includes(compactAlias);
}

export function normalizePlayerName(value: unknown): string | null {
  const text = asText(value)
    .replace(/\b(incl|including)\.?\s+overtime\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const commaParts = text.split(",").map((part) => part.trim()).filter(Boolean);
  const reordered = commaParts.length === 2 ? `${commaParts[1]} ${commaParts[0]}` : text;
  const cleaned = reordered
    .replace(/\b(team|player|total|over|under|yes|no)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(" ").filter(Boolean);
  if (tokens.every((token) => GENERIC_PLAYER_WORDS.has(token))) return null;
  return cleaned;
}

export function normalizePlayerPropMarketType(value: unknown): string | null {
  const raw = normalizeText(value);
  if (/^player_[a-z0-9_]+$/.test(raw)) return raw;
  const text = cleanStatSearchText(value);
  if (!text) return null;
  const alias = [...STAT_ALIASES].sort((a, b) => b[0].length - a[0].length).find(([name]) => aliasMatches(text, name));
  return alias?.[1] ?? null;
}

export function isPlayerPropMarketType(marketType: unknown): boolean {
  const normalized = normalizeText(marketType).replace(/\s+/g, "_");
  return normalized.startsWith("player_");
}

export function extractLineFromText(value: unknown): number | null {
  const text = asText(value);
  const match = text.match(/(?:^|\s)([+-]?\d+(?:\.\d+)?)(?:\s|$)/g);
  if (!match || match.length === 0) return null;
  const last = match[match.length - 1].trim();
  const parsed = Number(last);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractSideAndLine(value: unknown, fallbackLine?: number | null): { side?: string; line?: number | null } {
  const text = asText(value);
  const side = normalizeSide(text.split(" ")[0]);
  const line = extractLineFromText(text) ?? fallbackLine ?? null;
  if (side === "over" || side === "under" || side === "yes" || side === "no") return { side, line };
  if (/\bover\b/.test(text)) return { side: "over", line };
  if (/\bunder\b/.test(text)) return { side: "under", line };
  if (/\byes\b/.test(text)) return { side: "yes", line };
  if (/\bno\b/.test(text)) return { side: "no", line };
  return { line };
}

function stripKnownNoise(value: string): string {
  return value
    .replace(/\b(incl|including)\.?\s+overtime\b/g, " ")
    .replace(/\bregular\s+time\b/g, " ")
    .replace(/\b(player|players|props?|total|totals|made)\b/g, " ")
    .replace(/\b(over|under|yes|no)\b/g, " ")
    .replace(/[0-9]+(?:\.[0-9]+)?/g, " ")
    .replace(/[-:|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeStatWords(text: string): string {
  let next = text;
  for (const [alias] of STAT_ALIASES) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    next = next.replace(new RegExp(`\\b${escaped}\\b`, "g"), " ");
    next = next.replace(new RegExp(`\\b${compactStatText(alias)}\\b`, "g"), " ");
  }
  return next.replace(/\s+/g, " ").trim();
}

function playerFromTextAroundStat(value: unknown): string | null {
  const text = cleanStatSearchText(value);
  if (!text) return null;
  const withoutStats = stripKnownNoise(removeStatWords(text));
  return normalizePlayerName(withoutStats);
}

function playerFromOutcomeText(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  const split = text.split(/\b(?:over|under|yes|no)\b/)[0]?.trim();
  return normalizePlayerName(stripKnownNoise(removeStatWords(split)));
}

export function derivePlayerPropDetails(input: PlayerPropInput): PlayerPropDetails {
  const explicitPlayer = normalizePlayerName(input.player);
  const marketText = input.marketText;
  const outcomeText = input.outcomeText;
  const marketType =
    normalizePlayerPropMarketType(input.marketType) ??
    normalizePlayerPropMarketType(input.stat) ??
    normalizePlayerPropMarketType(marketText) ??
    normalizePlayerPropMarketType(outcomeText);
  const sideAndLine = extractSideAndLine(outcomeText, input.line ?? null);
  const player = explicitPlayer ?? playerFromTextAroundStat(marketText) ?? playerFromOutcomeText(outcomeText);
  const period = input.period ? normalizePeriod(input.period, "full_game") : null;
  return {
    marketType: marketType ?? undefined,
    player,
    side: sideAndLine.side,
    line: sideAndLine.line ?? input.line ?? null,
    period,
  };
}

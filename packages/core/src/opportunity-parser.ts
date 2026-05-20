export interface ParsedOpportunity {
  customId?: string;
  event: string;
  startTime?: Date;
  sport: string;
  league?: string;
  market: string;
  playerOrTeam?: string;
  period: string;
  tradeType: string;
  source: string;
  bookAName?: string;
  sideA?: string;
  oddsA?: number;
  lineA?: number;
  stakeA?: number;
  liquidityA?: number;
  bookBName?: string;
  sideB?: string;
  oddsB?: number;
  lineB?: number;
  stakeB?: number;
  liquidityB?: number;
  expectedProfitMin?: number;
  expectedProfitMax?: number;
  notes?: string;
}

const FIELD_ALIASES: Record<string, keyof ParsedOpportunity | "expectedProfitRange"> = {
  "trade id": "customId",
  id: "customId",
  event: "event",
  game: "event",
  matchup: "event",
  date: "startTime",
  time: "startTime",
  "start time": "startTime",
  sport: "sport",
  league: "league",
  market: "market",
  "market type": "market",
  "bet type": "market",
  player: "playerOrTeam",
  team: "playerOrTeam",
  "player/team": "playerOrTeam",
  period: "period",
  "game period": "period",
  type: "tradeType",
  "trade type": "tradeType",
  source: "source",
  "book a": "bookAName",
  "book 1": "bookAName",
  "book a name": "bookAName",
  "side a": "sideA",
  "leg a": "sideA",
  "selection a": "sideA",
  "odds a": "oddsA",
  "price a": "oddsA",
  "line a": "lineA",
  "stake a": "stakeA",
  "wager a": "stakeA",
  "liquidity a": "liquidityA",
  "available a": "liquidityA",
  "book b": "bookBName",
  "book 2": "bookBName",
  "book b name": "bookBName",
  "side b": "sideB",
  "leg b": "sideB",
  "selection b": "sideB",
  "odds b": "oddsB",
  "price b": "oddsB",
  "line b": "lineB",
  "stake b": "stakeB",
  "wager b": "stakeB",
  "liquidity b": "liquidityB",
  "available b": "liquidityB",
  notes: "notes",
  note: "notes",
  "expected profit": "expectedProfitRange",
  "expected profit range": "expectedProfitRange",
};

export function parseOpportunityText(raw: string): ParsedOpportunity {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("Import text is required");
  }

  const parsed: ParsedOpportunity = {
    event: "Pending verification",
    sport: "unknown",
    market: "moneyline",
    period: "full_game",
    tradeType: "cash_arbitrage",
    source: "oddsjam_paste",
  };

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^([^:=-]{2,60})\s*[:=-]\s*(.+)$/);
    if (!match) continue;

    const key = normalizeKey(match[1]);
    const value = match[2].trim();
    const field = FIELD_ALIASES[key];
    if (!field || value.length === 0) continue;

    if (field === "expectedProfitRange") {
      const [min, max] = parseProfitRange(value);
      if (min != null) parsed.expectedProfitMin = min;
      if (max != null) parsed.expectedProfitMax = max;
      continue;
    }

    assignParsedValue(parsed, field, value);
  }

  inferLinesFromSides(parsed);

  return parsed;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-]+/g, " ").trim();
}

function assignParsedValue(target: ParsedOpportunity, field: keyof ParsedOpportunity, value: string): void {
  switch (field) {
    case "startTime": {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) target.startTime = d;
      break;
    }
    case "oddsA":
    case "oddsB": {
      const odds = parseAmericanOdds(value);
      if (odds != null) target[field] = odds;
      break;
    }
    case "lineA":
    case "lineB":
    case "liquidityA":
    case "liquidityB": {
      const n = parseNumber(value);
      if (n != null) target[field] = n;
      break;
    }
    case "stakeA":
    case "stakeB":
    case "expectedProfitMin":
    case "expectedProfitMax": {
      const n = parseMoney(value);
      if (n != null) target[field] = n;
      break;
    }
    case "period":
      target.period = normalizePeriod(value);
      break;
    case "market":
      target.market = normalizeMarket(value);
      break;
    case "tradeType":
      target.tradeType = normalizeTradeType(value);
      break;
    case "source":
      target.source = value.toLowerCase().replace(/\s+/g, "_");
      break;
    default:
      target[field] = value as never;
  }
}

function inferLinesFromSides(parsed: ParsedOpportunity): void {
  if (parsed.lineA == null && parsed.sideA) parsed.lineA = inferLine(parsed.sideA);
  if (parsed.lineB == null && parsed.sideB) parsed.lineB = inferLine(parsed.sideB);
}

function inferLine(side: string): number | undefined {
  const match = side.match(/(?:over|under|o|u|\+|-)?\s*(-?\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  return parseNumber(match[1]) ?? undefined;
}

function parseProfitRange(value: string): [number | undefined, number | undefined] {
  const numbers = [...value.matchAll(/-?\$?\d+(?:,\d{3})*(?:\.\d+)?/g)]
    .map((m) => parseMoney(m[0]))
    .filter((n): n is number => n != null);

  if (numbers.length === 0) return [undefined, undefined];
  if (numbers.length === 1) return [numbers[0], numbers[0]];
  return [Math.min(...numbers), Math.max(...numbers)];
}

export function parseAmericanOdds(value: string | number | null | undefined): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value !== 0 ? Math.round(value) : undefined;
  if (!value) return undefined;
  const cleaned = String(value).replace(/[^+\-\d.]/g, "").trim();
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) && n !== 0 ? Math.round(n) : undefined;
}

export function parseMoney(value: string | number | null | undefined): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (!value) return undefined;
  const cleaned = String(value).replace(/[$,]/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!cleaned) return undefined;
  const n = Number(cleaned[0]);
  return Number.isFinite(n) ? n : undefined;
}

export function parseNumber(value: string | number | null | undefined): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (!value) return undefined;
  const cleaned = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!cleaned) return undefined;
  const n = Number(cleaned[0]);
  return Number.isFinite(n) ? n : undefined;
}

function normalizePeriod(value: string): string {
  const v = value.toLowerCase().trim();
  if (["full game", "game", "match", "full_game"].includes(v)) return "full_game";
  if (v.includes("1h") || v.includes("first half")) return "first_half";
  if (v.includes("2h") || v.includes("second half")) return "second_half";
  if (v.includes("1q") || v.includes("first quarter")) return "first_quarter";
  return v.replace(/\s+/g, "_");
}

function normalizeMarket(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, "_");
}

function normalizeTradeType(value: string): string {
  const v = value.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (v.includes("middle")) return "middle";
  if (v.includes("promo") || v.includes("free_play")) return "promo_conversion";
  if (v.includes("rollover")) return "rollover_clearing";
  if (v.includes("low_hold")) return "low_hold";
  if (v.includes("arb")) return "cash_arbitrage";
  return v || "cash_arbitrage";
}

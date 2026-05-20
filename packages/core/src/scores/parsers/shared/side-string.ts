export type ParsedMarketType = "ML" | "SPREAD" | "TOTAL" | "PROP" | "UNKNOWN";

export interface ParsedSide {
  competitorName: string;
  marketType: ParsedMarketType;
  line?: number;
  direction?: "OVER" | "UNDER";
  odds?: number;
  confidence: number;
}

const TRAILING_AMERICAN_ODDS = /\s*\(([+-]?\d{3,4})\)\s*$/;
const SPREAD_AT_END = /^(.+?)\s+([+-]\d+(?:\.\d+)?)$/i;
const TOTAL_ONLY = /^(over|under|o|u)\s+([+-]?\d+(?:\.\d+)?)$/i;
const OVER_UNDER_WITH_SUBJECT = /^(.+?)\s+(over|under|o|u)\s+([+-]?\d+(?:\.\d+)?)(?:\s+(.+))?$/i;
const MONEYLINE_AT_END = /^(.+?)\s+(ml|moneyline)$/i;
const PROP_TERMS = [
  "assist",
  "assists",
  "base",
  "bases",
  "goal",
  "goals",
  "hit",
  "hits",
  "hr",
  "point",
  "points",
  "rebound",
  "rebounds",
  "rbi",
  "run",
  "runs",
  "save",
  "saves",
  "shot",
  "shots",
  "strikeout",
  "strikeouts",
  "yard",
  "yards",
];

export function parseSideString(side: string): ParsedSide {
  const cleaned = normalizeInput(side);
  if (!cleaned) {
    return { competitorName: "", marketType: "UNKNOWN", confidence: 0.2 };
  }

  const total = cleaned.match(TOTAL_ONLY);
  if (total) {
    return {
      competitorName: "",
      marketType: "TOTAL",
      line: Number(total[2]),
      direction: normalizeDirection(total[1]),
      confidence: 0.95,
    };
  }

  const subjectTotal = cleaned.match(OVER_UNDER_WITH_SUBJECT);
  if (subjectTotal) {
    const statLabel = subjectTotal[4]?.trim();
    const isProp = statLabel ? looksLikePropStat(statLabel) : true;
    return {
      competitorName: subjectTotal[1].trim(),
      marketType: isProp ? "PROP" : "TOTAL",
      line: Number(subjectTotal[3]),
      direction: normalizeDirection(subjectTotal[2]),
      confidence: isProp ? 0.45 : 0.7,
    };
  }

  const moneyline = cleaned.match(MONEYLINE_AT_END);
  if (moneyline) {
    return {
      competitorName: moneyline[1].trim(),
      marketType: "ML",
      confidence: 0.95,
    };
  }

  const spread = cleaned.match(SPREAD_AT_END);
  if (spread) {
    return {
      competitorName: spread[1].trim(),
      marketType: "SPREAD",
      line: Number(spread[2]),
      confidence: 0.95,
    };
  }

  return {
    competitorName: cleaned,
    marketType: "UNKNOWN",
    confidence: 0.2,
  };
}

function normalizeInput(side: string): string {
  return String(side ?? "")
    .replace(TRAILING_AMERICAN_ODDS, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDirection(value: string): "OVER" | "UNDER" {
  return value.toLowerCase().startsWith("o") ? "OVER" : "UNDER";
}

function looksLikePropStat(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z\s]/g, " ");
  const terms = normalized.split(/\s+/).filter(Boolean);
  return terms.some((term) => PROP_TERMS.includes(term));
}

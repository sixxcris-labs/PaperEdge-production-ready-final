const STATUS_LABEL_MAP: Record<string, string> = {
  "pending verification": "pending_verification",
  "locked paper trade": "locked_paper_trade",
  "locked paper trade, upgraded": "locked_paper_trade_upgraded",
  "replaced/removed": "replaced_removed",
  "settled win": "settled_win",
  "settled loss": "settled_loss",
  "settled push/void": "settled_push_void",
  "settled push": "settled_push_void",
};

export interface ParsedTrade {
  customTradeId: string;
  tradeDate: Date;
  eventName: string;
  marketType: string;
  player: string;
  lineValue: number;
  bookAName: string;
  sideA: string;
  oddsA: number;
  stakeA: number;
  bookBName: string;
  sideB: string;
  oddsB: number;
  stakeB: number;
  expectedProfitRange: string;
  status: string;
  notes: string;
}

const TRADE_BLOCK_SEPARATOR = /\n\s*-{3,}\s*\n|\n{3,}/;

export function splitTradeBlocks(text: string): string[] {
  // Ensure every "Trade ID:" line that appears mid-text becomes a block
  // boundary, so trades separated by a single blank line (or no blank line)
  // are split correctly — not just the `---` / triple-newline format.
  const withSeps = text.trim().replace(/\n(?=Trade ID:)/gi, "\n\n\n\n");
  return withSeps
    .split(TRADE_BLOCK_SEPARATOR)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function normalizeTradePaste(text: string, fallbackDate = new Date()): string {
  return splitTradeBlocks(text)
    .map((block) => normalizeTradeBlock(block, fallbackDate))
    .join("\n\n---\n\n");
}

function mapStatus(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  return STATUS_LABEL_MAP[normalized] ?? normalized.replace(/\s+/g, "_");
}

function parseField(lines: string[], key: string): string {
  const prefix = key.toLowerCase() + ":";
  for (const line of lines) {
    if (line.toLowerCase().startsWith(prefix)) {
      return line.substring(key.length + 1).trim();
    }
  }
  return "";
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateKey(date: Date): string {
  return formatLocalDate(date).replace(/-/g, "");
}

function firstBookName(raw: string): string {
  return raw.split(/\s+or\s+/i)[0].trim();
}

function parseLineValue(raw: string): number {
  const direct = parseFloat(raw);
  if (!isNaN(direct)) return direct;
  // Handle handicap strings like "M80 +4.5 / paiN -4.5" — extract first number
  // not immediately preceded by a letter (skip team codes like "M80").
  const match = raw.match(/(?<![A-Za-z])[+-]?\d+\.?\d*/);
  return match ? parseFloat(match[0]) : 0;
}

function inferMarket(sideA: string, sideB: string): string {
  const combined = `${sideA} ${sideB}`;
  if (/\bmoneyline\b|\bml\b/i.test(combined)) return "Moneyline";
  if (/\bspread\b/i.test(combined)) return "Spread";
  if (/\btotal\b|\bover\b|\bunder\b/i.test(combined)) return "Total";
  return "Manual Paste";
}

function stripMarketLabel(side: string, market: string): string {
  let value = side.trim();
  if (market === "Moneyline") {
    value = value.replace(/\bmoneyline\b|\bml\b/gi, "");
  }
  return value.replace(/\s+/g, " ").trim() || side.trim();
}

function slugPart(value: string): string {
  return (
    value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "TRADE"
  );
}

function collectNotes(lines: string[]): string {
  let notes = "";
  let inNotes = false;
  const noteLines: string[] = [];
  for (const line of lines) {
    if (inNotes) {
      noteLines.push(line);
    } else if (line.toLowerCase().startsWith("notes:")) {
      notes = line.substring(6).trim();
      inNotes = true;
    }
  }
  if (noteLines.length > 0) return [notes, ...noteLines].join("\n").trim();
  return notes;
}

function normalizeTradeBlock(block: string, fallbackDate: Date): string {
  const lines = block.split("\n");

  const bookAName = firstBookName(parseField(lines, "Book A"));
  const sideA = parseField(lines, "Side A");
  const oddsA = parseField(lines, "Odds A");
  const stakeA = parseField(lines, "Stake A");
  const bookBName = firstBookName(parseField(lines, "Book B"));
  const sideB = parseField(lines, "Side B");
  const oddsB = parseField(lines, "Odds B");
  const stakeB = parseField(lines, "Stake B");

  const hasTwoLegs =
    bookAName && sideA && oddsA && stakeA && bookBName && sideB && oddsB && stakeB;
  if (!hasTwoLegs) return block.trim();

  const existingMarket = parseField(lines, "Market");
  const market = existingMarket || inferMarket(sideA, sideB);
  const sideATeam = stripMarketLabel(sideA, market);
  const sideBTeam = stripMarketLabel(sideB, market);
  const tradeDate = parseField(lines, "Date") || formatLocalDate(fallbackDate);
  const tradeId =
    parseField(lines, "Trade ID") ||
    `${slugPart(sideATeam)}-${slugPart(sideBTeam)}-${formatDateKey(fallbackDate)}`;
  const eventName = parseField(lines, "Event") || `${sideATeam} vs ${sideBTeam}`;
  const lineValue = parseField(lines, "Line") || "0";
  const player = parseField(lines, "Player");
  const expectedProfitRange = parseField(lines, "Expected Profit Range");
  const status = parseField(lines, "Status") || "Pending Verification";
  const notes = collectNotes(lines);

  const normalized = [
    `Trade ID: ${tradeId}`,
    `Date: ${tradeDate}`,
    `Event: ${eventName}`,
    `Market: ${market}`,
    player ? `Player: ${player}` : null,
    `Line: ${lineValue}`,
    "",
    `Book A: ${bookAName}`,
    `Side A: ${sideA}`,
    `Odds A: ${oddsA}`,
    `Stake A: ${stakeA}`,
    "",
    `Book B: ${bookBName}`,
    `Side B: ${sideB}`,
    `Odds B: ${oddsB}`,
    `Stake B: ${stakeB}`,
    expectedProfitRange ? "" : null,
    expectedProfitRange ? `Expected Profit Range: ${expectedProfitRange}` : null,
    `Status: ${status}`,
    notes ? `Notes: ${notes}` : null,
  ];

  return normalized.filter((line) => line !== null).join("\n").trim();
}

function parseStake(raw: string): number {
  return parseFloat(raw.replace(/[$,\s]/g, "")) || 0;
}

function parseOdds(raw: string): number {
  const clean = raw.trim();
  return parseInt(clean.replace(/[^0-9+-]/g, ""), 10) || 0;
}

function parseTradeDate(raw: string, fallbackDate: Date): Date {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? fallbackDate : d;
}

export function parseTradeBlock(
  text: string,
  fallbackDate = new Date()
): ParsedTrade {
  const normalized = normalizeTradeBlock(text.trim(), fallbackDate);
  const lines = normalized.split("\n");
  const notes = collectNotes(lines);

  const lineValue = parseLineValue(parseField(lines, "Line"));

  return {
    customTradeId: parseField(lines, "Trade ID") || `TRADE-${fallbackDate.getTime()}`,
    tradeDate: parseTradeDate(parseField(lines, "Date"), fallbackDate),
    eventName: parseField(lines, "Event"),
    marketType: parseField(lines, "Market"),
    player: parseField(lines, "Player"),
    lineValue,
    bookAName: firstBookName(parseField(lines, "Book A")),
    sideA: parseField(lines, "Side A"),
    oddsA: parseOdds(parseField(lines, "Odds A")),
    stakeA: parseStake(parseField(lines, "Stake A")),
    bookBName: firstBookName(parseField(lines, "Book B")),
    sideB: parseField(lines, "Side B"),
    oddsB: parseOdds(parseField(lines, "Odds B")),
    stakeB: parseStake(parseField(lines, "Stake B")),
    expectedProfitRange: parseField(lines, "Expected Profit Range"),
    status: mapStatus(parseField(lines, "Status") || "pending_verification"),
    notes,
  };
}

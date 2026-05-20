// Pure parsers for the structured-text trade importer's *settlement* blocks.
// Kept out of the "use server" action file so they're unit-testable and
// reusable (a "use server" module may only export async functions).

export interface ParsedSettlement {
  customTradeId: string;
  winningSide: string;
  finalStat: string;
  /** null when the text gave no explicit P/L — caller derives it from legs. */
  actualProfitLoss: number | null;
  resultNotes: string;
}

/** Read a `Key: Value` line (case-insensitive key match). */
export function parseField(lines: string[], key: string): string {
  const prefix = key.toLowerCase() + ":";
  for (const line of lines) {
    if (line.toLowerCase().startsWith(prefix)) {
      return line.substring(key.length + 1).trim();
    }
  }
  return "";
}

/**
 * A block that reports an outcome for an existing trade rather than defining a
 * new one: it has a Result / Winning Side / Actual P/L line but no "Book A".
 */
export function isSettlementBlock(text: string): boolean {
  const lines = text.split("\n");
  const has = (k: string) =>
    lines.some((l) => l.toLowerCase().startsWith(k.toLowerCase() + ":"));
  const hasOutcome =
    has("Result") || has("Winning Side") || has("Actual Paper Profit/Loss");
  return hasOutcome && !has("Book A");
}

/** "+$29.27" -> 29.27, "-$12.00" -> -12, "($5.10)" -> -5.1, "" -> null. */
export function parseSignedAmount(raw: string): number | null {
  if (!raw.trim()) return null;
  const negative = /^\s*-|^\s*\(|\bloss\b/i.test(raw);
  const digits = raw.replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const n = parseFloat(digits);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

export function parseSettlementBlock(text: string): ParsedSettlement {
  const lines = text.split("\n");

  // Settlement Notes can be multiline — capture everything after the key.
  let resultNotes = "";
  let inNotes = false;
  const noteLines: string[] = [];
  for (const line of lines) {
    if (inNotes) {
      noteLines.push(line);
    } else if (line.toLowerCase().startsWith("settlement notes:")) {
      resultNotes = line.substring("settlement notes:".length).trim();
      inNotes = true;
    }
  }
  if (noteLines.length > 0)
    resultNotes = [resultNotes, ...noteLines].join("\n").trim();

  const plRaw =
    parseField(lines, "Actual Paper Profit/Loss") ||
    parseField(lines, "Actual Profit/Loss") ||
    parseField(lines, "Actual Paper Profit") ||
    parseField(lines, "Profit/Loss");

  return {
    customTradeId: parseField(lines, "Trade ID"),
    winningSide: parseField(lines, "Winning Side"),
    finalStat: parseField(lines, "Final Stat"),
    actualProfitLoss: parseSignedAmount(plRaw),
    resultNotes,
  };
}

/** Derive the settled status the same way settleTrade does. */
export function settledStatusFor(
  winningSide: string,
  profitLoss: number
): "settled_push_void" | "settled_loss" | "settled_win" {
  const ws = winningSide.toLowerCase();
  if (ws.includes("push") || ws.includes("void")) return "settled_push_void";
  if (profitLoss < 0) return "settled_loss";
  return "settled_win";
}

"use server";

import { revalidatePath } from "next/cache";
import { db } from "@paperedge/database";
import { cashArbHedge, cashPayout } from "@paperedge/core/calc";
import {
  isSettlementBlock,
  parseSettlementBlock,
  settledStatusFor,
  type ParsedSettlement,
} from "@paperedge/core/import-settlement";
import type { ManualTradeInput } from "./manual-schema";

const LOCAL_USER_EMAIL = "local@paperedge.app";

export async function createManualTrade(input: ManualTradeInput): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });

  // Run the arbitrage calculator so numeric expected-profit fields are always
  // populated. This powers the dashboard KPIs and P/L tracker correctly.
  let calcFields: {
    expectedProfitIfA: number;
    expectedProfitIfB: number;
    worstCasePL: number;
    bestCasePL: number;
    totalStakeExposure: number;
    hedgeStake: number;
    expectedRoiPct: number;
  } | null = null;

  if (input.oddsA !== 0 && input.oddsB !== 0) {
    try {
      const r = cashArbHedge(input.stakeA, input.oddsA, input.oddsB);
      calcFields = {
        expectedProfitIfA: r.profitIfA,
        expectedProfitIfB: r.profitIfB,
        worstCasePL: Math.min(r.profitIfA, r.profitIfB),
        bestCasePL: Math.max(r.profitIfA, r.profitIfB),
        totalStakeExposure: r.totalStake,
        hedgeStake: r.stakeB,
        expectedRoiPct: r.totalStake > 0 ? (r.profitIfA / r.totalStake) * 100 : 0,
      };
    } catch {
      // If odds are invalid, fall back to simple stake sum — don't block the save.
      calcFields = null;
    }
  }

  const trade = await db.paperTrade.create({
    data: {
      userId: user.id,
      customTradeId: input.customTradeId,
      tradeDate: new Date(input.tradeDate),
      eventName: input.eventName,
      marketType: input.marketType,
      player: input.player || null,
      lineValue: input.lineValue,
      sport: "unknown",
      gamePeriod: "full_game",
      tradeType: "cash_arbitrage",
      bonusType: "none",
      goal: "cash_arb_profit",
      requiredCalculator: "arbitrage",
      status: input.status,
      source: "manual",
      expectedProfitRange: input.expectedProfitRange || null,
      notes: input.notes || null,
      // Numeric expected-profit fields — use calc output when available.
      totalStakeExposure: calcFields?.totalStakeExposure ?? (input.stakeA + input.stakeB),
      expectedProfitIfA: calcFields?.expectedProfitIfA ?? null,
      expectedProfitIfB: calcFields?.expectedProfitIfB ?? null,
      worstCasePL: calcFields?.worstCasePL ?? null,
      bestCasePL: calcFields?.bestCasePL ?? null,
      hedgeStake: calcFields?.hedgeStake ?? null,
      expectedRoiPct: calcFields?.expectedRoiPct ?? null,
    },
  });

  await db.tradeLeg.create({
    data: {
      tradeId: trade.id,
      bookId: input.bookAId,
      legLabel: "A",
      side: input.sideA,
      oddsAmerican: input.oddsA,
      lineValue: input.lineValue,
      stake: input.stakeA,
    },
  });

  await db.tradeLeg.create({
    data: {
      tradeId: trade.id,
      bookId: input.bookBId,
      legLabel: "B",
      side: input.sideB,
      oddsAmerican: input.oddsB,
      lineValue: input.lineValue,
      stake: input.stakeB,
    },
  });

  revalidatePath("/trades");
  revalidatePath("/");
  return trade.id;
}

async function findOrCreateBook(userId: string, name: string): Promise<string> {
  const existing = await db.book.findFirst({ where: { userId, name } });
  if (existing) return existing.id;
  const created = await db.book.create({
    data: { userId, name, role: "unknown", available: false },
  });
  return created.id;
}

export async function importTradesFromText(
  raw: string
): Promise<{ created: number; settled: number; errors: string[] }> {
  const user = await db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });

  const blocks = raw.trim().split(/\n-{3,}\n|\n{3,}/).map((b) => b.trim()).filter(Boolean);
  const errors: string[] = [];
  let created = 0;
  let settled = 0;

  for (const block of blocks) {
    try {
      // A settlement block carries a result for an already-imported trade
      // (Trade ID + Result/Winning Side, but no Book A). Route it to the
      // settle path instead of mis-creating a junk duplicate trade.
      if (isSettlementBlock(block)) {
        const s = parseSettlementBlock(block);
        const outcome = await applySettlement(user.id, s);
        if (outcome === "settled") settled++;
        continue;
      }

      const parsed = parseTradeBlock(block);
      const bookAId = await findOrCreateBook(user.id, parsed.bookAName);
      const bookBId = await findOrCreateBook(user.id, parsed.bookBName);

      let importCalc = null;
      if (parsed.oddsA !== 0 && parsed.oddsB !== 0) {
        try {
          const r = cashArbHedge(parsed.stakeA, parsed.oddsA, parsed.oddsB);
          importCalc = {
            expectedProfitIfA: r.profitIfA,
            expectedProfitIfB: r.profitIfB,
            worstCasePL: Math.min(r.profitIfA, r.profitIfB),
            bestCasePL: Math.max(r.profitIfA, r.profitIfB),
            totalStakeExposure: r.totalStake,
            hedgeStake: r.stakeB,
            expectedRoiPct: r.totalStake > 0 ? (r.profitIfA / r.totalStake) * 100 : 0,
          };
        } catch { importCalc = null; }
      }

      const trade = await db.paperTrade.create({
        data: {
          userId: user.id,
          customTradeId: parsed.customTradeId,
          tradeDate: parsed.tradeDate,
          eventName: parsed.eventName,
          marketType: parsed.marketType,
          player: parsed.player || null,
          lineValue: parsed.lineValue,
          sport: "unknown",
          gamePeriod: "full_game",
          tradeType: "cash_arbitrage",
          bonusType: "none",
          goal: "cash_arb_profit",
          requiredCalculator: "arbitrage",
          status: parsed.status,
          source: "manual",
          expectedProfitRange: parsed.expectedProfitRange || null,
          notes: parsed.notes || null,
          totalStakeExposure: importCalc?.totalStakeExposure ?? (parsed.stakeA + parsed.stakeB),
          expectedProfitIfA: importCalc?.expectedProfitIfA ?? null,
          expectedProfitIfB: importCalc?.expectedProfitIfB ?? null,
          worstCasePL: importCalc?.worstCasePL ?? null,
          bestCasePL: importCalc?.bestCasePL ?? null,
          hedgeStake: importCalc?.hedgeStake ?? null,
          expectedRoiPct: importCalc?.expectedRoiPct ?? null,
        },
      });

      await db.tradeLeg.create({
        data: {
          tradeId: trade.id,
          bookId: bookAId,
          legLabel: "A",
          side: parsed.sideA,
          oddsAmerican: parsed.oddsA,
          lineValue: parsed.lineValue,
          stake: parsed.stakeA,
        },
      });

      await db.tradeLeg.create({
        data: {
          tradeId: trade.id,
          bookId: bookBId,
          legLabel: "B",
          side: parsed.sideB,
          oddsAmerican: parsed.oddsB,
          lineValue: parsed.lineValue,
          stake: parsed.stakeB,
        },
      });

      created++;
    } catch (e: any) {
      errors.push(e.message ?? String(e));
    }
  }

  revalidatePath("/trades");
  revalidatePath("/");
  return { created, settled, errors };
}

/**
 * Settle an already-imported trade from a parsed settlement block.
 * Mirrors settleTrade in app/trades/[id]/settle-actions.ts: derives status
 * from the winning side / P/L, writes a Result, and applies realized P/L to
 * the bankroll exactly once. Idempotent — re-importing a settled trade is a
 * no-op for status and bankroll.
 */
async function applySettlement(
  userId: string,
  s: ParsedSettlement
): Promise<"settled" | "already"> {
  if (!s.customTradeId) {
    throw new Error("Settlement block is missing a Trade ID");
  }

  const trade = await db.paperTrade.findFirst({
    where: { userId, customTradeId: s.customTradeId },
    include: { legs: { include: { book: true } }, result: true },
    orderBy: { createdAt: "desc" },
  });
  if (!trade) {
    throw new Error(
      `Settlement for "${s.customTradeId}": no matching imported trade found`
    );
  }
  // Already settled (has a recorded result) — don't double-count bankroll.
  if (trade.result?.settledAt) return "already";

  const legA = trade.legs.find((l) => l.legLabel === "A");
  const legB = trade.legs.find((l) => l.legLabel === "B");
  const ws = s.winningSide.toLowerCase();

  // Identify the winning leg by book name or side text in "Winning Side".
  let winLeg = null as typeof legA | null;
  let loseLeg = null as typeof legA | null;
  for (const [w, o] of [
    [legA, legB],
    [legB, legA],
  ] as const) {
    if (!w) continue;
    const byBook = w.book?.name && ws.includes(w.book.name.toLowerCase());
    const bySide = w.side && ws.includes(w.side.toLowerCase());
    if (byBook || bySide) {
      winLeg = w;
      loseLeg = o ?? null;
      break;
    }
  }

  let actualPayout: number | null = null;
  let pl = s.actualProfitLoss;
  if (winLeg) {
    try {
      const p = cashPayout(winLeg.stake, winLeg.oddsAmerican);
      actualPayout = p.totalReturn;
      // Derive net P/L only if the text didn't state it explicitly.
      if (pl == null) pl = p.profit - (loseLeg?.stake ?? 0);
    } catch {
      /* invalid odds — fall through to pl ?? 0 */
    }
  }
  if (pl == null) pl = 0;

  const status = settledStatusFor(s.winningSide, pl);

  await db.result.upsert({
    where: { tradeId: trade.id },
    update: {
      winningSide: s.winningSide || null,
      finalStat: s.finalStat || null,
      actualPayout,
      actualProfitLoss: pl,
      matchedExpectedOutcome:
        trade.worstCasePL != null ? pl >= trade.worstCasePL : null,
      resultNotes: s.resultNotes || null,
      settledAt: new Date(),
    },
    create: {
      tradeId: trade.id,
      winningSide: s.winningSide || null,
      finalStat: s.finalStat || null,
      actualPayout,
      actualProfitLoss: pl,
      matchedExpectedOutcome:
        trade.worstCasePL != null ? pl >= trade.worstCasePL : null,
      resultNotes: s.resultNotes || null,
      settledAt: new Date(),
    },
  });

  await db.paperTrade.update({
    where: { id: trade.id },
    data: { status },
  });

  const settings = await db.userSettings.findUnique({ where: { userId } });
  if (settings) {
    await db.userSettings.update({
      where: { userId },
      data: { currentBankroll: settings.currentBankroll + pl },
    });
  }

  return "settled";
}

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

function parseStake(raw: string): number {
  return parseFloat(raw.replace(/[$,\s]/g, "")) || 0;
}

function parseOdds(raw: string): number {
  const clean = raw.trim();
  return parseInt(clean.replace(/[^0-9+-]/g, ""), 10) || 0;
}

function parseTradeDate(raw: string): Date {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

interface ParsedTrade {
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

function parseTradeBlock(text: string): ParsedTrade {
  const lines = text.split("\n");

  // Notes can be multiline — grab everything after "Notes:" key
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
  if (noteLines.length > 0) notes = [notes, ...noteLines].join("\n").trim();

  const lineValue = parseFloat(parseField(lines, "Line")) || 0;

  return {
    customTradeId: parseField(lines, "Trade ID") || `TRADE-${Date.now()}`,
    tradeDate: parseTradeDate(parseField(lines, "Date")),
    eventName: parseField(lines, "Event"),
    marketType: parseField(lines, "Market"),
    player: parseField(lines, "Player"),
    lineValue,
    bookAName: parseField(lines, "Book A"),
    sideA: parseField(lines, "Side A"),
    oddsA: parseOdds(parseField(lines, "Odds A")),
    stakeA: parseStake(parseField(lines, "Stake A")),
    bookBName: parseField(lines, "Book B"),
    sideB: parseField(lines, "Side B"),
    oddsB: parseOdds(parseField(lines, "Odds B")),
    stakeB: parseStake(parseField(lines, "Stake B")),
    expectedProfitRange: parseField(lines, "Expected Profit Range"),
    status: mapStatus(parseField(lines, "Status") || "pending_verification"),
    notes,
  };
}

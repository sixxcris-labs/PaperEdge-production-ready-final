/**
 * One-off loader: 4 paper trades tested on May 18, 2026
 * (Spurs vs Thunder), each created then settled as a paper win.
 *
 * Mirrors the app's own importTradesFromText + settleTrade logic so the
 * rows are consistent with manual entry: same user, same arbitrage calc
 * fields, same Result model, same bankroll update.
 *
 * Idempotent: skips any trade whose customTradeId already exists.
 *
 * Run: npx tsx prisma/add-trades-2026-05-18.ts
 */
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../lib/generated/prisma/client";
import { cashArbHedge, cashPayout } from "../lib/calc";
import { resolveBetterSqlite3NativeBinding } from "../lib/better-sqlite3-binding";

const dbUrl = `file:${path.resolve(__dirname, "dev.db")}`;
const db = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: dbUrl,
    nativeBinding: resolveBetterSqlite3NativeBinding(),
  }),
});

const LOCAL_USER_EMAIL = "local@paperedge.app";
const TRADE_DATE = new Date("2026-05-18");
const EVENT = "San Antonio Spurs vs Oklahoma City Thunder";

interface TradeInput {
  customTradeId: string;
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
  notes: string;
  // Settlement
  winningSide: string;
  finalStat: string;
  actualProfitLoss: number;
  resultNotes: string;
}

const TRADES: TradeInput[] = [
  {
    customTradeId: "CHET-AST-001",
    marketType: "Player Assists",
    player: "Chet Holmgren",
    lineValue: 1.5,
    bookAName: "Novig",
    sideA: "Over 1.5 Assists",
    oddsA: 128,
    stakeA: 398,
    bookBName: "Sportzino",
    sideB: "Under 1.5 Assists",
    oddsB: -110,
    stakeB: 470,
    expectedProfitRange: "$29.27 to $39.44",
    notes: "Verified live on both books before game.",
    winningSide: "Sportzino, Under 1.5 Assists",
    finalStat: "Chet Holmgren finished with 0 assists",
    actualProfitLoss: 29.27,
    resultNotes:
      "Under 1.5 Assists won. Sportzino -110 stake $470 returned $427.27 profit. Novig $398 stake lost.",
  },
  {
    customTradeId: "CHET-STL-002",
    marketType: "Player Steals",
    player: "Chet Holmgren",
    lineValue: 0.5,
    bookAName: "Novig",
    sideA: "Over 0.5 Steals",
    oddsA: -124,
    stakeA: 496,
    bookBName: "Sportzino",
    sideB: "Under 0.5 Steals",
    oddsB: 155,
    stakeB: 360,
    expectedProfitRange: "$40.00 to $62.00",
    notes: "Verified live on both books before game.",
    winningSide: "Novig, Over 0.5 Steals",
    finalStat: "Chet Holmgren finished with 1 steal",
    actualProfitLoss: 40.0,
    resultNotes:
      "Over 0.5 Steals won. Novig -124 stake $496 returned $400.00 profit. Sportzino $360 stake lost.",
  },
  {
    customTradeId: "CARUSO-3PM-003",
    marketType: "Player Made Threes",
    player: "Alex Caruso",
    lineValue: 1.5,
    bookAName: "Sportzino",
    sideA: "Over 1.5 Made Threes",
    oddsA: 122,
    stakeA: 90,
    bookBName: "Novig",
    sideB: "Under 1.5 Made Threes",
    oddsB: 100,
    stakeB: 99,
    expectedProfitRange: "$9.00 to $10.80",
    notes: "Verified live on both books before game.",
    winningSide: "Sportzino, Over 1.5 Made Threes",
    finalStat: "Alex Caruso finished with 8 made threes",
    actualProfitLoss: 10.8,
    resultNotes:
      "Over 1.5 Made Threes won. Sportzino +122 stake $90 returned $109.80 profit. Novig $99 stake lost.",
  },
  {
    customTradeId: "KORNET-REB-004-UPGRADED",
    marketType: "Player Rebounds",
    player: "Luke Kornet",
    lineValue: 3.5,
    bookAName: "Bovada",
    sideA: "Over 3.5 Rebounds",
    oddsA: 150,
    stakeA: 410,
    bookBName: "Sportzino",
    sideB: "Under 3.5 Rebounds",
    oddsB: -105,
    stakeB: 500,
    expectedProfitRange: "$66.19 to $115.00",
    notes:
      "Replaced smaller Novig/Sportzino Luke Kornet rebounds trade. Status: Locked Paper Trade, upgraded.",
    winningSide: "Sportzino, Under 3.5 Rebounds",
    finalStat: "Luke Kornet finished with 3 rebounds",
    actualProfitLoss: 66.19,
    resultNotes:
      "Under 3.5 Rebounds won. Sportzino -105 stake $500 returned $476.19 profit. Bovada $410 stake lost.",
  },
];

async function findOrCreateBook(userId: string, name: string): Promise<string> {
  const existing = await db.book.findFirst({ where: { userId, name } });
  if (existing) return existing.id;
  const created = await db.book.create({
    data: { userId, name, role: "unknown", available: false },
  });
  return created.id;
}

async function main() {
  const user = await db.user.findUniqueOrThrow({
    where: { email: LOCAL_USER_EMAIL },
  });

  let created = 0;
  let skipped = 0;
  let bankrollDelta = 0;

  for (const t of TRADES) {
    const dup = await db.paperTrade.findFirst({
      where: { userId: user.id, customTradeId: t.customTradeId },
    });
    if (dup) {
      console.log(`SKIP  ${t.customTradeId} (already exists)`);
      skipped++;
      continue;
    }

    const bookAId = await findOrCreateBook(user.id, t.bookAName);
    const bookBId = await findOrCreateBook(user.id, t.bookBName);

    // Same expected-profit calc the app runs on import.
    let calc = null;
    try {
      const r = cashArbHedge(t.stakeA, t.oddsA, t.oddsB);
      calc = {
        expectedProfitIfA: r.profitIfA,
        expectedProfitIfB: r.profitIfB,
        worstCasePL: Math.min(r.profitIfA, r.profitIfB),
        bestCasePL: Math.max(r.profitIfA, r.profitIfB),
        totalStakeExposure: r.totalStake,
        hedgeStake: r.stakeB,
        expectedRoiPct:
          r.totalStake > 0 ? (r.profitIfA / r.totalStake) * 100 : 0,
      };
    } catch {
      calc = null;
    }

    const trade = await db.paperTrade.create({
      data: {
        userId: user.id,
        customTradeId: t.customTradeId,
        tradeDate: TRADE_DATE,
        eventName: EVENT,
        marketType: t.marketType,
        player: t.player,
        lineValue: t.lineValue,
        sport: "unknown",
        gamePeriod: "full_game",
        tradeType: "cash_arbitrage",
        bonusType: "none",
        goal: "cash_arb_profit",
        requiredCalculator: "arbitrage",
        status: "settled_win",
        source: "manual",
        expectedProfitRange: t.expectedProfitRange,
        notes: t.notes,
        totalStakeExposure: calc?.totalStakeExposure ?? t.stakeA + t.stakeB,
        expectedProfitIfA: calc?.expectedProfitIfA ?? null,
        expectedProfitIfB: calc?.expectedProfitIfB ?? null,
        worstCasePL: calc?.worstCasePL ?? null,
        bestCasePL: calc?.bestCasePL ?? null,
        hedgeStake: calc?.hedgeStake ?? null,
        expectedRoiPct: calc?.expectedRoiPct ?? null,
      },
    });

    await db.tradeLeg.create({
      data: {
        tradeId: trade.id,
        bookId: bookAId,
        legLabel: "A",
        side: t.sideA,
        oddsAmerican: t.oddsA,
        lineValue: t.lineValue,
        stake: t.stakeA,
      },
    });
    await db.tradeLeg.create({
      data: {
        tradeId: trade.id,
        bookId: bookBId,
        legLabel: "B",
        side: t.sideB,
        oddsAmerican: t.oddsB,
        lineValue: t.lineValue,
        stake: t.stakeB,
      },
    });

    // Gross return of the winning leg (for the Result.actualPayout field).
    const winStake = t.winningSide.startsWith(t.bookAName)
      ? t.stakeA
      : t.stakeB;
    const winOdds = t.winningSide.startsWith(t.bookAName) ? t.oddsA : t.oddsB;
    const actualPayout = cashPayout(winStake, winOdds).totalReturn;

    await db.result.create({
      data: {
        tradeId: trade.id,
        winningSide: t.winningSide,
        finalStat: t.finalStat,
        actualPayout,
        actualProfitLoss: t.actualProfitLoss,
        matchedExpectedOutcome: true,
        resultNotes: t.resultNotes,
        settledAt: new Date(),
      },
    });

    bankrollDelta += t.actualProfitLoss;
    created++;
    console.log(
      `ADD   ${t.customTradeId}  net +$${t.actualProfitLoss.toFixed(2)}`
    );
  }

  // Apply realized P/L to bankroll, same as settleTrade does on first settle.
  if (bankrollDelta !== 0) {
    const settings = await db.userSettings.findUnique({
      where: { userId: user.id },
    });
    if (settings) {
      await db.userSettings.update({
        where: { userId: user.id },
        data: { currentBankroll: settings.currentBankroll + bankrollDelta },
      });
    }
  }

  console.log(
    `\nDone. created=${created} skipped=${skipped} bankrollDelta=+$${bankrollDelta.toFixed(2)}`
  );
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    db.$disconnect();
    process.exit(1);
  });

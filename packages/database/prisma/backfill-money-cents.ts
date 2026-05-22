import { disconnectDb, db } from "@paperedge/database";
import { pathToFileURL } from "node:url";

interface BackfillPair {
  table: string;
  centsColumn: string;
  dollarsColumn: string;
}

export const MONEY_CENTS_BACKFILL_PAIRS: readonly BackfillPair[] = [
  { table: "UserSettings", centsColumn: "startingBankrollCents", dollarsColumn: "startingBankroll" },
  { table: "UserSettings", centsColumn: "currentBankrollCents", dollarsColumn: "currentBankroll" },
  { table: "Book", centsColumn: "currentBalanceCents", dollarsColumn: "currentBalance" },
  { table: "Book", centsColumn: "rolloverRemainingCents", dollarsColumn: "rolloverRemaining" },
  { table: "Book", centsColumn: "maxBetLimitCents", dollarsColumn: "maxBetLimit" },
  { table: "PaperTrade", centsColumn: "expectedProfitIfACents", dollarsColumn: "expectedProfitIfA" },
  { table: "PaperTrade", centsColumn: "expectedProfitIfBCents", dollarsColumn: "expectedProfitIfB" },
  { table: "PaperTrade", centsColumn: "worstCasePLCents", dollarsColumn: "worstCasePL" },
  { table: "PaperTrade", centsColumn: "bestCasePLCents", dollarsColumn: "bestCasePL" },
  { table: "PaperTrade", centsColumn: "totalStakeExposureCents", dollarsColumn: "totalStakeExposure" },
  { table: "PaperTrade", centsColumn: "hedgeStakeCents", dollarsColumn: "hedgeStake" },
  { table: "PaperTrade", centsColumn: "promoConversionValueCents", dollarsColumn: "promoConversionValue" },
  { table: "PaperTrade", centsColumn: "lowHoldLossAmountCents", dollarsColumn: "lowHoldLossAmount" },
  { table: "TradeOpportunity", centsColumn: "stakeACents", dollarsColumn: "stakeA" },
  { table: "TradeOpportunity", centsColumn: "liquidityACents", dollarsColumn: "liquidityA" },
  { table: "TradeOpportunity", centsColumn: "verifiedLiquidityACents", dollarsColumn: "verifiedLiquidityA" },
  { table: "TradeOpportunity", centsColumn: "stakeBCents", dollarsColumn: "stakeB" },
  { table: "TradeOpportunity", centsColumn: "liquidityBCents", dollarsColumn: "liquidityB" },
  { table: "TradeOpportunity", centsColumn: "verifiedLiquidityBCents", dollarsColumn: "verifiedLiquidityB" },
  { table: "TradeOpportunity", centsColumn: "totalExposureCents", dollarsColumn: "totalExposure" },
  { table: "TradeOpportunity", centsColumn: "profitIfAWinsCents", dollarsColumn: "profitIfAWins" },
  { table: "TradeOpportunity", centsColumn: "profitIfBWinsCents", dollarsColumn: "profitIfBWins" },
  { table: "TradeOpportunity", centsColumn: "expectedProfitMinCents", dollarsColumn: "expectedProfitMin" },
  { table: "TradeOpportunity", centsColumn: "expectedProfitMaxCents", dollarsColumn: "expectedProfitMax" },
  { table: "TradeOpportunity", centsColumn: "outsideLossCents", dollarsColumn: "outsideLoss" },
  { table: "TradeOpportunity", centsColumn: "middleProfitCents", dollarsColumn: "middleProfit" },
  { table: "TradeLeg", centsColumn: "stakeCents", dollarsColumn: "stake" },
  { table: "TradeLeg", centsColumn: "maxBetAtBookCents", dollarsColumn: "maxBetAtBook" },
  { table: "Result", centsColumn: "actualPayoutCents", dollarsColumn: "actualPayout" },
  { table: "Result", centsColumn: "actualProfitLossCents", dollarsColumn: "actualProfitLoss" },
  { table: "Bonus", centsColumn: "bonusAmountCents", dollarsColumn: "bonusAmount" },
  { table: "Bonus", centsColumn: "depositAmountCents", dollarsColumn: "depositAmount" },
  { table: "Bonus", centsColumn: "requiredBettingVolumeCents", dollarsColumn: "requiredBettingVolume" },
  { table: "Bonus", centsColumn: "volumeCompletedCents", dollarsColumn: "volumeCompleted" },
  { table: "Bonus", centsColumn: "volumeRemainingCents", dollarsColumn: "volumeRemaining" },
  { table: "BankrollSnapshot", centsColumn: "currentBankrollCents", dollarsColumn: "currentBankroll" },
  { table: "BankrollSnapshot", centsColumn: "dailyPLCents", dollarsColumn: "dailyPL" },
  { table: "BankrollSnapshot", centsColumn: "weeklyPLCents", dollarsColumn: "weeklyPL" },
  { table: "BankrollSnapshot", centsColumn: "monthlyPLCents", dollarsColumn: "monthlyPL" },
  { table: "BankrollSnapshot", centsColumn: "drawdownCents", dollarsColumn: "drawdown" },
] as const;

export interface BackfillUpdateResult {
  table: string;
  centsColumn: string;
  dollarsColumn: string;
  updatedRows: number;
}

export interface BackfillSummary {
  totalUpdatedRows: number;
  perField: BackfillUpdateResult[];
  perTable: Record<string, number>;
}

type RawSqlClient = {
  $transaction<T>(fn: (tx: RawSqlClient) => Promise<T>): Promise<T>;
  $executeRawUnsafe(query: string): Promise<number>;
};

export function buildBackfillSql(pair: BackfillPair): string {
  return [
    `UPDATE "${pair.table}"`,
    `SET "${pair.centsColumn}" = CAST(ROUND("${pair.dollarsColumn}" * 100.0) AS INTEGER)`,
    `WHERE "${pair.centsColumn}" IS NULL`,
    `AND "${pair.dollarsColumn}" IS NOT NULL;`,
  ].join(" ");
}

export async function backfillMoneyCents(
  client: RawSqlClient = db,
): Promise<BackfillSummary> {
  const perField: BackfillUpdateResult[] = [];

  await client.$transaction(async (tx) => {
    for (const pair of MONEY_CENTS_BACKFILL_PAIRS) {
      const updatedRows = await tx.$executeRawUnsafe(buildBackfillSql(pair));
      perField.push({
        table: pair.table,
        centsColumn: pair.centsColumn,
        dollarsColumn: pair.dollarsColumn,
        updatedRows,
      });
    }
  });

  const perTable: Record<string, number> = {};
  let totalUpdatedRows = 0;
  for (const row of perField) {
    perTable[row.table] = (perTable[row.table] ?? 0) + row.updatedRows;
    totalUpdatedRows += row.updatedRows;
  }

  return { totalUpdatedRows, perField, perTable };
}

async function main() {
  const summary = await backfillMoneyCents();
  console.log("Money-cents backfill complete.");
  for (const [table, count] of Object.entries(summary.perTable)) {
    console.log(`- ${table}: ${count} rows updated`);
  }
  console.log(`Total rows updated: ${summary.totalUpdatedRows}`);
}

const isDirectRun =
  process.argv[1] != null &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  main()
    .catch((error) => {
      console.error("Money-cents backfill failed.");
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await disconnectDb();
    });
}

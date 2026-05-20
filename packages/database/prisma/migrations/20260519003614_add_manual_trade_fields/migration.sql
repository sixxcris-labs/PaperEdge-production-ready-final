-- AlterTable
ALTER TABLE "PaperTrade" ADD COLUMN "customTradeId" TEXT;
ALTER TABLE "PaperTrade" ADD COLUMN "expectedProfitRange" TEXT;
ALTER TABLE "PaperTrade" ADD COLUMN "player" TEXT;

-- AlterTable
ALTER TABLE "Result" ADD COLUMN "finalStat" TEXT;

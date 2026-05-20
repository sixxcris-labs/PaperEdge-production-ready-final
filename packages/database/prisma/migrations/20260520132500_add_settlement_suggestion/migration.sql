-- AlterTable
ALTER TABLE "PaperTrade" ADD COLUMN "needsManualSettle" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SettlementSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paperTradeId" TEXT NOT NULL,
    "suggestedWinningSide" TEXT,
    "suggestedProfitLoss" REAL,
    "confidence" REAL NOT NULL,
    "tier" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "providerName" TEXT,
    "rawApiResponse" JSONB,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SettlementSuggestion_paperTradeId_fkey" FOREIGN KEY ("paperTradeId") REFERENCES "PaperTrade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SettlementSuggestion_paperTradeId_key" ON "SettlementSuggestion"("paperTradeId");

-- CreateIndex
CREATE INDEX "SettlementSuggestion_status_idx" ON "SettlementSuggestion"("status");

-- CreateIndex
CREATE INDEX "SettlementSuggestion_tier_idx" ON "SettlementSuggestion"("tier");

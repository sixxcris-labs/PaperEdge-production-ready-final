-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "activeVerificationTradeId" TEXT;

-- CreateTable
CREATE TABLE "BookDeepLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "marketType" TEXT NOT NULL,
    "urlTemplate" TEXT NOT NULL,
    "queryParam" TEXT,
    "fallbackUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookDeepLink_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Book" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'unknown',
    "available" BOOLEAN NOT NULL DEFAULT true,
    "currentBalance" REAL NOT NULL DEFAULT 0,
    "rolloverRemaining" REAL NOT NULL DEFAULT 0,
    "maxBetLimit" REAL,
    "kycCompleted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Book_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Book" ("createdAt", "currentBalance", "id", "kycCompleted", "maxBetLimit", "name", "notes", "role", "rolloverRemaining", "userId") SELECT "createdAt", "currentBalance", "id", "kycCompleted", "maxBetLimit", "name", "notes", "role", "rolloverRemaining", "userId" FROM "Book";
DROP TABLE "Book";
ALTER TABLE "new_Book" RENAME TO "Book";
CREATE TABLE "new_PaperTrade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tradeDate" DATETIME NOT NULL,
    "sport" TEXT NOT NULL,
    "league" TEXT,
    "eventName" TEXT NOT NULL,
    "marketType" TEXT NOT NULL,
    "gamePeriod" TEXT NOT NULL,
    "lineValue" REAL,
    "tradeType" TEXT NOT NULL,
    "bonusType" TEXT NOT NULL DEFAULT 'none',
    "goal" TEXT NOT NULL,
    "requiredCalculator" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "oddsjamSnapshotJson" TEXT,
    "importedAt" DATETIME,
    "expectedProfitIfA" REAL,
    "expectedProfitIfB" REAL,
    "worstCasePL" REAL,
    "bestCasePL" REAL,
    "totalStakeExposure" REAL,
    "hedgeStake" REAL,
    "promoConversionValue" REAL,
    "lowHoldLossAmount" REAL,
    "lowHoldLossPct" REAL,
    "expectedRoiPct" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaperTrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PaperTrade" ("bestCasePL", "bonusType", "createdAt", "eventName", "expectedProfitIfA", "expectedProfitIfB", "expectedRoiPct", "gamePeriod", "goal", "hedgeStake", "id", "league", "lineValue", "lowHoldLossAmount", "lowHoldLossPct", "marketType", "notes", "promoConversionValue", "requiredCalculator", "sport", "status", "totalStakeExposure", "tradeDate", "tradeType", "updatedAt", "userId", "worstCasePL") SELECT "bestCasePL", "bonusType", "createdAt", "eventName", "expectedProfitIfA", "expectedProfitIfB", "expectedRoiPct", "gamePeriod", "goal", "hedgeStake", "id", "league", "lineValue", "lowHoldLossAmount", "lowHoldLossPct", "marketType", "notes", "promoConversionValue", "requiredCalculator", "sport", "status", "totalStakeExposure", "tradeDate", "tradeType", "updatedAt", "userId", "worstCasePL" FROM "PaperTrade";
DROP TABLE "PaperTrade";
ALTER TABLE "new_PaperTrade" RENAME TO "PaperTrade";
CREATE TABLE "new_TradeLeg" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "legLabel" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "oddsAmerican" INTEGER NOT NULL,
    "lineValue" REAL,
    "stake" REAL NOT NULL,
    "isPromoLeg" BOOLEAN NOT NULL DEFAULT false,
    "promoStakeReturned" BOOLEAN NOT NULL DEFAULT true,
    "oddsCapturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maxBetAtBook" REAL,
    "bonusId" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "verifiedAt" DATETIME,
    "observedOddsAmerican" INTEGER,
    "observedLineValue" REAL,
    "observationNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeLeg_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "PaperTrade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeLeg_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TradeLeg_bonusId_fkey" FOREIGN KEY ("bonusId") REFERENCES "Bonus" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TradeLeg" ("bonusId", "bookId", "createdAt", "id", "isPromoLeg", "legLabel", "lineValue", "maxBetAtBook", "oddsAmerican", "oddsCapturedAt", "promoStakeReturned", "side", "stake", "tradeId") SELECT "bonusId", "bookId", "createdAt", "id", "isPromoLeg", "legLabel", "lineValue", "maxBetAtBook", "oddsAmerican", "oddsCapturedAt", "promoStakeReturned", "side", "stake", "tradeId" FROM "TradeLeg";
DROP TABLE "TradeLeg";
ALTER TABLE "new_TradeLeg" RENAME TO "TradeLeg";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

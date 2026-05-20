-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "startingBankroll" REAL NOT NULL DEFAULT 1000,
    "currentBankroll" REAL NOT NULL DEFAULT 1000,
    "maxStakePct" REAL NOT NULL DEFAULT 5.0,
    "oddsFreshnessMinutes" INTEGER NOT NULL DEFAULT 5,
    "defaultUnitPct" REAL NOT NULL DEFAULT 1.0,
    "warnLowHoldPctAbove" REAL NOT NULL DEFAULT 3.0,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'unknown',
    "currentBalance" REAL NOT NULL DEFAULT 0,
    "rolloverRemaining" REAL NOT NULL DEFAULT 0,
    "maxBetLimit" REAL,
    "kycCompleted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Book_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperTrade" (
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

-- CreateTable
CREATE TABLE "TradeLeg" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeLeg_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "PaperTrade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeLeg_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TradeLeg_bonusId_fkey" FOREIGN KEY ("bonusId") REFERENCES "Bonus" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeChecklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "goalStated" BOOLEAN NOT NULL DEFAULT false,
    "bookRolesClassified" BOOLEAN NOT NULL DEFAULT false,
    "calculatorMatchesBonusType" BOOLEAN NOT NULL DEFAULT false,
    "sameEventConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "sameMarketTypeConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "sameGamePeriodConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "oppositeSidesConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "sameLineConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "oddsWithinFreshnessWindow" BOOLEAN NOT NULL DEFAULT false,
    "maxBetWithinLimits" BOOLEAN NOT NULL DEFAULT false,
    "bankrollExposureReviewed" BOOLEAN NOT NULL DEFAULT false,
    "promoStakeLogicCorrect" BOOLEAN NOT NULL DEFAULT false,
    "checklistComplete" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TradeChecklist_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "PaperTrade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChecklistOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "failedItems" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChecklistOverride_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "PaperTrade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "winningSide" TEXT,
    "actualPayout" REAL,
    "actualProfitLoss" REAL,
    "matchedExpectedOutcome" BOOLEAN,
    "resultNotes" TEXT,
    "settledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Result_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "PaperTrade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MistakeTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "TradeMistake" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "mistakeTagId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeMistake_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "PaperTrade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeMistake_mistakeTagId_fkey" FOREIGN KEY ("mistakeTagId") REFERENCES "MistakeTag" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bonus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "bonusAmount" REAL NOT NULL,
    "depositAmount" REAL,
    "rolloverMultiple" REAL,
    "requiredBettingVolume" REAL,
    "volumeCompleted" REAL NOT NULL DEFAULT 0,
    "volumeRemaining" REAL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bonus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Bonus_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankrollSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "snapshotDate" DATETIME NOT NULL,
    "currentBankroll" REAL NOT NULL,
    "dailyPL" REAL,
    "weeklyPL" REAL,
    "monthlyPL" REAL,
    "drawdown" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankrollSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TradeChecklist_tradeId_key" ON "TradeChecklist"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "Result_tradeId_key" ON "Result"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "MistakeTag_name_key" ON "MistakeTag"("name");

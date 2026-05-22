-- AlterTable
ALTER TABLE "BankrollSnapshot" ADD COLUMN "currentBankrollCents" INTEGER;
ALTER TABLE "BankrollSnapshot" ADD COLUMN "dailyPLCents" INTEGER;
ALTER TABLE "BankrollSnapshot" ADD COLUMN "drawdownCents" INTEGER;
ALTER TABLE "BankrollSnapshot" ADD COLUMN "monthlyPLCents" INTEGER;
ALTER TABLE "BankrollSnapshot" ADD COLUMN "weeklyPLCents" INTEGER;

-- AlterTable
ALTER TABLE "Bonus" ADD COLUMN "bonusAmountCents" INTEGER;
ALTER TABLE "Bonus" ADD COLUMN "depositAmountCents" INTEGER;
ALTER TABLE "Bonus" ADD COLUMN "requiredBettingVolumeCents" INTEGER;
ALTER TABLE "Bonus" ADD COLUMN "volumeCompletedCents" INTEGER;
ALTER TABLE "Bonus" ADD COLUMN "volumeRemainingCents" INTEGER;

-- AlterTable
ALTER TABLE "Book" ADD COLUMN "currentBalanceCents" INTEGER;
ALTER TABLE "Book" ADD COLUMN "maxBetLimitCents" INTEGER;
ALTER TABLE "Book" ADD COLUMN "rolloverRemainingCents" INTEGER;

-- AlterTable
ALTER TABLE "PaperTrade" ADD COLUMN "bestCasePLCents" INTEGER;
ALTER TABLE "PaperTrade" ADD COLUMN "expectedProfitIfACents" INTEGER;
ALTER TABLE "PaperTrade" ADD COLUMN "expectedProfitIfBCents" INTEGER;
ALTER TABLE "PaperTrade" ADD COLUMN "hedgeStakeCents" INTEGER;
ALTER TABLE "PaperTrade" ADD COLUMN "lowHoldLossAmountCents" INTEGER;
ALTER TABLE "PaperTrade" ADD COLUMN "promoConversionValueCents" INTEGER;
ALTER TABLE "PaperTrade" ADD COLUMN "totalStakeExposureCents" INTEGER;
ALTER TABLE "PaperTrade" ADD COLUMN "worstCasePLCents" INTEGER;

-- AlterTable
ALTER TABLE "Result" ADD COLUMN "actualPayoutCents" INTEGER;
ALTER TABLE "Result" ADD COLUMN "actualProfitLossCents" INTEGER;

-- AlterTable
ALTER TABLE "TradeLeg" ADD COLUMN "maxBetAtBookCents" INTEGER;
ALTER TABLE "TradeLeg" ADD COLUMN "stakeCents" INTEGER;

-- AlterTable
ALTER TABLE "TradeOpportunity" ADD COLUMN "expectedProfitMaxCents" INTEGER;
ALTER TABLE "TradeOpportunity" ADD COLUMN "expectedProfitMinCents" INTEGER;
ALTER TABLE "TradeOpportunity" ADD COLUMN "liquidityACents" INTEGER;
ALTER TABLE "TradeOpportunity" ADD COLUMN "liquidityBCents" INTEGER;
ALTER TABLE "TradeOpportunity" ADD COLUMN "middleProfitCents" INTEGER;
ALTER TABLE "TradeOpportunity" ADD COLUMN "outsideLossCents" INTEGER;
ALTER TABLE "TradeOpportunity" ADD COLUMN "profitIfAWinsCents" INTEGER;
ALTER TABLE "TradeOpportunity" ADD COLUMN "profitIfBWinsCents" INTEGER;
ALTER TABLE "TradeOpportunity" ADD COLUMN "stakeACents" INTEGER;
ALTER TABLE "TradeOpportunity" ADD COLUMN "stakeBCents" INTEGER;
ALTER TABLE "TradeOpportunity" ADD COLUMN "totalExposureCents" INTEGER;
ALTER TABLE "TradeOpportunity" ADD COLUMN "verifiedLiquidityACents" INTEGER;
ALTER TABLE "TradeOpportunity" ADD COLUMN "verifiedLiquidityBCents" INTEGER;

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "currentBankrollCents" INTEGER;
ALTER TABLE "UserSettings" ADD COLUMN "startingBankrollCents" INTEGER;

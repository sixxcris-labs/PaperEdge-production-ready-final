export function americanToDecimal(odds: number): number {
  if (odds === 0 || !Number.isFinite(odds)) {
    throw new Error("Invalid American odds");
  }
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

export function decimalToAmerican(dec: number): number {
  if (dec <= 1) throw new Error("Decimal odds must be > 1");
  return dec >= 2
    ? Math.round((dec - 1) * 100)
    : Math.round(-100 / (dec - 1));
}

export interface CashPayout {
  totalReturn: number;
  profit: number;
}

export function cashPayout(stake: number, americanOdds: number): CashPayout {
  if (stake <= 0) throw new Error("Stake must be positive");
  const dec = americanToDecimal(americanOdds);
  const totalReturn = stake * dec;
  return { totalReturn, profit: totalReturn - stake };
}

export function promoPayout(stake: number, americanOdds: number): CashPayout {
  if (stake <= 0) throw new Error("Stake must be positive");
  const dec = americanToDecimal(americanOdds);
  const profit = stake * (dec - 1);
  return { totalReturn: profit, profit };
}

export interface CashArbResult {
  stakeB: number;
  totalStake: number;
  profitIfA: number;
  profitIfB: number;
  arbPct: number;
  marginPct: number;
  isArb: boolean;
}

export function cashArbHedge(
  stakeA: number,
  oddsA: number,
  oddsB: number
): CashArbResult {
  if (stakeA <= 0 || !Number.isFinite(stakeA)) throw new Error("Stake A must be positive");
  const decA = americanToDecimal(oddsA);
  const decB = americanToDecimal(oddsB);
  const stakeB = (stakeA * decA) / decB;
  const totalStake = stakeA + stakeB;
  const profitIfA = stakeA * decA - totalStake;
  const profitIfB = stakeB * decB - totalStake;
  const arbPct = 1 / decA + 1 / decB;
  return {
    stakeB,
    totalStake,
    profitIfA,
    profitIfB,
    arbPct,
    marginPct: (1 - arbPct) * 100,
    isArb: arbPct < 1,
  };
}

export interface PromoHedgeResult {
  stakeB: number;
  lockedProfit: number;
  conversionPct: number;
  cashExposure: number;
}

// Side A is the free play (stake NOT returned). Side B is cash hedge.
export function promoHedge(
  promoStake: number,
  promoOdds: number,
  hedgeOdds: number
): PromoHedgeResult {
  if (promoStake <= 0 || !Number.isFinite(promoStake)) throw new Error("Promo stake must be positive");
  const decA = americanToDecimal(promoOdds);
  const decB = americanToDecimal(hedgeOdds);
  // Equalize: promoStake * (decA - 1) - stakeB = stakeB * (decB - 1)
  //   => stakeB = promoStake * (decA - 1) / decB
  const stakeB = (promoStake * (decA - 1)) / decB;
  const lockedProfit = promoStake * (decA - 1) - stakeB;
  return {
    stakeB,
    lockedProfit,
    conversionPct: lockedProfit / promoStake,
    cashExposure: stakeB,
  };
}

export interface LowHoldResult {
  totalStake: number;
  profitIfA: number;
  profitIfB: number;
  worstCaseLoss: number;
  lossPct: number;
}

export function lowHold(
  stakeA: number,
  oddsA: number,
  stakeB: number,
  oddsB: number
): LowHoldResult {
  if (stakeA <= 0 || !Number.isFinite(stakeA)) throw new Error("Stake A must be positive");
  if (stakeB <= 0 || !Number.isFinite(stakeB)) throw new Error("Stake B must be positive");
  const decA = americanToDecimal(oddsA);
  const decB = americanToDecimal(oddsB);
  const totalStake = stakeA + stakeB;
  const profitIfA = stakeA * decA - totalStake;
  const profitIfB = stakeB * decB - totalStake;
  const worstReturn = Math.min(stakeA * decA, stakeB * decB);
  const lossAmount = totalStake - worstReturn;
  return {
    totalStake,
    profitIfA,
    profitIfB,
    worstCaseLoss: -lossAmount,
    lossPct: (lossAmount / totalStake) * 100,
  };
}

export interface MiddleResult {
  totalStake: number;
  /** Result lands below the lower line: Over A loses, Under B wins. */
  plOutsideLow: number;
  /** Result lands above the upper line: Over A wins, Under B loses. */
  plOutsideHigh: number;
  /** The bad-side P/L if the middle misses (worst of the two outside cases). */
  outsideLoss: number;
  /** Result lands inside the gap: BOTH sides win. */
  middleProfit: number;
  /** Numeric width of the middle (upper line − lower line). */
  middleDistance: number;
  /** Center point of the middle gap. */
  middleNumber: number;
  /** Inclusive bounds of the middle window. */
  middleRange: [number, number];
  /** True when both outside cases are non-negative (a "free" middle). */
  isRiskFree: boolean;
}

/**
 * Middle bet: back the Over at `lineA` on Book A and the Under at `lineB`
 * on Book B, where `lineB >= lineA`. If the game result falls strictly
 * between the two lines, BOTH legs win (the middle hits). Otherwise exactly
 * one leg wins and the other loses (the outside loss / small profit).
 *
 * Side A is treated as the Over (wins high), Side B as the Under (wins low).
 */
export function middleHedge(
  stakeA: number,
  oddsA: number,
  lineA: number,
  stakeB: number,
  oddsB: number,
  lineB: number
): MiddleResult {
  if (stakeA <= 0 || !Number.isFinite(stakeA)) throw new Error("Stake A must be positive");
  if (stakeB <= 0 || !Number.isFinite(stakeB)) throw new Error("Stake B must be positive");
  if (!Number.isFinite(lineA) || !Number.isFinite(lineB)) throw new Error("Invalid line");
  if (lineB < lineA) throw new Error("Upper line (B) must be >= lower line (A)");

  const decA = americanToDecimal(oddsA);
  const decB = americanToDecimal(oddsB);
  const totalStake = stakeA + stakeB;

  const returnA = stakeA * decA; // Over A wins
  const returnB = stakeB * decB; // Under B wins

  // Result below lower line → Under B wins, Over A loses.
  const plOutsideLow = returnB - totalStake;
  // Result above upper line → Over A wins, Under B loses.
  const plOutsideHigh = returnA - totalStake;
  // Result inside (lineA, lineB) → both win.
  const middleProfit = returnA + returnB - totalStake;

  const outsideLoss = Math.min(plOutsideLow, plOutsideHigh);

  return {
    totalStake,
    plOutsideLow,
    plOutsideHigh,
    outsideLoss,
    middleProfit,
    middleDistance: lineB - lineA,
    middleNumber: (lineA + lineB) / 2,
    middleRange: [lineA, lineB],
    isRiskFree: plOutsideLow >= 0 && plOutsideHigh >= 0,
  };
}

export function isOddsStale(capturedAt: Date, freshnessMinutes: number): boolean {
  const ageMs = Date.now() - capturedAt.getTime();
  return ageMs > freshnessMinutes * 60 * 1000;
}

export function roiPct(profit: number, exposure: number): number {
  if (exposure <= 0) return 0;
  return (profit / exposure) * 100;
}

export function netProfitLossFromSettlement(
  winningPayout: number,
  winningStake: number,
  losingStakes: number,
): number {
  return (winningPayout - winningStake) - losingStakes;
}

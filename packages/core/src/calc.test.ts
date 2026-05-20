import { describe, it, expect } from "vitest";
import {
  americanToDecimal,
  decimalToAmerican,
  cashPayout,
  promoPayout,
  cashArbHedge,
  promoHedge,
  lowHold,
  middleHedge,
  isOddsStale,
  roiPct,
} from "./calc";

// ─── americanToDecimal ────────────────────────────────────────────────────────

describe("americanToDecimal", () => {
  it("converts positive odds", () => {
    expect(americanToDecimal(140)).toBeCloseTo(2.40, 4);
    expect(americanToDecimal(200)).toBeCloseTo(3.00, 4);
    expect(americanToDecimal(100)).toBeCloseTo(2.00, 4);
  });
  it("converts negative odds", () => {
    expect(americanToDecimal(-130)).toBeCloseTo(1.7692, 4);
    expect(americanToDecimal(-180)).toBeCloseTo(1.5556, 4);
    expect(americanToDecimal(-105)).toBeCloseTo(1.9524, 4);
  });
  it("+100 and -100 both equal 2.0 (even money)", () => {
    expect(americanToDecimal(100)).toBeCloseTo(2.0, 6);
    expect(americanToDecimal(-100)).toBeCloseTo(2.0, 6);
  });
  it("rejects 0", () => {
    expect(() => americanToDecimal(0)).toThrow("Invalid American odds");
  });
  it("rejects NaN", () => {
    expect(() => americanToDecimal(NaN)).toThrow();
  });
  it("rejects Infinity", () => {
    expect(() => americanToDecimal(Infinity)).toThrow();
  });
});

// ─── decimalToAmerican ────────────────────────────────────────────────────────

describe("decimalToAmerican", () => {
  it("round-trips positive odds", () => {
    expect(decimalToAmerican(2.40)).toBe(140);
    expect(decimalToAmerican(3.00)).toBe(200);
  });
  it("round-trips negative odds", () => {
    expect(decimalToAmerican(1.7692)).toBe(-130);
  });
  it("rejects dec <= 1", () => {
    expect(() => decimalToAmerican(1.0)).toThrow();
    expect(() => decimalToAmerican(0.5)).toThrow();
  });
});

// ─── cashPayout ──────────────────────────────────────────────────────────────

describe("cashPayout", () => {
  it("+140 with $100 stake", () => {
    const r = cashPayout(100, 140);
    expect(r.totalReturn).toBeCloseTo(240, 2);
    expect(r.profit).toBeCloseTo(140, 2);
  });
  it("-130 with $100 stake", () => {
    const r = cashPayout(100, -130);
    expect(r.profit).toBeCloseTo(76.92, 2);
  });
  it("rejects zero stake", () => {
    expect(() => cashPayout(0, 110)).toThrow();
  });
  it("rejects negative stake", () => {
    expect(() => cashPayout(-50, 110)).toThrow();
  });
});

// ─── promoPayout ─────────────────────────────────────────────────────────────

describe("promoPayout", () => {
  it("returns profit only — stake not returned", () => {
    const r = promoPayout(100, 200);
    expect(r.profit).toBeCloseTo(200, 2);
    expect(r.totalReturn).toBeCloseTo(200, 2);
  });
  it("rejects zero stake", () => {
    expect(() => promoPayout(0, 200)).toThrow();
  });
});

// ─── cashArbHedge ─────────────────────────────────────────────────────────────

describe("cashArbHedge — happy path", () => {
  it("+140 / -130 arb equalises profit", () => {
    const r = cashArbHedge(100, 140, -130);
    expect(r.stakeB).toBeCloseTo(135.65, 2);
    expect(r.totalStake).toBeCloseTo(235.65, 2);
    expect(r.profitIfA).toBeCloseTo(4.35, 2);
    expect(r.profitIfB).toBeCloseTo(4.35, 2);
    expect(r.isArb).toBe(true);
    expect(r.marginPct).toBeCloseTo(1.81, 1);
  });
  it("profit if A == profit if B (by construction)", () => {
    const r = cashArbHedge(500, 120, -140);
    expect(r.profitIfA).toBeCloseTo(r.profitIfB, 6);
  });
  it("detects non-arb", () => {
    const r = cashArbHedge(100, -110, -110);
    expect(r.isArb).toBe(false);
    expect(r.marginPct).toBeLessThan(0);
  });
});

describe("cashArbHedge — edge cases", () => {
  it("rejects zero stake", () => {
    expect(() => cashArbHedge(0, 140, -130)).toThrow("Stake A must be positive");
  });
  it("rejects negative stake", () => {
    expect(() => cashArbHedge(-100, 140, -130)).toThrow();
  });
  it("rejects invalid odds A", () => {
    expect(() => cashArbHedge(100, 0, -130)).toThrow("Invalid American odds");
  });
  it("rejects invalid odds B", () => {
    expect(() => cashArbHedge(100, 140, 0)).toThrow("Invalid American odds");
  });
  it("works at even money +100/-100", () => {
    const r = cashArbHedge(100, 100, -100);
    // +100 dec=2.0, -100 dec=2.0 → stakeB = 100; profitIfA = profitIfB = 0
    expect(r.stakeB).toBeCloseTo(100, 6);
    expect(r.profitIfA).toBeCloseTo(0, 6);
    expect(r.isArb).toBe(false); // arbPct == 1.0, not < 1
  });
});

// ─── promoHedge ───────────────────────────────────────────────────────────────

describe("promoHedge — happy path", () => {
  it("+200 free play / -180 hedge locks profit", () => {
    const r = promoHedge(100, 200, -180);
    expect(r.stakeB).toBeCloseTo(128.57, 2);
    expect(r.lockedProfit).toBeCloseTo(71.43, 2);
    expect(r.conversionPct).toBeCloseTo(0.7143, 4);
  });
  it("profit when promo wins == profit when hedge wins", () => {
    const r = promoHedge(50, 150, -120);
    const promoWinProfit = 50 * (americanToDecimal(150) - 1) - r.stakeB;
    const hedgeWinProfit = r.stakeB * (americanToDecimal(-120) - 1);
    expect(promoWinProfit).toBeCloseTo(hedgeWinProfit, 4);
  });
});

describe("promoHedge — edge cases", () => {
  it("rejects zero promo stake", () => {
    expect(() => promoHedge(0, 200, -180)).toThrow("Promo stake must be positive");
  });
  it("rejects negative promo stake", () => {
    expect(() => promoHedge(-100, 200, -180)).toThrow();
  });
});

// ─── lowHold ─────────────────────────────────────────────────────────────────

describe("lowHold — happy path", () => {
  it("-105 / -105 loss calculation", () => {
    const r = lowHold(100, -105, 100, -105);
    expect(r.totalStake).toBe(200);
    expect(r.worstCaseLoss).toBeCloseTo(-4.76, 2);
    expect(r.lossPct).toBeCloseTo(2.38, 2);
  });
});

describe("lowHold — edge cases", () => {
  it("rejects zero stake A", () => {
    expect(() => lowHold(0, -105, 100, -105)).toThrow("Stake A must be positive");
  });
  it("rejects zero stake B", () => {
    expect(() => lowHold(100, -105, 0, -105)).toThrow("Stake B must be positive");
  });
  it("rejects negative stake", () => {
    expect(() => lowHold(-50, -105, 100, -105)).toThrow();
  });
});

// ─── Settlement P/L scenarios ─────────────────────────────────────────────────

describe("Settlement P/L math (via cashArbHedge)", () => {
  // Simulates the computation SettlementClient does after a game:
  //   finalPayout = winning side's stake × dec odds
  //   actualPL    = finalPayout − totalStake
  const stakeA = 100, oddsA = 140;
  const stakeB = 135.65, oddsB = -130;
  const totalStake = stakeA + stakeB;

  it("Win A: profit matches expected arb profit", () => {
    const payoutA = stakeA * americanToDecimal(oddsA);
    const pl = payoutA - totalStake;
    expect(pl).toBeCloseTo(4.35, 1);
  });

  it("Win B: profit matches expected arb profit", () => {
    const payoutB = stakeB * americanToDecimal(oddsB);
    const pl = payoutB - totalStake;
    expect(pl).toBeCloseTo(4.35, 1);
  });

  it("Push A: stake returned → P/L = -(stakeB)", () => {
    // Side A pushes: stakeA returned. Side B lost.
    const payout = stakeA; // push returns stake
    const pl = payout - totalStake;
    expect(pl).toBeCloseTo(-stakeB, 2);
  });

  it("Push both: full stake returned → P/L = 0", () => {
    const payout = stakeA + stakeB;
    const pl = payout - totalStake;
    expect(pl).toBeCloseTo(0, 6);
  });

  it("Both legs lose: P/L = -totalStake", () => {
    const payout = 0; // no return
    const pl = payout - totalStake;
    expect(pl).toBeCloseTo(-totalStake, 6);
  });
});

// ─── middleHedge ──────────────────────────────────────────────────────────────

describe("middleHedge — happy path", () => {
  // Real example: Onyx Over 199.5 @ -640 $75 / Kalshi Under 200.5 @ +571 $13
  it("NBA total middle matches expected outside loss + middle profit", () => {
    const r = middleHedge(75, -640, 199.5, 13, 571, 200.5);
    expect(r.totalStake).toBe(88);
    expect(r.middleProfit).toBeCloseTo(85.95, 1);
    expect(r.outsideLoss).toBeCloseTo(-1.28, 2);
    expect(r.middleDistance).toBeCloseTo(1.0, 6);
    expect(r.middleNumber).toBeCloseTo(200, 6);
    expect(r.middleRange).toEqual([199.5, 200.5]);
    expect(r.isRiskFree).toBe(false);
  });

  it("both win when the result lands in the middle (profit > both outside cases)", () => {
    const r = middleHedge(75, -640, 199.5, 13, 571, 200.5);
    expect(r.middleProfit).toBeGreaterThan(r.plOutsideLow);
    expect(r.middleProfit).toBeGreaterThan(r.plOutsideHigh);
  });

  it("detects a risk-free middle (both outside cases non-negative)", () => {
    // Even-money both sides, equal stake: each outside case returns stake → 0
    const r = middleHedge(100, 100, 7.5, 100, 100, 8.5);
    expect(r.plOutsideLow).toBeCloseTo(0, 6);
    expect(r.plOutsideHigh).toBeCloseTo(0, 6);
    expect(r.isRiskFree).toBe(true);
    expect(r.middleProfit).toBeCloseTo(200, 6);
  });
});

describe("middleHedge — edge cases", () => {
  it("rejects zero / negative stakes", () => {
    expect(() => middleHedge(0, -110, 199.5, 100, -110, 200.5)).toThrow("Stake A must be positive");
    expect(() => middleHedge(100, -110, 199.5, 0, -110, 200.5)).toThrow("Stake B must be positive");
    expect(() => middleHedge(-5, -110, 199.5, 100, -110, 200.5)).toThrow();
  });
  it("rejects invalid odds", () => {
    expect(() => middleHedge(100, 0, 199.5, 100, -110, 200.5)).toThrow("Invalid American odds");
  });
  it("rejects an inverted gap (upper line below lower line)", () => {
    expect(() => middleHedge(100, -110, 200.5, 100, -110, 199.5)).toThrow("Upper line (B) must be >= lower line (A)");
  });
  it("zero-width middle (lineA == lineB) is a degenerate push-style hedge", () => {
    const r = middleHedge(100, 100, 200, 100, 100, 200);
    expect(r.middleDistance).toBe(0);
    expect(r.middleNumber).toBe(200);
  });
});

// ─── isOddsStale ─────────────────────────────────────────────────────────────

describe("isOddsStale", () => {
  it("returns true for odds older than freshness window", () => {
    const old = new Date(Date.now() - 10 * 60 * 1000);
    expect(isOddsStale(old, 5)).toBe(true);
  });
  it("returns false for fresh odds", () => {
    const fresh = new Date(Date.now() - 1 * 60 * 1000);
    expect(isOddsStale(fresh, 5)).toBe(false);
  });
  it("returns false when exactly at the freshness boundary", () => {
    const boundary = new Date(Date.now() - 5 * 60 * 1000 + 100);
    expect(isOddsStale(boundary, 5)).toBe(false);
  });
});

// ─── roiPct ──────────────────────────────────────────────────────────────────

describe("roiPct", () => {
  it("calculates ROI", () => {
    expect(roiPct(4.35, 235.65)).toBeCloseTo(1.85, 2);
  });
  it("handles zero exposure", () => {
    expect(roiPct(10, 0)).toBe(0);
  });
  it("handles negative profit (loss)", () => {
    expect(roiPct(-50, 200)).toBeCloseTo(-25, 2);
  });
});

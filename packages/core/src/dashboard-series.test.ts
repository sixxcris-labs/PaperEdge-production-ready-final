import { describe, it, expect } from "vitest";
import {
  buildBankrollSeries,
  buildDailyExpectedVsActual,
  type SettledTradeInput,
  type BankrollSnapshotInput,
} from "./dashboard-series";

// Anchor "now" at noon local time so off-by-one date math is obvious if it breaks.
const NOW = new Date(2026, 4, 19, 12, 0, 0); // 2026-05-19 12:00 local
const ms = 24 * 60 * 60 * 1000;

function daysAgo(n: number, hour = 12): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

// ─── buildBankrollSeries ────────────────────────────────────────────────────

describe("buildBankrollSeries", () => {
  it("returns one point per day in the window, oldest first", () => {
    const series = buildBankrollSeries([], [], 10_000, 7, NOW);
    expect(series).toHaveLength(7);
    // Day labels are "MMM d" — just check we got distinct ones in order.
    const labels = series.map((p) => p.d);
    expect(new Set(labels).size).toBe(7);
  });

  it("uses snapshots when any exist in the window, forward-filling gaps", () => {
    const snapshots: BankrollSnapshotInput[] = [
      { snapshotDate: daysAgo(5), currentBankroll: 10_200 },
      { snapshotDate: daysAgo(2), currentBankroll: 10_350 },
    ];
    const series = buildBankrollSeries(snapshots, [], 10_000, 7, NOW);
    // Days before the first snapshot inherit startingBankroll;
    // days between snapshots inherit the previous value;
    // days after the latest snapshot keep that value.
    const values = series.map((p) => p.v);
    expect(values[0]).toBe(10_000); // 6 days ago — before first snapshot
    expect(values[1]).toBe(10_200); // 5 days ago — first snapshot
    expect(values[2]).toBe(10_200); // 4 days ago — forward-filled
    expect(values[3]).toBe(10_200); // 3 days ago — forward-filled
    expect(values[4]).toBe(10_350); // 2 days ago — second snapshot
    expect(values[5]).toBe(10_350); // 1 day ago
    expect(values[6]).toBe(10_350); // today
  });

  it("multiple snapshots on the same day → newest wins (end of day)", () => {
    const snapshots: BankrollSnapshotInput[] = [
      { snapshotDate: daysAgo(3, 9), currentBankroll: 10_100 },
      { snapshotDate: daysAgo(3, 21), currentBankroll: 10_180 }, // later same day
    ];
    const series = buildBankrollSeries(snapshots, [], 10_000, 5, NOW);
    const day3 = series[1]; // window of 5, oldest is days ago 4
    expect(day3.v).toBe(10_180);
  });

  it("prefers cents-backed snapshot bankroll values when present", () => {
    const snapshots: BankrollSnapshotInput[] = [
      {
        snapshotDate: daysAgo(1),
        currentBankroll: 10_000,
        currentBankrollCents: 1_002_555,
      },
    ];
    const series = buildBankrollSeries(snapshots, [], 10_000, 2, NOW);
    expect(series[1].v).toBe(10025.55);
  });

  it("falls back to starting bankroll + cumulative settled P/L when no snapshots", () => {
    const settled: SettledTradeInput[] = [
      {
        status: "settled_won",
        result: {
          actualProfitLoss: 50,
          actualProfitLossCents: 5_125,
          settledAt: daysAgo(4),
        },
      },
      { status: "settled_loss", result: { actualProfitLoss: -20, settledAt: daysAgo(2) } },
      { status: "settled_win",  result: { actualProfitLoss: 10,  settledAt: daysAgo(0) } },
    ];
    const series = buildBankrollSeries([], settled, 10_000, 7, NOW);
    const values = series.map((p) => p.v);
    // Window opens 6 days ago.
    expect(values[0]).toBe(10_000); // 6 days ago — nothing settled yet
    expect(values[1]).toBe(10_000); // 5 days ago
    expect(values[2]).toBe(10_051.25); // 4 days ago — cents value preferred
    expect(values[3]).toBe(10_051.25); // 3 days ago — no delta
    expect(values[4]).toBe(10_031.25); // 2 days ago — -20
    expect(values[5]).toBe(10_031.25); // 1 day ago — no delta
    expect(values[6]).toBe(10_041.25); // today — +10
  });

  it("fallback seeds the curve with realized P/L from BEFORE the window opens", () => {
    const settled: SettledTradeInput[] = [
      // Settled 20 days ago — well before a 7-day window.
      { status: "settled_won", result: { actualProfitLoss: 200, settledAt: daysAgo(20) } },
      { status: "settled_won", result: { actualProfitLoss: 10,  settledAt: daysAgo(1) } },
    ];
    const series = buildBankrollSeries([], settled, 10_000, 7, NOW);
    expect(series[0].v).toBe(10_200); // window opens already +200
    expect(series[6].v).toBe(10_210); // +10 yesterday
  });

  it("ignores non-settled rows and settled rows missing settledAt", () => {
    const trades: SettledTradeInput[] = [
      { status: "paper_traded", result: { actualProfitLoss: 999, settledAt: daysAgo(2) } },
      { status: "settled_won", result: { actualProfitLoss: 999, settledAt: null } },
      { status: "settled_won", result: { actualProfitLoss: 30,  settledAt: daysAgo(1) } },
    ];
    const series = buildBankrollSeries([], trades, 10_000, 5, NOW);
    expect(series[series.length - 1].v).toBe(10_030);
  });
});

// ─── buildDailyExpectedVsActual ─────────────────────────────────────────────

describe("buildDailyExpectedVsActual", () => {
  it("buckets expected and actual by settledAt for settled trades", () => {
    const trades: SettledTradeInput[] = [
      { status: "settled_won", worstCasePL: 4.35, result: { actualProfitLoss:  5, settledAt: daysAgo(3) } },
      { status: "settled_won", worstCasePL: 6.10, result: { actualProfitLoss:  7, settledAt: daysAgo(3) } },
      { status: "settled_loss", worstCasePL: 4.35, result: { actualProfitLoss: -10, settledAt: daysAgo(1) } },
    ];
    const series = buildDailyExpectedVsActual(trades, 5, NOW);
    expect(series).toHaveLength(5);
    // 3 days ago: expected 4.35 + 6.10 = 10.45, actual 5 + 7 = 12
    const day3 = series[1];
    expect(day3.expected).toBeCloseTo(10.45, 4);
    expect(day3.actual).toBe(12);
    // 1 day ago
    const day1 = series[3];
    expect(day1.expected).toBeCloseTo(4.35, 4);
    expect(day1.actual).toBe(-10);
  });

  it("returns zeros for days with no settled activity", () => {
    const trades: SettledTradeInput[] = [
      { status: "settled_won", worstCasePL: 4, result: { actualProfitLoss: 5, settledAt: daysAgo(0) } },
    ];
    const series = buildDailyExpectedVsActual(trades, 4, NOW);
    expect(series.slice(0, 3).every((p) => p.expected === 0 && p.actual === 0)).toBe(true);
    expect(series[3].expected).toBe(4);
    expect(series[3].actual).toBe(5);
  });

  it("ignores non-settled trades entirely", () => {
    const trades: SettledTradeInput[] = [
      { status: "paper_traded", worstCasePL: 99, result: { actualProfitLoss: 99, settledAt: daysAgo(1) } },
      { status: "unverified", worstCasePL: 99, result: null },
      { status: "not_placed_odds_moved", worstCasePL: 99, result: null },
    ];
    const series = buildDailyExpectedVsActual(trades, 5, NOW);
    expect(series.every((p) => p.expected === 0 && p.actual === 0)).toBe(true);
  });

  it("uses min(profitIfA, profitIfB) when worstCasePL is missing", () => {
    const trades: SettledTradeInput[] = [
      {
        status: "settled_won",
        expectedProfitIfA: 8,
        expectedProfitIfB: 4,
        result: { actualProfitLoss: 5, settledAt: daysAgo(0) },
      },
    ];
    const series = buildDailyExpectedVsActual(trades, 1, NOW);
    expect(series[0].expected).toBe(4);
    expect(series[0].actual).toBe(5);
  });
});

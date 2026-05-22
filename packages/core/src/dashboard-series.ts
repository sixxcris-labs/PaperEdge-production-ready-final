/**
 * Dashboard time-series helpers.
 *
 * Produces the chart-ready arrays the dashboard renders. Built on top of
 * `trade-metrics` and `status` so groupings agree with the rest of the app.
 *
 * Pure functions — take plain rows in, return plain `{ d, v }` / `{ d, expected, actual }`
 * arrays out. No DB access. No date-library dependency (small ISO helpers only).
 */

import {
  getActualProfitLoss,
  type TradeMetricInput,
} from "./trade-metrics";
import { isSettled } from "./status";
import { dollarsFromCentsOrNumberOrNull } from "./money-fields";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BankrollPoint {
  /** Day label, e.g. "May 19" or an ISO date — chart x-axis. */
  d: string;
  /** Bankroll value at end of that day. */
  v: number;
}

export interface DailyEvAPoint {
  d: string;
  expected: number;
  actual: number;
}

/** Snapshot row shape (subset of Prisma `BankrollSnapshot`). */
export interface BankrollSnapshotInput {
  snapshotDate: Date;
  currentBankroll: number;
  currentBankrollCents?: number | null;
}

/** Settled trade row shape — extends metric input with a settledAt timestamp. */
export interface SettledTradeInput extends TradeMetricInput {
  result?: {
    actualProfitLoss?: number | null;
    actualProfitLossCents?: number | null;
    settledAt?: Date | null;
  } | null;
}

// ─── Bankroll curve ─────────────────────────────────────────────────────────

/**
 * Build the bankroll curve for the trailing `days` window.
 *
 * Primary source: real `BankrollSnapshot` rows. When at least one snapshot
 * falls inside the window, the curve is built from snapshots (newest snapshot
 * per day wins) and gaps are forward-filled.
 *
 * Fallback: when no snapshots cover the window, reconstruct from
 * `startingBankroll` + cumulative realized P&L over the window, derived from
 * settled trades' `result.settledAt`. This is honest: it shows exactly what
 * the bankroll *would* be if the user had no untracked deposits / withdrawals.
 *
 * Returns one point per day in the window, oldest first.
 */
export function buildBankrollSeries(
  snapshots: BankrollSnapshotInput[],
  settledTrades: SettledTradeInput[],
  startingBankroll: number,
  days = 30,
  now: Date = new Date(),
): BankrollPoint[] {
  const window = lastNDays(days, now);

  const inWindow = snapshots.filter((s) =>
    isWithinWindow(s.snapshotDate, window),
  );

  if (inWindow.length > 0) {
    return curveFromSnapshots(inWindow, window, startingBankroll);
  }

  return curveFromSettledFallback(settledTrades, window, startingBankroll);
}

function curveFromSnapshots(
  snapshots: BankrollSnapshotInput[],
  window: DayBucket[],
  startingBankroll: number,
): BankrollPoint[] {
  // Newest snapshot per day wins. If multiple snapshots land on the same day,
  // the last one (chronologically) is the end-of-day bankroll.
  const byDay = new Map<string, number>();
  const sorted = [...snapshots].sort(
    (a, b) => a.snapshotDate.getTime() - b.snapshotDate.getTime(),
  );
  for (const s of sorted) {
    const bankroll = dollarsFromCentsOrNumberOrNull(
      s.currentBankrollCents,
      s.currentBankroll,
    );
    if (bankroll !== null) {
      byDay.set(isoDay(s.snapshotDate), bankroll);
    }
  }

  // Forward-fill: a day with no snapshot inherits the previous day's value.
  // Days before the first snapshot get the starting bankroll.
  let last = startingBankroll;
  return window.map((b) => {
    const v = byDay.get(b.iso);
    if (v !== undefined) last = v;
    return { d: b.label, v: round2(last) };
  });
}

function curveFromSettledFallback(
  settledTrades: SettledTradeInput[],
  window: DayBucket[],
  startingBankroll: number,
): BankrollPoint[] {
  // Day → realized P&L on that day. Only settled trades with a settledAt
  // count; settled rows missing settledAt are dropped (would otherwise distort
  // the timeline silently).
  const deltaByDay = new Map<string, number>();
  for (const t of settledTrades) {
    if (!isSettled(t.status)) continue;
    const at = t.result?.settledAt;
    if (!(at instanceof Date)) continue;
    const key = isoDay(at);
    deltaByDay.set(key, (deltaByDay.get(key) ?? 0) + getActualProfitLoss(t));
  }

  // Seed: starting bankroll + everything that settled BEFORE the window opens.
  const windowStart = window[0]?.date;
  let running = startingBankroll;
  if (windowStart) {
    for (const t of settledTrades) {
      if (!isSettled(t.status)) continue;
      const at = t.result?.settledAt;
      if (!(at instanceof Date)) continue;
      if (at.getTime() < windowStart.getTime()) {
        running += getActualProfitLoss(t);
      }
    }
  }

  return window.map((b) => {
    running += deltaByDay.get(b.iso) ?? 0;
    return { d: b.label, v: round2(running) };
  });
}

// ─── Daily Expected vs Actual ───────────────────────────────────────────────

/**
 * For each day in the window, the sum of conservative expected profit and the
 * sum of realized P&L for trades that **settled** on that day.
 *
 * Grouping both numbers on `settledAt` keeps the comparison apples-to-apples:
 * one bar pair per day says "of the trades that settled today, here's what we
 * expected vs. what we got". Open / unsettled trades don't appear yet — they
 * show up here once they settle.
 */
export function buildDailyExpectedVsActual(
  trades: SettledTradeInput[],
  days = 14,
  now: Date = new Date(),
): DailyEvAPoint[] {
  const window = lastNDays(days, now);
  const expected = new Map<string, number>();
  const actual = new Map<string, number>();

  for (const t of trades) {
    if (!isSettled(t.status)) continue;
    const at = t.result?.settledAt;
    if (!(at instanceof Date)) continue;
    const key = isoDay(at);
    expected.set(
      key,
      (expected.get(key) ?? 0) + originalExpectedProfit(t),
    );
    actual.set(
      key,
      (actual.get(key) ?? 0) + getActualProfitLoss(t),
    );
  }

  return window.map((b) => ({
    d: b.label,
    expected: round2(expected.get(b.iso) ?? 0),
    actual: round2(actual.get(b.iso) ?? 0),
  }));
}

/**
 * The expected-profit number to compare against actual for a settled trade.
 *
 * `getConservativeExpectedProfit` zeros out settled rows by design (it's the
 * "money currently at risk" view). For the EvA chart we want the *original*
 * expected at lock time, so we read the same fields directly without the
 * status-based zeroing.
 */
function originalExpectedProfit(t: TradeMetricInput): number {
  const w = dollarsFromCentsOrNumberOrNull(t.worstCasePLCents, t.worstCasePL);
  if (w !== null) return w;
  const a = dollarsFromCentsOrNumberOrNull(
    t.expectedProfitIfACents,
    t.expectedProfitIfA,
  );
  const b = dollarsFromCentsOrNumberOrNull(
    t.expectedProfitIfBCents,
    t.expectedProfitIfB,
  );
  if (a !== null && b !== null) return Math.min(a, b);
  if (a !== null) return a;
  if (b !== null) return b;
  return 0;
}

// ─── Internal: day bucketing ────────────────────────────────────────────────

interface DayBucket {
  /** Start-of-day Date in local time. */
  date: Date;
  /** "YYYY-MM-DD" key. */
  iso: string;
  /** Human label, e.g. "May 19". */
  label: string;
}

/** Trailing window of `days` calendar days, ending today. Oldest first. */
function lastNDays(days: number, now: Date): DayBucket[] {
  const out: DayBucket[] = [];
  const today = startOfDay(now);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push({ date: d, iso: isoDay(d), label: shortLabel(d) });
  }
  return out;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isoDay(d: Date): string {
  // Local-time YYYY-MM-DD. Using ISO directly would silently shift across
  // timezones; the dashboard is a single-user local app and the user expects
  // their wall-clock day boundaries.
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shortLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isWithinWindow(d: Date, window: DayBucket[]): boolean {
  if (window.length === 0) return false;
  const t = d.getTime();
  return (
    t >= window[0].date.getTime() &&
    t < window[window.length - 1].date.getTime() + 24 * 60 * 60 * 1000
  );
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

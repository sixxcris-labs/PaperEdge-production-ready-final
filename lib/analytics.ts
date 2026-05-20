import {
  hasCandidateExposure,
  hasOpenExposure,
  isSettledStatus,
  isVisibleInDashboard,
  needsReview,
} from "./status";

export interface AnalyticsResultLike {
  actualProfitLoss: number | null;
  settledAt?: Date | string | null;
}

export interface AnalyticsTradeLike {
  status: string;
  tradeDate: Date | string;
  expectedProfitIfA?: number | null;
  expectedProfitIfB?: number | null;
  worstCasePL?: number | null;
  totalStakeExposure?: number | null;
  result?: AnalyticsResultLike | null;
}

export interface DashboardMetrics<T extends AnalyticsTradeLike = AnalyticsTradeLike> {
  visibleTrades: T[];
  openExposureTrades: T[];
  candidateTrades: T[];
  settledTrades: T[];
  reviewTrades: T[];
  totalStaked: number;
  openExposure: number;
  candidateExposure: number;
  expectedOpenProfit: number;
  actualPL: number;
  settledStaked: number;
  roiPct: number;
  winsCount: number;
  lossCount: number;
  voidedCount: number;
}

export function expectedProfit(trade: AnalyticsTradeLike): number {
  return trade.worstCasePL ?? trade.expectedProfitIfA ?? 0;
}

export function actualProfit(trade: AnalyticsTradeLike): number {
  return trade.result?.actualProfitLoss ?? 0;
}

export function stakeExposure(trade: AnalyticsTradeLike): number {
  return trade.totalStakeExposure ?? 0;
}

export function computeDashboardMetrics<T extends AnalyticsTradeLike>(trades: T[]): DashboardMetrics<T> {
  const visibleTrades = trades.filter((trade) => isVisibleInDashboard(trade.status));
  const openExposureTrades = visibleTrades.filter((trade) => hasOpenExposure(trade.status));
  const candidateTrades = visibleTrades.filter((trade) => hasCandidateExposure(trade.status));
  const settledTrades = visibleTrades.filter((trade) => isSettledStatus(trade.status));
  const reviewTrades = visibleTrades.filter((trade) => needsReview(trade.status));

  const totalStaked = visibleTrades.reduce((sum, trade) => sum + stakeExposure(trade), 0);
  const openExposure = openExposureTrades.reduce((sum, trade) => sum + stakeExposure(trade), 0);
  const candidateExposure = candidateTrades.reduce((sum, trade) => sum + stakeExposure(trade), 0);
  const expectedOpenProfit = openExposureTrades.reduce((sum, trade) => sum + expectedProfit(trade), 0);
  const actualPL = settledTrades.reduce((sum, trade) => sum + actualProfit(trade), 0);
  const settledStaked = settledTrades.reduce((sum, trade) => sum + stakeExposure(trade), 0);
  const roiPct = settledStaked > 0 ? (actualPL / settledStaked) * 100 : 0;
  const winsCount = settledTrades.filter((trade) => actualProfit(trade) > 0).length;
  const lossCount = settledTrades.filter((trade) => actualProfit(trade) < 0).length;
  const voidedCount = settledTrades.filter((trade) =>
    trade.status === "voided" || trade.status === "settled_push" || trade.status === "settled_push_void"
  ).length;

  return {
    visibleTrades,
    openExposureTrades,
    candidateTrades,
    settledTrades,
    reviewTrades,
    totalStaked,
    openExposure,
    candidateExposure,
    expectedOpenProfit,
    actualPL,
    settledStaked,
    roiPct,
    winsCount,
    lossCount,
    voidedCount,
  };
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function settledDate(trade: AnalyticsTradeLike): Date | null {
  return parseDate(trade.result?.settledAt) ?? parseDate(trade.tradeDate);
}

export function buildMonthlyProfitSeries(
  trades: AnalyticsTradeLike[],
  monthCount = 6,
  now = new Date()
): { m: string; v: number }[] {
  const firstMonth = addMonths(startOfMonth(now), -(monthCount - 1));
  const buckets = new Map<string, number>();
  const labels: { key: string; label: string }[] = [];

  for (let i = 0; i < monthCount; i++) {
    const d = addMonths(firstMonth, i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    labels.push({ key, label: d.toLocaleDateString("en-US", { month: "short" }) });
    buckets.set(key, 0);
  }

  for (const trade of trades.filter((t) => isSettledStatus(t.status))) {
    const date = settledDate(trade);
    if (!date || date < firstMonth || date >= addMonths(startOfMonth(now), 1)) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + actualProfit(trade));
    }
  }

  return labels.map(({ key, label }) => ({
    m: label,
    v: roundCurrency(buckets.get(key) ?? 0),
  }));
}

export function buildDailyExpectedActualSeries(
  trades: AnalyticsTradeLike[],
  dayCount = 14,
  now = new Date()
): { d: string; expected: number; actual: number }[] {
  const firstDay = startOfDay(addDays(now, -(dayCount - 1)));
  const buckets = new Map<string, { expected: number; actual: number; label: string }>();

  for (let i = 0; i < dayCount; i++) {
    const d = addDays(firstDay, i);
    const key = dayKey(d);
    buckets.set(key, {
      expected: 0,
      actual: 0,
      label: d.toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
    });
  }

  for (const trade of trades) {
    const date = settledDate(trade);
    if (!date || date < firstDay || date > addDays(startOfDay(now), 1)) continue;
    const key = dayKey(date);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.expected += expectedProfit(trade);
    if (isSettledStatus(trade.status)) bucket.actual += actualProfit(trade);
  }

  return [...buckets.values()].map((bucket) => ({
    d: bucket.label,
    expected: roundCurrency(bucket.expected),
    actual: roundCurrency(bucket.actual),
  }));
}

export function buildBankrollSeries(
  trades: AnalyticsTradeLike[],
  startingBankroll: number,
  dayCount = 30,
  now = new Date()
): { d: string; v: number }[] {
  const firstDay = startOfDay(addDays(now, -(dayCount - 1)));
  const settledTrades = trades
    .filter((trade) => isSettledStatus(trade.status))
    .map((trade) => ({ trade, date: settledDate(trade) }))
    .filter((entry): entry is { trade: AnalyticsTradeLike; date: Date } => Boolean(entry.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const prePeriodPL = settledTrades
    .filter(({ date }) => date < firstDay)
    .reduce((sum, { trade }) => sum + actualProfit(trade), 0);
  let running = startingBankroll + prePeriodPL;

  return Array.from({ length: dayCount }, (_, i) => {
    const day = addDays(firstDay, i);
    const nextDay = addDays(day, 1);
    for (const { trade, date } of settledTrades) {
      if (date >= day && date < nextDay) running += actualProfit(trade);
    }
    return { d: day.toLocaleDateString("en-US", { month: "short", day: "2-digit" }), v: roundCurrency(running) };
  });
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

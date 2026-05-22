import { dollarsFromCentsOrNumberOrNull } from "./money-fields";

export interface SettledPLInput {
  settledAt: Date | null | undefined;
  actualProfitLoss: number | null | undefined;
  actualProfitLossCents?: number | null | undefined;
}

export interface SnapshotPL {
  dailyPL: number;
  weeklyPL: number;
  monthlyPL: number;
}

export function computeSnapshotPL(
  settledRows: SettledPLInput[],
  snapshotAt: Date = new Date(),
): SnapshotPL {
  const dayStart = startOfDay(snapshotAt);
  const weekStart = new Date(dayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(dayStart);
  monthStart.setDate(monthStart.getDate() - 29);

  let dailyPL = 0;
  let weeklyPL = 0;
  let monthlyPL = 0;

  for (const row of settledRows) {
    if (!(row.settledAt instanceof Date)) continue;
    const pl = dollarsFromCentsOrNumberOrNull(
      row.actualProfitLossCents,
      row.actualProfitLoss,
    );
    if (pl == null) continue;

    const at = row.settledAt.getTime();
    if (at >= dayStart.getTime()) dailyPL += pl;
    if (at >= weekStart.getTime()) weeklyPL += pl;
    if (at >= monthStart.getTime()) monthlyPL += pl;
  }

  return {
    dailyPL: round2(dailyPL),
    weeklyPL: round2(weeklyPL),
    monthlyPL: round2(monthlyPL),
  };
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

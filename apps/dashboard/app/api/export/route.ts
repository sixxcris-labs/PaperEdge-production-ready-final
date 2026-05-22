import { db } from "@paperedge/database";
import {
  dollarsFromCentsOrNumber,
  dollarsFromCentsOrNumberOrNull,
} from "@paperedge/core/money-fields";
import { getDashboardLocalUser } from "@/apps/dashboard/lib/local-user";

export async function GET() {
  const user = await getDashboardLocalUser();

  const trades = await db.paperTrade.findMany({
    where: { userId: user.id },
    include: {
      legs: { include: { book: true } },
      result: true,
      mistakes: { include: { mistakeTag: true } },
    },
    orderBy: { tradeDate: "desc" },
  });

  const rows = trades.map((t) => {
    const legA = t.legs.find((l) => l.legLabel === "A");
    const legB = t.legs.find((l) => l.legLabel === "B");
    const mistakeNames = t.mistakes
      .map((m) => m.mistakeTag.name)
      .join("|");
    const stakeA = legA
      ? dollarsFromCentsOrNumber(legA.stakeCents, legA.stake)
      : null;
    const stakeB = legB
      ? dollarsFromCentsOrNumber(legB.stakeCents, legB.stake)
      : null;
    const expectedProfit = dollarsFromCentsOrNumberOrNull(
      t.worstCasePLCents,
      t.worstCasePL,
    );
    const actualProfitLoss = dollarsFromCentsOrNumberOrNull(
      t.result?.actualProfitLossCents,
      t.result?.actualProfitLoss,
    );
    return [
      new Date(t.tradeDate).toISOString().split("T")[0],
      t.sport,
      `"${t.eventName.replace(/"/g, '""')}"`,
      t.tradeType,
      t.bonusType,
      t.goal,
      legA?.book.name ?? "",
      legA?.side ?? "",
      legA?.oddsAmerican ?? "",
      stakeA?.toFixed(2) ?? "",
      legB?.book.name ?? "",
      legB?.side ?? "",
      legB?.oddsAmerican ?? "",
      stakeB?.toFixed(2) ?? "",
      expectedProfit?.toFixed(2) ?? "",
      actualProfitLoss?.toFixed(2) ?? "",
      t.status,
      t.result?.winningSide ?? "",
      mistakeNames,
      `"${(t.notes ?? "").replace(/"/g, '""')}"`,
    ].join(",");
  });

  const header =
    "trade_date,sport,event,trade_type,bonus_type,goal," +
    "book_a,side_a,odds_a,stake_a," +
    "book_b,side_b,odds_b,stake_b," +
    "expected_pl,actual_pl,status,winning_side,mistakes,notes";

  const csv = [header, ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="paperedge-trades-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}

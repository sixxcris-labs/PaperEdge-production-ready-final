import { db } from "@paperedge/database";

const LOCAL_USER_EMAIL = "local@paperedge.app";

export async function GET() {
  const user = await db.user.findUniqueOrThrow({
    where: { email: LOCAL_USER_EMAIL },
  });

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
      legA?.stake?.toFixed(2) ?? "",
      legB?.book.name ?? "",
      legB?.side ?? "",
      legB?.oddsAmerican ?? "",
      legB?.stake?.toFixed(2) ?? "",
      t.worstCasePL?.toFixed(2) ?? "",
      t.result?.actualProfitLoss?.toFixed(2) ?? "",
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

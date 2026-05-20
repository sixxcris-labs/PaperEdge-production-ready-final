import Link from "next/link";
import { db } from "@paperedge/database";
import { fmtUSD, fmtOdds } from "@paperedge/core/fmt";
import { BookCell, SportPill, StatusBadge } from "@/components/ui/design";
import { LockedTradesClient } from "./LockedTradesClient";

const LOCAL_USER_EMAIL = "local@paperedge.app";
export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const user = await db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });

  const trades = await db.paperTrade.findMany({
    where: { userId: user.id },
    include: {
      legs: { include: { book: true } },
      result: true,
    },
    orderBy: { tradeDate: "desc" },
  });

  const rows = trades.map((t) => {
    const legA = t.legs.find((l) => l.legLabel === "A");
    const legB = t.legs.find((l) => l.legLabel === "B");
    return {
      id: t.id,
      customTradeId: t.customTradeId,
      date: t.tradeDate.toISOString().slice(0, 10),
      time: t.tradeDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      sport: t.sport ?? "other",
      eventName: t.eventName,
      marketType: t.marketType ?? "",
      player: t.player ?? "",
      bookA: legA?.book.name ?? "—",
      sideA: legA?.side ?? "",
      oddsA: legA?.oddsAmerican ?? null,
      stakeA: legA?.stake ?? 0,
      bookB: legB?.book.name ?? "—",
      sideB: legB?.side ?? "",
      oddsB: legB?.oddsAmerican ?? null,
      stakeB: legB?.stake ?? 0,
      expectedProfit: t.worstCasePL ?? t.expectedProfitIfA ?? 0,
      actualPL: t.result?.actualProfitLoss ?? null,
      status: t.status,
    };
  });

  return <LockedTradesClient trades={rows} />;
}

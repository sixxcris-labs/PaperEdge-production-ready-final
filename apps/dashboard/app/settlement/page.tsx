import { db } from "@paperedge/database";
import { groupList } from "@paperedge/core/status";
import { dollarsFromCentsOrNumber, dollarsFromCentsOrNumberOrNull } from "@paperedge/core/money-fields";
import { SettlementClient } from "./SettlementClient";
import { getDashboardLocalUser } from "@/apps/dashboard/lib/local-user";
export const dynamic = "force-dynamic";

export default async function SettlementPage() {
  const user = await getDashboardLocalUser();

  const candidates = await db.paperTrade.findMany({
    where: {
      userId: user.id,
      status: {
        in: [
          ...groupList("candidate"),
          ...groupList("ready_to_lock"),
          ...groupList("locked_open"),
          ...groupList("pending_settlement"),
        ],
      },
    },
    include: { legs: { include: { book: true } }, result: true },
    orderBy: { tradeDate: "desc" },
  });

  const rows = candidates.map((t) => {
    const legA = t.legs.find((l) => l.legLabel === "A");
    const legB = t.legs.find((l) => l.legLabel === "B");
    return {
      id: t.id,
      customTradeId: t.customTradeId,
      sport: t.sport ?? "other",
      eventName: t.eventName,
      marketType: t.marketType ?? "",
      player: t.player ?? "",
      time: t.tradeDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      date: t.tradeDate.toISOString().slice(0, 10),
      status: t.status,
      expectedProfit:
        dollarsFromCentsOrNumberOrNull(t.worstCasePLCents, t.worstCasePL) ??
        dollarsFromCentsOrNumberOrNull(
          t.expectedProfitIfACents,
          t.expectedProfitIfA,
        ) ??
        0,
      bookA: legA?.book.name ?? "—",
      sideA: legA?.side ?? "",
      oddsA: legA?.oddsAmerican ?? 0,
      stakeA: legA
        ? dollarsFromCentsOrNumber(legA.stakeCents, legA.stake)
        : 0,
      bookB: legB?.book.name ?? "—",
      sideB: legB?.side ?? "",
      oddsB: legB?.oddsAmerican ?? 0,
      stakeB: legB
        ? dollarsFromCentsOrNumber(legB.stakeCents, legB.stake)
        : 0,
    };
  });

  return <SettlementClient candidates={rows} />;
}

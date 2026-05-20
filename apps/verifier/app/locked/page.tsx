import Link from "next/link";
import { db } from "@paperedge/database";
import { fmtUSD } from "@paperedge/core/fmt";
import { LOCAL_USER_EMAIL } from "@/lib/opportunity-service";

export const dynamic = "force-dynamic";

export default async function LockedOpportunitiesPage() {
  const user = await db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });
  const opportunities = await db.tradeOpportunity.findMany({
    where: { userId: user.id, status: "locked" },
    include: { bookA: true, bookB: true, lockedTrade: true },
    orderBy: { lockedAt: "desc" },
  });
  return (
    <div className="page">
      <div className="page-head"><div><p className="eyebrow">Locked</p><h1>Locked From Queue</h1><p>Verified opportunities promoted to dashboard paper trades.</p></div></div>
      <div className="card"><div className="card-pad stack">
        {opportunities.map((o) => (
          <div key={o.id} className="row" style={{ justifyContent: "space-between" }}>
            <div><b>{o.event}</b><div className="hint">{o.bookA?.name ?? "A"} / {o.bookB?.name ?? "B"}</div></div>
            <div className="num">{o.expectedProfitMin != null ? fmtUSD(o.expectedProfitMin, { sign: true }) : "—"}</div>
            {o.lockedTradeId && <a className="btn ghost" href={`${process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3000"}/trades/${o.lockedTradeId}`}>Open trade</a>}
          </div>
        ))}
        {opportunities.length === 0 && <p className="hint">No locked opportunities yet. <Link href="/verify">Open queue.</Link></p>}
      </div></div>
    </div>
  );
}

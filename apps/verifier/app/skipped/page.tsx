import { db } from "@paperedge/database";
import { getLocalUser } from "@/lib/opportunity-service";

export const dynamic = "force-dynamic";

export default async function SkippedPage() {
  const user = await getLocalUser();
  const opportunities = await db.tradeOpportunity.findMany({
    where: { userId: user.id, OR: [{ status: "skipped" }, { status: { startsWith: "failed_" } }] },
    include: { bookA: true, bookB: true },
    orderBy: [{ failedAt: "desc" }, { skippedAt: "desc" }, { importedAt: "desc" }],
  });
  return (
    <div className="page">
      <div className="page-head"><div><p className="eyebrow">Failed verification</p><h1>Skipped / Failed</h1><p>Audit trail of opportunities that did not pass verification.</p></div></div>
      <div className="card"><div className="card-pad stack">
        {opportunities.map((o) => (
          <div key={o.id} className="row" style={{ justifyContent: "space-between" }}>
            <div><b>{o.event}</b><div className="hint">{o.bookA?.name ?? "A"} / {o.bookB?.name ?? "B"}</div></div>
            <span className="badge b-warn"><span className="dot" />{o.failureReason ?? o.status}</span>
          </div>
        ))}
        {opportunities.length === 0 && <p className="hint">No failed opportunities yet.</p>}
      </div></div>
    </div>
  );
}

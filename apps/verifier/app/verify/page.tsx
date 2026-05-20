import Link from "next/link";
import { db } from "@paperedge/database";
import { fmtUSD } from "@paperedge/core/fmt";
import { LOCAL_USER_EMAIL } from "@/lib/opportunity-service";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const user = await db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });
  const opportunities = await db.tradeOpportunity.findMany({
    where: { userId: user.id, NOT: [{ status: "locked" }, { status: "skipped" }] },
    include: { bookA: true, bookB: true },
    orderBy: { importedAt: "desc" },
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Queue</p>
          <h1>Verification Queue</h1>
          <p>{opportunities.length} opportunities awaiting verification or lock.</p>
        </div>
        <Link className="btn primary" href="/import">Import</Link>
      </div>
      <div className="card">
        <div className="card-pad" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Event</th><th>Books</th><th>Market</th><th>Status</th><th>Expected</th><th /></tr></thead>
            <tbody>
              {opportunities.map((o) => (
                <tr key={o.id}>
                  <td><b>{o.event}</b><div className="hint">{o.playerOrTeam ?? o.sport}</div></td>
                  <td>{o.bookA?.name ?? "Book A"} / {o.bookB?.name ?? "Book B"}</td>
                  <td>{o.market}</td>
                  <td><span className="badge b-needs"><span className="dot" />{o.status}</span></td>
                  <td className="num">{o.expectedProfitMin != null ? fmtUSD(o.expectedProfitMin, { sign: true }) : "—"}</td>
                  <td><Link className="btn ghost" href={`/verify/${o.id}`}>Verify</Link></td>
                </tr>
              ))}
              {opportunities.length === 0 && <tr><td colSpan={6} className="hint">No opportunities in the queue.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

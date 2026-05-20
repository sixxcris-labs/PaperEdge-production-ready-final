import Link from "next/link";
import { db } from "@paperedge/database";
import { buildPerBookPassRates, buildVerificationFunnel } from "@paperedge/core/verification-analytics";
import { fmtPct, fmtUSD } from "@paperedge/core/fmt";
import { LOCAL_USER_EMAIL } from "@/lib/opportunity-service";

export const dynamic = "force-dynamic";

export default async function VerifierHomePage() {
  const user = await db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });
  const opportunities = await db.tradeOpportunity.findMany({
    where: { userId: user.id },
    include: { bookA: true, bookB: true },
    orderBy: { importedAt: "desc" },
  });
  const funnel = buildVerificationFunnel(opportunities);
  const passRates = buildPerBookPassRates(opportunities).slice(0, 8);
  const queued = opportunities.filter((o) => o.status === "queued_for_verification" || o.status === "imported");
  const ready = opportunities.filter((o) => o.status === "ready_to_lock" || o.status === "books_verified");
  const locked = opportunities.filter((o) => o.status === "locked");
  const expectedMin = opportunities.reduce((sum, o) => sum + (o.expectedProfitMin ?? 0), 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Verifier</p>
          <h1>Verification Health</h1>
          <p>Import opportunities, verify the market on the books, then lock only the candidates that pass.</p>
        </div>
        <div className="actions">
          <Link href="/import" className="btn primary">Import Opportunities</Link>
          <Link href="/verify" className="btn ghost">Open Queue</Link>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <Kpi label="Queued" value={String(queued.length)} />
        <Kpi label="Ready / verifying" value={String(ready.length)} />
        <Kpi label="Locked" value={String(locked.length)} />
        <Kpi label="Imported min EV" value={fmtUSD(expectedMin, { sign: true })} />
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><h3>Funnel</h3></div>
          <div className="card-pad stack">
            {funnel.map((row) => (
              <div key={row.bucket} className="row tight" style={{ justifyContent: "space-between" }}>
                <span>{row.bucket.replace(/_/g, " ")}</span>
                <b className="num">{row.count}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Book pass rates</h3></div>
          <div className="card-pad stack">
            {passRates.length === 0 ? <p className="hint">No book verification history yet.</p> : passRates.map((row) => (
              <div key={row.bookId} className="row tight" style={{ justifyContent: "space-between" }}>
                <span>{row.bookName}</span>
                <span className="num">{fmtPct(row.passRatePct)} · {row.passed}/{row.total}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="card"><div className="card-pad"><div className="kpi"><span>{label}</span><b>{value}</b></div></div></div>;
}

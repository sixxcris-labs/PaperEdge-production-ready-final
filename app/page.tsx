export default function WorkspaceLauncherPage() {
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3000";
  const verifierUrl = process.env.NEXT_PUBLIC_VERIFIER_URL ?? "http://localhost:3001";
  return (
    <main className="page" style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px" }}>
      <p className="eyebrow">PaperEdge</p>
      <h1>Verification-first paper trading workspace</h1>
      <p className="hint" style={{ fontSize: 16 }}>
        The production routes now live in the split workspace apps. Run the dashboard for locked trades and reporting, and the verifier for import, book checks, deep links, and lock promotion.
      </p>
      <div className="grid cols-2" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="card-head"><h3>Dashboard app</h3></div>
          <div className="card-pad stack">
            <p>Locked paper trades, settlement, P/L, mistakes, bankroll, books, and settings.</p>
            <code>npm --workspace @paperedge/dashboard run dev</code>
            <a className="btn primary" href={dashboardUrl}>Open dashboard</a>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Verifier app</h3></div>
          <div className="card-pad stack">
            <p>Bulk import, verification queue, deep links, Chrome extension support, and lock promotion.</p>
            <code>npm --workspace @paperedge/verifier run dev</code>
            <a className="btn primary" href={verifierUrl}>Open verifier</a>
          </div>
        </div>
      </div>
      <div className="callout" style={{ marginTop: 24 }}>
        PaperEdge is a coach, tracker, calculator, and verifier. It does not place bets, log into books, auto-click sportsbook actions, or bypass geo/KYC checks.
      </div>
    </main>
  );
}

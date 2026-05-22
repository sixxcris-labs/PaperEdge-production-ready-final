import { db } from "@paperedge/database";
import { fmtUSD, fmtOdds } from "@paperedge/core/fmt";
import { Sparkline, bookInfo } from "@/components/ui/design";
import Link from "next/link";
import { getDashboardLocalUser } from "@/apps/dashboard/lib/local-user";
export const dynamic = "force-dynamic";

export default async function BooksPage() {
  const user = await getDashboardLocalUser();

  // Compute per-book stats from legs
  const legs = await db.tradeLeg.findMany({
    where: { trade: { userId: user.id } },
    include: { book: true, trade: { include: { result: true } } },
  });

  const bookStats: Record<string, {
    name: string;
    trades: number;
    stake: number;
    profit: number;
    mistakes: number;
    verified: number;
    attempts: number;
  }> = {};

  for (const leg of legs) {
    const name = leg.book.name;
    if (!bookStats[name]) {
      bookStats[name] = { name, trades: 0, stake: 0, profit: 0, mistakes: 0, verified: 0, attempts: 0 };
    }
    bookStats[name].trades++;
    bookStats[name].stake += leg.stake;
    bookStats[name].profit += (leg.trade.result?.actualProfitLoss ?? 0) / 2;
    bookStats[name].attempts++;
    if (leg.verificationStatus === "verified") bookStats[name].verified++;
  }

  const statsRows = Object.values(bookStats).sort((a, b) => b.profit - a.profit);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Book Performance</h1>
          <p>How each sportsbook has performed across your paper trades.</p>
        </div>
        <div className="actions">
          <Link href="/books/manage" className="btn ghost">Manage books →</Link>
          <div className="toggle">
            <button className="on">All time</button>
            <button>YTD</button>
            <button>30D</button>
          </div>
        </div>
      </div>

      {statsRows.length === 0 ? (
        <div className="card card-pad" style={{ color: "var(--fg-3)", textAlign: "center", padding: "40px" }}>
          No book data yet.{" "}
          <Link href="/trades/new" style={{ color: "var(--info)" }}>Add your first paper trade →</Link>
        </div>
      ) : (
        <>
          {/* Book cards grid */}
          <div className="grid cols-3" style={{ gap: 14, marginBottom: 14 }}>
            {statsRows.map((s) => {
              const info = bookInfo(s.name);
              const reliability = s.attempts > 0 ? (s.verified / s.attempts) * 100 : 0;
              const sparkData = [s.profit * 0.1, s.profit * 0.3, s.profit * 0.55, s.profit * 0.72, s.profit * 0.88, s.profit].map((v) => v + 20);
              return (
                <div key={s.name} className="card">
                  <div className="card-head">
                    <span className={`book-av ${info.cls}`} style={{ width: 28, height: 28, fontSize: 12 }}>{info.initials}</span>
                    <div>
                      <h3 style={{ marginBottom: 0 }}>{s.name}</h3>
                      <span className="sub">{s.trades} paper trades</span>
                    </div>
                    <div className="right">
                      {s.profit >= 0
                        ? <span className="badge b-profit"><span className="dot" />net positive</span>
                        : <span className="badge b-loss"><span className="dot" />net negative</span>}
                    </div>
                  </div>
                  <div className="card-pad">
                    <div className="row" style={{ gap: 16, marginBottom: 12 }}>
                      <div>
                        <div className="hint">Profit / loss</div>
                        <div className={`num ${s.profit >= 0 ? "pos" : "neg"}`} style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>
                          {fmtUSD(s.profit, { sign: true })}
                        </div>
                      </div>
                      <div className="right">
                        <Sparkline data={sparkData} color={s.profit >= 0 ? "#22C55E" : "#EF4444"} width={120} height={36} />
                      </div>
                    </div>
                    <dl className="kv">
                      <dt>Total trades</dt><dd>{s.trades}</dd>
                      <dt>Total stake</dt><dd>{fmtUSD(s.stake)}</dd>
                      <dt>Mistakes flagged</dt><dd className={s.mistakes > 0 ? "neg" : ""}>{s.mistakes}</dd>
                      <dt>Verification reliability</dt>
                      <dd className={reliability >= 95 ? "pos" : reliability >= 90 ? "" : "neg"}>
                        {reliability.toFixed(1)}%
                      </dd>
                    </dl>
                    <div className="divider" />
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="hint">Reliability index</span>
                      <div className="pbar" style={{ flex: 1, marginLeft: 12 }}>
                        <span className="p" style={{ width: `${reliability}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comparison table */}
          <div className="card">
            <div className="card-head"><h3>Comparison</h3><span className="sub">side-by-side</span></div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Sportsbook</th>
                    <th className="num">Trades</th>
                    <th className="num">Total stake</th>
                    <th className="num">P/L</th>
                    <th className="num">Mistakes</th>
                    <th>Reliability</th>
                  </tr>
                </thead>
                <tbody>
                  {statsRows.map((s) => {
                    const info = bookInfo(s.name);
                    const reliability = s.attempts > 0 ? (s.verified / s.attempts) * 100 : 0;
                    return (
                      <tr key={s.name}>
                        <td>
                          <span className="book-row">
                            <span className={`book-av ${info.cls}`}>{info.initials}</span>
                            {s.name}
                          </span>
                        </td>
                        <td className="num">{s.trades}</td>
                        <td className="num">{fmtUSD(s.stake)}</td>
                        <td className={`num ${s.profit >= 0 ? "pos" : "neg"}`}>{fmtUSD(s.profit, { sign: true })}</td>
                        <td className={`num ${s.mistakes > 0 ? "neg" : "muted"}`}>{s.mistakes}</td>
                        <td>
                          <div className="row tight">
                            <div className="pbar" style={{ width: 120 }}>
                              <span
                                className={reliability >= 95 ? "p" : "l"}
                                style={{
                                  width: `${reliability}%`,
                                  background: reliability >= 95 ? "var(--profit)" : reliability >= 90 ? "var(--warn)" : "var(--loss)",
                                }}
                              />
                            </div>
                            <span className="num muted" style={{ fontSize: 11.5 }}>{reliability.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

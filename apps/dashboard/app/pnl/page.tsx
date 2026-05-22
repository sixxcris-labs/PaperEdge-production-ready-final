import { db } from "@paperedge/database";
import { fmtUSD, fmtPct } from "@paperedge/core/fmt";
import { dollarsFromCentsOrNumber, dollarsFromCentsOrNumberOrNull } from "@paperedge/core/money-fields";
import { KPI, BarChart } from "@/components/ui/design";
import { STATUS, groupList } from "@paperedge/core/status";
import { getDashboardLocalUser } from "@/apps/dashboard/lib/local-user";
export const dynamic = "force-dynamic";

const MONTHLY_PROFIT = [
  { m: "Dec", v: 184 },
  { m: "Jan", v: 246 },
  { m: "Feb", v: 312 },
  { m: "Mar", v: 268 },
  { m: "Apr", v: 388 },
  { m: "May", v: 421 },
];

export default async function PnLPage() {
  const user = await getDashboardLocalUser();

  const settled = await db.paperTrade.findMany({
    where: {
      userId: user.id,
      status: { in: groupList("settled") },
    },
    include: { legs: { include: { book: true } }, result: true },
    orderBy: { tradeDate: "desc" },
  });

  const also = await db.paperTrade.findMany({
    where: { userId: user.id, status: { in: [STATUS.mistake_invalid, STATUS.mistake] } },
    include: { legs: { include: { book: true } }, result: true },
    orderBy: { tradeDate: "desc" },
  });

  const allSettled = [...settled, ...also];
  const tradeActual = (trade: (typeof allSettled)[number]) =>
    dollarsFromCentsOrNumber(
      trade.result?.actualProfitLossCents,
      trade.result?.actualProfitLoss,
    );
  const tradeExpected = (trade: (typeof allSettled)[number]) => {
    const worstCase = dollarsFromCentsOrNumberOrNull(
      trade.worstCasePLCents,
      trade.worstCasePL,
    );
    if (worstCase != null) return worstCase;
    const a = dollarsFromCentsOrNumberOrNull(
      trade.expectedProfitIfACents,
      trade.expectedProfitIfA,
    );
    const b = dollarsFromCentsOrNumberOrNull(
      trade.expectedProfitIfBCents,
      trade.expectedProfitIfB,
    );
    if (a != null && b != null) return Math.min(a, b);
    return a ?? b ?? 0;
  };
  const tradeStake = (trade: (typeof allSettled)[number]) =>
    dollarsFromCentsOrNumber(
      trade.totalStakeExposureCents,
      trade.totalStakeExposure,
    );

  // expectedProfitRange is a free-text string — use the numeric fields instead.
  const totalExpected = allSettled.reduce(
    (s, t) => s + tradeExpected(t),
    0
  );
  const totalActual = allSettled.reduce((s, t) => s + tradeActual(t), 0);
  const wins = allSettled.filter((t) => tradeActual(t) > 0).length;
  const winRate = allSettled.length ? (wins / allSettled.length) * 100 : 0;
  const avgProfit = allSettled.length ? totalActual / allSettled.length : 0;
  const totalStaked = allSettled.reduce((s, t) => s + tradeStake(t), 0);
  const avgStake = allSettled.length ? totalStaked / allSettled.length : 0;
  const roi = totalStaked > 0 ? (totalActual / totalStaked) * 100 : 0;

  const best = allSettled.reduce<typeof allSettled[0] | null>((b, t) =>
    !b || tradeActual(t) > tradeActual(b) ? t : b, null);
  const worst = allSettled.reduce<typeof allSettled[0] | null>((b, t) =>
    !b || tradeActual(t) < tradeActual(b) ? t : b, null);

  // Profit by book
  const bookProfitMap: Record<string, { name: string; profit: number }> = {};
  for (const t of allSettled) {
    for (const leg of t.legs) {
      const name = leg.book.name;
      if (!bookProfitMap[name]) bookProfitMap[name] = { name, profit: 0 };
      // Credit half the P/L to each leg (approximate)
      bookProfitMap[name].profit += tradeActual(t) / 2;
    }
  }
  const profitByBook = Object.values(bookProfitMap).sort((a, b) => b.profit - a.profit).map((b) => ({ m: b.name, v: Math.round(b.profit * 100) / 100 }));

  // Profit by market
  const marketProfitMap: Record<string, number> = {};
  for (const t of allSettled) {
    const market = t.marketType ?? "Other";
    marketProfitMap[market] = (marketProfitMap[market] ?? 0) + tradeActual(t);
  }
  const profitByMarket = Object.entries(marketProfitMap).map(([m, v]) => ({ m, v: Math.round(v * 100) / 100 })).sort((a, b) => b.v - a.v);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Profit / Loss Tracker</h1>
          <p>How your expected edge has translated to realized P/L.</p>
        </div>
        <div className="actions">
          <div className="toggle">
            <button className="on">All time</button>
            <button>YTD</button>
            <button>30D</button>
            <button>7D</button>
          </div>
          <a href="/api/export" download className="btn ghost">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>
            Export
          </a>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <KPI label="Total expected profit" value={fmtUSD(totalExpected, { sign: true })} sub={`${allSettled.length} settled trades`} />
        <KPI label="Total actual profit"   value={fmtUSD(totalActual, { sign: true })} delta={`${fmtPct(roi)} ROI`} up={totalActual >= 0} down={totalActual < 0} />
        <KPI label="Expected vs Actual"    value={fmtUSD(totalActual - totalExpected, { sign: true })} delta={totalActual >= totalExpected ? "Outperforming model" : "Below expected"} up={totalActual >= totalExpected} down={totalActual < totalExpected} />
        <KPI label="Win rate"              value={`${winRate.toFixed(1)}%`} sub={`${wins} / ${allSettled.length} settled`} />
        <KPI label="Avg. profit / trade"   value={fmtUSD(avgProfit, { sign: true })} sub="per settled trade" />
        <KPI label="Avg. stake / trade"    value={fmtUSD(avgStake)} sub="combined both books" />
        <KPI label="Best trade"            value={fmtUSD(best ? tradeActual(best) : 0, { sign: true })} sub={best?.eventName ?? "—"} up />
        <KPI label="Worst trade"           value={fmtUSD(worst ? tradeActual(worst) : 0, { sign: true })} sub={worst?.eventName ?? "—"} down />
      </div>

      {/* Charts */}
      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-head"><h3>Monthly profit</h3><span className="sub">last 6 months (sample)</span></div>
          <div className="chart-wrap"><BarChart data={MONTHLY_PROFIT} color="#22C55E" /></div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Profit by sportsbook</h3><span className="sub">net realized P/L</span></div>
          <div className="chart-wrap">
            {profitByBook.length > 0
              ? <BarChart data={profitByBook.slice(0, 8)} color="#3B82F6" />
              : <div className="card-pad hint">No settled trades yet.</div>}
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><h3>Profit by market</h3><span className="sub">where your edge lives</span></div>
          <div className="chart-wrap">
            {profitByMarket.length > 0
              ? <BarChart data={profitByMarket.slice(0, 8)} color="#8B5CF6" />
              : <div className="card-pad hint">No settled trades yet.</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Expected vs Actual (settled)</h3><span className="sub">per-trade variance</span></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Trade</th>
                  <th>Event</th>
                  <th className="num">Expected</th>
                  <th className="num">Actual</th>
                  <th className="num">Variance</th>
                </tr>
              </thead>
              <tbody>
                {allSettled.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "var(--fg-4)" }}>No settled trades yet.</td></tr>
                ) : (
                  allSettled.map((t) => {
                    const actual = tradeActual(t);
                    const expected = tradeExpected(t);
                    const variance = actual - expected;
                    return (
                      <tr key={t.id}>
                        <td className="num muted">{t.customTradeId ?? t.id.slice(0, 8)}</td>
                        <td>
                          <b>{t.eventName}</b>
                          <div className="hint">{t.marketType}</div>
                        </td>
                        <td className="num">{fmtUSD(expected, { sign: true })}</td>
                        <td className={`num ${actual >= 0 ? "pos" : "neg"}`}>{fmtUSD(actual, { sign: true })}</td>
                        <td className={`num ${variance >= 0 ? "pos" : "neg"}`}>{fmtUSD(variance, { sign: true })}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

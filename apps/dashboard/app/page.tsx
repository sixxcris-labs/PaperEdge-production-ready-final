import Link from "next/link";
import { db } from "@paperedge/database";
import { fmtUSD, fmtPct, fmtOdds } from "@paperedge/core/fmt";
import { KPI, LineChart, GroupedBarChart, BookCell, SportPill, StatusBadge } from "@/components/ui/design";
import { RefreshButton } from "@/components/RefreshButton";
import {
  hasCandidateExposure,
  hasOpenExposure,
  isFailedVerification,
  isPendingSettlement,
  isSettled,
  isVisibleOnDashboard,
  settledKind,
} from "@paperedge/core/status";
import {
  getConservativeExpectedProfit,
  sumActualProfitLoss,
  sumOpenExposure,
  sumCandidateExposure,
  sumConservativeExpectedProfit,
  getRealizedRoiPct,
  getLargestExposurePct,
} from "@paperedge/core/trade-metrics";
import {
  buildBankrollSeries,
  buildDailyExpectedVsActual,
} from "@paperedge/core/dashboard-series";

const LOCAL_USER_EMAIL = "local@paperedge.app";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });
  const settings = await db.userSettings.findUnique({ where: { userId: user.id } });

  // Dashboard ignores draft/excluded rows globally; everything past this point
  // is "trades the user cares about".
  const allTrades = await db.paperTrade.findMany({
    where: { userId: user.id },
    include: { legs: { include: { book: true } }, result: true },
    orderBy: { tradeDate: "desc" },
  });
  const trades = allTrades.filter((t) => isVisibleOnDashboard(t.status));

  const snapshots = await db.bankrollSnapshot.findMany({
    where: { userId: user.id },
    orderBy: { snapshotDate: "asc" },
  });

  // Process-discipline + bankroll-mechanics queries. Kept separate from the
  // main trades fetch so adding/removing a card doesn't reshape that include.
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [tradesWithChecklist, overrides30, mistakes30, books] = await Promise.all([
    db.paperTrade.findMany({
      where: { userId: user.id },
      select: {
        status: true,
        checklist: { select: { checklistComplete: true } },
      },
    }),
    db.checklistOverride.count({
      where: { createdAt: { gte: last30 }, trade: { userId: user.id } },
    }),
    db.tradeMistake.findMany({
      where: { createdAt: { gte: last30 }, trade: { userId: user.id } },
      select: { mistakeTag: { select: { name: true } } },
    }),
    db.book.findMany({
      where: { userId: user.id },
      select: {
        role: true,
        currentBalance: true,
        rolloverRemaining: true,
        available: true,
      },
    }),
  ]);

  // Bucket trades by canonical group via predicates from lib/status.ts.
  const openTrades = trades.filter((t) => hasOpenExposure(t.status));
  const candidateTrades = trades.filter((t) => hasCandidateExposure(t.status));
  const settledTrades = trades.filter((t) => isSettled(t.status));
  const needsVerification = trades.filter(
    (t) => hasCandidateExposure(t.status) || isPendingSettlement(t.status),
  );
  const failedTrades = trades.filter((t) => isFailedVerification(t.status));

  // Metrics via lib/trade-metrics.ts — never compute exposure or expected
  // profit inline in this component again.
  const lockedExposure = sumOpenExposure(openTrades);
  const candidateExposure = sumCandidateExposure(candidateTrades);
  const expectedProfit = sumConservativeExpectedProfit(openTrades);
  const actualPL = sumActualProfitLoss(settledTrades);
  const roi = getRealizedRoiPct(settledTrades);

  // Capital ever deployed (settled + currently open). Excludes candidates and
  // failed verification, which never had real exposure.
  const totalStaked =
    sumOpenExposure(openTrades) +
    settledTrades.reduce((s, t) => s + (t.totalStakeExposure ?? 0), 0);

  const startingBankroll = settings?.startingBankroll ?? 10000;
  const currentBankroll = settings?.currentBankroll ?? (startingBankroll + actualPL);
  const bankrollPct = startingBankroll > 0 ? ((currentBankroll - startingBankroll) / startingBankroll) * 100 : 0;

  const winsCount = settledTrades.filter((t) => settledKind(t.status) === "win").length;
  const lossCount = settledTrades.filter((t) => settledKind(t.status) === "loss").length;
  const voidedCount = settledTrades.filter((t) => settledKind(t.status) === "push").length;

  // ── Process Discipline ────────────────────────────────────────────────────
  // Pass rate: trades that reached a terminal state (settled or post-lock)
  // AND have a completed checklist, vs the same denominator. Drafts and
  // candidates don't count -- they haven't reached the checklist gate yet.
  const checklistEligible = tradesWithChecklist.filter(
    (t) => isVisibleOnDashboard(t.status) && !hasCandidateExposure(t.status),
  );
  const checklistPassed = checklistEligible.filter(
    (t) => t.checklist?.checklistComplete === true,
  ).length;
  const checklistPassPct =
    checklistEligible.length > 0
      ? (checklistPassed / checklistEligible.length) * 100
      : 0;

  // Top mistake tag in last 30 days.
  const mistakeCounts = new Map<string, number>();
  for (const m of mistakes30) {
    const name = m.mistakeTag?.name;
    if (!name) continue;
    mistakeCounts.set(name, (mistakeCounts.get(name) ?? 0) + 1);
  }
  const topMistake = [...mistakeCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  // ── Bankroll Mechanics ────────────────────────────────────────────────────
  const rolloverBooks = books.filter(
    (b) => b.available && (b.rolloverRemaining ?? 0) > 0,
  );
  const rolloverRemainingTotal = rolloverBooks.reduce(
    (s, b) => s + (b.rolloverRemaining ?? 0),
    0,
  );

  // Liquid bankroll = current bankroll minus locked open exposure minus
  // balances sitting on rollover-restricted books. Conservative view: money
  // the user can still move freely.
  const rolloverBookBalance = rolloverBooks.reduce(
    (s, b) => s + (b.currentBalance ?? 0),
    0,
  );
  const liquidBankroll = Math.max(
    0,
    currentBankroll - lockedExposure - rolloverBookBalance,
  );

  const largestExposurePct = getLargestExposurePct(openTrades, currentBankroll);

  // Real, DB-backed chart data. When no BankrollSnapshot rows cover the
  // window, the series reconstructs from starting bankroll + cumulative
  // realized P&L; see buildBankrollSeries for the fallback rules.
  const bankrollSeries = buildBankrollSeries(
    snapshots,
    settledTrades,
    startingBankroll,
    30,
  );
  const dailyEvA = buildDailyExpectedVsActual(settledTrades, 14);

  const bankrollWindowDelta =
    bankrollSeries.length > 1
      ? bankrollSeries[bankrollSeries.length - 1].v - bankrollSeries[0].v
      : 0;
  const hasSnapshotData = snapshots.some(
    (s) => s.snapshotDate.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000,
  );
  const hasSettledHistory = settledTrades.length > 0;

  // Today's trades (last 5)
  const today = new Date().toISOString().slice(0, 10);
  const todayTrades = trades.filter((t) => t.tradeDate.toISOString().slice(0, 10) === today).slice(0, 8);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>{new Date().toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })} · Paper account · No live betting</p>
        </div>
        <div className="actions">
          <RefreshButton />
          <a href="/api/export" download className="btn ghost">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>
            Export
          </a>
          <Link href="/trades/new" className="btn primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            Add Paper Trade
          </Link>
        </div>
      </div>

      {/* ─── Performance ─── */}
      <h2 className="section-title">Performance</h2>
      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <KPI
          label="Paper Bankroll"
          value={fmtUSD(currentBankroll)}
          delta={`${fmtPct(bankrollPct)} all-time`}
          up={bankrollPct >= 0}
        />
        <KPI
          label="Settled P/L"
          value={fmtUSD(actualPL, { sign: true })}
          delta={`${fmtPct(roi)} ROI realized`}
          sub={`${winsCount}W · ${lossCount}L · ${voidedCount}V`}
          up={actualPL >= 0}
          down={actualPL < 0}
        />
        <KPI
          label="Locked Open Exposure"
          value={fmtUSD(lockedExposure)}
          sub={`${openTrades.length} locked · ${fmtUSD(expectedProfit, { sign: true })} exp.`}
          warn={lockedExposure > 0}
        />
      </div>

      {/* ─── Process Discipline ─── */}
      <h2 className="section-title">Process Discipline</h2>
      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <KPI
          label="Checklist Pass Rate"
          value={
            checklistEligible.length > 0
              ? `${checklistPassPct.toFixed(0)}%`
              : "—"
          }
          sub={
            checklistEligible.length > 0
              ? `${checklistPassed} / ${checklistEligible.length} trades`
              : "no eligible trades yet"
          }
          up={checklistPassPct >= 90}
          warn={checklistEligible.length > 0 && checklistPassPct < 90}
        />
        <KPI
          label="Overrides (30d)"
          value={overrides30}
          sub="checklist forced through"
          warn={overrides30 > 0}
        />
        <KPI
          label="Top Mistake Tag (30d)"
          value={topMistake ? topMistake[0] : "—"}
          sub={
            topMistake
              ? `${topMistake[1]}× in last 30 days`
              : "no mistakes logged"
          }
          warn={!!topMistake}
        />
      </div>

      {/* ─── Bankroll Mechanics ─── */}
      <h2 className="section-title">Bankroll Mechanics</h2>
      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <KPI
          label="Active Rollover Books"
          value={rolloverBooks.length}
          sub={`${fmtUSD(rolloverRemainingTotal)} remaining`}
          warn={rolloverBooks.length > 0}
        />
        <KPI
          label="Liquid Bankroll"
          value={fmtUSD(liquidBankroll)}
          sub={`after exposure + rollover hold`}
        />
        <KPI
          label="Largest Single-Trade Exposure"
          value={
            openTrades.length > 0
              ? `${largestExposurePct.toFixed(1)}%`
              : "—"
          }
          sub={
            openTrades.length > 0
              ? "of current bankroll"
              : "no open trades"
          }
          warn={largestExposurePct > 5}
        />
      </div>

      {/* Candidates and verification failures sit below the three required
          rows -- they describe the queue, not the locked book of business. */}
      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <KPI
          label="Candidate Exposure"
          value={fmtUSD(candidateExposure)}
          sub={`${candidateTrades.length} unverified opportunity${candidateTrades.length === 1 ? "" : "s"}`}
        />
        <KPI
          label="Failed Verification"
          value={failedTrades.length}
          sub="never placed"
        />
        <KPI
          label="Total Capital Used"
          value={fmtUSD(totalStaked)}
          sub={`${openTrades.length + settledTrades.length} locked + settled`}
        />
      </div>

      {/* Warning panel — stale trades */}
      {needsVerification.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--warn-bd)" }}>
          <div className="card-head" style={{ background: "var(--warn-bg)" }}>
            <span style={{ color: "var(--warn)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z"/>
              </svg>
            </span>
            <h3 style={{ color: "var(--warn)" }}>Trades Needing Review</h3>
            <span className="sub">{needsVerification.length} trade{needsVerification.length !== 1 ? "s" : ""} · needs verification or settlement</span>
            <div className="right">
              <Link href="/settlement" className="btn warn sm">Review all</Link>
            </div>
          </div>
          <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {needsVerification.slice(0, 5).map((t) => (
              <div key={t.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 120px 120px", gap: 12, alignItems: "center", padding: "6px 0" }}>
                <span className="muted num" style={{ fontSize: 11.5 }}>{t.customTradeId ?? t.id.slice(0, 8)}</span>
                <div>
                  <b style={{ fontSize: 13 }}>{t.eventName}</b>
                  <div className="hint">{t.marketType}</div>
                </div>
                <span className="hint">needs re-verification</span>
                <span className="num pos" style={{ fontSize: 12.5 }}>
                  {fmtUSD(getConservativeExpectedProfit(t), { sign: true })} <span className="muted">exp.</span>
                </span>
                <div style={{ textAlign: "right" }}>
                  <Link href="/settlement" className="btn sm">Review →</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-head">
            <h3>Paper Bankroll</h3>
            <span className="sub">
              last 30 days · {hasSnapshotData
                ? "snapshots"
                : hasSettledHistory
                  ? "reconstructed from settled P/L"
                  : "no history yet"}
            </span>
            <div className="right">
              <div className="toggle">
                <button>7D</button>
                <button className="on">30D</button>
                <button>90D</button>
                <button>YTD</button>
              </div>
            </div>
          </div>
          <div className="chart-wrap">
            <LineChart data={bankrollSeries} color="#22C55E" />
          </div>
          <div className="chart-legend">
            <span><i className="legend-sw" style={{ background: "#22C55E" }} />Bankroll</span>
            <span className="dim">
              {fmtUSD(bankrollWindowDelta, { sign: true })} this period
            </span>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Daily Expected vs Actual</h3>
            <span className="sub">
              last 14 days · settled trades by settle date
            </span>
            <div className="right"><span className="hint dim">$ profit</span></div>
          </div>
          <div className="chart-wrap">
            {hasSettledHistory ? (
              <GroupedBarChart data={dailyEvA} />
            ) : (
              <div style={{ padding: "40px 16px", color: "var(--fg-3)", textAlign: "center", fontSize: 13 }}>
                No settled trades yet. Settle a trade to populate this chart.
              </div>
            )}
          </div>
          <div className="chart-legend">
            <span><i className="legend-sw" style={{ background: "#3B82F6", opacity: 0.6 }} />Expected</span>
            <span><i className="legend-sw" style={{ background: "#22C55E" }} />Actual (profit)</span>
            <span><i className="legend-sw" style={{ background: "#EF4444" }} />Actual (loss)</span>
          </div>
        </div>
      </div>

      {/* Today's trades table */}
      <div className="card">
        <div className="card-head">
          <h3>Recent Paper Trades</h3>
          <span className="sub">{todayTrades.length} shown</span>
          <div className="right">
            <Link href="/trades" className="btn ghost sm">View all →</Link>
          </div>
        </div>
        {trades.length === 0 ? (
          <div className="card-pad" style={{ color: "var(--fg-3)", textAlign: "center", padding: "40px 16px" }}>
            No trades yet.{" "}
            <Link href="/trades/new" style={{ color: "var(--info)" }}>Add your first paper trade →</Link>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Market</th>
                  <th>Book A</th>
                  <th className="num">Odds A</th>
                  <th className="num">Stake A</th>
                  <th>Book B</th>
                  <th className="num">Odds B</th>
                  <th className="num">Stake B</th>
                  <th className="num">Exp. profit</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(todayTrades.length > 0 ? todayTrades : trades.slice(0, 8)).map((t) => {
                  const legA = t.legs.find((l) => l.legLabel === "A");
                  const legB = t.legs.find((l) => l.legLabel === "B");
                  return (
                    <tr key={t.id}>
                      <td className="muted num">{t.tradeDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</td>
                      <td>
                        <b>{t.eventName}</b>
                        <div className="hint">{t.sport ? <SportPill sport={t.sport} /> : null}</div>
                      </td>
                      <td>
                        {t.marketType}
                        <div className="hint">{t.player ?? t.notes?.slice(0, 40)}</div>
                      </td>
                      <td>{legA ? <BookCell name={legA.book.name} /> : <span className="dim">—</span>}</td>
                      <td className="num">{legA?.oddsAmerican != null ? fmtOdds(legA.oddsAmerican) : "—"}</td>
                      <td className="num">{legA ? fmtUSD(legA.stake) : "—"}</td>
                      <td>{legB ? <BookCell name={legB.book.name} /> : <span className="dim">—</span>}</td>
                      <td className="num">{legB?.oddsAmerican != null ? fmtOdds(legB.oddsAmerican) : "—"}</td>
                      <td className="num">{legB ? fmtUSD(legB.stake) : "—"}</td>
                      <td className="num pos">{fmtUSD(getConservativeExpectedProfit(t), { sign: true })}</td>
                      <td><StatusBadge status={t.status} /></td>
                      <td className="actions">
                        <Link href={`/trades/${t.id}`} className="btn ghost sm">Open →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

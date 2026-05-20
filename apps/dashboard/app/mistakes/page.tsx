import Link from "next/link";
import { db } from "@paperedge/database";
import { fmtUSD } from "@paperedge/core/fmt";
import { KPI } from "@/components/ui/design";
import { STATUS } from "@paperedge/core/status";

const LOCAL_USER_EMAIL = "local@paperedge.app";
export const dynamic = "force-dynamic";

const MISTAKE_REASONS = [
  "Odds moved before placement",
  "Wrong line",
  "Wrong market",
  "Wrong game period",
  "Same side by mistake",
  "Stake entered wrong",
  "Book did not match",
  "Trade was stale",
  "Event voided",
  "Other",
];

export default async function MistakesPage() {
  const user = await db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });

  const [mistakes, overrides] = await Promise.all([
    db.tradeMistake.findMany({
      where: { trade: { userId: user.id } },
      include: { mistakeTag: true, trade: true },
      orderBy: { createdAt: "desc" },
    }),
    db.checklistOverride.findMany({
      where: { trade: { userId: user.id } },
      include: { trade: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Mistake trades (canonical status is `mistake_invalid`; `mistake` is the
  // legacy alias still read defensively elsewhere but never written).
  const mistakeTrades = await db.paperTrade.findMany({
    where: { userId: user.id, status: { in: [STATUS.mistake_invalid, STATUS.mistake] } },
    include: { result: true, mistakes: { include: { mistakeTag: true } } },
    orderBy: { tradeDate: "desc" },
  });

  const byReason: Record<string, number> = {};
  for (const m of mistakes) {
    const r = m.mistakeTag.name;
    byReason[r] = (byReason[r] ?? 0) + 1;
  }
  // Also count incomplete checklists
  for (const o of overrides) {
    byReason["Checklist incomplete"] = (byReason["Checklist incomplete"] ?? 0) + 1;
  }

  const reasonRows = Object.entries(byReason).sort((a, b) => b[1] - a[1]);
  const totalMistakes = mistakes.length + overrides.length;
  const totalLoss = mistakeTrades.reduce((s, t) => s + Math.min(0, t.result?.actualProfitLoss ?? 0), 0);
  const topReason = reasonRows[0]?.[0] ?? "—";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Mistake Log</h1>
          <p>A strict record of every tracking mistake. Read this before locking your next trade.</p>
        </div>
        <div className="actions">
          <a href="/api/export" download className="btn ghost">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>
            Export
          </a>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <KPI label="Total mistakes" value={totalMistakes} sub="all time" warn={totalMistakes > 0} />
        <KPI label="Mistake cost"   value={fmtUSD(totalLoss, { sign: true })} sub="net realized loss from mistakes" down={totalLoss < 0} />
        <KPI label="Overrides"      value={overrides.length} sub="checklist bypasses" warn={overrides.length > 0} />
        <KPI label="Most common"    value={topReason.length > 20 ? topReason.slice(0, 20) + "…" : topReason} sub={`${reasonRows[0]?.[1] ?? 0}× occurred`} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.2fr 2fr", gap: 14 }}>
        {/* By reason panel */}
        <div className="card">
          <div className="card-head">
            <h3>By reason</h3>
            <span className="sub">{reasonRows.length} categories</span>
          </div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {MISTAKE_REASONS.concat(["Checklist incomplete"]).map((r) => {
              const n = byReason[r] ?? 0;
              const max = Math.max(1, ...Object.values(byReason));
              const pct = (n / max) * 100;
              return (
                <div key={r}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5 }}>{r}</span>
                    <span className="num muted" style={{ fontSize: 11.5 }}>{n}</span>
                  </div>
                  <div style={{ height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: n > 0 ? "var(--loss)" : "var(--neutral-bd)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* All mistakes table */}
        <div className="card">
          <div className="card-head">
            <h3>All mistakes</h3>
            <span className="sub">{mistakeTrades.length + overrides.length} entries</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Trade</th>
                  <th>Event</th>
                  <th>Reason</th>
                  <th className="num">Cost</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {mistakeTrades.length === 0 && overrides.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--fg-4)" }}>
                      No mistakes logged — great discipline! 🎯
                    </td>
                  </tr>
                ) : (
                  <>
                    {mistakeTrades.map((t) => (
                      <tr key={t.id}>
                        <td className="muted num">{t.tradeDate.toISOString().slice(0, 10)}</td>
                        <td className="num muted">{t.customTradeId ?? t.id.slice(0, 8)}</td>
                        <td>
                          <b>{t.eventName}</b>
                          <div className="hint">{t.marketType}</div>
                        </td>
                        <td>
                          <span className="badge b-mistake">
                            <span className="dot" />
                            {t.mistakes[0]?.mistakeTag.name ?? "Unknown"}
                          </span>
                        </td>
                        <td className="num neg">{fmtUSD(t.result?.actualProfitLoss ?? 0, { sign: true })}</td>
                        <td className="hint" style={{ whiteSpace: "normal", maxWidth: 280 }}>{t.notes ?? "—"}</td>
                        <td className="actions">
                          <Link href={`/trades/${t.id}`} className="btn ghost sm">Open →</Link>
                        </td>
                      </tr>
                    ))}
                    {overrides.map((o) => (
                      <tr key={o.id}>
                        <td className="muted num">{o.createdAt.toISOString().slice(0, 10)}</td>
                        <td className="num muted">{o.tradeId.slice(0, 8)}</td>
                        <td><b>{o.trade.eventName}</b></td>
                        <td>
                          <span className="badge b-warn">
                            <span className="dot" />
                            Checklist override
                          </span>
                        </td>
                        <td className="num muted">—</td>
                        <td className="hint" style={{ whiteSpace: "normal", maxWidth: 280 }}>{o.reason}</td>
                        <td className="actions">
                          <Link href={`/trades/${o.tradeId}`} className="btn ghost sm">Open →</Link>
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Strict-coach alert */}
      <div className="alert info" style={{ marginTop: 14 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>
        </svg>
        <div>
          <b>Strict-coach mode is on.</b>
          <p>OddsFlex will continue to block any trade from being locked until all verification checklist items pass. Mistakes are surfaced here so you can fix the pattern, not just the trade.</p>
        </div>
      </div>
    </div>
  );
}

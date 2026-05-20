"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtUSD, fmtOdds, americanToDec } from "@paperedge/core/fmt";
import { BookCell, StatusBadge, SportPill } from "@/components/ui/design";
import { updateTradeStatus } from "./settle-actions";
import { toast } from "sonner";
import { STATUS, isSettled, isExcluded } from "@paperedge/core/status";

interface Props {
  trade: any;
  mistageTags?: { id: string; name: string }[];
}

const CHECKLIST_LABELS: [string, string][] = [
  ["sameEvent", "Same event"],
  ["sameMarket", "Same market"],
  ["sameLine", "Same line"],
  ["oppositeSides", "Opposite sides"],
  ["sameGamePeriod", "Same game period"],
  ["oddsVerifiedA", "Odds verified on Book A"],
  ["oddsVerifiedB", "Odds verified on Book B"],
  ["stakesConfirmed", "Stake sizes confirmed"],
  ["profitCalculated", "Expected profit calculated"],
  ["loggedBeforeStart", "Logged before game start"],
];

export function TradeDetailClient({ trade, mistageTags = [] }: Props) {
  const router = useRouter();
  const legA = trade.legs?.find((l: any) => l.legLabel === "A");
  const legB = trade.legs?.find((l: any) => l.legLabel === "B");

  const totalStake = (legA?.stake ?? 0) + (legB?.stake ?? 0);
  // Prefer pre-computed expected fields from DB; fall back to on-the-fly calc.
  const payoutA = legA?.oddsAmerican ? legA.stake * americanToDec(legA.oddsAmerican) : 0;
  const payoutB = legB?.oddsAmerican ? legB.stake * americanToDec(legB.oddsAmerican) : 0;
  const profitIfA = payoutA - totalStake;
  const profitIfB = payoutB - totalStake;

  const checklist = trade.checklist ?? {};
  const checkKeys = Object.keys(checklist).filter((k) => k !== "id" && k !== "tradeId" && k !== "checklistComplete" && k !== "createdAt" && k !== "updatedAt");
  const checkPassed = checkKeys.filter((k) => Boolean(checklist[k])).length;

  const settled = isSettled(trade.status) || isExcluded(trade.status);
  const canSettle = !settled && trade.status !== STATUS.cancelled;

  // Synthesise an audit trail from available data
  const audit = [
    { label: "Created", at: trade.tradeDate ? new Date(trade.tradeDate).toLocaleString() : "—", done: true },
    { label: "Verified", at: (trade.status === "ready" || settled) ? "Yes" : "—", done: trade.status !== "draft" && trade.status !== "pending_result" },
    { label: "Locked", at: (trade.status === "paper_traded" || settled) ? "Yes" : "—", done: trade.status === "paper_traded" || settled },
    { label: "Settled", at: trade.result ? new Date(trade.result.settledAt || trade.tradeDate).toLocaleString() : "—", done: settled },
  ];

  return (
    <div className="page">
      {/* Page head */}
      <div className="page-head">
        <div className="row" style={{ gap: 10 }}>
          <Link href="/trades" className="btn ghost">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
            Back
          </Link>
          <div>
            <h1>{trade.eventName}</h1>
            <p>
              {trade.customTradeId ?? trade.id.slice(0, 8)} ·{" "}
              {new Date(trade.tradeDate).toLocaleDateString()} ·{" "}
              {trade.sport && <SportPill sport={trade.sport} />}
            </p>
          </div>
        </div>
        <div className="actions">
          <StatusBadge status={trade.status} />
          {canSettle && (
            <Link href={`/trades/${trade.id}/settle`} className="btn primary">
              Settle →
            </Link>
          )}
        </div>
      </div>

      <div className="detail-grid">
        {/* Left column */}
        <div className="stack">
          {/* Event header card */}
          <div className="card card-pad">
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div className="hint">Market</div>
                <b style={{ fontSize: 14 }}>{trade.marketType || "—"}</b>
              </div>
              <div>
                <div className="hint">Player</div>
                <b style={{ fontSize: 14 }}>{trade.player || "—"}</b>
              </div>
              <div>
                <div className="hint">Period</div>
                <b style={{ fontSize: 14 }}>{trade.gamePeriod || "Full Game"}</b>
              </div>
              <div>
                <div className="hint">Total stake</div>
                <b className="num" style={{ fontSize: 14 }}>{fmtUSD(totalStake)}</b>
              </div>
              <div>
                <div className="hint">Expected profit</div>
                <b className="num pos" style={{ fontSize: 14 }}>
                  {fmtUSD(trade.worstCasePL ?? trade.expectedProfitIfA ?? 0, { sign: true })}
                </b>
              </div>
            </div>
          </div>

          {/* Book cards */}
          <div className="grid cols-2" style={{ gap: 14 }}>
            {legA && <BookDetailCard label="Book A" leg={legA} />}
            {legB && <BookDetailCard label="Book B" leg={legB} />}
          </div>

          {/* Expected outcome table */}
          <div className="card">
            <div className="card-head">
              <h3>Expected outcome</h3>
              <span className="sub">payouts modelled at locked odds</span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Winner</th>
                    <th className="num">Payout (A)</th>
                    <th className="num">Payout (B)</th>
                    <th className="num">Net P/L</th>
                    <th className="num">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Book A wins</td>
                    <td>{legA?.sideLabel || legA?.side || "—"}</td>
                    <td className="num">{fmtUSD(payoutA)}</td>
                    <td className="num muted">$0.00</td>
                    <td className={`num ${profitIfA >= 0 ? "pos" : "neg"}`}>{fmtUSD(profitIfA, { sign: true })}</td>
                    <td className={`num ${profitIfA >= 0 ? "pos" : "neg"}`}>{totalStake > 0 ? ((profitIfA / totalStake) * 100).toFixed(2) : "0.00"}%</td>
                  </tr>
                  <tr>
                    <td>Book B wins</td>
                    <td>{legB?.sideLabel || legB?.side || "—"}</td>
                    <td className="num muted">$0.00</td>
                    <td className="num">{fmtUSD(payoutB)}</td>
                    <td className={`num ${profitIfB >= 0 ? "pos" : "neg"}`}>{fmtUSD(profitIfB, { sign: true })}</td>
                    <td className={`num ${profitIfB >= 0 ? "pos" : "neg"}`}>{totalStake > 0 ? ((profitIfB / totalStake) * 100).toFixed(2) : "0.00"}%</td>
                  </tr>
                  <tr>
                    <td>Push / Void</td>
                    <td className="muted">Both books return stake</td>
                    <td className="num">{legA ? fmtUSD(legA.stake) : "—"}</td>
                    <td className="num">{legB ? fmtUSD(legB.stake) : "—"}</td>
                    <td className="num muted">$0.00</td>
                    <td className="num muted">0.00%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Settlement result */}
          {trade.result && (
            <div className="card">
              <div className="card-head">
                <h3>Settlement result</h3>
                <div className="right"><StatusBadge status={trade.status} /></div>
              </div>
              <div className="card-pad grid cols-3" style={{ gap: 14 }}>
                <KV k="Final stat / result" v={trade.result.finalStat || "—"} />
                <KV k="Winning side" v={`Side ${trade.result.winningSide ?? "—"}`} />
                <KV k="Actual payout" v={fmtUSD(trade.result.actualPayout ?? 0)} />
                <KV k="Actual P/L" v={
                  <span className={(trade.result.actualProfitLoss ?? 0) >= 0 ? "pos" : "neg"}>
                    {fmtUSD(trade.result.actualProfitLoss ?? 0, { sign: true })}
                  </span>
                } />
                <KV k="Expected P/L" v={fmtUSD(trade.worstCasePL ?? trade.expectedProfitIfA ?? 0, { sign: true })} />
                <KV k="Variance" v={
                  <span className={(trade.result.actualProfitLoss ?? 0) - (trade.worstCasePL ?? trade.expectedProfitIfA ?? 0) >= 0 ? "pos" : "neg"}>
                    {fmtUSD((trade.result.actualProfitLoss ?? 0) - (trade.worstCasePL ?? trade.expectedProfitIfA ?? 0), { sign: true })}
                  </span>
                } />
                {trade.mistakes?.length > 0 && (
                  <KV k="Mistake reason" v={
                    <span className="badge b-mistake">
                      <span className="dot" />
                      {trade.mistakes[0].mistakeTag?.name?.replace(/_/g, " ")}
                    </span>
                  } span={3} />
                )}
                {trade.result.resultNotes && (
                  <KV k="Notes" v={trade.result.resultNotes} span={3} />
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {trade.notes && (
            <div className="card">
              <div className="card-head"><h3>Notes</h3></div>
              <div className="card-pad hint" style={{ color: "var(--fg-2)" }}>{trade.notes}</div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="stack">
          {/* Checklist */}
          <div className="card">
            <div className="card-head">
              <h3>Verification checklist</h3>
              <span className="sub">{checkPassed} / {checkKeys.length || 10}</span>
            </div>
            <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {CHECKLIST_LABELS.map(([k, label]) => {
                const passed = Boolean(checklist[k]);
                return (
                  <div key={k} className="row tight" style={{ padding: "6px 0", justifyContent: "space-between" }}>
                    <span style={{ color: passed ? "var(--fg)" : "var(--fg-3)" }}>{label}</span>
                    {passed ? (
                      <span style={{ color: "var(--profit)" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7"/></svg>
                      </span>
                    ) : (
                      <span style={{ color: "var(--loss)" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audit trail */}
          <div className="card">
            <div className="card-head"><h3>Audit trail</h3><span className="sub">trade lifecycle</span></div>
            <div className="card-pad">
              <div className="audit">
                {audit.map((a, i) => (
                  <div key={i} className={`audit-step ${a.done ? "done" : ""}`}>
                    <div className="dot" />
                    <div className="body">
                      <b>{a.label}</b>
                      <span className="meta">{a.at}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick actions */}
          {!settled && (
            <div className="card">
              <div className="card-head"><h3>Quick actions</h3></div>
              <div className="card-pad stack">
                {(trade.status === "pending_verification" || trade.status === "locked_paper_trade") && (
                  <button
                    className="btn success"
                    style={{ justifyContent: "center" }}
                    onClick={() => updateTradeStatus(trade.id, "ready").then(() => { toast.success("Marked as ready"); router.refresh(); })}
                  >
                    Mark Ready
                  </button>
                )}
                {trade.status === "ready" && (
                  <button
                    className="btn success"
                    style={{ justifyContent: "center" }}
                    onClick={() => updateTradeStatus(trade.id, "paper_traded").then(() => { toast.success("Marked as paper traded"); router.refresh(); })}
                  >
                    Mark Paper Traded
                  </button>
                )}
                {trade.status === "paper_traded" && (
                  <button
                    className="btn warn"
                    style={{ justifyContent: "center" }}
                    onClick={() => updateTradeStatus(trade.id, "pending_result").then(() => { toast.success("Awaiting result"); router.refresh(); })}
                  >
                    Awaiting result
                  </button>
                )}
                {canSettle && (
                  <Link href={`/trades/${trade.id}/settle`} className="btn primary" style={{ justifyContent: "center" }}>
                    Settle trade →
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BookDetailCard({ label, leg }: { label: string; leg: any }) {
  const oddsAmerican = leg.odds ?? leg.oddsAmerican ?? 0;
  return (
    <div className="book-card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row tight">
          <BookCell name={leg.book?.name ?? "Other"} />
        </div>
        {leg.verificationStatus === "verified"
          ? <span className="badge b-verified"><span className="dot" />Odds verified</span>
          : <span className="badge b-needs"><span className="dot" />Not verified</span>}
      </div>
      <div className="divider" style={{ margin: "6px 0" }} />
      <div className="hint" style={{ marginBottom: 4 }}>{label}</div>
      <dl className="kv">
        <dt>Side</dt><dd>{leg.sideLabel || leg.side || "—"}</dd>
        <dt>Odds (American)</dt><dd>{fmtOdds(oddsAmerican)}</dd>
        <dt>Odds (decimal)</dt><dd>{americanToDec(oddsAmerican).toFixed(3)}</dd>
        <dt>Stake</dt><dd>{fmtUSD(leg.stake)}</dd>
        <dt>Implied payout</dt><dd>{fmtUSD(leg.stake * americanToDec(oddsAmerican))}</dd>
      </dl>
    </div>
  );
}

function KV({ k, v, span = 1 }: { k: string; v: React.ReactNode; span?: number }) {
  return (
    <div style={{ gridColumn: `span ${span}`, display: "flex", flexDirection: "column", gap: 3 }}>
      <span className="hint">{k}</span>
      <b style={{ fontSize: 13 }}>{v}</b>
    </div>
  );
}

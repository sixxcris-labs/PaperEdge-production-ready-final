"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtUSD, fmtOdds, americanToDec } from "@paperedge/core/fmt";
import { SportPill, StatusBadge, BookCell } from "@/components/ui/design";
import { settleTrade } from "../trades/[id]/settle-actions";
import { toast } from "sonner";

interface Candidate {
  id: string;
  customTradeId: string | null;
  sport: string;
  eventName: string;
  marketType: string;
  player: string;
  time: string;
  date: string;
  status: string;
  expectedProfit: number;
  bookA: string;
  sideA: string;
  oddsA: number;
  stakeA: number;
  bookB: string;
  sideB: string;
  oddsB: number;
  stakeB: number;
}

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

export function SettlementClient({ candidates }: { candidates: Candidate[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(candidates[0]?.id ?? null);

  // Form state
  const [result, setResult] = useState("");
  const [winner, setWinner] = useState("");
  const [bookAWin, setBookAWin] = useState<boolean | "push" | null>(null);
  const [bookBWin, setBookBWin] = useState<boolean | "push" | null>(null);
  const [actualPayout, setActualPayout] = useState("");
  const [settlementNotes, setSettlementNotes] = useState("");
  const [mistake, setMistake] = useState("");
  const [pending, setPending] = useState(false);

  function reset() {
    setResult(""); setWinner(""); setBookAWin(null); setBookBWin(null);
    setActualPayout(""); setSettlementNotes(""); setMistake("");
  }

  function selectTrade(id: string) {
    setSelectedId(id);
    reset();
  }

  const t = candidates.find((c) => c.id === selectedId) ?? candidates[0];

  if (!t) {
    return (
      <div className="page">
        <div className="card card-pad" style={{ color: "var(--fg-3)", textAlign: "center", padding: "40px" }}>
          All trades settled.{" "}
          <Link href="/" className="btn ghost sm">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const totalStake = t.stakeA + t.stakeB;
  const computedPayout = (() => {
    let p = 0;
    // Win: stake × decimal odds (includes stake back)
    if (bookAWin === true)     p += t.stakeA * americanToDec(t.oddsA);
    if (bookBWin === true)     p += t.stakeB * americanToDec(t.oddsB);
    // Push: stake returned as-is, no profit
    if (bookAWin === "push")   p += t.stakeA;
    if (bookBWin === "push")   p += t.stakeB;
    // Loss (false): $0 returned — already excluded
    return p;
  })();
  const finalPayout = parseFloat(actualPayout) || computedPayout;
  const actualPL = finalPayout - totalStake;
  const canSettle = result.trim() !== "" && (bookAWin !== null || bookBWin !== null);

  async function handleSettle() {
    if (!canSettle || pending) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("winningSide", winner || (bookAWin === true ? "A" : bookBWin === true ? "B" : "push"));
      fd.set("finalStat", result);
      fd.set("actualPayout", String(finalPayout));
      fd.set("losingSake", "0");
      fd.set("actualProfitLoss", String(actualPL));
      fd.set("resultNotes", settlementNotes);
      if (mistake) fd.set("mistakeNotes", mistake);
      await settleTrade(t.id, fd);
      toast.success("Trade settled");
      router.refresh();
      reset();
      // select next
      const next = candidates.find((c) => c.id !== t.id);
      if (next) setSelectedId(next.id);
    } catch {
      toast.error("Failed to settle");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settlement Review</h1>
          <p>Review what would have happened. The app does not place bets.</p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "300px 1fr", gap: 14 }}>
        {/* Queue */}
        <div className="card">
          <div className="card-head">
            <h3>Pending settlement</h3>
            <span className="sub">{candidates.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", padding: 8, gap: 4, maxHeight: 700, overflowY: "auto" }}>
            {candidates.map((c) => (
              <button
                key={c.id}
                className={`nav-item ${selectedId === c.id ? "active" : ""}`}
                onClick={() => selectTrade(c.id)}
                style={{ alignItems: "flex-start", flexDirection: "column", gap: 4, padding: "10px 12px" }}
              >
                <div className="row tight" style={{ width: "100%" }}>
                  <SportPill sport={c.sport} />
                  <span className="muted num" style={{ fontSize: 11 }}>{c.customTradeId ?? c.id.slice(0, 8)}</span>
                  <span className="right hint">{c.time}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>{c.eventName}</div>
                <div className="hint">{c.marketType}{c.player ? ` · ${c.player}` : ""}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Settlement form */}
        <div className="stack">
          {/* Match card */}
          <div className="card">
            <div className="card-head">
              <h3>{t.eventName}</h3>
              <span className="sub">{t.customTradeId ?? t.id.slice(0, 8)} · {t.date} {t.time}</span>
              <div className="right"><StatusBadge status={t.status} /></div>
            </div>
            <div className="card-pad">
              <div className="match-bar">
                <div className="side">
                  <span className="hint">Book A · <BookCell name={t.bookA} /></span>
                  <span className="who">{t.sideA || "—"}</span>
                  <span className="o">{fmtOdds(t.oddsA)} · {fmtUSD(t.stakeA)} stake</span>
                </div>
                <div className="vs">vs</div>
                <div className="side">
                  <span className="hint">Book B · <BookCell name={t.bookB} /></span>
                  <span className="who">{t.sideB || "—"}</span>
                  <span className="o">{fmtOdds(t.oddsB)} · {fmtUSD(t.stakeB)} stake</span>
                </div>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="card">
            <div className="card-head">
              <h3>Final result</h3>
              <span className="sub">Record what actually happened</span>
            </div>
            <div className="card-pad grid cols-2" style={{ gap: 16 }}>
              <div className="field">
                <label>Final score / result</label>
                <input className="input" placeholder="e.g. BOS 112 – IND 105" value={result} onChange={(e) => setResult(e.target.value)} />
              </div>
              <div className="field">
                <label>Winning side</label>
                <select className="select" value={winner} onChange={(e) => setWinner(e.target.value)}>
                  <option value="">Select winner…</option>
                  <option value="A">{t.sideA || "Side A"} (Book A)</option>
                  <option value="B">{t.sideB || "Side B"} (Book B)</option>
                  <option value="push">Push</option>
                  <option value="void">Voided / no action</option>
                </select>
              </div>
              <div className="field">
                <label>Did Book A win?</label>
                <div className="toggle" style={{ width: "fit-content" }}>
                  <button className={bookAWin === true ? "on" : ""} onClick={() => setBookAWin(true)}>Yes · won</button>
                  <button className={bookAWin === false ? "on" : ""} onClick={() => setBookAWin(false)}>No · lost</button>
                  <button className={bookAWin === "push" ? "on" : ""} onClick={() => setBookAWin("push")}>Push</button>
                </div>
              </div>
              <div className="field">
                <label>Did Book B win?</label>
                <div className="toggle" style={{ width: "fit-content" }}>
                  <button className={bookBWin === true ? "on" : ""} onClick={() => setBookBWin(true)}>Yes · won</button>
                  <button className={bookBWin === false ? "on" : ""} onClick={() => setBookBWin(false)}>No · lost</button>
                  <button className={bookBWin === "push" ? "on" : ""} onClick={() => setBookBWin("push")}>Push</button>
                </div>
              </div>
              <div className="field">
                <label>Actual payout</label>
                <input
                  className="input mono"
                  placeholder={`auto = ${fmtUSD(computedPayout)}`}
                  value={actualPayout}
                  onChange={(e) => setActualPayout(e.target.value)}
                />
                <span className="help">Leave blank to use the calculated payout.</span>
              </div>
              <div className="field">
                <label>Actual profit / loss</label>
                <div
                  className="input mono"
                  style={{
                    background: actualPL >= 0 ? "var(--profit-bg)" : "var(--loss-bg)",
                    borderColor: actualPL >= 0 ? "var(--profit-bd)" : "var(--loss-bd)",
                    color: actualPL >= 0 ? "var(--profit)" : "var(--loss)",
                    fontWeight: 600,
                  }}
                >
                  {fmtUSD(actualPL, { sign: true })}
                </div>
                <span className="help">
                  vs expected {fmtUSD(t.expectedProfit, { sign: true })} · variance {fmtUSD(actualPL - t.expectedProfit, { sign: true })}
                </span>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Settlement notes</label>
                <textarea
                  className="textarea"
                  placeholder="Anything notable about how the game graded…"
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Mistake reason <span className="dim">(only if a tracking mistake occurred)</span></label>
                <select className="select" value={mistake} onChange={(e) => setMistake(e.target.value)}>
                  <option value="">No mistake</option>
                  {MISTAKE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="card-head" style={{ borderTop: "1px solid var(--line)", borderBottom: 0 }}>
              <span className="hint">Settlement will be added to the audit trail.</span>
              <div className="right row tight">
                <Link href="/trades" className="btn ghost">Cancel</Link>
                <button
                  className="btn success"
                  disabled={!canSettle || pending}
                  onClick={handleSettle}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7"/></svg>
                  {pending ? "Saving…" : "Settle trade"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { recalculateOnObserved } from "@/lib/verify";
import { lockGateFailures } from "@/lib/checklist";
import { fmtUSD, fmtOdds } from "@/lib/fmt";
import { updateTradeStatus } from "../settle-actions";

type VerifStatus =
  | "unverified"
  | "verified"
  | "odds_moved"
  | "line_moved"
  | "market_unavailable"
  | "player_not_listed"
  | "book_unavailable";

interface LegState {
  status: VerifStatus;
  observedOdds: string;
  observedLine: string;
  notes: string;
}

const STATUS_OPTIONS: { value: VerifStatus; label: string }[] = [
  { value: "verified", label: "Verified — matches exactly" },
  { value: "odds_moved", label: "Odds moved" },
  { value: "line_moved", label: "Line moved" },
  { value: "market_unavailable", label: "Market unavailable" },
  { value: "player_not_listed", label: "Player not listed" },
  { value: "book_unavailable", label: "Book unavailable" },
];

interface LegVerifyProps {
  leg: any;
  trade: any;
  legState: LegState;
  onChange: (updates: Partial<LegState>) => void;
}

function LegVerify({ leg, trade, legState, onChange }: LegVerifyProps) {
  const [opening, setOpening] = useState(false);

  async function openBook() {
    setOpening(true);
    try {
      await navigator.clipboard.writeText(leg.side);
    } catch {
      /* clipboard may be denied — not critical */
    }
    const params = new URLSearchParams({
      bookId: leg.bookId,
      sport: trade.sport,
      marketType: trade.marketType,
      player: leg.side,
      event: trade.eventName,
    });
    const url = await fetch(`/api/deep-link?${params}`).then((r) => r.text());
    window.open(url || "#", "_blank", "noopener,noreferrer");
    setOpening(false);
  }

  const needsOdds = legState.status === "odds_moved";
  const needsLine = legState.status === "line_moved";
  const verified = legState.status === "verified";

  return (
    <div className="card">
      <div className="card-head">
        <h3 style={{ marginBottom: 0 }}>
          Leg {leg.legLabel} — {leg.book?.name ?? "Book"}
        </h3>
        <div className="right" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {verified
            ? <span className="badge b-verified"><span className="dot" />Verified</span>
            : <span className="badge b-needs"><span className="dot" />Pending</span>}
          <button
            className="btn ghost"
            style={{ padding: "4px 10px", fontSize: 12 }}
            onClick={openBook}
            disabled={opening}
          >
            Open {leg.book?.name ?? "book"} ▸
          </button>
        </div>
      </div>
      <div className="card-pad stack">
        <div className="hint">
          Player/team name copied to clipboard — paste into the book's search.
        </div>
        <div
          style={{
            background: "var(--panel)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
          }}
        >
          <span className="hint">Expected: </span>
          <b>{leg.side}</b>
          {" @ "}
          <b className="num">{fmtOdds(leg.oddsAmerican)}</b>
          {leg.lineValue != null && (
            <span className="hint"> (line {leg.lineValue})</span>
          )}
          <span className="hint" style={{ marginLeft: 8 }}>
            stake <b className="num">{fmtUSD(leg.stake)}</b>
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {STATUS_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="row tight"
              style={{ gap: 8, cursor: "pointer", padding: "2px 0" }}
            >
              <input
                type="radio"
                name={`status-${leg.id}`}
                value={opt.value}
                checked={legState.status === opt.value}
                onChange={() => onChange({ status: opt.value })}
              />
              <span style={{ fontSize: 13 }}>{opt.label}</span>
            </label>
          ))}
        </div>

        {needsOdds && (
          <div className="field">
            <label className="label">Observed odds</label>
            <input
              className="input num"
              type="number"
              value={legState.observedOdds}
              onChange={(e) => onChange({ observedOdds: e.target.value })}
              placeholder={String(leg.oddsAmerican)}
            />
          </div>
        )}

        {needsLine && (
          <div className="field">
            <label className="label">Observed line</label>
            <input
              className="input num"
              type="number"
              step="0.5"
              value={legState.observedLine}
              onChange={(e) => onChange({ observedLine: e.target.value })}
              placeholder={leg.lineValue != null ? String(leg.lineValue) : ""}
            />
          </div>
        )}

        <div className="field">
          <label className="label">Notes (optional)</label>
          <input
            className="input"
            type="text"
            value={legState.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="Anything worth recording about this book"
          />
        </div>
      </div>
    </div>
  );
}

interface Props {
  trade: any;
}

const defaultLegState = (): LegState => ({
  status: "unverified",
  observedOdds: "",
  observedLine: "",
  notes: "",
});

const MATCH_CHECKS: [string, string][] = [
  ["sameEvent", "Same event"],
  ["sameMarket", "Same market"],
  ["samePeriod", "Same period"],
  ["oppositeSides", "Opposite sides"],
];

export function VerifyClient({ trade }: Props) {
  const router = useRouter();
  const legs: any[] = trade.legs ?? [];
  const isMiddle = trade.requiredCalculator === "middle";

  const [legStates, setLegStates] = useState<Record<string, LegState>>(
    Object.fromEntries(legs.map((l) => [l.id, defaultLegState()]))
  );
  const [saving, setSaving] = useState(false);
  const [started, setStarted] = useState(
    legs.some((l) => l.verificationStatus !== "unverified") ||
      trade.status === "verifying"
  );

  // Step 3: market-match checklist
  const [match, setMatch] = useState<Record<string, boolean>>({
    sameEvent: false,
    sameMarket: false,
    samePeriod: false,
    oppositeSides: false,
    sameLine: false, // doubles as "middle gap confirmed" when isMiddle
  });
  // Step 4 + 5
  const [recalcConfirmed, setRecalcConfirmed] = useState(false);
  const [finalConfirm, setFinalConfirm] = useState(false);

  const updateLeg = useCallback((legId: string, updates: Partial<LegState>) => {
    setLegStates((prev) => ({ ...prev, [legId]: { ...prev[legId], ...updates } }));
  }, []);

  const legA = legs.find((l) => l.legLabel === "A");
  const legB = legs.find((l) => l.legLabel === "B");
  const stateA = legA ? legStates[legA.id] : null;
  const stateB = legB ? legStates[legB.id] : null;

  const bookAVerified = stateA?.status === "verified";
  const bookBVerified = stateB?.status === "verified";
  const allTerminal = legs.every((l) => legStates[l.id]?.status !== "unverified");

  // Live recalc with observed odds
  const observedOddsA =
    stateA?.status === "odds_moved" && stateA.observedOdds
      ? parseInt(stateA.observedOdds)
      : legA?.oddsAmerican;
  const observedOddsB =
    stateB?.status === "odds_moved" && stateB.observedOdds
      ? parseInt(stateB.observedOdds)
      : legB?.oddsAmerican;

  let recalc = null;
  if (legA && legB && observedOddsA && observedOddsB) {
    try {
      recalc = recalculateOnObserved(
        trade.requiredCalculator,
        observedOddsA,
        observedOddsB,
        legA.stake,
        isMiddle
          ? {
              stakeB: legB.stake,
              lineA: legA.lineValue ?? 0,
              lineB: legB.lineValue ?? 0,
            }
          : undefined
      );
    } catch {
      recalc = null;
    }
  }

  const stillProfitable = !recalc
    ? false
    : recalc.type === "arbitrage"
      ? recalc.result.isArb
      : recalc.type === "promo"
        ? recalc.result.lockedProfit > 0
        : recalc.result.middleProfit > 0;

  const gateFailures = lockGateFailures({
    bookAVerified: !!bookAVerified,
    bookBVerified: !!bookBVerified,
    sameEventConfirmed: match.sameEvent,
    sameMarketTypeConfirmed: match.sameMarket,
    sameGamePeriodConfirmed: match.samePeriod,
    oppositeSidesConfirmed: match.oppositeSides,
    sameLineConfirmed: match.sameLine,
    recalculatedConfirmed: recalcConfirmed,
    userFinalConfirm: finalConfirm,
    tradeType: isMiddle ? "middle" : "arb",
  });
  const canLock = gateFailures.length === 0;

  async function saveLeg(legId: string, overrideState?: LegState) {
    const state = overrideState ?? legStates[legId];
    const response = await fetch(`/api/trades/${trade.id}/verify-leg`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        legId,
        status: state.status,
        observedOddsAmerican: state.observedOdds ? parseInt(state.observedOdds) : null,
        observedLineValue: state.observedLine ? parseFloat(state.observedLine) : null,
        notes: state.notes || null,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error ?? "Failed to save leg verification");
    }
  }

  async function handleStartVerification() {
    setSaving(true);
    try {
      const response = await fetch(`/api/trades/${trade.id}/start-verification`, { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Failed to start verification");
      }
      setStarted(true);
      for (const leg of legs) {
        const params = new URLSearchParams({
          bookId: leg.bookId,
          sport: trade.sport,
          marketType: trade.marketType,
          player: leg.side,
          event: trade.eventName,
        });
        const url = await fetch(`/api/deep-link?${params}`).then((r) => r.text());
        window.open(url || "#", "_blank", "noopener,noreferrer");
      }
      toast.success("Books opened in new tabs — verify each one.");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to start verification");
    } finally {
      setSaving(false);
    }
  }

  async function handleLock() {
    if (!canLock) return;
    setSaving(true);
    try {
      for (const leg of legs) await saveLeg(leg.id);
      await updateTradeStatus(trade.id, "locked_paper_trade");
      toast.success("Paper trade locked");
      router.push(`/trades/${trade.id}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to lock paper trade");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkNotPlaced() {
    setSaving(true);
    try {
      for (const leg of legs) {
        const state = legStates[leg.id].status === "unverified"
          ? { ...legStates[leg.id], status: "market_unavailable" as VerifStatus }
          : legStates[leg.id];
        await saveLeg(leg.id, state);
        updateLeg(leg.id, state);
      }
      await updateTradeStatus(trade.id, "not_placed_market_unavailable");
      toast.success("Trade marked as not placed");
      router.push(`/trades/${trade.id}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="row" style={{ gap: 10 }}>
          <Link href={`/trades/${trade.id}`} className="btn ghost">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M11 18l-6-6 6-6"/>
            </svg>
            Back
          </Link>
          <div>
            <h1>Verify Trade</h1>
            <p>{trade.eventName} · open each book, confirm the market, then lock.</p>
          </div>
        </div>
        <div className="actions">
          {isMiddle && <span className="badge b-locked"><span className="dot" />Middle</span>}
        </div>
      </div>

      <div
        className="badge b-info"
        style={{ marginBottom: 14, display: "inline-flex" }}
      >
        <span className="dot" />
        Paper trading only. This app does not place bets, connect to sportsbooks,
        bypass geolocation, or guarantee profit. Verify both books manually before locking.
      </div>

      <div className="detail-grid">
        {/* Left: trade info + recalc */}
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Trade source</h3><span className="sub">imported</span></div>
            <div className="card-pad">
              <dl className="kv">
                <dt>Event</dt><dd>{trade.eventName}</dd>
                <dt>Sport</dt><dd>{trade.sport}</dd>
                <dt>Market</dt><dd>{trade.marketType}</dd>
                <dt>Period</dt><dd>{trade.gamePeriod || "Full Game"}</dd>
              </dl>
            </div>
          </div>

          {recalc && (
            <div className="card">
              <div className="card-head">
                <h3>Step 4 · Recalculate</h3>
                <div className="right">
                  {stillProfitable
                    ? <span className="badge b-profit"><span className="dot" />Still profitable</span>
                    : <span className="badge b-loss"><span className="dot" />No longer profitable</span>}
                </div>
              </div>
              <div className="card-pad">
                <dl className="kv">
                  {recalc.type === "arbitrage" && (
                    <>
                      <dt>Profit if A wins</dt>
                      <dd className={`num ${recalc.result.profitIfA >= 0 ? "pos" : "neg"}`}>{fmtUSD(recalc.result.profitIfA, { sign: true })}</dd>
                      <dt>Profit if B wins</dt>
                      <dd className={`num ${recalc.result.profitIfB >= 0 ? "pos" : "neg"}`}>{fmtUSD(recalc.result.profitIfB, { sign: true })}</dd>
                      <dt>Margin</dt>
                      <dd className="num">{recalc.result.marginPct.toFixed(2)}%</dd>
                    </>
                  )}
                  {recalc.type === "promo" && (
                    <>
                      <dt>Locked profit</dt>
                      <dd className={`num ${recalc.result.lockedProfit >= 0 ? "pos" : "neg"}`}>{fmtUSD(recalc.result.lockedProfit, { sign: true })}</dd>
                      <dt>Conversion</dt>
                      <dd className="num">{(recalc.result.conversionPct * 100).toFixed(1)}%</dd>
                    </>
                  )}
                  {recalc.type === "middle" && (
                    <>
                      <dt>Middle profit (both win)</dt>
                      <dd className="num pos">{fmtUSD(recalc.result.middleProfit, { sign: true })}</dd>
                      <dt>Outside loss (middle misses)</dt>
                      <dd className={`num ${recalc.result.outsideLoss >= 0 ? "pos" : "neg"}`}>{fmtUSD(recalc.result.outsideLoss, { sign: true })}</dd>
                      <dt>Middle window</dt>
                      <dd className="num">{recalc.result.middleRange[0]} – {recalc.result.middleRange[1]}</dd>
                      <dt>Total exposure</dt>
                      <dd className="num">{fmtUSD(recalc.result.totalStake)}</dd>
                    </>
                  )}
                </dl>
                <label className="row tight" style={{ gap: 8, marginTop: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={recalcConfirmed}
                    onChange={(e) => setRecalcConfirmed(e.target.checked)}
                  />
                  <span style={{ fontSize: 13 }}>I confirm the recalculated stakes/outcome</span>
                </label>
              </div>
            </div>
          )}

          {/* Step 3: market match */}
          <div className="card">
            <div className="card-head"><h3>Step 3 · Market match</h3></div>
            <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {MATCH_CHECKS.map(([k, label]) => (
                <label key={k} className="row tight" style={{ gap: 8, cursor: "pointer", padding: "2px 0" }}>
                  <input
                    type="checkbox"
                    checked={match[k]}
                    onChange={(e) => setMatch((m) => ({ ...m, [k]: e.target.checked }))}
                  />
                  <span style={{ fontSize: 13 }}>{label}</span>
                </label>
              ))}
              <label className="row tight" style={{ gap: 8, cursor: "pointer", padding: "2px 0" }}>
                <input
                  type="checkbox"
                  checked={match.sameLine}
                  onChange={(e) => setMatch((m) => ({ ...m, sameLine: e.target.checked }))}
                />
                <span style={{ fontSize: 13 }}>
                  {isMiddle ? "Middle gap confirmed" : "Same line"}
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Right: per-leg verification (Steps 1 & 2) */}
        <div className="stack">
          {legs.map((leg) => (
            <LegVerify
              key={leg.id}
              leg={leg}
              trade={trade}
              legState={legStates[leg.id]}
              onChange={(updates) => updateLeg(leg.id, updates)}
            />
          ))}
          {legs.length === 0 && (
            <div className="card card-pad hint" style={{ textAlign: "center", padding: 32 }}>
              No legs yet — fill in trade details after verification.
            </div>
          )}
        </div>
      </div>

      {/* Step 5: final lock gate */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head"><h3>Step 5 · Lock paper trade</h3></div>
        <div className="card-pad stack">
          <label className="row tight" style={{ gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={finalConfirm}
              onChange={(e) => setFinalConfirm(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>
              I manually verified both sportsbooks and understand this is paper trading only.
            </span>
          </label>

          {!canLock && (
            <div className="hint" style={{ color: "var(--warn)" }}>
              Blocked until: {gateFailures.join(" · ")}
            </div>
          )}

          <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
            {!started && legs.length > 0 && (
              <button
                className="btn ghost"
                onClick={handleStartVerification}
                disabled={saving}
              >
                {saving ? "Opening…" : "▶ Start verification (opens books)"}
              </button>
            )}
            <button
              className="btn ghost"
              onClick={handleMarkNotPlaced}
              disabled={!allTerminal || saving}
            >
              Mark Not Placed
            </button>
            <button
              className="btn primary"
              onClick={handleLock}
              disabled={!canLock || saving}
            >
              {saving ? "Locking…" : "Lock Paper Trade"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

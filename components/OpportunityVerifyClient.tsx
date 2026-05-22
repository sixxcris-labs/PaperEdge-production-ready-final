"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cashPayout, lowHold, middleHedge, promoPayout } from "@paperedge/core/calc";
import {
  evaluateManualLockChecklistFailures,
  evaluateVerificationGates,
  type VerificationTradeInput,
} from "@paperedge/core/verification-gates";
import { fmtOdds, fmtUSD } from "@paperedge/core/fmt";

interface Props {
  opportunity: any;
  settings?: {
    currentBankroll?: number | null;
    maxStakePct?: number | null;
    oddsFreshnessMinutes?: number | null;
  } | null;
  backHref?: string;
  afterLockHref?: string;
}

interface LegState {
  observedOdds: string;
  observedLine: string;
  observedLiquidity: string;
  stake: string;
  notes: string;
  verified: boolean;
  saving: boolean;
}

interface CheckState {
  sameEventConfirmed: boolean;
  sameMarketConfirmed: boolean;
  samePlayerOrTeamConfirmed: boolean;
  samePeriodConfirmed: boolean;
  sameLineConfirmed: boolean;
  oppositeSidesConfirmed: boolean;
  oddsAcceptedConfirmed: boolean;
  stakeAcceptedConfirmed: boolean;
  liquidityEnoughConfirmed: boolean;
  recalculatedConfirmed: boolean;
  userFinalConfirm: boolean;
}

function defaultLegState(opportunity: any, leg: "A" | "B"): LegState {
  return {
    observedOdds: String((leg === "A" ? opportunity.verifiedOddsA ?? opportunity.oddsA : opportunity.verifiedOddsB ?? opportunity.oddsB) ?? ""),
    observedLine: String((leg === "A" ? opportunity.verifiedLineA ?? opportunity.lineA : opportunity.verifiedLineB ?? opportunity.lineB) ?? ""),
    observedLiquidity: String((leg === "A" ? opportunity.verifiedLiquidityA ?? opportunity.liquidityA : opportunity.verifiedLiquidityB ?? opportunity.liquidityB) ?? ""),
    stake: String((leg === "A" ? opportunity.stakeA : opportunity.stakeB) ?? ""),
    notes: (leg === "A" ? opportunity.bookANotes : opportunity.bookBNotes) ?? "",
    verified: leg === "A" ? Boolean(opportunity.bookAVerified) : Boolean(opportunity.bookBVerified),
    saving: false,
  };
}

export function OpportunityVerifyClient({
  opportunity,
  settings,
  backHref = "/verify",
  afterLockHref = "/locked",
}: Props) {
  const router = useRouter();
  const [started, setStarted] = useState(Boolean(opportunity.bookAVerified || opportunity.bookBVerified || String(opportunity.status).startsWith("verifying")));
  const [bookA, setBookA] = useState(() => defaultLegState(opportunity, "A"));
  const [bookB, setBookB] = useState(() => defaultLegState(opportunity, "B"));
  const [lastVerifiedAt, setLastVerifiedAt] = useState<Date | null>(() =>
    opportunity.verifiedAt ? new Date(opportunity.verifiedAt) : null,
  );
  const [checks, setChecks] = useState<CheckState>({
    sameEventConfirmed: Boolean(opportunity.sameEventConfirmed),
    sameMarketConfirmed: Boolean(opportunity.sameMarketConfirmed),
    samePlayerOrTeamConfirmed: Boolean(opportunity.samePlayerOrTeamConfirmed),
    samePeriodConfirmed: Boolean(opportunity.samePeriodConfirmed),
    sameLineConfirmed: Boolean(opportunity.sameLineConfirmed),
    oppositeSidesConfirmed: Boolean(opportunity.oppositeSidesConfirmed),
    oddsAcceptedConfirmed: Boolean(opportunity.oddsAcceptedConfirmed),
    stakeAcceptedConfirmed: Boolean(opportunity.stakeAcceptedConfirmed),
    liquidityEnoughConfirmed: Boolean(opportunity.liquidityEnoughConfirmed),
    recalculatedConfirmed: Boolean(opportunity.recalculatedConfirmed),
    userFinalConfirm: Boolean(opportunity.userFinalConfirm),
  });
  const [locking, setLocking] = useState(false);

  const economics = useMemo(() => computeEconomics(opportunity.tradeType, bookA, bookB), [opportunity.tradeType, bookA, bookB]);
  const opportunityTradeType = String(opportunity.tradeType ?? "").trim().toLowerCase();
  const derivedBonusType =
    opportunityTradeType.includes("promo") || opportunityTradeType.includes("bonus")
      ? "promo free play"
      : "cash";
  const derivedCalculatorUsed = opportunityTradeType.includes("middle")
    ? "middle"
    : opportunityTradeType.includes("promo") || opportunityTradeType.includes("bonus")
      ? "promo_converter"
      : "arbitrage";

  const verificationInput: VerificationTradeInput = {
    goal: opportunityTradeType.includes("middle") ? "middle" : "profit",
    tradeType: opportunity.tradeType ?? null,
    bonusType: derivedBonusType,
    calculatorUsed: derivedCalculatorUsed,
    bankroll: settings?.currentBankroll ?? 1000,
    maxStakePct: settings?.maxStakePct ?? 5,
    oddsVerifiedAt: lastVerifiedAt,
    oddsFreshnessSeconds: (settings?.oddsFreshnessMinutes ?? 5) * 60,
    rolloverAmount: null,
    rolloverMultiple: null,
    rolloverUnknownOrNA: true,
    oppositeSideConfirmed: checks.oppositeSidesConfirmed,
    legA: {
      bookId: opportunity.bookAId ?? null,
      bookName: opportunity.bookA?.name ?? null,
      event: opportunity.event ?? null,
      market: opportunity.market ?? null,
      period: opportunity.period ?? null,
      side: opportunity.sideA ?? null,
      oddsAmerican:
        numberOrNull(bookA.observedOdds) ?? opportunity.verifiedOddsA ?? opportunity.oddsA ?? null,
      stake: numberOrNull(bookA.stake) ?? opportunity.stakeA ?? null,
      line:
        numberOrNull(bookA.observedLine) ?? opportunity.verifiedLineA ?? opportunity.lineA ?? null,
    },
    legB: {
      bookId: opportunity.bookBId ?? null,
      bookName: opportunity.bookB?.name ?? null,
      event: opportunity.event ?? null,
      market: opportunity.market ?? null,
      period: opportunity.period ?? null,
      side: opportunity.sideB ?? null,
      oddsAmerican:
        numberOrNull(bookB.observedOdds) ?? opportunity.verifiedOddsB ?? opportunity.oddsB ?? null,
      stake: numberOrNull(bookB.stake) ?? opportunity.stakeB ?? null,
      line:
        numberOrNull(bookB.observedLine) ?? opportunity.verifiedLineB ?? opportunity.lineB ?? null,
    },
  };
  const verificationGateFailures = evaluateVerificationGates(verificationInput, new Date())
    .filter((gate) => gate.status !== "pass")
    .map((gate) => `${gate.label}: ${gate.message}`);
  const manualGateFailures = evaluateManualLockChecklistFailures({
    bookAVerified: bookA.verified,
    bookBVerified: bookB.verified,
    sameEventConfirmed: checks.sameEventConfirmed,
    sameMarketConfirmed: checks.sameMarketConfirmed,
    samePlayerOrTeamConfirmed: checks.samePlayerOrTeamConfirmed,
    requiresSamePlayerOrTeam: Boolean(opportunity.playerOrTeam),
    samePeriodConfirmed: checks.samePeriodConfirmed,
    sameLineConfirmed: checks.sameLineConfirmed,
    isMiddleTrade: opportunityTradeType.includes("middle"),
    oppositeSidesConfirmed: checks.oppositeSidesConfirmed,
    oddsAcceptedConfirmed: checks.oddsAcceptedConfirmed,
    stakeAcceptedConfirmed: checks.stakeAcceptedConfirmed,
    liquidityEnoughConfirmed: checks.liquidityEnoughConfirmed,
    recalculatedConfirmed: checks.recalculatedConfirmed,
    userFinalConfirm: checks.userFinalConfirm,
  });
  const failures = [...verificationGateFailures, ...manualGateFailures];
  const canLock = failures.length === 0;

  async function startVerification() {
    const response = await fetch(`/api/trades/${opportunity.id}/start-verification`, { method: "POST" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast.error(body.error ?? "Could not start verification");
      return;
    }
    setStarted(true);
    toast.success("Verification started");
  }

  async function openBook(leg: "A" | "B") {
    const book = leg === "A" ? opportunity.bookA : opportunity.bookB;
    const side = leg === "A" ? opportunity.sideA : opportunity.sideB;
    if (!book?.id) {
      toast.error("No book is attached to this leg");
      return;
    }
    try {
      await navigator.clipboard.writeText(opportunity.playerOrTeam || side || opportunity.event);
    } catch {
      // Clipboard can be denied in browser privacy settings.
    }
    const params = new URLSearchParams({
      bookId: book.id,
      sport: opportunity.sport,
      marketType: opportunity.market,
      player: opportunity.playerOrTeam || side || "",
      event: opportunity.event,
    });
    const url = await fetch(`/api/deep-link?${params}`).then((r) => r.text());
    window.open(url || "#", "_blank", "noopener,noreferrer");
  }

  async function saveLeg(leg: "A" | "B") {
    const state = leg === "A" ? bookA : bookB;
    const setState = leg === "A" ? setBookA : setBookB;
    setState((prev) => ({ ...prev, saving: true }));
    try {
      const response = await fetch(`/api/trades/${opportunity.id}/verify-leg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leg,
          status: "verified",
          observedOdds: numberOrNull(state.observedOdds),
          observedLine: numberOrNull(state.observedLine),
          observedLiquidity: numberOrNull(state.observedLiquidity),
          notes: state.notes,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not save verification");
      }
      setState((prev) => ({ ...prev, verified: true, saving: false }));
      setLastVerifiedAt(new Date());
      toast.success(`Book ${leg} verified`);
    } catch (error) {
      setState((prev) => ({ ...prev, saving: false }));
      toast.error(error instanceof Error ? error.message : "Could not save verification");
    }
  }

  async function failCandidate(status: string) {
    const response = await fetch(`/api/trades/${opportunity.id}/verify-leg`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leg: "A", status }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast.error(body.error ?? "Could not fail candidate");
      return;
    }
    toast.message("Candidate moved to skipped/failed review");
    router.push("/skipped");
    router.refresh();
  }

  async function lockOpportunity() {
    setLocking(true);
    try {
      const response = await fetch(`/api/trades/${opportunity.id}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...checks,
          verifiedOddsA: numberOrNull(bookA.observedOdds),
          verifiedOddsB: numberOrNull(bookB.observedOdds),
          verifiedLineA: numberOrNull(bookA.observedLine),
          verifiedLineB: numberOrNull(bookB.observedLine),
          verifiedLiquidityA: numberOrNull(bookA.observedLiquidity),
          verifiedLiquidityB: numberOrNull(bookB.observedLiquidity),
          stakeA: numberOrNull(bookA.stake),
          stakeB: numberOrNull(bookB.stake),
          bookANotes: bookA.notes,
          bookBNotes: bookB.notes,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not lock opportunity");
      toast.success("Locked as paper trade");
      router.push(afterLockHref);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not lock opportunity");
    } finally {
      setLocking(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Verification-first queue</p>
          <h1>{opportunity.event}</h1>
          <p>{opportunity.sport} · {opportunity.market} · {opportunity.period}</p>
        </div>
        <div className="actions">
          <Link href={backHref} className="btn ghost">Back to queue</Link>
          <button className="btn" onClick={startVerification} disabled={started}>{started ? "Verification started" : "Start verification"}</button>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <SummaryCard label="Status" value={opportunity.status} />
        <SummaryCard label="Imported range" value={`${fmtMaybeUSD(opportunity.expectedProfitMin)} to ${fmtMaybeUSD(opportunity.expectedProfitMax)}`} />
        <SummaryCard label="Live recalculation" value={economics ? `${fmtUSD(economics.worst, { sign: true })} worst` : "Needs odds/stakes"} />
      </div>

      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <LegCard leg="A" opportunity={opportunity} state={bookA} setState={setBookA} onOpen={() => openBook("A")} onSave={() => saveLeg("A")} />
        <LegCard leg="B" opportunity={opportunity} state={bookB} setState={setBookB} onOpen={() => openBook("B")} onSave={() => saveLeg("B")} />
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><h3>Strict lock checklist</h3></div>
          <div className="card-pad stack">
            <Check label="Same event" value={checks.sameEventConfirmed} onChange={(v) => setChecks((c) => ({ ...c, sameEventConfirmed: v }))} />
            <Check label="Same market" value={checks.sameMarketConfirmed} onChange={(v) => setChecks((c) => ({ ...c, sameMarketConfirmed: v }))} />
            {opportunity.playerOrTeam && <Check label="Same player/team" value={checks.samePlayerOrTeamConfirmed} onChange={(v) => setChecks((c) => ({ ...c, samePlayerOrTeamConfirmed: v }))} />}
            <Check label="Same period" value={checks.samePeriodConfirmed} onChange={(v) => setChecks((c) => ({ ...c, samePeriodConfirmed: v }))} />
            <Check label={opportunity.tradeType === "middle" ? "Middle gap confirmed" : "Same line"} value={checks.sameLineConfirmed} onChange={(v) => setChecks((c) => ({ ...c, sameLineConfirmed: v }))} />
            <Check label="Opposite sides" value={checks.oppositeSidesConfirmed} onChange={(v) => setChecks((c) => ({ ...c, oppositeSidesConfirmed: v }))} />
            <Check label="Live odds accepted" value={checks.oddsAcceptedConfirmed} onChange={(v) => setChecks((c) => ({ ...c, oddsAcceptedConfirmed: v }))} />
            <Check label="Stake accepted at book" value={checks.stakeAcceptedConfirmed} onChange={(v) => setChecks((c) => ({ ...c, stakeAcceptedConfirmed: v }))} />
            <Check label="Liquidity enough" value={checks.liquidityEnoughConfirmed} onChange={(v) => setChecks((c) => ({ ...c, liquidityEnoughConfirmed: v }))} />
            <Check label="Recalculated after moves" value={checks.recalculatedConfirmed} onChange={(v) => setChecks((c) => ({ ...c, recalculatedConfirmed: v }))} />
            <Check label="Final manual confirmation" value={checks.userFinalConfirm} onChange={(v) => setChecks((c) => ({ ...c, userFinalConfirm: v }))} />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Lock decision</h3></div>
          <div className="card-pad stack">
            {economics && (
              <div className="callout">
                <b>Observed P/L:</b> A wins {fmtUSD(economics.profitIfA, { sign: true })} · B wins {fmtUSD(economics.profitIfB, { sign: true })}
              </div>
            )}
            {failures.length > 0 ? (
              <div className="hint">Missing: {failures.join(" · ")}</div>
            ) : (
              <div className="badge b-verified"><span className="dot" />Ready to lock</div>
            )}
            <button className="btn primary" onClick={lockOpportunity} disabled={failures.length > 0 || locking}>
              {locking ? "Locking…" : "Lock Paper Trade"}
            </button>
            <div className="row tight">
              <button className="btn ghost" onClick={() => failCandidate("market_unavailable")}>Fail: market unavailable</button>
              <button className="btn ghost" onClick={() => failCandidate("book_unavailable")}>Fail: book unavailable</button>
            </div>
            <p className="hint">This app only verifies and tracks paper trades. It never logs into books, clicks bet buttons, or places wagers.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegCard({ leg, opportunity, state, setState, onOpen, onSave }: {
  leg: "A" | "B";
  opportunity: any;
  state: LegState;
  setState: (updater: (prev: LegState) => LegState) => void;
  onOpen: () => void;
  onSave: () => void;
}) {
  const book = leg === "A" ? opportunity.bookA : opportunity.bookB;
  const side = leg === "A" ? opportunity.sideA : opportunity.sideB;
  const originalOdds = leg === "A" ? opportunity.oddsA : opportunity.oddsB;
  const originalLine = leg === "A" ? opportunity.lineA : opportunity.lineB;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Book {leg}: {book?.name ?? "Unassigned"}</h3>
        <span className={`badge ${state.verified ? "b-verified" : "b-needs"}`}><span className="dot" />{state.verified ? "Verified" : "Pending"}</span>
      </div>
      <div className="card-pad stack">
        <div className="hint">Expected: <b>{side ?? "unknown side"}</b> {originalOdds ? `@ ${fmtOdds(originalOdds)}` : ""} {originalLine != null ? `(line ${originalLine})` : ""}</div>
        <button className="btn ghost" onClick={onOpen}>Open book deep link</button>
        <Field label="Observed odds" value={state.observedOdds} onChange={(v) => setState((s) => ({ ...s, observedOdds: v, verified: false }))} />
        <Field label="Observed line" value={state.observedLine} onChange={(v) => setState((s) => ({ ...s, observedLine: v, verified: false }))} />
        <Field label="Accepted stake" value={state.stake} onChange={(v) => setState((s) => ({ ...s, stake: v, verified: false }))} />
        <Field label="Available liquidity / max" value={state.observedLiquidity} onChange={(v) => setState((s) => ({ ...s, observedLiquidity: v, verified: false }))} />
        <div className="field">
          <label className="label">Notes</label>
          <input className="input" value={state.notes} onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))} />
        </div>
        <button className="btn" onClick={onSave} disabled={state.saving}>{state.saving ? "Saving…" : `Save book ${leg} verification`}</button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div className="card"><div className="card-pad"><div className="kpi"><span>{label}</span><b>{value}</b></div></div></div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <input className="input num" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="row tight" style={{ gap: 8 }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function computeEconomics(tradeType: string, a: LegState, b: LegState) {
  const oddsA = numberOrNull(a.observedOdds);
  const oddsB = numberOrNull(b.observedOdds);
  const stakeA = numberOrNull(a.stake);
  const stakeB = numberOrNull(b.stake);
  if (oddsA == null || oddsB == null || stakeA == null || stakeB == null || stakeA <= 0 || stakeB <= 0) return null;

  if (tradeType === "middle") {
    const lineA = numberOrNull(a.observedLine);
    const lineB = numberOrNull(b.observedLine);
    if (lineA == null || lineB == null) return null;
    const middle = middleHedge(stakeA, oddsA, Math.min(lineA, lineB), stakeB, oddsB, Math.max(lineA, lineB));
    return { profitIfA: middle.plOutsideHigh, profitIfB: middle.plOutsideLow, worst: middle.outsideLoss, best: middle.middleProfit };
  }

  if (tradeType === "promo_conversion") {
    const profitIfA = promoPayout(stakeA, oddsA).profit - stakeB;
    const profitIfB = cashPayout(stakeB, oddsB).totalReturn - stakeB;
    return { profitIfA, profitIfB, worst: Math.min(profitIfA, profitIfB), best: Math.max(profitIfA, profitIfB) };
  }

  if (tradeType === "low_hold" || tradeType === "rollover_clearing") {
    const low = lowHold(stakeA, oddsA, stakeB, oddsB);
    return { profitIfA: low.profitIfA, profitIfB: low.profitIfB, worst: Math.min(low.profitIfA, low.profitIfB), best: Math.max(low.profitIfA, low.profitIfB) };
  }

  const profitIfA = cashPayout(stakeA, oddsA).totalReturn - stakeA - stakeB;
  const profitIfB = cashPayout(stakeB, oddsB).totalReturn - stakeA - stakeB;
  return { profitIfA, profitIfB, worst: Math.min(profitIfA, profitIfB), best: Math.max(profitIfA, profitIfB) };
}

function numberOrNull(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fmtMaybeUSD(value: number | null | undefined) {
  return typeof value === "number" ? fmtUSD(value, { sign: true }) : "—";
}

"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createManualTrade } from "./manual-actions";
import { ManualTradeSchema } from "./manual-schema";
import { MANUAL_STATUSES } from "@paperedge/core/constants";
import type { Book } from "@paperedge/database";

interface Props {
  books: Book[];
}

function parseOddsInput(raw: string): number | null {
  const clean = raw.trim();
  if (!clean) return null;
  const n = parseInt(clean, 10);
  return isNaN(n) ? null : n;
}

function oddsWarning(raw: string): string | null {
  if (!raw.trim()) return null;
  if (!/^[+-]/.test(raw.trim())) return "Odds should start with + or − (e.g. +128 or -110)";
  return null;
}

function sideWarning(sideA: string, sideB: string): string | null {
  if (!sideA || !sideB) return null;
  if (sideA.trim().toLowerCase() === sideB.trim().toLowerCase())
    return "Side A and Side B appear identical — check they are opposite sides";
  const aLower = sideA.toLowerCase();
  const bLower = sideB.toLowerCase();
  if (aLower.includes("over") && bLower.includes("over"))
    return "Both sides contain 'Over' — one should be Under";
  if (aLower.includes("under") && bLower.includes("under"))
    return "Both sides contain 'Under' — one should be Over";
  return null;
}

export function TradeForm({ books }: Props) {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];

  const [customTradeId, setCustomTradeId] = useState("");
  const [tradeDate, setTradeDate] = useState(today);
  const [eventName, setEventName] = useState("");
  const [marketType, setMarketType] = useState("");
  const [player, setPlayer] = useState("");
  const [lineValue, setLineValue] = useState("");
  const [bookAId, setBookAId] = useState("");
  const [sideA, setSideA] = useState("");
  const [oddsA, setOddsA] = useState("");
  const [stakeA, setStakeA] = useState("");
  const [bookBId, setBookBId] = useState("");
  const [sideB, setSideB] = useState("");
  const [oddsB, setOddsB] = useState("");
  const [stakeB, setStakeB] = useState("");
  const [expectedProfitRange, setExpectedProfitRange] = useState("");
  const [status, setStatus] = useState("pending_verification");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const sameBooksWarning =
    bookAId && bookBId && bookAId === bookBId
      ? "Book A and Book B are the same — trades require two different books"
      : null;

  const sidesWarn = sideWarning(sideA, sideB);
  const oddsAWarn = oddsWarning(oddsA);
  const oddsBWarn = oddsWarning(oddsB);

  const totalStake = useMemo(() => {
    const a = parseFloat(stakeA) || 0;
    const b = parseFloat(stakeB) || 0;
    return a + b > 0 ? (a + b).toFixed(2) : null;
  }, [stakeA, stakeB]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const input = {
      customTradeId,
      tradeDate,
      eventName,
      marketType,
      player,
      lineValue,
      bookAId,
      sideA,
      oddsA: parseOddsInput(oddsA) ?? 0,
      stakeA,
      bookBId,
      sideB,
      oddsB: parseOddsInput(oddsB) ?? 0,
      stakeB,
      expectedProfitRange,
      status,
      notes,
    };

    console.groupCollapsed("[ManualTrade] submit");
    console.debug("raw input", input);

    const result = ManualTradeSchema.safeParse(input);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as string;
        fieldErrors[key] = issue.message;
      }
      console.warn("[ManualTrade] validation failed", result.error.issues);
      console.groupEnd();
      setErrors(fieldErrors);
      return;
    }

    console.debug("[ManualTrade] parsed payload", result.data);
    console.groupEnd();

    setSaving(true);
    try {
      const id = await createManualTrade(result.data);
      toast.success("Trade saved");
      router.push(`/trades/${id}`);
    } catch (err: any) {
      console.error("[ManualTrade] createManualTrade failed", err);
      toast.error(err.message ?? "Failed to save trade");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Add Paper Trade</h1>
          <p>Record both legs of your arbitrage before the game starts.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => router.back()}>
            ← Cancel
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="stack">
        {/* Trade Info */}
        <div className="card">
          <div className="card-head">
            <h3>Trade Info</h3>
            <span className="sub">Event details and identifiers</span>
          </div>
          <div className="card-pad" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="field">
              <label>Trade ID <span style={{ color: "var(--loss)" }}>*</span></label>
              <input
                className="input mono"
                placeholder="CHET-AST-001"
                value={customTradeId}
                onChange={(e) => setCustomTradeId(e.target.value)}
              />
              {errors.customTradeId && <span className="help" style={{ color: "var(--loss)" }}>{errors.customTradeId}</span>}
            </div>
            <div className="field">
              <label>Date <span style={{ color: "var(--loss)" }}>*</span></label>
              <input
                type="date"
                className="input"
                value={tradeDate}
                onChange={(e) => setTradeDate(e.target.value)}
              />
              {errors.tradeDate && <span className="help" style={{ color: "var(--loss)" }}>{errors.tradeDate}</span>}
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Event <span style={{ color: "var(--loss)" }}>*</span></label>
              <input
                className="input"
                placeholder="San Antonio Spurs vs Oklahoma City Thunder"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
              />
              {errors.eventName && <span className="help" style={{ color: "var(--loss)" }}>{errors.eventName}</span>}
            </div>
            <div className="field">
              <label>Market <span style={{ color: "var(--loss)" }}>*</span></label>
              <input
                className="input"
                placeholder="Player Assists"
                value={marketType}
                onChange={(e) => setMarketType(e.target.value)}
              />
              {errors.marketType && <span className="help" style={{ color: "var(--loss)" }}>{errors.marketType}</span>}
            </div>
            <div className="field">
              <label>Player</label>
              <input
                className="input"
                placeholder="Chet Holmgren"
                value={player}
                onChange={(e) => setPlayer(e.target.value)}
              />
              {errors.player && <span className="help" style={{ color: "var(--loss)" }}>{errors.player}</span>}
            </div>
            <div className="field">
              <label>Line <span style={{ color: "var(--loss)" }}>*</span></label>
              <input
                type="number"
                step="0.5"
                className="input mono"
                placeholder="1.5"
                value={lineValue}
                onChange={(e) => setLineValue(e.target.value)}
                style={{ maxWidth: 140 }}
              />
              <span className="help">Point spread, total, or prop line</span>
              {errors.lineValue && <span className="help" style={{ color: "var(--loss)" }}>{errors.lineValue}</span>}
            </div>
          </div>
        </div>

        {/* Legs */}
        <div className="grid cols-2" style={{ gap: 14 }}>
          {/* Leg A */}
          <div className="card">
            <div className="card-head">
              <h3>Leg A</h3>
              <span className="sub">First book</span>
            </div>
            <div className="card-pad stack" style={{ gap: 12 }}>
              {sameBooksWarning && (
                <div className="alert danger" style={{ padding: "8px 12px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--loss)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
                  <span style={{ fontSize: 12 }}>{sameBooksWarning}</span>
                </div>
              )}
              <div className="field">
                <label>Book A <span style={{ color: "var(--loss)" }}>*</span></label>
                <select
                  className="select"
                  value={bookAId}
                  onChange={(e) => setBookAId(e.target.value)}
                >
                  <option value="">Select book…</option>
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                {errors.bookAId && <span className="help" style={{ color: "var(--loss)" }}>{errors.bookAId}</span>}
              </div>
              <div className="field">
                <label>Side A <span style={{ color: "var(--loss)" }}>*</span></label>
                <input
                  className="input"
                  placeholder="Over 1.5 Assists"
                  value={sideA}
                  onChange={(e) => setSideA(e.target.value)}
                />
                {sidesWarn && <span className="help" style={{ color: "var(--warn)" }}>{sidesWarn}</span>}
                {errors.sideA && <span className="help" style={{ color: "var(--loss)" }}>{errors.sideA}</span>}
              </div>
              <div className="field">
                <label>Odds A <span style={{ color: "var(--loss)" }}>*</span></label>
                <input
                  className="input mono"
                  placeholder="+128"
                  value={oddsA}
                  onChange={(e) => setOddsA(e.target.value)}
                  style={{ maxWidth: 120 }}
                />
                {oddsAWarn && <span className="help" style={{ color: "var(--warn)" }}>{oddsAWarn}</span>}
                {errors.oddsA && <span className="help" style={{ color: "var(--loss)" }}>{errors.oddsA}</span>}
              </div>
              <div className="field">
                <label>Stake A ($) <span style={{ color: "var(--loss)" }}>*</span></label>
                <input
                  type="number"
                  step="0.01"
                  className="input mono"
                  placeholder="398"
                  value={stakeA}
                  onChange={(e) => setStakeA(e.target.value)}
                  style={{ maxWidth: 140 }}
                />
                {errors.stakeA && <span className="help" style={{ color: "var(--loss)" }}>{errors.stakeA}</span>}
              </div>
            </div>
          </div>

          {/* Leg B */}
          <div className="card">
            <div className="card-head">
              <h3>Leg B</h3>
              <span className="sub">Second book</span>
            </div>
            <div className="card-pad stack" style={{ gap: 12 }}>
              <div className="field">
                <label>Book B <span style={{ color: "var(--loss)" }}>*</span></label>
                <select
                  className="select"
                  value={bookBId}
                  onChange={(e) => setBookBId(e.target.value)}
                >
                  <option value="">Select book…</option>
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                {errors.bookBId && <span className="help" style={{ color: "var(--loss)" }}>{errors.bookBId}</span>}
              </div>
              <div className="field">
                <label>Side B <span style={{ color: "var(--loss)" }}>*</span></label>
                <input
                  className="input"
                  placeholder="Under 1.5 Assists"
                  value={sideB}
                  onChange={(e) => setSideB(e.target.value)}
                />
                {errors.sideB && <span className="help" style={{ color: "var(--loss)" }}>{errors.sideB}</span>}
              </div>
              <div className="field">
                <label>Odds B <span style={{ color: "var(--loss)" }}>*</span></label>
                <input
                  className="input mono"
                  placeholder="-110"
                  value={oddsB}
                  onChange={(e) => setOddsB(e.target.value)}
                  style={{ maxWidth: 120 }}
                />
                {oddsBWarn && <span className="help" style={{ color: "var(--warn)" }}>{oddsBWarn}</span>}
                {errors.oddsB && <span className="help" style={{ color: "var(--loss)" }}>{errors.oddsB}</span>}
              </div>
              <div className="field">
                <label>Stake B ($) <span style={{ color: "var(--loss)" }}>*</span></label>
                <input
                  type="number"
                  step="0.01"
                  className="input mono"
                  placeholder="470"
                  value={stakeB}
                  onChange={(e) => setStakeB(e.target.value)}
                  style={{ maxWidth: 140 }}
                />
                {errors.stakeB && <span className="help" style={{ color: "var(--loss)" }}>{errors.stakeB}</span>}
              </div>
            </div>
          </div>
        </div>

        {totalStake && (
          <div className="alert info" style={{ padding: "10px 14px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>
            <span style={{ fontSize: 13 }}>Total combined stake: <strong className="mono">${totalStake}</strong></span>
          </div>
        )}

        {/* Additional Info */}
        <div className="card">
          <div className="card-head">
            <h3>Additional Info</h3>
            <span className="sub">Optional details and metadata</span>
          </div>
          <div className="card-pad" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="field">
              <label>Expected Profit Range</label>
              <input
                className="input mono"
                placeholder="$29.27 to $39.44"
                value={expectedProfitRange}
                onChange={(e) => setExpectedProfitRange(e.target.value)}
              />
              <span className="help">e.g. "$29.27 to $39.44" — paste from OddsJam</span>
            </div>
            <div className="field">
              <label>Status <span style={{ color: "var(--loss)" }}>*</span></label>
              <select
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {MANUAL_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              {errors.status && <span className="help" style={{ color: "var(--loss)" }}>{errors.status}</span>}
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Notes</label>
              <textarea
                className="textarea"
                rows={3}
                placeholder="Verified live on both books before game."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="card-head" style={{ borderTop: "1px solid var(--line)", borderBottom: 0 }}>
            <span className="hint">Trade will be saved and you can lock it after verification.</span>
            <div className="right row tight">
              <button type="button" className="btn ghost" onClick={() => router.back()}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7"/></svg>
                {saving ? "Saving…" : "Save Trade"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

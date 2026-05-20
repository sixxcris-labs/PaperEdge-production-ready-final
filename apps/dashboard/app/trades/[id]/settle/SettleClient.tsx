"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtUSD, fmtOdds, americanToDec } from "@paperedge/core/fmt";
import { toast } from "sonner";
import { settleTrade } from "../settle-actions";

interface Props {
  trade: any;
  mistageTags: { id: string; name: string }[];
}

export function SettleClient({ trade, mistageTags }: Props) {
  const router = useRouter();
  const legA = trade.legs?.find((l: any) => l.legLabel === "A");
  const legB = trade.legs?.find((l: any) => l.legLabel === "B");

  const totalStake = (legA?.stake ?? 0) + (legB?.stake ?? 0);

  const [winningSide, setWinningSide] = useState("A");
  const [finalStat, setFinalStat] = useState("");
  const [actualPayout, setActualPayout] = useState("");
  const [losingStake, setLosingStake] = useState("");
  const [actualPL, setActualPL] = useState("");
  const [resultNotes, setResultNotes] = useState("");
  const [selectedMistakeTags, setSelectedMistakeTags] = useState<string[]>([]);
  const [mistakeNotes, setMistakeNotes] = useState("");
  const [pending, setPending] = useState(false);

  function recalcPL(payout: string, losing: string) {
    const p = parseFloat(payout) || 0;
    const l = parseFloat(losing) || 0;
    if (p > 0 || l > 0) setActualPL((p - l).toFixed(2));
  }

  function handleWinningSideChange(side: string) {
    setWinningSide(side);
    // Pre-fill stakes based on outcome
    if (side === "A" && legA && legB) {
      const payout = (legA.stake * americanToDec(legA.oddsAmerican)).toFixed(2);
      setActualPayout(payout);
      setLosingStake(legB.stake.toFixed(2));
      recalcPL(payout, legB.stake.toFixed(2));
    } else if (side === "B" && legA && legB) {
      const payout = (legB.stake * americanToDec(legB.oddsAmerican)).toFixed(2);
      setActualPayout(payout);
      setLosingStake(legA.stake.toFixed(2));
      recalcPL(payout, legA.stake.toFixed(2));
    } else if (side === "push") {
      setActualPayout(totalStake.toFixed(2));
      setLosingStake("0");
      setActualPL("0.00");
    }
  }

  function toggleMistakeTag(id: string) {
    setSelectedMistakeTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("winningSide", winningSide);
      fd.set("finalStat", finalStat);
      fd.set("actualPayout", actualPayout);
      fd.set("losingStake", losingStake);
      fd.set("actualProfitLoss", actualPL);
      fd.set("resultNotes", resultNotes);
      fd.set("mistakeNotes", mistakeNotes);
      selectedMistakeTags.forEach((t) => fd.append("mistakeTagIds", t));

      await settleTrade(trade.id, fd);
      toast.success("Trade settled successfully");
      router.push(`/trades/${trade.id}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to settle trade");
    } finally {
      setPending(false);
    }
  }

  const plNum = parseFloat(actualPL) || 0;
  const plClass = plNum > 0 ? "pos" : plNum < 0 ? "neg" : "";

  return (
    <form onSubmit={handleSubmit}>
      <div className="detail-grid">
        {/* Left: settlement inputs */}
        <div className="stack">
          {/* Outcome selector */}
          <div className="card">
            <div className="card-head"><h3>Outcome</h3><span className="sub">which side won?</span></div>
            <div className="card-pad stack">
              <div className="field">
                <label className="label">Winning side</label>
                <select
                  className="select"
                  value={winningSide}
                  onChange={(e) => handleWinningSideChange(e.target.value)}
                >
                  <option value="A">
                    Book A wins — {legA?.sideLabel || legA?.side || "Side A"}
                    {legA ? ` (${fmtOdds(legA.oddsAmerican)})` : ""}
                  </option>
                  <option value="B">
                    Book B wins — {legB?.sideLabel || legB?.side || "Side B"}
                    {legB ? ` (${fmtOdds(legB.oddsAmerican)})` : ""}
                  </option>
                  <option value="push">Push / Void — stakes returned</option>
                </select>
              </div>

              <div className="field">
                <label className="label">Final stat / result</label>
                <input
                  className="input"
                  value={finalStat}
                  onChange={(e) => setFinalStat(e.target.value)}
                  placeholder="e.g. 1 assist, over 4.5 pts, 3-2 final"
                />
              </div>
            </div>
          </div>

          {/* Payout figures */}
          <div className="card">
            <div className="card-head"><h3>Payout figures</h3><span className="sub">actual amounts received/lost</span></div>
            <div className="card-pad">
              <div className="grid cols-2" style={{ gap: 14 }}>
                <div className="field">
                  <label className="label">Winning leg payout ($)</label>
                  <input
                    className="input num"
                    type="number"
                    step="0.01"
                    value={actualPayout}
                    onChange={(e) => {
                      setActualPayout(e.target.value);
                      recalcPL(e.target.value, losingStake);
                    }}
                    placeholder="526.00"
                  />
                </div>
                <div className="field">
                  <label className="label">Losing stake ($)</label>
                  <input
                    className="input num"
                    type="number"
                    step="0.01"
                    value={losingStake}
                    onChange={(e) => {
                      setLosingStake(e.target.value);
                      recalcPL(actualPayout, e.target.value);
                    }}
                    placeholder="398.00"
                  />
                </div>
              </div>

              <div className="field" style={{ marginTop: 14 }}>
                <label className="label">
                  Actual P/L ($)
                  <span className="hint" style={{ marginLeft: 8 }}>auto-calculated · edit if needed</span>
                </label>
                <input
                  className={`input num ${plClass}`}
                  type="number"
                  step="0.01"
                  required
                  value={actualPL}
                  onChange={(e) => setActualPL(e.target.value)}
                  placeholder="29.50"
                  style={{
                    color: plNum > 0 ? "var(--profit)" : plNum < 0 ? "var(--loss)" : undefined,
                    fontWeight: actualPL ? 600 : undefined,
                  }}
                />
              </div>

              <div className="field" style={{ marginTop: 14 }}>
                <label className="label">Settlement notes</label>
                <textarea
                  className="textarea"
                  rows={2}
                  value={resultNotes}
                  onChange={(e) => setResultNotes(e.target.value)}
                  placeholder="Any notes about how this settled…"
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="card card-pad">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="hint">Net P/L</div>
                <b className={`num ${plClass}`} style={{ fontSize: 20 }}>
                  {actualPL ? fmtUSD(plNum, { sign: true }) : "—"}
                </b>
              </div>
              <button type="submit" className="btn primary" disabled={pending || !actualPL}>
                {pending ? "Saving…" : "Settle Trade →"}
              </button>
            </div>
          </div>
        </div>

        {/* Right: summary + mistake tags */}
        <div className="stack">
          {/* Trade summary */}
          <div className="card">
            <div className="card-head"><h3>Trade summary</h3></div>
            <div className="card-pad">
              <dl className="kv">
                <dt>Event</dt><dd>{trade.eventName}</dd>
                <dt>Market</dt><dd>{trade.marketType || "—"}</dd>
                <dt>Total staked</dt><dd className="num">{fmtUSD(totalStake)}</dd>
              </dl>
              {legA && (
                <div style={{ marginTop: 12 }}>
                  <div className="hint" style={{ marginBottom: 4 }}>Book A</div>
                  <dl className="kv">
                    <dt>Side</dt><dd>{legA.sideLabel || legA.side || "—"}</dd>
                    <dt>Odds</dt><dd>{fmtOdds(legA.oddsAmerican)}</dd>
                    <dt>Stake</dt><dd className="num">{fmtUSD(legA.stake)}</dd>
                    <dt>Implied payout</dt><dd className="num">{fmtUSD(legA.stake * americanToDec(legA.oddsAmerican))}</dd>
                  </dl>
                </div>
              )}
              {legB && (
                <div style={{ marginTop: 12 }}>
                  <div className="hint" style={{ marginBottom: 4 }}>Book B</div>
                  <dl className="kv">
                    <dt>Side</dt><dd>{legB.sideLabel || legB.side || "—"}</dd>
                    <dt>Odds</dt><dd>{fmtOdds(legB.oddsAmerican)}</dd>
                    <dt>Stake</dt><dd className="num">{fmtUSD(legB.stake)}</dd>
                    <dt>Implied payout</dt><dd className="num">{fmtUSD(legB.stake * americanToDec(legB.oddsAmerican))}</dd>
                  </dl>
                </div>
              )}
            </div>
          </div>

          {/* Mistake tags */}
          {mistageTags.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h3>Mistake tags</h3>
                <span className="sub">optional — flag execution errors</span>
              </div>
              <div className="card-pad stack">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {mistageTags.map((tag) => {
                    const active = selectedMistakeTags.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        className={`chip ${active ? "active" : ""}`}
                        onClick={() => toggleMistakeTag(tag.id)}
                        style={active ? { borderColor: "var(--loss)", color: "var(--loss)" } : undefined}
                      >
                        {tag.name.replace(/_/g, " ")}
                      </button>
                    );
                  })}
                </div>
                {selectedMistakeTags.length > 0 && (
                  <div className="field">
                    <label className="label">Mistake notes</label>
                    <textarea
                      className="textarea"
                      rows={2}
                      value={mistakeNotes}
                      onChange={(e) => setMistakeNotes(e.target.value)}
                      placeholder="What went wrong?"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { importTradesFromText } from "../new/manual-actions";
import { normalizeTradePaste } from "@/lib/trade-text-import";

const EXAMPLE = `Trade ID: CHET-AST-001
Date: May 18, 2026
Event: San Antonio Spurs vs Oklahoma City Thunder
Market: Player Assists
Player: Chet Holmgren
Line: 1.5

Book A: Novig
Side A: Over 1.5 Assists
Odds A: +128
Stake A: $398

Book B: Sportzino
Side B: Under 1.5 Assists
Odds B: -110
Stake B: $470

Expected Profit Range: $29.27 to $39.44
Status: Locked Paper Trade
Notes: Verified live on both books before game.`;

export default function ImportPage() {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"paste" | "oddsJam">("paste");
  const router = useRouter();

  async function handleImport() {
    if (!raw.trim()) return;
    setLoading(true);
    try {
      const result = await importTradesFromText(raw);
      const summary = [
        `${result.created} trade${result.created !== 1 ? "s" : ""} imported`,
        result.settled > 0 ? `${result.settled} settled` : null,
      ]
        .filter(Boolean)
        .join(", ");
      if (result.created === 0 && result.settled === 0 && result.errors.length > 0) {
        toast.error(`Import failed: ${result.errors[0]}`);
      } else if (result.errors.length > 0) {
        toast.warning(
          `${summary}, ${result.errors.length} failed: ${result.errors[0]}`
        );
        router.push("/trades");
      } else {
        toast.success(summary);
        router.push("/trades");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Import failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleOddsJamStart() {
    if (!raw.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/trades/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      const { id } = await res.json();
      router.push(`/trades/${id}/verify`);
    } finally {
      setLoading(false);
    }
  }

  function handleStructuredPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (mode !== "paste") return;
    const pasted = e.clipboardData.getData("text");
    if (!pasted.trim()) return;

    e.preventDefault();
    const target = e.currentTarget;
    const start = target.selectionStart ?? raw.length;
    const end = target.selectionEnd ?? raw.length;
    const normalized = normalizeTradePaste(pasted);
    setRaw(`${raw.slice(0, start)}${normalized}${raw.slice(end)}`);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Import Trades</h1>
          <p>
            Paste one or more trades, separated by{" "}
            <code style={{ background: "var(--panel)", padding: "1px 5px", borderRadius: 4 }}>---</code>{" "}
            on its own line. Each item enters the verification queue before it can be locked.
          </p>
        </div>
        <div className="actions">
          <Link href="/trades" className="btn ghost">Cancel</Link>
        </div>
      </div>

      <div
        className="badge b-info"
        style={{ marginBottom: 14, display: "inline-flex" }}
        title="No real money is placed by this app."
      >
        <span className="dot" />
        Paper trading only. This app does not place bets, connect to sportsbooks,
        bypass geolocation, or guarantee profit. Verify both books manually before locking.
      </div>

      {/* Mode tabs */}
      <div className="toggle" style={{ marginBottom: 16 }}>
        <button
          className={mode === "paste" ? "on" : ""}
          onClick={() => setMode("paste")}
        >
          Structured text import
        </button>
        <button
          className={mode === "oddsJam" ? "on" : ""}
          onClick={() => setMode("oddsJam")}
        >
          OddsJam paste → verify
        </button>
      </div>

      <div className="detail-grid">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h3>{mode === "paste" ? "Paste trade(s)" : "Paste OddsJam opportunity"}</h3>
              {mode === "paste" && (
                <button
                  className="btn ghost"
                  style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 12 }}
                  onClick={() => setRaw(EXAMPLE)}
                >
                  Load example
                </button>
              )}
            </div>
            <div className="card-pad">
              <textarea
                className="textarea"
                style={{ minHeight: 320, fontFamily: "var(--mono, monospace)", fontSize: 12.5 }}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                onPaste={handleStructuredPaste}
                placeholder={mode === "paste" ? EXAMPLE : "Paste OddsJam arb here — odds, stakes, book names, player/team, etc."}
                spellCheck={false}
              />
              <div className="row" style={{ gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
                {mode === "paste" ? (
                  <button
                    className="btn primary"
                    onClick={handleImport}
                    disabled={!raw.trim() || loading}
                  >
                    {loading ? "Importing…" : "Import trades →"}
                  </button>
                ) : (
                  <button
                    className="btn primary"
                    onClick={handleOddsJamStart}
                    disabled={!raw.trim() || loading}
                  >
                    {loading ? "Creating…" : "Start verification →"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Format notes</h3></div>
            <div className="card-pad hint" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {mode === "paste" ? (
                <>
                  <span>• All fields are <code>Key: Value</code> on separate lines.</span>
                  <span>• Separate multiple trades with <code>---</code> on its own line.</span>
                  <span>
                    • Book names must exist in your{" "}
                    <Link href="/books/manage" style={{ color: "var(--info)" }}>Books list</Link>{" "}
                    — unknown books are auto-created with the Unknown role.
                  </span>
                  <span>
                    • Status values: Pending Verification, Locked Paper Trade,
                    Locked Paper Trade Upgraded, Replaced/Removed, Settled Win,
                    Settled Loss, Settled Push/Void.
                  </span>
                </>
              ) : (
                <>
                  <span>
                    • The app creates an unverified trade and takes you to the
                    verification screen.
                  </span>
                  <span>
                    • You confirm odds live on each book before locking — nothing
                    is placed automatically.
                  </span>
                  <span>
                    • The Lock Paper Trade button stays disabled until every
                    verification check passes.
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

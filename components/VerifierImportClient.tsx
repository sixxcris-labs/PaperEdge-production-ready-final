"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const EXAMPLE = `Event: San Antonio Spurs vs Oklahoma City Thunder
Sport: NBA
Market: Player Assists
Player: Chet Holmgren
Period: Full Game
Book A: Novig
Side A: Over 1.5 Assists
Odds A: +128
Stake A: $398
Book B: Sportzino
Side B: Under 1.5 Assists
Odds B: -110
Stake B: $470
Expected Profit Range: $29.27 to $39.44`;

export function VerifierImportClient() {
  const router = useRouter();
  const [raw, setRaw] = useState(EXAMPLE);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const response = await fetch("/api/trades/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Import failed");
      toast.success("Opportunity queued for verification");
      router.push(`/verify/${body.opportunityId ?? body.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Bulk paste</p>
          <h1>Import opportunities into the verifier</h1>
          <p>Rows enter a verification queue first. They do not become locked paper trades until every check passes.</p>
        </div>
      </div>
      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><h3>Paste OddsJam-style text</h3></div>
          <div className="card-pad stack">
            <textarea className="textarea" style={{ minHeight: 360 }} value={raw} onChange={(e) => setRaw(e.target.value)} />
            <button className="btn primary" onClick={submit} disabled={loading || raw.trim().length === 0}>{loading ? "Importing…" : "Queue for verification"}</button>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Verifier rules</h3></div>
          <div className="card-pad stack hint">
            <p>PaperEdge verifies first, ranks second. Confirm same event, market, player/team, period, line, opposite sides, live odds, stake acceptance, liquidity, and calculator before locking.</p>
            <p>Unknown books are auto-created as unavailable and must be classified before they can pass the lock gate.</p>
            <p>The app opens deep links and copies search text. It never logs in, clicks book controls, bypasses KYC/geolocation, or places bets.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

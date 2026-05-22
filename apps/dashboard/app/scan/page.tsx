import { KPI, SportPill, BookCell } from "@/components/ui/design";
import { RefreshButton } from "@/components/RefreshButton";
import { RunScanButton } from "./RunScanButton";
import { loadScanResults } from "@/apps/dashboard/lib/scan-results";
import type { ScanFinding } from "@paperedge/core/scan-findings";

export const dynamic = "force-dynamic";

const KIND_META: Record<ScanFinding["kind"], { label: string; cls: string }> = {
  arb: { label: "Arb", cls: "b-profit" },
  value: { label: "+EV", cls: "b-info" },
  middle: { label: "Middle", cls: "b-neutral" },
};

function timeAgo(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function FindingRow({ f, rank }: { f: ScanFinding; rank: number }) {
  const kind = KIND_META[f.kind];
  return (
    <tr style={f.actNow ? { background: "var(--profit-bg)" } : undefined}>
      <td className="muted num">{rank}</td>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`badge ${kind.cls}`}>
            <span className="dot" />
            {kind.label}
          </span>
          {f.actNow && (
            <span className="badge b-profit" title="Clears the act-now threshold">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
              </svg>
              ACT NOW
            </span>
          )}
        </div>
      </td>
      <td>
        <b>{f.event}</b>
        <div className="hint">{f.sport ? <SportPill sport={f.sport} /> : f.league}</div>
      </td>
      <td>
        {f.market}
        <div className="hint">
          {f.selection}
          {f.detail ? ` · ${f.detail}` : ""}
        </div>
      </td>
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {f.legs.map((leg, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              {leg.book ? <BookCell name={leg.book} /> : <span className="dim">—</span>}
              {leg.line ? <span className="muted">{leg.line}</span> : null}
              {leg.odds ? <span className="num">{leg.odds}</span> : null}
            </div>
          ))}
        </div>
      </td>
      <td className="num">
        <b className={f.edge > 0 ? "pos" : ""}>{f.metric}</b>
      </td>
      <td className="num muted">{f.score.toFixed(0)}</td>
    </tr>
  );
}

export default function ScanPage() {
  const { findings, summary, lastScanAt, empty } = loadScanResults();
  const actNow = findings.filter((f) => f.actNow);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Market Scan</h1>
          <p>
            Cross-book arbs and +EV edges, ranked best to worst ·{" "}
            {lastScanAt ? `last scan ${timeAgo(lastScanAt)}` : "no scan yet"}
          </p>
        </div>
        <div className="actions">
          <RefreshButton />
          <RunScanButton />
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <KPI
          label="Act Now"
          value={summary.actNow}
          sub="cleared the action threshold"
          up={summary.actNow > 0}
          warn={summary.actNow === 0}
        />
        <KPI
          label="Locked Arbs"
          value={summary.arbs}
          sub={`${summary.middles} middle${summary.middles === 1 ? "" : "s"} also found`}
          up={summary.arbs > 0}
        />
        <KPI label="+EV Edges" value={summary.value} sub="priced above fair value" />
        <KPI
          label="Best Edge"
          value={summary.topEdge > 0 ? `${(summary.topEdge * 100).toFixed(2)}%` : "—"}
          sub="top finding this scan"
          up={summary.topEdge > 0}
        />
      </div>

      {empty ? (
        <div className="card">
          <div className="card-pad" style={{ textAlign: "center", padding: "48px 16px", color: "var(--fg-3)" }}>
            No scan results yet. Hit <b>Run Scan</b> to capture odds from your books and detect edges.
          </div>
        </div>
      ) : findings.length === 0 ? (
        <div className="card">
          <div className="card-pad" style={{ textAlign: "center", padding: "48px 16px", color: "var(--fg-3)" }}>
            Scan ran, but no arbs or +EV edges cleared. Re-scan once more lines are live.
          </div>
        </div>
      ) : (
        <>
          {actNow.length > 0 && (
            <div className="card" style={{ marginBottom: 14, borderColor: "var(--profit-bd)" }}>
              <div className="card-head" style={{ background: "var(--profit-bg)" }}>
                <span style={{ color: "var(--profit)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
                  </svg>
                </span>
                <h3 style={{ color: "var(--profit)" }}>Act Now</h3>
                <span className="sub">
                  {actNow.length} high-confidence play{actNow.length === 1 ? "" : "s"} · move before lines shift
                </span>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="num">#</th>
                      <th>Type</th>
                      <th>Event</th>
                      <th>Market</th>
                      <th>Legs</th>
                      <th className="num">Edge</th>
                      <th className="num">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actNow.map((f, i) => (
                      <FindingRow key={f.id} f={f} rank={i + 1} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h3>All Findings</h3>
              <span className="sub">{findings.length} ranked best → worst</span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Type</th>
                    <th>Event</th>
                    <th>Market</th>
                    <th>Legs</th>
                    <th className="num">Edge</th>
                    <th className="num">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((f, i) => (
                    <FindingRow key={f.id} f={f} rank={i + 1} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { fmtUSD, fmtOdds } from "@paperedge/core/fmt";
import { BookCell, SportPill, StatusBadge } from "@/components/ui/design";
import { removeTrade } from "./actions";
import {
  isSettled,
  hasOpenExposure,
  isFailedVerification,
} from "@paperedge/core/status";

/** Statuses that are part of finalized history — not removable. */
const isRemovable = (status: string) =>
  !isSettled(status) && status !== "replaced_removed";

type SectionKey = "pending" | "locked" | "settled" | "notplaced" | "removed";

function sectionOf(status: string): SectionKey {
  if (status === "replaced_removed") return "removed";
  if (isSettled(status)) return "settled";
  if (isFailedVerification(status)) return "notplaced";
  // LOCKED_OPEN ∪ PENDING_SETTLEMENT — both are real paper exposure.
  if (hasOpenExposure(status)) return "locked";
  return "pending"; // pending_verification, draft, ready, verifying, unverified…
}

const SECTION_ORDER: { key: SectionKey; label: string }[] = [
  { key: "pending",   label: "Pending Review" },
  { key: "locked",    label: "Locked" },
  { key: "settled",   label: "Settled" },
  { key: "notplaced", label: "Not Placed" },
  { key: "removed",   label: "Removed" },
];

const SPORTS = [
  { id: "all", label: "All sports" },
  { id: "nba", label: "NBA" },
  { id: "nfl", label: "NFL" },
  { id: "mlb", label: "MLB" },
  { id: "nhl", label: "NHL" },
  { id: "soccer", label: "Soccer" },
  { id: "mma", label: "MMA" },
  { id: "tennis", label: "Tennis" },
];

const STATUSES: [string, string][] = [
  ["all",                        "All"],
  ["pending_verification",       "Pending"],
  ["locked_paper_trade",         "Locked"],
  ["settled_win",                "Win"],
  ["settled_loss",               "Loss"],
  ["settled_push_void",          "Push/Void"],
  ["not_placed_line_moved",      "Line Moved"],
  ["not_placed_odds_moved",      "Odds Moved"],
  ["not_placed_market_unavailable", "Market Gone"],
  ["replaced_removed",           "Removed"],
];

interface TradeRow {
  id: string;
  customTradeId: string | null;
  date: string;
  time: string;
  sport: string;
  eventName: string;
  marketType: string;
  player: string;
  bookA: string;
  sideA: string;
  oddsA: number | null;
  stakeA: number;
  bookB: string;
  sideB: string;
  oddsB: number | null;
  stakeB: number;
  expectedProfit: number;
  actualPL: number | null;
  status: string;
}

export function LockedTradesClient({ trades }: { trades: TradeRow[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("all");
  const [sportFilter, setSportFilter] = useState("all");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [showRemoved, setShowRemoved] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Local copy so a removal reflects instantly, independent of router.refresh()
  // timing. Re-syncs whenever the server sends fresh data.
  const [rows, setRows] = useState<TradeRow[]>(trades);
  useEffect(() => { setRows(trades); }, [trades]);

  const removedCount = rows.filter((t) => t.status === "replaced_removed").length;

  const filtered = rows.filter((t) => {
    // Hide soft-removed trades unless explicitly shown (or filtered to them).
    if (
      t.status === "replaced_removed" &&
      !showRemoved &&
      statusFilter !== "replaced_removed"
    )
      return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (sportFilter !== "all" && t.sport !== sportFilter) return false;
    if (search && !`${t.eventName} ${t.marketType} ${t.player}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group the filtered rows into ordered, non-empty sections.
  const sections = SECTION_ORDER
    .map((s) => ({ ...s, items: filtered.filter((t) => sectionOf(t.status) === s.key) }))
    .filter((s) => s.items.length > 0);

  async function handleRemove(t: TradeRow) {
    if (
      !confirm(
        `Remove "${t.eventName}"?\n\nIt moves to the Removed section and is excluded from P&L. This does not delete the record — toggle "Show removed" to see it.`
      )
    )
      return;
    setRemovingId(t.id);
    try {
      await removeTrade(t.id);
      // Optimistically reflect immediately, then reconcile with the server.
      setRows((prev) =>
        prev.map((r) => (r.id === t.id ? { ...r, status: "replaced_removed" } : r))
      );
      toast.success("Trade removed");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to remove trade");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Locked Trades</h1>
          <p>All paper trades — drafts, locked, settled, voided, and mistakes.</p>
        </div>
        <div className="actions">
          <a href="/api/export" download className="btn ghost">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>
            Export CSV
          </a>
          <Link href="/trades/new" className="btn primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            New trade
          </Link>
        </div>
      </div>

      <div className="card">
        {/* Filter row */}
        <div className="filter-row">
          <div className="search" style={{ minWidth: 280, flex: "0 1 360px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search event, market, player…"
              style={{ background: "transparent", border: 0, outline: 0, color: "var(--fg)", flex: 1, fontFamily: "inherit", fontSize: 12 }}
            />
          </div>

          <select
            className="select"
            style={{ width: 160 }}
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
          >
            {SPORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>

          <div className="row tight" style={{ flex: 1, flexWrap: "wrap" }}>
            {STATUSES.map(([k, label]) => (
              <button
                key={k}
                className={`chip ${statusFilter === k ? "active" : ""}`}
                onClick={() => setStatusFilter(k)}
              >
                {label}
                {k !== "all" && (
                  <span className="dim">· {rows.filter((t) => t.status === k).length}</span>
                )}
              </button>
            ))}
          </div>

          {removedCount > 0 && (
            <button
              className={`chip ${showRemoved ? "active" : ""}`}
              onClick={() => setShowRemoved((v) => !v)}
              title="Toggle visibility of soft-removed trades"
            >
              {showRemoved ? "Hide removed" : "Show removed"}
              <span className="dim">· {removedCount}</span>
            </button>
          )}

          <span className="hint dim right">{filtered.length} of {rows.length}</span>
        </div>

        {/* Table */}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Sport</th>
                <th>Event</th>
                <th>Market</th>
                <th>Book A</th>
                <th>Side A</th>
                <th className="num">Odds A</th>
                <th className="num">Stake A</th>
                <th>Book B</th>
                <th>Side B</th>
                <th className="num">Odds B</th>
                <th className="num">Stake B</th>
                <th className="num">Exp. profit</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sections.length === 0 ? (
                <tr>
                  <td colSpan={15} style={{ textAlign: "center", padding: "40px 16px", color: "var(--fg-4)" }}>
                    No trades match filters.
                  </td>
                </tr>
              ) : (
                sections.map((section) => (
                  <SectionRows
                    key={section.key}
                    label={section.label}
                    items={section.items}
                    removingId={removingId}
                    onRemove={handleRemove}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SectionRows({
  label,
  items,
  removingId,
  onRemove,
}: {
  label: string;
  items: TradeRow[];
  removingId: string | null;
  onRemove: (t: TradeRow) => void;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={15}
          style={{
            background: "var(--panel)",
            padding: "8px 14px",
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: "var(--fg-3)",
            borderTop: "1px solid var(--border)",
          }}
        >
          {label} <span className="dim">· {items.length}</span>
        </td>
      </tr>
      {items.map((t) => (
        <tr key={t.id}>
          <td className="muted num">
            {t.date}
            <div className="hint">{t.time}</div>
          </td>
          <td><SportPill sport={t.sport} /></td>
          <td>
            <b>{t.eventName}</b>
            <div className="hint">{t.customTradeId ?? t.id.slice(0, 8)}</div>
          </td>
          <td>
            {t.marketType}
            {t.player && <div className="hint">{t.player}</div>}
          </td>
          <td><BookCell name={t.bookA} /></td>
          <td>{t.sideA || "—"}</td>
          <td className="num">{t.oddsA != null ? fmtOdds(t.oddsA) : "—"}</td>
          <td className="num">{fmtUSD(t.stakeA)}</td>
          <td><BookCell name={t.bookB} /></td>
          <td>{t.sideB || "—"}</td>
          <td className="num">{t.oddsB != null ? fmtOdds(t.oddsB) : "—"}</td>
          <td className="num">{fmtUSD(t.stakeB)}</td>
          <td className="num pos">{fmtUSD(t.expectedProfit, { sign: true })}</td>
          <td><StatusBadge status={t.status} /></td>
          <td className="actions">
            <div className="row tight" style={{ gap: 6, justifyContent: "flex-end" }}>
              <Link href={`/trades/${t.id}`} className="btn ghost sm">Review →</Link>
              {isRemovable(t.status) && (
                <button
                  className="btn ghost sm"
                  style={{ color: "var(--loss)" }}
                  disabled={removingId === t.id}
                  onClick={() => onRemove(t)}
                  title="Remove from active list (soft — kept for audit)"
                >
                  {removingId === t.id ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

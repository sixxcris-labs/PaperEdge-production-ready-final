"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { ALL_STATUSES, STATUS_COLORS } from "@paperedge/core/constants";
import { isSettled } from "@paperedge/core/status";

export type TradeRow = {
  id: string;
  customTradeId: string | null;
  tradeDate: string;
  eventName: string;
  player: string | null;
  marketType: string;
  bookA: string;
  bookB: string;
  stakeA: number;
  stakeB: number;
  expectedProfitRange: string | null;
  actualPL: number | null;
  status: string;
};

interface Props {
  trades: TradeRow[];
}

function statusLabel(value: string): string {
  return ALL_STATUSES.find((s) => s.value === value)?.label ?? value.replace(/_/g, " ");
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {statusLabel(status)}
    </span>
  );
}

export function TradesTable({ trades }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bookFilter, setBookFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");
  const [playerFilter, setPlayerFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<keyof TradeRow>("tradeDate");
  const [sortAsc, setSortAsc] = useState(false);

  // Unique values for filter dropdowns
  const allBooks = useMemo(() => {
    const s = new Set<string>();
    trades.forEach((t) => { if (t.bookA !== "—") s.add(t.bookA); if (t.bookB !== "—") s.add(t.bookB); });
    return [...s].sort();
  }, [trades]);

  const allMarkets = useMemo(() => {
    const s = new Set<string>(trades.map((t) => t.marketType).filter(Boolean));
    return [...s].sort();
  }, [trades]);

  const allPlayers = useMemo(() => {
    const s = new Set<string>(trades.map((t) => t.player).filter(Boolean) as string[]);
    return [...s].sort();
  }, [trades]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return trades
      .filter((t) => {
        if (statusFilter !== "all" && t.status !== statusFilter) return false;
        if (bookFilter !== "all" && t.bookA !== bookFilter && t.bookB !== bookFilter) return false;
        if (marketFilter !== "all" && t.marketType !== marketFilter) return false;
        if (playerFilter !== "all" && t.player !== playerFilter) return false;
        if (dateFrom && t.tradeDate < dateFrom) return false;
        if (dateTo && t.tradeDate > dateTo + "T99") return false;
        if (!q) return true;
        return (
          (t.customTradeId ?? "").toLowerCase().includes(q) ||
          t.eventName.toLowerCase().includes(q) ||
          (t.player ?? "").toLowerCase().includes(q) ||
          t.marketType.toLowerCase().includes(q) ||
          t.bookA.toLowerCase().includes(q) ||
          t.bookB.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const av = a[sortKey] ?? "";
        const bv = b[sortKey] ?? "";
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sortAsc ? cmp : -cmp;
      });
  }, [trades, search, statusFilter, bookFilter, marketFilter, playerFilter, dateFrom, dateTo, sortKey, sortAsc]);

  function toggleSort(key: keyof TradeRow) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortHeader({ col, label }: { col: keyof TradeRow; label: string }) {
    const active = sortKey === col;
    return (
      <th
        className="text-left text-xs font-medium text-muted-foreground py-2 px-3 cursor-pointer select-none whitespace-nowrap"
        onClick={() => toggleSort(col)}
      >
        {label}
        {active ? (sortAsc ? " ▲" : " ▼") : ""}
      </th>
    );
  }

  function clearFilters() {
    setSearch(""); setStatusFilter("all"); setBookFilter("all");
    setMarketFilter("all"); setPlayerFilter("all"); setDateFrom(""); setDateTo("");
  }

  const hasFilters = search || statusFilter !== "all" || bookFilter !== "all" ||
    marketFilter !== "all" || playerFilter !== "all" || dateFrom || dateTo;

  return (
    <div className="space-y-3">
      {/* Search + filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <Input
          placeholder="Search ID, event, player, book, market…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-md px-2 py-2 text-sm focus:outline-none"
        >
          <option value="all">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          value={bookFilter}
          onChange={(e) => setBookFilter(e.target.value)}
          className="border rounded-md px-2 py-2 text-sm focus:outline-none"
        >
          <option value="all">All books</option>
          {allBooks.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={marketFilter}
          onChange={(e) => setMarketFilter(e.target.value)}
          className="border rounded-md px-2 py-2 text-sm focus:outline-none"
        >
          <option value="all">All markets</option>
          {allMarkets.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {allPlayers.length > 0 && (
          <select
            value={playerFilter}
            onChange={(e) => setPlayerFilter(e.target.value)}
            className="border rounded-md px-2 py-2 text-sm focus:outline-none"
          >
            <option value="all">All players</option>
            {allPlayers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>From</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="border rounded px-1 py-1.5 text-xs" />
          <span>to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="border rounded px-1 py-1.5 text-xs" />
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded border bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <SortHeader col="customTradeId" label="Trade ID" />
              <SortHeader col="tradeDate" label="Date" />
              <SortHeader col="eventName" label="Event" />
              <SortHeader col="player" label="Player" />
              <SortHeader col="marketType" label="Market" />
              <th className="text-left text-xs font-medium text-muted-foreground py-2 px-3 whitespace-nowrap">Books</th>
              <th className="text-left text-xs font-medium text-muted-foreground py-2 px-3 whitespace-nowrap">Stake</th>
              <th className="text-left text-xs font-medium text-muted-foreground py-2 px-3 whitespace-nowrap">Exp. Profit</th>
              <SortHeader col="actualPL" label="Actual P/L" />
              <SortHeader col="status" label="Status" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-muted-foreground py-10">
                  No trades found.{" "}
                  <a href="/trades/new" className="text-blue-600 hover:underline">
                    Add your first trade →
                  </a>
                </td>
              </tr>
            ) : (
              filtered.map((t) => {
                const totalStake = t.stakeA + t.stakeB;
                const settled = isSettled(t.status);
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3">
                      <Link href={`/trades/${t.id}`} className="text-blue-600 hover:underline font-mono text-xs">
                        {t.customTradeId ?? "—"}
                      </Link>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(t.tradeDate).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-3 max-w-[200px]">
                      <Link href={`/trades/${t.id}`} className="text-blue-600 hover:underline">
                        {t.eventName}
                      </Link>
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
                      {t.player ?? "—"}
                    </td>
                    <td className="py-2 px-3 text-xs whitespace-nowrap">{t.marketType}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
                      {t.bookA} / {t.bookB}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">
                      ${totalStake.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground max-w-[140px] truncate">
                      {t.expectedProfitRange ?? "—"}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">
                      {settled && t.actualPL != null ? (
                        <span className={t.actualPL >= 0 ? "text-green-700" : "text-red-600"}>
                          {t.actualPL >= 0 ? "+" : ""}${t.actualPL.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <StatusBadge status={t.status} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {filtered.length} of {trades.length} trade{trades.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

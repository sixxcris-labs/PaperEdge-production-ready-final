import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { Book, Summary, Tier } from "./types";
import { TIER_ORDER } from "./types";
import { SummaryBar } from "./components/SummaryBar";
import { FilterBar, type Filter } from "./components/FilterBar";
import { TierSection } from "./components/TierSection";
import { BookEditor } from "./components/BookEditor";
import { daysSince, STALE_DAYS } from "./utils/time";

export default function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [bs, sm] = await Promise.all([api.listBooks(), api.summary()]);
    setBooks(bs);
    setSummary(sm);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    return books.filter((b) => {
      switch (filter) {
        case "all":
          return true;
        case "verify":
        case "registered":
        case "funded":
          return b.status === filter;
        case "rollover":
          return b.rollover_cents > 0;
        case "stale":
          return (
            b.status === "funded" && daysSince(b.updated_at) > STALE_DAYS
          );
      }
    });
  }, [books, filter]);

  const grouped = useMemo(() => {
    const map: Record<Tier, Book[]> = {
      core: [], next: [], test: [], optional: [], lowprio: [], later: [], avoid: [],
    };
    for (const b of filtered) map[b.tier].push(b);
    return map;
  }, [filtered]);

  return (
    <div className="min-h-screen px-6 py-6 max-w-6xl mx-auto">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bookmap</h1>
          <p className="text-xs text-slate-400">
            Local-only sportsbook account tracker · personal use only
          </p>
        </div>
        <a
          href="/api/export"
          className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-300 hover:border-slate-500"
        >
          Export backup
        </a>
      </header>

      <SummaryBar summary={summary} />
      <FilterBar value={filter} onChange={setFilter} />

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-slate-400">No books match this filter.</div>
      ) : (
        TIER_ORDER.map((tier) => (
          <TierSection
            key={tier}
            tier={tier}
            books={grouped[tier]}
            onEdit={setEditingId}
          />
        ))
      )}

      {editingId && (
        <BookEditor
          bookId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

import type { Summary } from "../types";
import { fmtCents } from "../utils/money";

export function SummaryBar({ summary }: { summary: Summary | null }) {
  if (!summary) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <Cell label="Funded books" value={String(summary.funded_count)} />
      <Cell label="Total balance" value={fmtCents(summary.total_balance)} />
      <Cell label="Open rollover" value={fmtCents(summary.total_rollover)} />
      <Cell
        label="Books w/ rollover"
        value={String(summary.books_with_rollover)}
      />
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 px-4 py-3">
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

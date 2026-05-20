import type { Book, Status } from "../types";
import { fmtCents } from "../utils/money";
import { relativeTime, daysSince, STALE_DAYS } from "../utils/time";
import { api } from "../api";

const STATUS_STYLES: Record<Status, string> = {
  verify: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  registered: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  funded: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  paused: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  avoid: "bg-red-500/20 text-red-300 border-red-500/40",
};

export function BookCard({
  book,
  onEdit,
}: {
  book: Book;
  onEdit: (id: string) => void;
}) {
  const isStale =
    book.status === "funded" && daysSince(book.updated_at) > STALE_DAYS;

  const rolloverPct =
    book.rollover_total_cents > 0
      ? Math.max(
          0,
          Math.min(
            100,
            ((book.rollover_total_cents - book.rollover_cents) /
              book.rollover_total_cents) *
              100,
          ),
        )
      : 0;

  async function handleOpen() {
    const { url } = await api.openBook(book.id);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else alert("No URL configured for this book yet.");
  }

  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{book.name}</div>
          <div className="text-xs text-slate-400">{book.role}</div>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded border ${
            STATUS_STYLES[book.status]
          }`}
        >
          {book.status}
        </span>
      </div>

      {book.status === "funded" && (
        <div className="text-sm space-y-1">
          <div className="flex justify-between tabular-nums">
            <span className="text-slate-400">Balance</span>
            <span>{fmtCents(book.balance_cents)}</span>
          </div>
          {book.rollover_total_cents > 0 && (
            <>
              <div className="flex justify-between tabular-nums">
                <span className="text-slate-400">Rollover left</span>
                <span>
                  {fmtCents(book.rollover_cents)} /{" "}
                  {fmtCents(book.rollover_total_cents)}
                </span>
              </div>
              <div className="h-1.5 rounded bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${rolloverPct}%` }}
                />
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-1">
        <div className="text-xs text-slate-500">
          {relativeTime(book.updated_at)}
          {isStale && (
            <span className="ml-2 text-amber-400">⚠ stale</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleOpen}
            disabled={!book.url}
            className="px-2 py-1 text-xs rounded border border-slate-700 hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Open
          </button>
          <button
            onClick={() => onEdit(book.id)}
            className="px-2 py-1 text-xs rounded bg-slate-100 text-slate-900 hover:bg-white"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

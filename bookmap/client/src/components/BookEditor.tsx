import { useEffect, useState } from "react";
import type { Book, LogEntry } from "../types";
import { api } from "../api";
import { fmtCents, parseDollarsToCents } from "../utils/money";
import { relativeTime } from "../utils/time";

type Editable = Pick<
  Book,
  | "status"
  | "eligible_in_state"
  | "balance_cents"
  | "rollover_cents"
  | "rollover_total_cents"
  | "bonus_type"
  | "bonus_amount_cents"
  | "min_deposit_cents"
  | "withdrawal_rule"
  | "verification_done"
  | "first_withdrawal_at"
  | "notes"
>;

export function BookEditor({
  bookId,
  onClose,
  onSaved,
}: {
  bookId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [book, setBook] = useState<(Book & { log: LogEntry[] }) | null>(null);
  const [draft, setDraft] = useState<Editable | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getBook(bookId).then((b) => {
      setBook(b);
      setDraft({
        status: b.status,
        eligible_in_state: b.eligible_in_state,
        balance_cents: b.balance_cents,
        rollover_cents: b.rollover_cents,
        rollover_total_cents: b.rollover_total_cents,
        bonus_type: b.bonus_type,
        bonus_amount_cents: b.bonus_amount_cents,
        min_deposit_cents: b.min_deposit_cents,
        withdrawal_rule: b.withdrawal_rule,
        verification_done: b.verification_done,
        first_withdrawal_at: b.first_withdrawal_at,
        notes: b.notes,
      });
    });
  }, [bookId]);

  if (!book || !draft) {
    return (
      <Backdrop onClose={onClose}>
        <div className="p-6 text-slate-400">Loading…</div>
      </Backdrop>
    );
  }

  function set<K extends keyof Editable>(key: K, value: Editable[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function save() {
    setSaving(true);
    try {
      await api.updateState(bookId, draft as Partial<Book>);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900">
          <div>
            <h2 className="text-lg font-semibold">{book.name}</h2>
            <div className="text-xs text-slate-400">{book.role}</div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100"
          >
            ✕
          </button>
        </header>

        <div className="px-5 py-4 grid grid-cols-2 gap-3">
          <Select
            label="Status"
            value={draft.status}
            onChange={(v) => set("status", v as Editable["status"])}
            options={["verify", "registered", "funded", "paused", "avoid"]}
          />
          <Select
            label="Eligible in state"
            value={draft.eligible_in_state ?? "unknown"}
            onChange={(v) => set("eligible_in_state", v as Editable["eligible_in_state"])}
            options={["unknown", "yes", "no"]}
          />

          <Money
            label="Balance"
            cents={draft.balance_cents}
            onChange={(c) => set("balance_cents", c)}
          />
          <Money
            label="Min deposit"
            cents={draft.min_deposit_cents}
            onChange={(c) => set("min_deposit_cents", c)}
          />

          <Money
            label="Rollover remaining"
            cents={draft.rollover_cents}
            onChange={(c) => set("rollover_cents", c)}
          />
          <Money
            label="Rollover original"
            cents={draft.rollover_total_cents}
            onChange={(c) => set("rollover_total_cents", c)}
          />

          <Select
            label="Bonus type"
            value={draft.bonus_type ?? "none"}
            onChange={(v) => set("bonus_type", v as Editable["bonus_type"])}
            options={["none", "cash", "promo", "deposit_match", "reload", "signup"]}
          />
          <Money
            label="Bonus amount"
            cents={draft.bonus_amount_cents}
            onChange={(c) => set("bonus_amount_cents", c)}
          />

          <label className="col-span-2 text-sm">
            <div className="text-slate-400 text-xs uppercase mb-1">Withdrawal rule</div>
            <input
              type="text"
              value={draft.withdrawal_rule ?? ""}
              onChange={(e) => set("withdrawal_rule", e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5"
            />
          </label>

          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.verification_done === 1}
              onChange={(e) =>
                set("verification_done", e.target.checked ? 1 : 0)
              }
            />
            <span>ID verified</span>
          </label>

          <label className="text-sm">
            <div className="text-slate-400 text-xs uppercase mb-1">First withdrawal eligible</div>
            <input
              type="date"
              value={draft.first_withdrawal_at?.slice(0, 10) ?? ""}
              onChange={(e) =>
                set("first_withdrawal_at", e.target.value || null)
              }
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5"
            />
          </label>

          <label className="col-span-2 text-sm">
            <div className="text-slate-400 text-xs uppercase mb-1">Notes</div>
            <textarea
              value={draft.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5"
            />
          </label>
        </div>

        <footer className="px-5 py-3 border-t border-slate-800 flex justify-end gap-2 sticky bottom-0 bg-slate-900">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-slate-700 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>

        <div className="px-5 pb-5">
          <h3 className="text-xs uppercase text-slate-400 mb-2">
            Recent changes
          </h3>
          {book.log.length === 0 ? (
            <div className="text-sm text-slate-500">No changes yet.</div>
          ) : (
            <ul className="text-xs text-slate-300 space-y-1">
              {book.log.map((entry) => (
                <li key={entry.id} className="font-mono">
                  <span className="text-slate-500">
                    {relativeTime(entry.changed_at)}
                  </span>{" "}
                  <span className="text-slate-400">{entry.field}</span>
                  {entry.field !== "visit" && (
                    <>
                      :{" "}
                      <span className="text-slate-500">
                        {fmtMaybe(entry.field, entry.old_value)}
                      </span>{" "}
                      →{" "}
                      <span>
                        {fmtMaybe(entry.field, entry.new_value)}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Backdrop>
  );
}

function fmtMaybe(field: string, v: string | null): string {
  if (v === null || v === "") return "∅";
  if (field.endsWith("_cents")) {
    const n = Number(v);
    if (!Number.isNaN(n)) return fmtCents(n);
  }
  return v;
}

function Backdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="text-sm">
      <div className="text-slate-400 text-xs uppercase mb-1">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Money({
  label,
  cents,
  onChange,
}: {
  label: string;
  cents: number;
  onChange: (cents: number) => void;
}) {
  const [text, setText] = useState((cents / 100).toString());
  useEffect(() => {
    setText((cents / 100).toString());
  }, [cents]);
  return (
    <label className="text-sm">
      <div className="text-slate-400 text-xs uppercase mb-1">{label}</div>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(parseDollarsToCents(text))}
        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 tabular-nums"
      />
    </label>
  );
}

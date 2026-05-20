"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ACTIVE_BOOKS, BOOK_ROLES } from "@paperedge/core/constants";
import { fmtUSD } from "@paperedge/core/fmt";
import { bookInfo } from "@/components/ui/design";
import { createBook, updateBook, deleteBook } from "../actions";

interface Book {
  id: string;
  name: string;
  role: string;
  currentBalance: number;
  rolloverRemaining: number;
  maxBetLimit: number | null;
  kycCompleted: boolean;
  notes: string | null;
  available: boolean;
}

interface Props {
  books: Book[];
}

const EMPTY_FORM = {
  name: "",
  role: "unknown",
  currentBalance: "",
  rolloverRemaining: "",
  maxBetLimit: "",
  kycCompleted: false,
  notes: "",
};

export function BooksManageClient({ books: initialBooks }: Props) {
  const [books, setBooks] = useState(initialBooks);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [pending, setPending] = useState(false);
  const [activeTemplateName, setActiveTemplateName] = useState("");
  const activeBookNames = new Set(books.map((book) => book.name.trim().toLowerCase()));

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setActiveTemplateName("");
    setShowForm(true);
  }

  function openEdit(book: Book) {
    setEditing(book);
    setActiveTemplateName("");
    setForm({
      name: book.name,
      role: book.role,
      currentBalance: String(book.currentBalance),
      rolloverRemaining: String(book.rolloverRemaining),
      maxBetLimit: book.maxBetLimit != null ? String(book.maxBetLimit) : "",
      kycCompleted: book.kycCompleted,
      notes: book.notes ?? "",
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setActiveTemplateName("");
  }

  const duplicateName =
    books.some(
      (book) =>
        book.id !== editing?.id &&
        book.name.trim().toLowerCase() === form.name.trim().toLowerCase()
    );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (duplicateName) {
      toast.error("That active book already exists");
      return;
    }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("name", form.name);
      fd.set("role", form.role);
      fd.set("currentBalance", form.currentBalance || "0");
      fd.set("rolloverRemaining", form.rolloverRemaining || "0");
      if (form.maxBetLimit) fd.set("maxBetLimit", form.maxBetLimit);
      fd.set("kycCompleted", form.kycCompleted ? "true" : "false");
      fd.set("notes", form.notes);

      if (editing) {
        await updateBook(editing.id, fd);
        toast.success("Book updated");
      } else {
        await createBook(fd);
        toast.success("Book added");
      }
      // Refresh list from server — simplest approach: reload page
      window.location.reload();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
      setPending(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteBook(id);
      setBooks((prev) => prev.filter((b) => b.id !== id));
      toast.success("Book deleted");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete book");
    }
  }

  const roleLabel = (role: string) => BOOK_ROLES.find((r) => r.value === role)?.label ?? role;

  return (
    <>
      {/* Book grid */}
      <div className="grid cols-3" style={{ gap: 14, marginBottom: 14 }}>
        {books.map((book) => {
          const info = bookInfo(book.name);
          return (
            <div key={book.id} className="card">
              <div className="card-head">
                <span className={`book-av ${info.cls}`} style={{ width: 28, height: 28, fontSize: 12 }}>
                  {info.initials}
                </span>
                <div>
                  <h3 style={{ marginBottom: 0 }}>{book.name}</h3>
                  <span className="sub">{roleLabel(book.role)}</span>
                </div>
                <div className="right" style={{ display: "flex", gap: 6 }}>
                  <Link
                    href={`/books/${book.id}/deep-links`}
                    className="btn ghost"
                    style={{ padding: "4px 10px", fontSize: 12 }}
                    title="Configure the page that opens in this book during verification"
                  >
                    Links
                  </Link>
                  <button className="btn ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => openEdit(book)}>
                    Edit
                  </button>
                  <button
                    className="btn ghost"
                    style={{ padding: "4px 10px", fontSize: 12, color: "var(--loss)" }}
                    onClick={() => handleDelete(book.id, book.name)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="card-pad">
                <dl className="kv">
                  <dt>Balance</dt><dd className="num">{fmtUSD(book.currentBalance)}</dd>
                  {book.rolloverRemaining > 0 && (
                    <><dt>Rollover rem.</dt><dd className="num warn">{fmtUSD(book.rolloverRemaining)}</dd></>
                  )}
                  {book.maxBetLimit != null && (
                    <><dt>Max bet</dt><dd className="num">{fmtUSD(book.maxBetLimit)}</dd></>
                  )}
                  <dt>KYC</dt>
                  <dd className={book.kycCompleted ? "pos" : "neg"}>
                    {book.kycCompleted ? "Completed" : "Pending"}
                  </dd>
                </dl>
                {book.role === "unknown" && (
                  <div className="hint" style={{ color: "var(--warn)", marginTop: 8 }}>
                    ⚠ Classify this book before using in a trade
                  </div>
                )}
                {book.notes && (
                  <div className="hint" style={{ marginTop: 8, fontStyle: "italic" }}>{book.notes}</div>
                )}
              </div>
            </div>
          );
        })}

        {/* Add new card */}
        <button
          className="card"
          onClick={openCreate}
          style={{
            border: "1.5px dashed var(--border)",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 120,
            color: "var(--fg-3)",
            gap: 8,
            flexDirection: "column",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <span style={{ fontSize: 13 }}>Add book</span>
        </button>
      </div>

      {/* Modal overlay */}
      {showForm && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}
        >
          <div className="card" style={{ width: "min(520px, 96vw)", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="card-head">
              <h3>{editing ? "Edit Book" : "Add Book"}</h3>
              <button className="icon-btn" onClick={closeForm} style={{ marginLeft: "auto" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 6l12 12M18 6 6 18"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="card-pad stack">
              <div className="field">
                <label className="label">Choose from active default books</label>
                <select
                  className="select"
                  value={activeTemplateName}
                  onChange={(e) => {
                    const template = ACTIVE_BOOKS.find((book) => book.name === e.target.value);
                    setActiveTemplateName(e.target.value);
                    if (!template) return;
                    setForm((prev) => ({ ...prev, name: template.name, role: template.role }));
                  }}
                >
                  <option value="">Pick an active default book…</option>
                  {ACTIVE_BOOKS.map((book) => (
                    <option
                      key={book.name}
                      value={book.name}
                      disabled={activeBookNames.has(book.name.trim().toLowerCase())}
                    >
                      {book.name} — {BOOK_ROLES.find((r) => r.value === book.role)?.label ?? book.role}
                      {activeBookNames.has(book.name.trim().toLowerCase()) ? " (already added)" : ""}
                    </option>
                  ))}
                </select>
                <span className="hint">Manual entry stays available below for custom books.</span>
              </div>

              <div className="field">
                <label className="label">Book name *</label>
                <input
                  className="input"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. DraftKings"
                />
              </div>

              <div className="field">
                <label className="label">Role *</label>
                <select
                  className="select"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  {BOOK_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label} — {r.description}</option>
                  ))}
                </select>
              </div>

              {duplicateName && (
                <div className="hint" style={{ color: "var(--warn)" }}>
                  This book name already exists in your active list.
                </div>
              )}

              <div className="grid cols-2" style={{ gap: 12 }}>
                <div className="field">
                  <label className="label">Current balance ($)</label>
                  <input
                    className="input num"
                    type="number"
                    step="0.01"
                    value={form.currentBalance}
                    onChange={(e) => setForm({ ...form, currentBalance: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="field">
                  <label className="label">Rollover remaining ($)</label>
                  <input
                    className="input num"
                    type="number"
                    step="0.01"
                    value={form.rolloverRemaining}
                    onChange={(e) => setForm({ ...form, rolloverRemaining: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="field">
                  <label className="label">Max bet limit ($)</label>
                  <input
                    className="input num"
                    type="number"
                    step="0.01"
                    value={form.maxBetLimit}
                    onChange={(e) => setForm({ ...form, maxBetLimit: e.target.value })}
                    placeholder="Leave blank if unknown"
                  />
                </div>
                <div className="field" style={{ justifyContent: "flex-end" }}>
                  <label className="label">KYC completed</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={form.kycCompleted}
                      onChange={(e) => setForm({ ...form, kycCompleted: e.target.checked })}
                    />
                    <span style={{ fontSize: 13 }}>KYC is done</span>
                  </label>
                </div>
              </div>

              <div className="field">
                <label className="label">Notes</label>
                <textarea
                  className="textarea"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any notes about this book…"
                />
              </div>

              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="btn ghost" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn primary" disabled={pending || duplicateName}>
                  {pending ? "Saving…" : editing ? "Update Book" : "Add Book"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

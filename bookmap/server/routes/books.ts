import { Router, Request, Response } from "express";
import { db } from "../db";

export const booksRouter = Router();

const MUTABLE_FIELDS = [
  "status",
  "eligible_in_state",
  "balance_cents",
  "rollover_cents",
  "rollover_total_cents",
  "bonus_type",
  "bonus_amount_cents",
  "min_deposit_cents",
  "withdrawal_rule",
  "verification_done",
  "first_withdrawal_at",
  "notes",
] as const;

type MutableField = (typeof MUTABLE_FIELDS)[number];

booksRouter.get("/", (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT b.*, s.status, s.eligible_in_state, s.balance_cents, s.rollover_cents,
              s.rollover_total_cents, s.bonus_type, s.bonus_amount_cents,
              s.min_deposit_cents, s.withdrawal_rule, s.verification_done,
              s.first_withdrawal_at, s.notes, s.updated_at
       FROM books b
       LEFT JOIN book_state s ON s.book_id = b.id
       ORDER BY b.tier, b.name`,
    )
    .all();
  res.json(rows);
});

booksRouter.get("/:id", (req: Request, res: Response) => {
  const book = db
    .prepare(
      `SELECT b.*, s.status, s.eligible_in_state, s.balance_cents, s.rollover_cents,
              s.rollover_total_cents, s.bonus_type, s.bonus_amount_cents,
              s.min_deposit_cents, s.withdrawal_rule, s.verification_done,
              s.first_withdrawal_at, s.notes, s.updated_at
       FROM books b
       LEFT JOIN book_state s ON s.book_id = b.id
       WHERE b.id = ?`,
    )
    .get(req.params.id);

  if (!book) return res.status(404).json({ error: "not_found" });

  const log = db
    .prepare(
      `SELECT * FROM state_log WHERE book_id = ? ORDER BY changed_at DESC LIMIT 10`,
    )
    .all(req.params.id);

  res.json({ ...book, log });
});

booksRouter.patch("/:id/state", (req: Request, res: Response) => {
  const id = req.params.id;
  const current = db
    .prepare(`SELECT * FROM book_state WHERE book_id = ?`)
    .get(id) as Record<string, unknown> | undefined;

  if (!current) return res.status(404).json({ error: "not_found" });

  const updates: { field: MutableField; value: unknown }[] = [];
  for (const f of MUTABLE_FIELDS) {
    if (f in req.body && req.body[f] !== current[f]) {
      updates.push({ field: f, value: req.body[f] });
    }
  }

  if (updates.length === 0) return res.json({ updated: 0 });

  const now = new Date().toISOString();
  const insertLog = db.prepare(
    `INSERT INTO state_log (book_id, field, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    for (const u of updates) {
      const stmt = db.prepare(
        `UPDATE book_state SET ${u.field} = ?, updated_at = ? WHERE book_id = ?`,
      );
      stmt.run(u.value as never, now, id);
      insertLog.run(id, u.field, String(current[u.field] ?? ""), String(u.value ?? ""), now);
    }
  });
  tx();

  res.json({ updated: updates.length });
});

booksRouter.get("/:id/log", (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const rows = db
    .prepare(
      `SELECT * FROM state_log WHERE book_id = ? ORDER BY changed_at DESC LIMIT ?`,
    )
    .all(req.params.id, limit);
  res.json(rows);
});

booksRouter.post("/:id/open", (req: Request, res: Response) => {
  const book = db
    .prepare(`SELECT id, url FROM books WHERE id = ?`)
    .get(req.params.id) as { id: string; url: string | null } | undefined;

  if (!book) return res.status(404).json({ error: "not_found" });

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO state_log (book_id, field, old_value, new_value, changed_at) VALUES (?, 'visit', NULL, NULL, ?)`,
  ).run(book.id, now);

  res.json({ url: book.url ?? "" });
});

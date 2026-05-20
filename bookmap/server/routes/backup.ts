import { Router, Request, Response } from "express";
import { db } from "../db";

export const backupRouter = Router();

backupRouter.get("/export", (_req: Request, res: Response) => {
  const books = db.prepare("SELECT * FROM books").all();
  const book_state = db.prepare("SELECT * FROM book_state").all();
  const state_log = db.prepare("SELECT * FROM state_log").all();
  const user_prefs = db.prepare("SELECT * FROM user_prefs").all();

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="bookmap-backup-${new Date().toISOString().slice(0, 10)}.json"`,
  );
  res.json({
    version: 1,
    exported_at: new Date().toISOString(),
    books,
    book_state,
    state_log,
    user_prefs,
  });
});

backupRouter.post("/import", (req: Request, res: Response) => {
  const payload = req.body;
  if (!payload || payload.version !== 1) {
    return res.status(400).json({ error: "invalid_payload" });
  }

  const tx = db.transaction(() => {
    db.exec("DELETE FROM state_log; DELETE FROM book_state; DELETE FROM user_prefs;");

    const insBook = db.prepare(
      `INSERT OR REPLACE INTO books (id, name, url, tier, role, category, created_at)
       VALUES (@id, @name, @url, @tier, @role, @category, @created_at)`,
    );
    for (const b of payload.books ?? []) insBook.run(b);

    const insState = db.prepare(
      `INSERT INTO book_state (book_id, status, eligible_in_state, balance_cents, rollover_cents,
        rollover_total_cents, bonus_type, bonus_amount_cents, min_deposit_cents, withdrawal_rule,
        verification_done, first_withdrawal_at, notes, updated_at)
       VALUES (@book_id, @status, @eligible_in_state, @balance_cents, @rollover_cents,
        @rollover_total_cents, @bonus_type, @bonus_amount_cents, @min_deposit_cents, @withdrawal_rule,
        @verification_done, @first_withdrawal_at, @notes, @updated_at)`,
    );
    for (const s of payload.book_state ?? []) insState.run(s);

    const insLog = db.prepare(
      `INSERT INTO state_log (id, book_id, field, old_value, new_value, changed_at)
       VALUES (@id, @book_id, @field, @old_value, @new_value, @changed_at)`,
    );
    for (const l of payload.state_log ?? []) insLog.run(l);

    const insPref = db.prepare(
      `INSERT INTO user_prefs (key, value) VALUES (@key, @value)`,
    );
    for (const p of payload.user_prefs ?? []) insPref.run(p);
  });

  try {
    tx();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "import_failed", message: String(err) });
  }
});

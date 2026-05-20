import { Router, Request, Response } from "express";
import { db } from "../db";

export const summaryRouter = Router();

summaryRouter.get("/", (_req: Request, res: Response) => {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'funded' THEN 1 ELSE 0 END) AS funded_count,
         COALESCE(SUM(balance_cents), 0) AS total_balance,
         COALESCE(SUM(rollover_cents), 0) AS total_rollover,
         SUM(CASE WHEN rollover_cents > 0 THEN 1 ELSE 0 END) AS books_with_rollover
       FROM book_state`,
    )
    .get() as Record<string, number>;

  res.json({
    funded_count: row.funded_count ?? 0,
    total_balance: row.total_balance ?? 0,
    total_rollover: row.total_rollover ?? 0,
    books_with_rollover: row.books_with_rollover ?? 0,
  });
});

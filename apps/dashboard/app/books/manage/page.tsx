import { db } from "@paperedge/database";
import Link from "next/link";
import { BooksManageClient } from "./BooksManageClient";

const LOCAL_USER_EMAIL = "local@paperedge.app";
export const dynamic = "force-dynamic";

export default async function BooksManagePage() {
  const user = await db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });
  const books = await db.book.findMany({
    where: { userId: user.id, available: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Manage Books</h1>
          <p>Add, edit, or remove sportsbooks from your paper trading account.</p>
        </div>
        <div className="actions">
          <Link href="/books" className="btn ghost">View performance →</Link>
          <Link href="/settings" className="btn ghost">Settings →</Link>
        </div>
      </div>

      <BooksManageClient books={books} />
    </div>
  );
}

import { db } from "@paperedge/database";
import { TradeForm } from "./TradeForm";

const LOCAL_USER_EMAIL = "local@paperedge.app";
export const dynamic = "force-dynamic";

export default async function NewTradePage() {
  const user = await db.user.findUniqueOrThrow({
    where: { email: LOCAL_USER_EMAIL },
  });
  const books = await db.book.findMany({
    where: { userId: user.id, available: true },
    orderBy: { name: "asc" },
  });

  return <TradeForm books={books} />;
}

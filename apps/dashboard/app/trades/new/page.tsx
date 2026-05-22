import { db } from "@paperedge/database";
import { TradeForm } from "./TradeForm";
import { getDashboardLocalUser } from "@/apps/dashboard/lib/local-user";
export const dynamic = "force-dynamic";

export default async function NewTradePage() {
  const user = await getDashboardLocalUser();
  const books = await db.book.findMany({
    where: { userId: user.id, available: true },
    orderBy: { name: "asc" },
  });

  return <TradeForm books={books} />;
}

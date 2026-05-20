import { notFound } from "next/navigation";
import { db } from "@paperedge/database";
import { TradeDetailClient } from "./TradeDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function TradeDetailPage({ params }: Props) {
  const { id } = await params;

  const trade = await db.paperTrade.findUnique({
    where: { id },
    include: {
      legs: { include: { book: true } },
      checklist: true,
      result: true,
      mistakes: { include: { mistakeTag: true } },
      overrides: true,
    },
  });

  if (!trade) notFound();

  const mistageTags = await db.mistakeTag.findMany({ orderBy: { name: "asc" } });

  return <TradeDetailClient trade={trade} mistageTags={mistageTags} />;
}

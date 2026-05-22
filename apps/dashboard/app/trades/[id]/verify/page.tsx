import { notFound } from "next/navigation";
import { db } from "@paperedge/database";
import { getLocalUser } from "@/lib/opportunity-service";
import { VerifyClient } from "./VerifyClient";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: Props) {
  const { id } = await params;

  const user = await getLocalUser();
  const trade = await db.paperTrade.findFirst({
    where: { id, userId: user.id },
    include: { legs: { include: { book: true } } },
  });

  if (!trade) notFound();

  return <VerifyClient trade={trade} />;
}

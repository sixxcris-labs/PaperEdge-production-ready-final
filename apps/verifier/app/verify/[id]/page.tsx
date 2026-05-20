import { notFound } from "next/navigation";
import { db } from "@paperedge/database";
import { OpportunityVerifyClient } from "@/components/OpportunityVerifyClient";

interface Props { params: Promise<{ id: string }> }

export const dynamic = "force-dynamic";

export default async function VerifyOpportunityPage({ params }: Props) {
  const { id } = await params;
  const opportunity = await db.tradeOpportunity.findUnique({
    where: { id },
    include: { bookA: true, bookB: true, lockedTrade: true },
  });
  if (!opportunity) notFound();
  return <OpportunityVerifyClient opportunity={opportunity} />;
}

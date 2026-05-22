import { notFound } from "next/navigation";
import { db } from "@paperedge/database";
import { getLocalUser } from "@/lib/opportunity-service";
import { OpportunityVerifyClient } from "@/components/OpportunityVerifyClient";

interface Props { params: Promise<{ id: string }> }

export const dynamic = "force-dynamic";

export default async function VerifyOpportunityPage({ params }: Props) {
  const { id } = await params;
  const user = await getLocalUser();
  const [opportunity, settings] = await Promise.all([
    db.tradeOpportunity.findFirst({
      where: { id, userId: user.id },
      include: { bookA: true, bookB: true, lockedTrade: true },
    }),
    db.userSettings.findUnique({ where: { userId: user.id } }),
  ]);
  if (!opportunity) notFound();
  return <OpportunityVerifyClient opportunity={opportunity} settings={settings} />;
}

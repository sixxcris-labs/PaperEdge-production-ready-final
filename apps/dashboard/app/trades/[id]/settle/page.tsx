import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@paperedge/database";
import { STATUS, isSettled } from "@paperedge/core/status";
import { SettleClient } from "./SettleClient";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

const isLocked = (status: string) => isSettled(status) || status === STATUS.cancelled;

export default async function SettlePage({ params }: Props) {
  const { id } = await params;

  const trade = await db.paperTrade.findUnique({
    where: { id },
    include: {
      legs: { include: { book: true } },
      result: true,
    },
  });

  if (!trade) notFound();
  if (isLocked(trade.status)) redirect(`/trades/${id}`);

  const mistageTags = await db.mistakeTag.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="page">
      <div className="page-head">
        <div className="row" style={{ gap: 10 }}>
          <Link href={`/trades/${id}`} className="btn ghost">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M11 18l-6-6 6-6"/>
            </svg>
            Back
          </Link>
          <div>
            <h1>Settle Trade</h1>
            <p>{trade.eventName} · {new Date(trade.tradeDate).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      <SettleClient trade={trade} mistageTags={mistageTags} />
    </div>
  );
}

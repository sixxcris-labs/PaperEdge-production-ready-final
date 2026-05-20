import { NextResponse } from "next/server";
import { db } from "@paperedge/database";
import { lockOpportunityAsPaperTrade, LockOpportunityError } from "@/lib/lock-opportunity";
import { getLocalUser } from "@/lib/opportunity-service";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface Props {
  params: Promise<{ id: string }>;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request, { params }: Props) {
  try {
    const { id } = await params;
    const body = await req.json();
    const user = await getLocalUser();

    const existing = await db.tradeOpportunity.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404, headers: corsHeaders });
    }

    await db.tradeOpportunity.update({
      where: { id },
      data: {
        sameEventConfirmed: Boolean(body.sameEventConfirmed),
        sameMarketConfirmed: Boolean(body.sameMarketConfirmed),
        samePlayerOrTeamConfirmed: Boolean(body.samePlayerOrTeamConfirmed),
        samePeriodConfirmed: Boolean(body.samePeriodConfirmed),
        sameLineConfirmed: Boolean(body.sameLineConfirmed),
        oppositeSidesConfirmed: Boolean(body.oppositeSidesConfirmed),
        oddsAcceptedConfirmed: Boolean(body.oddsAcceptedConfirmed),
        stakeAcceptedConfirmed: Boolean(body.stakeAcceptedConfirmed),
        liquidityEnoughConfirmed: Boolean(body.liquidityEnoughConfirmed),
        recalculatedConfirmed: Boolean(body.recalculatedConfirmed),
        userFinalConfirm: Boolean(body.userFinalConfirm),
        verifiedOddsA: finiteOrUndefined(body.verifiedOddsA),
        verifiedOddsB: finiteOrUndefined(body.verifiedOddsB),
        verifiedLineA: finiteOrUndefined(body.verifiedLineA),
        verifiedLineB: finiteOrUndefined(body.verifiedLineB),
        stakeA: finiteOrUndefined(body.stakeA),
        stakeB: finiteOrUndefined(body.stakeB),
        verifiedLiquidityA: finiteOrUndefined(body.verifiedLiquidityA),
        verifiedLiquidityB: finiteOrUndefined(body.verifiedLiquidityB),
        bookANotes: cleanStringOrUndefined(body.bookANotes),
        bookBNotes: cleanStringOrUndefined(body.bookBNotes),
        status: "ready_to_lock",
      },
    });

    const result = await lockOpportunityAsPaperTrade(db, id, user.id);
    return NextResponse.json({ ok: true, ...result }, { headers: corsHeaders });
  } catch (error) {
    const status = error instanceof LockOpportunityError ? 409 : 400;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to lock opportunity",
        code: error instanceof LockOpportunityError ? error.code : "LOCK_FAILED",
      },
      { status, headers: corsHeaders },
    );
  }
}

function finiteOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function cleanStringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 1000) : undefined;
}

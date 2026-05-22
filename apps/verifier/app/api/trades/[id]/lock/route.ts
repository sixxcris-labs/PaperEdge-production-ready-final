import { NextResponse } from "next/server";
import { db } from "@paperedge/database";
import { evaluateVerificationGates } from "@paperedge/core/verification-gates";
import {
  dollarsFromCentsOrNumberOrNull,
  toCentsOrUndefined,
} from "@paperedge/core/money-fields";
import { lockOpportunityAsPaperTrade, LockOpportunityError } from "@/lib/lock-opportunity";
import { getLocalUser } from "@/lib/opportunity-service";
import { localExtensionCorsHeaders, rejectDisallowedOrigin } from "@/apps/verifier/lib/cors";

const ALLOWED_METHODS = "POST, OPTIONS";

interface Props {
  params: Promise<{ id: string }>;
}

export async function OPTIONS(req: Request) {
  const blocked = rejectDisallowedOrigin(req, ALLOWED_METHODS);
  if (blocked) return blocked;
  return new Response(null, {
    status: 204,
    headers: localExtensionCorsHeaders(req, ALLOWED_METHODS),
  });
}

export async function POST(req: Request, { params }: Props) {
  const blocked = rejectDisallowedOrigin(req, ALLOWED_METHODS);
  if (blocked) return blocked;

  const headers = localExtensionCorsHeaders(req, ALLOWED_METHODS);

  try {
    const { id } = await params;
    const body = await req.json();
    const user = await getLocalUser();

    const opportunity = await db.tradeOpportunity.findFirst({
      where: { id, userId: user.id },
      include: { bookA: true, bookB: true },
    });
    if (!opportunity) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404, headers });
    }

    const settings = await db.userSettings.findUnique({ where: { userId: user.id } });
    const stakeA = finiteOrUndefined(body.stakeA);
    const stakeB = finiteOrUndefined(body.stakeB);
    const verifiedLiquidityA = finiteOrUndefined(body.verifiedLiquidityA);
    const verifiedLiquidityB = finiteOrUndefined(body.verifiedLiquidityB);
    const tradeType = String(opportunity.tradeType ?? "").trim().toLowerCase();
    const verificationInput = {
      goal: tradeType.includes("middle") ? "middle" : "profit",
      tradeType: opportunity.tradeType,
      bonusType:
        tradeType.includes("promo") || tradeType.includes("bonus")
          ? "promo free play"
          : "cash",
      calculatorUsed: tradeType.includes("middle")
        ? "middle"
        : tradeType.includes("promo") || tradeType.includes("bonus")
          ? "promo_converter"
          : "arbitrage",
      bankroll: settings
        ? dollarsFromCentsOrNumberOrNull(
            settings.currentBankrollCents,
            settings.currentBankroll,
          ) ?? 1000
        : 1000,
      maxStakePct: settings?.maxStakePct ?? 5,
      oddsVerifiedAt: opportunity.verifiedAt ?? null,
      oddsFreshnessSeconds: (settings?.oddsFreshnessMinutes ?? 5) * 60,
      rolloverAmount: null,
      rolloverMultiple: null,
      rolloverUnknownOrNA: true,
      oppositeSideConfirmed: Boolean(body.oppositeSidesConfirmed),
      legA: {
        bookId: opportunity.bookAId ?? null,
        bookName: opportunity.bookA?.name ?? null,
        event: opportunity.event ?? null,
        market: opportunity.market ?? null,
        period: opportunity.period ?? null,
        side: opportunity.sideA ?? null,
        oddsAmerican:
          finiteOrUndefined(body.verifiedOddsA) ?? opportunity.verifiedOddsA ?? opportunity.oddsA ?? null,
        stake:
          stakeA ??
          dollarsFromCentsOrNumberOrNull(
            opportunity.stakeACents,
            opportunity.stakeA,
          ) ??
          null,
        line:
          finiteOrUndefined(body.verifiedLineA) ?? opportunity.verifiedLineA ?? opportunity.lineA ?? null,
      },
      legB: {
        bookId: opportunity.bookBId ?? null,
        bookName: opportunity.bookB?.name ?? null,
        event: opportunity.event ?? null,
        market: opportunity.market ?? null,
        period: opportunity.period ?? null,
        side: opportunity.sideB ?? null,
        oddsAmerican:
          finiteOrUndefined(body.verifiedOddsB) ?? opportunity.verifiedOddsB ?? opportunity.oddsB ?? null,
        stake:
          stakeB ??
          dollarsFromCentsOrNumberOrNull(
            opportunity.stakeBCents,
            opportunity.stakeB,
          ) ??
          null,
        line:
          finiteOrUndefined(body.verifiedLineB) ?? opportunity.verifiedLineB ?? opportunity.lineB ?? null,
      },
    };
    const verificationFailures = evaluateVerificationGates(verificationInput, new Date())
      .filter((gate) => gate.status !== "pass")
      .map((gate) => `${gate.label}: ${gate.message}`);
    if (verificationFailures.length > 0) {
      throw new LockOpportunityError(verificationFailures.join(" · "), "VERIFICATION_GATES");
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
        stakeA,
        stakeACents: toCentsOrUndefined(stakeA),
        stakeB,
        stakeBCents: toCentsOrUndefined(stakeB),
        verifiedLiquidityA,
        verifiedLiquidityACents: toCentsOrUndefined(verifiedLiquidityA),
        verifiedLiquidityB,
        verifiedLiquidityBCents: toCentsOrUndefined(verifiedLiquidityB),
        bookANotes: cleanStringOrUndefined(body.bookANotes),
        bookBNotes: cleanStringOrUndefined(body.bookBNotes),
        status: "ready_to_lock",
      },
    });

    const result = await lockOpportunityAsPaperTrade(db, id, user.id);
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch (error) {
    const status = error instanceof LockOpportunityError ? 409 : 400;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to lock opportunity",
        code: error instanceof LockOpportunityError ? error.code : "LOCK_FAILED",
      },
      { status, headers },
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

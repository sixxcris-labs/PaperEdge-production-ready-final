import type { PrismaClient } from "@paperedge/database";
import { db } from "@paperedge/database";
import { cashPayout, lowHold, middleHedge } from "@paperedge/core/calc";
import { parseOpportunityText } from "@paperedge/core/opportunity-parser";

export const LOCAL_USER_EMAIL = "local@paperedge.app";
const MAX_IMPORT_CHARS = 50_000;

export type VerificationLegStatus =
  | "verified"
  | "odds_moved"
  | "line_moved"
  | "market_unavailable"
  | "player_not_listed"
  | "book_unavailable";

export interface VerifyLegPayload {
  legId?: string;
  leg?: string;
  status: VerificationLegStatus;
  observedOdds?: number | string | null;
  observedLine?: number | string | null;
  observedLiquidity?: number | string | null;
  notes?: string | null;
}

export async function getLocalUser(client: PrismaClient = db) {
  return client.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });
}

export async function createOpportunityFromRaw(raw: string, client: PrismaClient = db) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("Import text is required");
  }
  if (raw.length > MAX_IMPORT_CHARS) {
    throw new Error(`Import text is too large; max ${MAX_IMPORT_CHARS.toLocaleString()} characters`);
  }

  const user = await getLocalUser(client);
  const parsed = parseOpportunityText(raw);
  const bookA = await findOrCreateBook(parsed.bookAName, user.id, client);
  const bookB = await findOrCreateBook(parsed.bookBName, user.id, client);
  const economics = computeOpportunityEconomics({
    tradeType: parsed.tradeType,
    oddsA: parsed.oddsA,
    oddsB: parsed.oddsB,
    stakeA: parsed.stakeA,
    stakeB: parsed.stakeB,
    lineA: parsed.lineA,
    lineB: parsed.lineB,
  });

  return client.tradeOpportunity.create({
    data: {
      userId: user.id,
      status: "queued_for_verification",
      source: parsed.source,
      rawEntryText: raw,
      importedAt: new Date(),
      tradeType: parsed.tradeType,
      event: parsed.event,
      startTime: parsed.startTime,
      sport: parsed.sport,
      league: parsed.league,
      market: parsed.market,
      playerOrTeam: parsed.playerOrTeam,
      period: parsed.period,
      bookAId: bookA?.id,
      sideA: parsed.sideA,
      oddsA: parsed.oddsA,
      lineA: parsed.lineA,
      stakeA: parsed.stakeA,
      liquidityA: parsed.liquidityA,
      bookBId: bookB?.id,
      sideB: parsed.sideB,
      oddsB: parsed.oddsB,
      lineB: parsed.lineB,
      stakeB: parsed.stakeB,
      liquidityB: parsed.liquidityB,
      totalExposure: economics.totalExposure,
      profitIfAWins: economics.profitIfA,
      profitIfBWins: economics.profitIfB,
      expectedProfitMin: parsed.expectedProfitMin ?? economics.expectedProfitMin,
      expectedProfitMax: parsed.expectedProfitMax ?? economics.expectedProfitMax,
      middleDistance: economics.middleDistance,
      middleNumber: economics.middleNumber,
      middleRange: economics.middleRange,
      outsideLoss: economics.outsideLoss,
      middleProfit: economics.middleProfit,
      notes: parsed.notes,
    },
    include: { bookA: true, bookB: true },
  });
}

export async function startOpportunityVerification(opportunityId: string, client: PrismaClient = db) {
  const user = await getLocalUser(client);
  const opportunity = await client.tradeOpportunity.findFirst({
    where: { id: opportunityId, userId: user.id },
  });
  if (!opportunity) throw new Error("Opportunity not found");
  if (opportunity.status === "locked" || opportunity.status === "skipped" || opportunity.status.startsWith("failed_")) {
    throw new Error(`Opportunity is already terminal: ${opportunity.status}`);
  }

  const nextStatus = opportunity.bookAVerified ? "verifying_book_b" : "verifying_book_a";
  await client.userSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id, activeVerificationTradeId: opportunity.id },
    update: { activeVerificationTradeId: opportunity.id },
  });

  return client.tradeOpportunity.update({
    where: { id: opportunity.id },
    data: { status: nextStatus },
    include: { bookA: true, bookB: true },
  });
}

export async function getActiveVerificationOpportunity(client: PrismaClient = db) {
  const user = await getLocalUser(client);
  const settings = await client.userSettings.findUnique({ where: { userId: user.id } });
  const id = settings?.activeVerificationTradeId;
  if (!id) return null;

  const opportunity = await client.tradeOpportunity.findFirst({
    where: { id, userId: user.id },
    include: { bookA: true, bookB: true },
  });

  if (!opportunity || opportunity.status === "locked" || opportunity.status === "skipped" || opportunity.status.startsWith("failed_")) {
    await client.userSettings.update({ where: { userId: user.id }, data: { activeVerificationTradeId: null } });
    return null;
  }

  return opportunityToExtensionTrade(opportunity);
}

export async function applyOpportunityLegVerification(
  opportunityId: string,
  payload: VerifyLegPayload,
  client: PrismaClient = db,
) {
  const user = await getLocalUser(client);
  const opportunity = await client.tradeOpportunity.findFirst({
    where: { id: opportunityId, userId: user.id },
    include: { bookA: true, bookB: true },
  });
  if (!opportunity) throw new Error("Opportunity not found");

  const leg = normalizeLeg(payload.leg ?? payload.legId);
  const status = payload.status;
  if (!isVerificationStatus(status)) throw new Error("Invalid verification status");

  const now = new Date();
  const observedOdds = finiteNumber(payload.observedOdds);
  const observedLine = finiteNumber(payload.observedLine);
  const observedLiquidity = finiteNumber(payload.observedLiquidity);
  const notes = typeof payload.notes === "string" ? payload.notes.slice(0, 1000) : undefined;

  const isFailure = ["market_unavailable", "player_not_listed", "book_unavailable"].includes(status);
  const data: Record<string, unknown> = {
    verifiedAt: now,
    status: statusForLegResult(leg, status, opportunity),
  };

  if (leg === "A") {
    data.bookAVerified = !isFailure;
    if (observedOdds != null) data.verifiedOddsA = Math.round(observedOdds);
    if (observedLine != null) data.verifiedLineA = observedLine;
    if (observedLiquidity != null) data.verifiedLiquidityA = observedLiquidity;
    if (notes != null) data.bookANotes = notes;
  } else {
    data.bookBVerified = !isFailure;
    if (observedOdds != null) data.verifiedOddsB = Math.round(observedOdds);
    if (observedLine != null) data.verifiedLineB = observedLine;
    if (observedLiquidity != null) data.verifiedLiquidityB = observedLiquidity;
    if (notes != null) data.bookBNotes = notes;
  }

  if (isFailure) {
    data.failedAt = now;
    data.failureReason = status;
  }

  return client.tradeOpportunity.update({
    where: { id: opportunity.id },
    data: data as never,
    include: { bookA: true, bookB: true },
  });
}

export function opportunityToExtensionTrade(opportunity: any) {
  return {
    id: opportunity.id,
    opportunityId: opportunity.id,
    status: opportunity.status,
    eventName: opportunity.event,
    sport: opportunity.sport,
    marketType: opportunity.market,
    gamePeriod: opportunity.period,
    player: opportunity.playerOrTeam,
    legs: [
      {
        id: "A",
        legLabel: "A",
        bookId: opportunity.bookAId,
        book: opportunity.bookA,
        side: opportunity.sideA,
        oddsAmerican: opportunity.verifiedOddsA ?? opportunity.oddsA,
        lineValue: opportunity.verifiedLineA ?? opportunity.lineA,
        stake: opportunity.stakeA,
        verificationStatus: opportunity.bookAVerified ? "verified" : "unverified",
      },
      {
        id: "B",
        legLabel: "B",
        bookId: opportunity.bookBId,
        book: opportunity.bookB,
        side: opportunity.sideB,
        oddsAmerican: opportunity.verifiedOddsB ?? opportunity.oddsB,
        lineValue: opportunity.verifiedLineB ?? opportunity.lineB,
        stake: opportunity.stakeB,
        verificationStatus: opportunity.bookBVerified ? "verified" : "unverified",
      },
    ].filter((leg) => leg.bookId || leg.side || leg.oddsAmerican != null),
  };
}

async function findOrCreateBook(name: string | undefined, userId: string, client: PrismaClient) {
  const normalized = name?.trim();
  if (!normalized) return null;
  const existing = await client.book.findFirst({
    where: { userId, name: { equals: normalized } },
  });
  if (existing) return existing;
  return client.book.create({
    data: {
      userId,
      name: normalized,
      role: "unknown",
      available: false,
      notes: "Auto-created from verifier import. Classify role and availability before locking real workflows.",
    },
  });
}

function computeOpportunityEconomics(input: {
  tradeType: string;
  oddsA?: number;
  oddsB?: number;
  stakeA?: number;
  stakeB?: number;
  lineA?: number;
  lineB?: number;
}) {
  const { oddsA, oddsB, stakeA, stakeB } = input;
  if (oddsA == null || oddsB == null || stakeA == null || stakeB == null || stakeA <= 0 || stakeB <= 0) {
    return {} as {
      totalExposure?: number;
      profitIfA?: number;
      profitIfB?: number;
      expectedProfitMin?: number;
      expectedProfitMax?: number;
      middleDistance?: number;
      middleNumber?: number;
      middleRange?: string;
      outsideLoss?: number;
      middleProfit?: number;
    };
  }

  if (input.tradeType === "middle" && input.lineA != null && input.lineB != null) {
    const lower = Math.min(input.lineA, input.lineB);
    const upper = Math.max(input.lineA, input.lineB);
    const result = middleHedge(stakeA, oddsA, lower, stakeB, oddsB, upper);
    return {
      totalExposure: result.totalStake,
      profitIfA: result.plOutsideHigh,
      profitIfB: result.plOutsideLow,
      expectedProfitMin: result.outsideLoss,
      expectedProfitMax: result.middleProfit,
      middleDistance: result.middleDistance,
      middleNumber: result.middleNumber,
      middleRange: `${result.middleRange[0]}-${result.middleRange[1]}`,
      outsideLoss: result.outsideLoss,
      middleProfit: result.middleProfit,
    };
  }

  const a = cashPayout(stakeA, oddsA);
  const b = cashPayout(stakeB, oddsB);
  const totalExposure = stakeA + stakeB;
  const profitIfA = a.totalReturn - totalExposure;
  const profitIfB = b.totalReturn - totalExposure;
  if (input.tradeType === "low_hold" || input.tradeType === "rollover_clearing") {
    const low = lowHold(stakeA, oddsA, stakeB, oddsB);
    return {
      totalExposure,
      profitIfA: low.profitIfA,
      profitIfB: low.profitIfB,
      expectedProfitMin: Math.min(low.profitIfA, low.profitIfB),
      expectedProfitMax: Math.max(low.profitIfA, low.profitIfB),
      outsideLoss: low.worstCaseLoss,
    };
  }
  return {
    totalExposure,
    profitIfA,
    profitIfB,
    expectedProfitMin: Math.min(profitIfA, profitIfB),
    expectedProfitMax: Math.max(profitIfA, profitIfB),
  };
}

function normalizeLeg(value: string | undefined): "A" | "B" {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "A" || normalized === "BOOK_A" || normalized === "LEGA" || normalized === "LEG_A") return "A";
  if (normalized === "B" || normalized === "BOOK_B" || normalized === "LEGB" || normalized === "LEG_B") return "B";
  throw new Error("Leg must be A or B");
}

function isVerificationStatus(status: string): status is VerificationLegStatus {
  return [
    "verified",
    "odds_moved",
    "line_moved",
    "market_unavailable",
    "player_not_listed",
    "book_unavailable",
  ].includes(status);
}

function statusForLegResult(leg: "A" | "B", status: VerificationLegStatus, opportunity: { bookAVerified: boolean; bookBVerified: boolean }) {
  if (status === "market_unavailable") return "failed_market_unavailable";
  if (status === "player_not_listed") return "failed_player_not_listed";
  if (status === "book_unavailable") return "failed_book_unavailable";

  const aVerified = leg === "A" ? true : opportunity.bookAVerified;
  const bVerified = leg === "B" ? true : opportunity.bookBVerified;
  if (aVerified && bVerified) return "books_verified";
  return leg === "A" ? "book_a_verified" : "book_b_verified";
}

function finiteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

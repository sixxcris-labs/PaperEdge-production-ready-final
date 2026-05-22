export type GateStatus = "pass" | "fail" | "unknown";

export type VerificationGateId =
  | "same_event"
  | "same_market"
  | "same_period"
  | "same_line"
  | "opposite_sides"
  | "odds_verified_live"
  | "correct_calculator"
  | "stake_within_bankroll"
  | "rollover_understood"
  | "trackable";

export type CalculatorId = "arbitrage" | "promo_converter" | "middle";

export interface GateResult {
  id: VerificationGateId;
  label: string;
  status: GateStatus;
  message: string;
}

export interface VerificationLegInput {
  bookId?: string | null;
  bookName?: string | null;
  event?: string | null;
  market?: string | null;
  period?: string | null;
  side?: string | null;
  oddsAmerican?: number | null;
  stake?: number | null;
  line?: number | null;
}

export interface VerificationTradeInput {
  goal?: string | null;
  tradeType?: string | null;
  bonusType?: string | null;
  calculatorUsed?: string | null;
  bankroll?: number | null;
  maxStakePct?: number | null;
  oddsVerifiedAt?: Date | string | number | null;
  oddsFreshnessSeconds?: number | null;
  rolloverAmount?: number | null;
  rolloverMultiple?: number | null;
  rolloverUnknownOrNA?: boolean | null;
  oppositeSideConfirmed?: boolean | null;
  legA: VerificationLegInput;
  legB: VerificationLegInput;
}

export interface ManualLockChecklistInput {
  bookAVerified: boolean;
  bookBVerified: boolean;
  sameEventConfirmed: boolean;
  sameMarketConfirmed: boolean;
  samePlayerOrTeamConfirmed: boolean;
  requiresSamePlayerOrTeam: boolean;
  samePeriodConfirmed: boolean;
  sameLineConfirmed: boolean;
  isMiddleTrade: boolean;
  oppositeSidesConfirmed: boolean;
  oddsAcceptedConfirmed: boolean;
  stakeAcceptedConfirmed: boolean;
  liquidityEnoughConfirmed: boolean;
  recalculatedConfirmed: boolean;
  userFinalConfirm: boolean;
}

const GATE_LABELS: Record<VerificationGateId, string> = {
  same_event: "Same event",
  same_market: "Same market",
  same_period: "Same period",
  same_line: "Same line",
  opposite_sides: "Opposite sides",
  odds_verified_live: "Odds verified live",
  correct_calculator: "Correct calculator",
  stake_within_bankroll: "Stake within bankroll",
  rollover_understood: "Rollover understood",
  trackable: "Trackable",
};

const GATE_ORDER: VerificationGateId[] = [
  "same_event",
  "same_market",
  "same_period",
  "same_line",
  "opposite_sides",
  "odds_verified_live",
  "correct_calculator",
  "stake_within_bankroll",
  "rollover_understood",
  "trackable",
];

function result(id: VerificationGateId, status: GateStatus, message: string): GateResult {
  return {
    id,
    label: GATE_LABELS[id],
    status,
    message,
  };
}

function clean(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function hasText(value: unknown): boolean {
  return clean(value).length > 0;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positive(value: unknown): value is number {
  return finite(value) && value > 0;
}

function normalizeSide(value: unknown): string {
  return clean(value).replace(/[^a-z0-9]/g, "");
}

function expectedCalculatorFor(input: VerificationTradeInput): CalculatorId {
  const goal = clean(input.goal);
  const tradeType = clean(input.tradeType);
  const bonusType = clean(input.bonusType);

  const promoLike =
    bonusType.includes("promo") ||
    bonusType.includes("free") ||
    bonusType.includes("bonus bet") ||
    bonusType.includes("bonus_bet");

  if (promoLike) return "promo_converter";

  if (goal.includes("middle") || tradeType.includes("middle")) {
    return "middle";
  }

  return "arbitrage";
}

function marketFamily(value: unknown): "spread" | "total" | "moneyline" | "other" {
  const market = clean(value);

  if (
    market.includes("spread") ||
    market.includes("run line") ||
    market.includes("puck line")
  ) {
    return "spread";
  }

  if (
    market.includes("total") ||
    market.includes("over under") ||
    market.includes("over/under")
  ) {
    return "total";
  }

  if (market.includes("moneyline") || market === "ml") {
    return "moneyline";
  }

  return "other";
}

function sameEvent(input: VerificationTradeInput): GateResult {
  const a = clean(input.legA.event);
  const b = clean(input.legB.event);

  if (!a || !b) {
    return result("same_event", "unknown", "Enter the event on both legs.");
  }

  if (a !== b) {
    return result("same_event", "fail", "Both legs must be the exact same event.");
  }

  return result("same_event", "pass", "Both legs use the same event.");
}

function sameMarket(input: VerificationTradeInput): GateResult {
  const a = clean(input.legA.market);
  const b = clean(input.legB.market);

  if (!a || !b) {
    return result("same_market", "unknown", "Enter the market on both legs.");
  }

  if (a !== b) {
    return result("same_market", "fail", "Both legs must use the same market.");
  }

  return result("same_market", "pass", "Both legs use the same market.");
}

function samePeriod(input: VerificationTradeInput): GateResult {
  const a = clean(input.legA.period);
  const b = clean(input.legB.period);

  if (!a || !b) {
    return result("same_period", "unknown", "Enter the period on both legs.");
  }

  if (a !== b) {
    return result("same_period", "fail", "Both legs must use the same period.");
  }

  return result("same_period", "pass", "Both legs use the same period.");
}

function sameLine(input: VerificationTradeInput): GateResult {
  const family = marketFamily(input.legA.market || input.legB.market);

  if (family === "moneyline" || family === "other") {
    return result("same_line", "pass", "No line match is required for this market type.");
  }

  const lineA = input.legA.line;
  const lineB = input.legB.line;

  if (!finite(lineA) || !finite(lineB)) {
    return result("same_line", "unknown", "Enter the line on both legs.");
  }

  if (family === "spread") {
    if (lineA !== -lineB) {
      return result(
        "same_line",
        "fail",
        "Spread legs must use opposite-signed matching lines, such as -2.5 and +2.5.",
      );
    }

    return result("same_line", "pass", "Spread lines are opposite-signed matches.");
  }

  if (lineA !== lineB) {
    return result(
      "same_line",
      "fail",
      "Total legs must use the same numeric line, such as Over 8.5 and Under 8.5.",
    );
  }

  return result("same_line", "pass", "Total lines match.");
}

function oppositeSides(input: VerificationTradeInput): GateResult {
  if (input.oppositeSideConfirmed) {
    return result("opposite_sides", "pass", "Opposite sides were explicitly confirmed.");
  }

  const a = normalizeSide(input.legA.side);
  const b = normalizeSide(input.legB.side);

  if (!a || !b) {
    return result("opposite_sides", "unknown", "Select or enter both sides.");
  }

  const pairs = new Set([
    "over|under",
    "under|over",
    "yes|no",
    "no|yes",
    "home|away",
    "away|home",
    "teama|teamb",
    "teamb|teama",
    "optiona|optionb",
    "optionb|optiona",
    "favorite|underdog",
    "underdog|favorite",
  ]);

  if (pairs.has(`${a}|${b}`)) {
    return result("opposite_sides", "pass", "The sides are recognized opposites.");
  }

  return result("opposite_sides", "unknown", "Confirm the two sides are true opposite outcomes.");
}

function oddsVerifiedLive(input: VerificationTradeInput, now: Date): GateResult {
  if (input.oddsVerifiedAt == null) {
    return result(
      "odds_verified_live",
      "unknown",
      "Click Re-verify after checking both odds live.",
    );
  }

  const verifiedAt = new Date(input.oddsVerifiedAt).getTime();

  if (!Number.isFinite(verifiedAt)) {
    return result("odds_verified_live", "unknown", "Odds verification time is invalid.");
  }

  const freshnessSeconds = input.oddsFreshnessSeconds ?? 30;
  const ageSeconds = (now.getTime() - verifiedAt) / 1000;

  if (ageSeconds < 0) {
    return result("odds_verified_live", "unknown", "Odds verification time is in the future.");
  }

  if (ageSeconds > freshnessSeconds) {
    return result(
      "odds_verified_live",
      "fail",
      `Odds are stale. Re-verify within ${freshnessSeconds} seconds.`,
    );
  }

  return result("odds_verified_live", "pass", "Odds were verified recently.");
}

function correctCalculator(input: VerificationTradeInput): GateResult {
  const used = clean(input.calculatorUsed);

  if (!used) {
    return result("correct_calculator", "unknown", "Calculator has not been selected or derived.");
  }

  const expected = expectedCalculatorFor(input);

  if (used !== expected) {
    return result(
      "correct_calculator",
      "fail",
      `Use ${expected} for this goal and bonus type, not ${used}.`,
    );
  }

  return result("correct_calculator", "pass", `Calculator matches: ${expected}.`);
}

function stakeWithinBankroll(input: VerificationTradeInput): GateResult {
  const stakeA = input.legA.stake;
  const stakeB = input.legB.stake;

  if (!positive(stakeA) || !positive(stakeB)) {
    return result("stake_within_bankroll", "unknown", "Enter positive stakes for both legs.");
  }

  if (!positive(input.bankroll)) {
    return result("stake_within_bankroll", "unknown", "Enter bankroll to check exposure.");
  }

  const maxPct = input.maxStakePct ?? 5;
  const maxExposure = input.bankroll * (maxPct / 100);
  const totalStake = stakeA + stakeB;

  if (totalStake > maxExposure) {
    return result(
      "stake_within_bankroll",
      "fail",
      `Total stake ${totalStake.toFixed(2)} exceeds ${maxPct}% bankroll exposure.`,
    );
  }

  return result("stake_within_bankroll", "pass", "Total stake is within bankroll exposure limit.");
}

function rolloverUnderstood(input: VerificationTradeInput): GateResult {
  if (input.rolloverUnknownOrNA) {
    return result("rollover_understood", "pass", "Rollover is marked unknown or not applicable.");
  }

  const amountSet = finite(input.rolloverAmount) && input.rolloverAmount >= 0;
  const multipleSet = finite(input.rolloverMultiple) && input.rolloverMultiple >= 0;

  if (!amountSet || !multipleSet) {
    return result(
      "rollover_understood",
      "unknown",
      "Enter rollover amount and multiple, or mark rollover unknown / N/A.",
    );
  }

  return result("rollover_understood", "pass", "Rollover inputs are present.");
}

function trackable(input: VerificationTradeInput): GateResult {
  const missing: string[] = [];

  if (!hasText(input.legA.bookId) && !hasText(input.legA.bookName)) missing.push("Book A");
  if (!hasText(input.legB.bookId) && !hasText(input.legB.bookName)) missing.push("Book B");
  if (!hasText(input.legA.event)) missing.push("event");
  if (!hasText(input.legA.market)) missing.push("market");
  if (!hasText(input.legA.period)) missing.push("period");
  if (!hasText(input.legA.side)) missing.push("side A");
  if (!hasText(input.legB.side)) missing.push("side B");
  if (!finite(input.legA.oddsAmerican)) missing.push("odds A");
  if (!finite(input.legB.oddsAmerican)) missing.push("odds B");
  if (!positive(input.legA.stake)) missing.push("stake A");
  if (!positive(input.legB.stake)) missing.push("stake B");

  if (missing.length > 0) {
    return result(
      "trackable",
      "fail",
      `Missing required tracking fields: ${missing.join(", ")}.`,
    );
  }

  return result("trackable", "pass", "Trade has enough data to track.");
}

export function evaluateVerificationGate(
  id: VerificationGateId,
  input: VerificationTradeInput,
  now = new Date(),
): GateResult {
  switch (id) {
    case "same_event":
      return sameEvent(input);
    case "same_market":
      return sameMarket(input);
    case "same_period":
      return samePeriod(input);
    case "same_line":
      return sameLine(input);
    case "opposite_sides":
      return oppositeSides(input);
    case "odds_verified_live":
      return oddsVerifiedLive(input, now);
    case "correct_calculator":
      return correctCalculator(input);
    case "stake_within_bankroll":
      return stakeWithinBankroll(input);
    case "rollover_understood":
      return rolloverUnderstood(input);
    case "trackable":
      return trackable(input);
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
}

export function evaluateVerificationGates(
  input: VerificationTradeInput,
  now = new Date(),
): GateResult[] {
  return GATE_ORDER.map((id) => evaluateVerificationGate(id, input, now));
}

export function allVerificationGatesPass(
  input: VerificationTradeInput,
  now = new Date(),
): boolean {
  return evaluateVerificationGates(input, now).every((gate) => gate.status === "pass");
}

export function evaluateManualLockChecklistFailures(
  input: ManualLockChecklistInput,
): string[] {
  return [
    input.bookAVerified ? null : "Book A not verified",
    input.bookBVerified ? null : "Book B not verified",
    input.sameEventConfirmed ? null : "Same event not confirmed",
    input.sameMarketConfirmed ? null : "Same market not confirmed",
    input.requiresSamePlayerOrTeam && !input.samePlayerOrTeamConfirmed
      ? "Same player/team not confirmed"
      : null,
    input.samePeriodConfirmed ? null : "Same period not confirmed",
    input.sameLineConfirmed
      ? null
      : input.isMiddleTrade
        ? "Middle gap not confirmed"
        : "Same line not confirmed",
    input.oppositeSidesConfirmed ? null : "Opposite sides not confirmed",
    input.oddsAcceptedConfirmed ? null : "Live odds not accepted",
    input.stakeAcceptedConfirmed ? null : "Stake not accepted",
    input.liquidityEnoughConfirmed ? null : "Liquidity not confirmed",
    input.recalculatedConfirmed ? null : "Stakes not recalculated",
    input.userFinalConfirm ? null : "Final manual confirmation required",
  ].filter((message): message is string => Boolean(message));
}

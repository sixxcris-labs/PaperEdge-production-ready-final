REPO_AUDIT_AND_NEXT_STEPS.md
Repository Audit and Next Steps
Executive Summary

PaperEdge has a strong product thesis: a local-first, manual-verification cockpit for sports betting paper trading and execution review. The repository already shows meaningful progress toward that direction: a monorepo split, shared core/database packages, dashboard and verifier apps, Prisma-backed local persistence, a manual Chrome extension, and tests that enforce some workspace boundaries.

The biggest risk is not that the app lacks features. The biggest risk is that the product surface can drift away from the stated core: verify one trade cleanly, log it, settle it, learn from the leak. The repository still contains dashboard/journal/verifier/support surfaces that can be useful, but they need to be subordinate to the Trade Cockpit, Settlement Mirror, and Edge Pulse.

The highest-priority work is:

Lock the product around the verification-first flow.
Harden all money/math paths.
Implement the 10 verification gates as tested pure functions.
Tighten local API and extension safety boundaries.
Clean generated/stale artifacts and standardize quality gates.
Improve database modeling for money and domain states.

This audit is based on static review of the packed repository. I could not run builds/tests in this environment because the execution/file-writing tools failed, so every runtime finding should be verified locally with the testing instructions at the end.

Repository Overview
Product

PaperEdge is a local/manual decision-support app for sports betting paper trading. The repo documentation defines it as a verification-first trade cockpit, not a dashboard-first betting tracker.

The intended product loop is:

Import or enter a trade.
Verify the market, sides, odds, calculator, stake, bankroll exposure, and rollover assumptions.
Log the trade only when the verification gates pass.
Settle the trade.
Compare expected vs actual outcome.
Record leaks/mistakes automatically.
Show the user one clear weekly edge/leak diagnosis.
Main repository areas
Area	Purpose	Audit notes
apps/dashboard	Main Next app for trades, settlement, dashboard views	Useful, but must not remain dashboard-first if build plan is current.
apps/verifier	Next app for opportunity verification and deep links	Strong separation concept; API needs local-only hardening.
packages/core	Shared calculators, status, checklist, import, analytics logic	Correct place for money-risking logic. Needs stricter input validation and verification gate coverage.
packages/database	Prisma/SQLite ownership and generated client	Good ownership move. Money stored as floats is a major correctness risk.
components	Shared UI components	Good reuse, but ensure app-specific logic does not leak into shared UI.
lib	Root helpers and workspace tests	Should stay small. Structural tests enforce this.
extensions/paperedge-verifier	Manual Chrome overlay for verification	Good manual-only boundary; host permissions and CORS should stay tight.
docs	Build plan and handoff docs	Strong product direction, but docs need a source-of-truth index.
optional-new-improvements	Future security/E2E notes	Some items should be promoted from optional to required before serious use.
bookmap	Separate local-only sportsbook account tracker	Useful domain tool, but may duplicate PaperEdge book-map scope. Needs integration or isolation decision.
Stack observed
Next.js app router
React
TypeScript
Prisma 7 with SQLite and better-sqlite3
Zod
Vitest
TanStack Table
Local Chrome extension
Monorepo workspaces: apps/*, packages/*
Audit Findings
Priority Legend
Priority	Meaning
P0	Work before adding features. Could affect correctness, safety, or product direction.
P1	Work soon. Important for maintainability, security, or dev velocity.
P2	Work after P0/P1. Useful but not blocking the core loop.
P3	Later polish or expansion.
Findings Table
ID	Priority	Area	Finding	Impact	Effort	Recommendation
F-01	P0	Product architecture	Build plan says / should be the Trade Cockpit and old dashboard-first surfaces should be cut, but the repo still has dashboard/trades/verifier/support surfaces.	High	Medium	Pick the current source of truth. Make Cockpit the primary route and demote dashboard/journal to support views.
F-02	P0	Math correctness	Database schema appears to store balances/stakes/profit as Float.	High	High	Migrate all money to integer cents or Decimal. Integer cents is safest with SQLite.
F-03	P0	Verification	The 10 verification gates are core product logic, but they should exist as explicit pure functions with boundary tests.	High	Medium	Add packages/core/src/verification-gates.ts and tests.
F-04	P0	Core verify logic	recalculateOnObserved accepts arbitrary string calculator IDs, raw odds/stakes, and silently returns null for unsupported states.	High	Low	Harden input validation and add verify.test.ts.
F-05	P0	API security	apps/verifier/app/api/deep-link/route.ts uses wildcard CORS and accepts unvalidated query params.	High	Low	Restrict origins to local app/extension, validate params with Zod, reject unsafe URL schemes.
F-06	P1	Generated artifacts	Repomix includes generated Prisma client files under lib/generated/prisma, despite migration tests expecting database ownership in packages/database.	Medium	Low	Remove generated/stale artifacts from source control if not intentional. Update .gitignore and generation docs.
F-07	P1	Tests	Workspace tests are useful but mostly structural. Money-risking logic needs behavioral tests.	High	Medium	Add tests for calculators, verify recalc, 10 gates, settlement leak inference, and edge pulse aggregation.
F-08	P1	Dev experience	App package scripts only include dev, build, start; root quality gates are not obvious from snippets.	Medium	Low	Add a docs/QUALITY_GATES.md and root scripts for test, build, quality.
F-09	P1	Settlement	Settlement server action has promising locking checks, but settlement should be transactional across result, bankroll, snapshots, and mistake tags.	High	Medium	Verify and enforce a single Prisma transaction for settlement. Add double-settlement tests.
F-10	P1	Local identity	LOCAL_USER_EMAIL = "local@paperedge.app" is hard-coded in server code.	Medium	Low	Fine for local-only MVP, but isolate behind a getLocalUser() helper and document local-only assumptions.
F-11	P1	Extension safety	Manual extension boundary is good, but broad host patterns plus wildcard API CORS could become risky.	Medium	Low	Keep extension manual-only. Require explicit active opportunity. Keep API local-only.
F-12	P1	Domain modeling	Roles/statuses/bonus types appear to be strings rather than closed enums.	Medium	Medium	Add TypeScript domain constants and Zod schemas now; consider Prisma enums later.
F-13	P2	Bookmap	bookmap overlaps with PaperEdge Book Map and bankroll inventory.	Medium	Medium	Decide whether to fold Bookmap into PaperEdge or keep it explicitly separate.
F-14	P2	Money parsing	bookmap/client/src/utils/money.ts silently maps invalid money input to 0 and formats without cents.	Medium	Low	Add strict parse helper and cents-aware formatter.
F-15	P2	Typo / DX	mistageTags typo appears in trade detail page.	Low	Low	Rename to mistakeTags consistently.
F-16	P2	Docs	Multiple plans/addenda exist; optional security and E2E notes may be more important than “optional.”	Medium	Low	Add docs index and promote minimum E2E/security checklist into required quality gates.
F-17	P3	Performance	No obvious frontend performance emergency, but generated files, duplicated surfaces, and broad imports can slow dev/build.	Low	Medium	Remove stale generated output, avoid barrel imports in hot paths, keep shared packages focused.
Highest-Risk Issues Explained
1. Money stored as floats

Any app that compares expected profit, actual profit, stake, rollover, and bankroll should not use binary floating-point as its canonical database format.

Why it matters

Float rounding errors can create false leak calculations, incorrect bankroll snapshots, and confusing penny mismatches.

What to do

Use integer cents in persisted records:

stakeCents: number;
expectedProfitCents: number;
actualProfitCents: number;
rolloverRemainingCents: number;

Use display helpers only at the UI edge.

Migration strategy
Add new *Cents fields beside existing float fields.
Backfill with Math.round(oldFloat * 100).
Update core calculations to return cents or convert immediately at boundaries.
Update UI to display cents.
Remove old float fields after data validation.
2. Verification gates must be first-class product logic

The build plan says the 10 gates decide whether a trade can be logged. That is the product. These gates should not be scattered across components or mixed with UI state.

What to do

Add a pure gate module:

Input: plain trade object.
Output: ordered gate results.
No database.
No React.
No side effects.
Tests for every pass/fail/unknown boundary.

A full implementation is included below.

3. Deep-link route needs local-only hardening

The verifier deep-link route currently behaves like a simple utility endpoint, but it is exposed through HTTP and returns URLs. Since it supports sportsbook deep links, it should be conservative:

Validate all query params.
Restrict origins.
Prevent dangerous resolved URL schemes.
Return text/plain.
Disable caching.
Keep it local/manual-only.

A replacement route is included below.

4. The repo needs a single “current direction” document

The docs are useful, but there are multiple build plans, handoffs, optional improvements, and embedded historical context. For contributors and AI coding agents, this creates drift.

What to do

Create:

docs/README.md
docs/QUALITY_GATES.md
docs/SECURITY_AND_SAFETY_BOUNDARIES.md

Make docs/PAPEREDGE_BUILD_PLAN.md the product source of truth, or explicitly supersede it.

Priority Roadmap
P0 — Do this before more feature work
1. Align the app around the Trade Cockpit

Goal: The first screen should help the user verify one trade, not browse a dashboard.

Work items:

Make / route to Cockpit or a redirect to the active verifier/cockpit route.
Keep /trades, /books, /import, /queue, /mistakes, and dashboard metrics as support views.
Remove or hide dashboard-first hero cards that do not help the immediate verify/log/settle loop.
Ensure every trading path asks:
What is the goal?
Which book are we trying to win into?
Which book are we trying to lose out of?
Is this promo/free play, cash, cash bonus, low hold, or middle?
Are odds live?
2. Add pure verification gates and tests

Use the complete verification-gates.ts and test file below.

3. Harden observed-odds recalculation

Replace packages/core/src/verify.ts and add verify.test.ts.

4. Harden /api/deep-link

Replace apps/verifier/app/api/deep-link/route.ts.

5. Stop using floats for new money code

Do not start a huge migration before shipping the gates, but stop adding new float-backed money paths.

P1 — Do next
1. Add quality gates
Root npm run test.
Root npm run build.
Root npm run quality.
Dashboard build.
Verifier build.
Database generation/seed docs.
Extension manual QA checklist.
2. Clean generated artifacts
Remove stale lib/generated/prisma if the active generated client belongs under packages/database.
Confirm .gitignore excludes:
.next
node_modules
generated Prisma output if generated at install/build time
local SQLite dev databases
coverage
build output
3. Settlement transaction audit

Settlement should be atomic:

Create/update Result.
Update PaperTrade.status.
Write TradeMistake.
Update bankroll/settings.
Create BankrollSnapshot.
Revalidate paths.

Add tests for:

Already settled trade cannot be settled again.
Cancelled trade cannot be settled.
Bankroll changes exactly once.
Mistake tags are attached only when requested.
Failed transaction does not partially update bankroll.
4. Rename typo

Rename mistageTags to mistakeTags.

P2 — Do after core loop is solid
1. Decide Bookmap’s future

Choose one:

Fold Bookmap into PaperEdge’s /books.
Keep Bookmap as an experimental sidecar.
Delete/archive it.

Do not let two book-map systems become competing sources of truth.

2. Promote minimum E2E tests

The optional E2E test plan should become a minimum smoke suite:

Seed local data.
Import opportunity.
Verify both legs manually.
Lock opportunity.
Confirm it appears in dashboard/trades.
Settle trade.
Confirm bankroll/edge metrics update.
3. Add docs index

Create a short docs index that says:

Start here.
Current source of truth.
Deprecated docs.
Optional docs.
Safety rules.
Files to Add or Modify
1. Replace packages/core/src/verify.ts
import {
  cashArbHedge,
  promoHedge,
  middleHedge,
  type CashArbResult,
  type PromoHedgeResult,
  type MiddleResult,
} from "./calc";

export const SUPPORTED_CALCULATORS = [
  "arbitrage",
  "promo_converter",
  "middle",
] as const;

export type SupportedCalculator = (typeof SUPPORTED_CALCULATORS)[number];

export type VerifyRecalcResult =
  | { type: "arbitrage"; result: CashArbResult }
  | { type: "promo"; result: PromoHedgeResult }
  | { type: "middle"; result: MiddleResult }
  | null;

export interface MiddleRecalcInput {
  stakeB: number;
  lineA: number;
  lineB: number;
}

export class VerifyInputError extends Error {
  constructor(
    public readonly code:
      | "INVALID_CALCULATOR"
      | "INVALID_ODDS"
      | "INVALID_STAKE"
      | "MISSING_MIDDLE_INPUT",
    message: string,
  ) {
    super(message);
    this.name = "VerifyInputError";
  }
}

export function isSupportedCalculator(value: string): value is SupportedCalculator {
  return SUPPORTED_CALCULATORS.includes(value as SupportedCalculator);
}

function assertFiniteNumber(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new VerifyInputError("INVALID_STAKE", `${label} must be a finite number.`);
  }
}

function assertPositiveStake(label: string, value: number): void {
  assertFiniteNumber(label, value);

  if (value <= 0) {
    throw new VerifyInputError("INVALID_STAKE", `${label} must be greater than 0.`);
  }
}

function assertAmericanOdds(label: string, value: number): void {
  assertFiniteNumber(label, value);

  if (value === 0 || (value > -100 && value < 100)) {
    throw new VerifyInputError(
      "INVALID_ODDS",
      `${label} must be valid American odds, such as -110 or +120.`,
    );
  }
}

/**
 * Recalculate a verified opportunity after the user manually observes live odds.
 *
 * This function intentionally does not read sportsbook pages, scrape values,
 * place bets, or infer odds from outside sources. It only recalculates from
 * values the user typed into PaperEdge.
 */
export function recalculateOnObserved(
  requiredCalculator: string,
  observedOddsA: number,
  observedOddsB: number,
  stakeA: number,
  middle?: MiddleRecalcInput,
): VerifyRecalcResult {
  if (!isSupportedCalculator(requiredCalculator)) {
    return null;
  }

  assertAmericanOdds("observedOddsA", observedOddsA);
  assertAmericanOdds("observedOddsB", observedOddsB);
  assertPositiveStake("stakeA", stakeA);

  if (requiredCalculator === "arbitrage") {
    return {
      type: "arbitrage",
      result: cashArbHedge(stakeA, observedOddsA, observedOddsB),
    };
  }

  if (requiredCalculator === "promo_converter") {
    return {
      type: "promo",
      result: promoHedge(stakeA, observedOddsA, observedOddsB),
    };
  }

  if (!middle) {
    throw new VerifyInputError(
      "MISSING_MIDDLE_INPUT",
      "Middle recalculation requires stakeB, lineA, and lineB.",
    );
  }

  assertPositiveStake("middle.stakeB", middle.stakeB);
  assertFiniteNumber("middle.lineA", middle.lineA);
  assertFiniteNumber("middle.lineB", middle.lineB);

  return {
    type: "middle",
    result: middleHedge(
      stakeA,
      observedOddsA,
      middle.lineA,
      middle.stakeB,
      observedOddsB,
      middle.lineB,
    ),
  };
}
2. Add packages/core/src/verify.test.ts
import { describe, expect, it } from "vitest";
import {
  VerifyInputError,
  isSupportedCalculator,
  recalculateOnObserved,
} from "./verify";

describe("verify recalculation", () => {
  it("recognizes supported calculator IDs", () => {
    expect(isSupportedCalculator("arbitrage")).toBe(true);
    expect(isSupportedCalculator("promo_converter")).toBe(true);
    expect(isSupportedCalculator("middle")).toBe(true);
    expect(isSupportedCalculator("free_money_machine")).toBe(false);
  });

  it("returns null for unsupported calculator IDs for backward compatibility", () => {
    expect(recalculateOnObserved("unknown", 120, -110, 100)).toBeNull();
  });

  it("recalculates standard arbitrage observations", () => {
    const result = recalculateOnObserved("arbitrage", 120, -110, 100);

    expect(result?.type).toBe("arbitrage");
    expect(result?.result).toBeTruthy();
  });

  it("recalculates promo converter observations", () => {
    const result = recalculateOnObserved("promo_converter", 140, -130, 250);

    expect(result?.type).toBe("promo");
    expect(result?.result).toBeTruthy();
  });

  it("recalculates middle observations when middle inputs are supplied", () => {
    const result = recalculateOnObserved("middle", -110, -110, 100, {
      stakeB: 100,
      lineA: 2.5,
      lineB: 3.5,
    });

    expect(result?.type).toBe("middle");
    expect(result?.result).toBeTruthy();
  });

  it("throws when middle inputs are missing", () => {
    expect(() => recalculateOnObserved("middle", -110, -110, 100)).toThrow(
      VerifyInputError,
    );
  });

  it("rejects zero odds", () => {
    expect(() => recalculateOnObserved("arbitrage", 0, -110, 100)).toThrow(
      VerifyInputError,
    );
  });

  it("rejects American odds inside the invalid -99 to +99 range", () => {
    expect(() => recalculateOnObserved("arbitrage", 50, -110, 100)).toThrow(
      VerifyInputError,
    );
  });

  it("rejects non-positive stakeA", () => {
    expect(() => recalculateOnObserved("arbitrage", 120, -110, 0)).toThrow(
      VerifyInputError,
    );
  });

  it("rejects non-finite stakeA", () => {
    expect(() =>
      recalculateOnObserved("arbitrage", 120, -110, Number.POSITIVE_INFINITY),
    ).toThrow(VerifyInputError);
  });
});
3. Add packages/core/src/verification-gates.ts
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

function result(
  id: VerificationGateId,
  status: GateStatus,
  message: string,
): GateResult {
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

  if (market.includes("spread") || market.includes("run line") || market.includes("puck line")) {
    return "spread";
  }

  if (market.includes("total") || market.includes("over under") || market.includes("over/under")) {
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

  return result(
    "opposite_sides",
    "unknown",
    "Confirm the two sides are true opposite outcomes.",
  );
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
    return result("trackable", "fail", `Missing required tracking fields: ${missing.join(", ")}.`);
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
4. Add packages/core/src/verification-gates.test.ts
import { describe, expect, it } from "vitest";
import {
  allVerificationGatesPass,
  evaluateVerificationGate,
  evaluateVerificationGates,
  type VerificationTradeInput,
} from "./verification-gates";

const NOW = new Date("2026-05-20T12:00:00.000Z");

function passingTrade(overrides: Partial<VerificationTradeInput> = {}): VerificationTradeInput {
  const base: VerificationTradeInput = {
    goal: "profit",
    tradeType: "arbitrage",
    bonusType: "cash",
    calculatorUsed: "arbitrage",
    bankroll: 10_000,
    maxStakePct: 5,
    oddsVerifiedAt: new Date(NOW.getTime() - 10_000),
    oddsFreshnessSeconds: 30,
    rolloverAmount: 0,
    rolloverMultiple: 0,
    rolloverUnknownOrNA: false,
    oppositeSideConfirmed: true,
    legA: {
      bookId: "book-a",
      bookName: "Book A",
      event: "Team A vs Team B",
      market: "moneyline",
      period: "full game",
      side: "home",
      oddsAmerican: 120,
      stake: 100,
      line: null,
    },
    legB: {
      bookId: "book-b",
      bookName: "Book B",
      event: "Team A vs Team B",
      market: "moneyline",
      period: "full game",
      side: "away",
      oddsAmerican: -110,
      stake: 110,
      line: null,
    },
  };

  return {
    ...base,
    ...overrides,
    legA: { ...base.legA, ...(overrides.legA ?? {}) },
    legB: { ...base.legB, ...(overrides.legB ?? {}) },
  };
}

describe("verification gates", () => {
  it("passes all gates for a complete clean trade", () => {
    const trade = passingTrade();

    expect(allVerificationGatesPass(trade, NOW)).toBe(true);
  });

  it("fails same event when events differ", () => {
    const gate = evaluateVerificationGate(
      "same_event",
      passingTrade({ legB: { event: "Different Event" } }),
      NOW,
    );

    expect(gate.status).toBe("fail");
  });

  it("returns unknown for missing event", () => {
    const gate = evaluateVerificationGate(
      "same_event",
      passingTrade({ legA: { event: "" } }),
      NOW,
    );

    expect(gate.status).toBe("unknown");
  });

  it("passes spread line when signs are opposite", () => {
    const gate = evaluateVerificationGate(
      "same_line",
      passingTrade({
        legA: { market: "spread", line: -2.5 },
        legB: { market: "spread", line: 2.5 },
      }),
      NOW,
    );

    expect(gate.status).toBe("pass");
  });

  it("fails spread line when signs are not opposite", () => {
    const gate = evaluateVerificationGate(
      "same_line",
      passingTrade({
        legA: { market: "spread", line: -2.5 },
        legB: { market: "spread", line: -2.5 },
      }),
      NOW,
    );

    expect(gate.status).toBe("fail");
  });

  it("passes total line when the same numeric line is used", () => {
    const gate = evaluateVerificationGate(
      "same_line",
      passingTrade({
        legA: { market: "total", side: "over", line: 8.5 },
        legB: { market: "total", side: "under", line: 8.5 },
        oppositeSideConfirmed: false,
      }),
      NOW,
    );

    expect(gate.status).toBe("pass");
  });

  it("fails stale odds", () => {
    const gate = evaluateVerificationGate(
      "odds_verified_live",
      passingTrade({ oddsVerifiedAt: new Date(NOW.getTime() - 31_000) }),
      NOW,
    );

    expect(gate.status).toBe("fail");
  });

  it("fails when the wrong calculator is used for promo/free play", () => {
    const gate = evaluateVerificationGate(
      "correct_calculator",
      passingTrade({
        bonusType: "promo free play",
        calculatorUsed: "arbitrage",
      }),
      NOW,
    );

    expect(gate.status).toBe("fail");
  });

  it("fails when stake exposure is above bankroll limit", () => {
    const gate = evaluateVerificationGate(
      "stake_within_bankroll",
      passingTrade({
        bankroll: 1_000,
        maxStakePct: 5,
        legA: { stake: 100 },
        legB: { stake: 100 },
      }),
      NOW,
    );

    expect(gate.status).toBe("fail");
  });

  it("passes rollover gate when rollover is marked unknown or not applicable", () => {
    const gate = evaluateVerificationGate(
      "rollover_understood",
      passingTrade({
        rolloverAmount: null,
        rolloverMultiple: null,
        rolloverUnknownOrNA: true,
      }),
      NOW,
    );

    expect(gate.status).toBe("pass");
  });

  it("fails trackable when required fields are missing", () => {
    const gate = evaluateVerificationGate(
      "trackable",
      passingTrade({ legA: { stake: null } }),
      NOW,
    );

    expect(gate.status).toBe("fail");
  });

  it("always returns exactly ten gates in product order", () => {
    const gates = evaluateVerificationGates(passingTrade(), NOW);

    expect(gates.map((gate) => gate.id)).toEqual([
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
    ]);
  });
});
5. Replace apps/verifier/app/api/deep-link/route.ts
import { z } from "zod";
import { resolveBookUrl } from "@/lib/deep-links";

const QuerySchema = z.object({
  bookId: z.string().trim().min(1).max(128),
  sport: z.string().trim().min(1).max(64).default("default"),
  marketType: z.string().trim().min(1).max(64).default("default"),
  player: z.string().trim().max(200).optional(),
  team: z.string().trim().max(200).optional(),
  event: z.string().trim().max(300).optional(),
});

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;

  try {
    const parsed = new URL(origin);

    if (parsed.protocol === "chrome-extension:") {
      return true;
    }

    const localHosts = new Set(["localhost", "127.0.0.1"]);

    if (!localHosts.has(parsed.hostname)) {
      return false;
    }

    return parsed.port === "3000" || parsed.port === "3001" || parsed.port === "";
  } catch {
    return false;
  }
}

function baseHeaders(req: Request): Headers {
  const headers = new Headers();
  const origin = req.headers.get("origin");

  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");

  if (origin && isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  } else if (!origin) {
    headers.set("Access-Control-Allow-Origin", "http://127.0.0.1:3001");
  }

  return headers;
}

function safeResolvedUrl(value: string | null): string {
  if (!value) return "about:blank";
  if (value === "about:blank") return value;

  try {
    const parsed = new URL(value);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "about:blank";
    }

    if (parsed.username || parsed.password) {
      return "about:blank";
    }

    return parsed.toString();
  } catch {
    return "about:blank";
  }
}

export async function OPTIONS(req: Request) {
  if (!isAllowedOrigin(req.headers.get("origin"))) {
    return new Response("Forbidden origin", { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: baseHeaders(req),
  });
}

export async function GET(req: Request) {
  if (!isAllowedOrigin(req.headers.get("origin"))) {
    return new Response("Forbidden origin", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));

  if (!parsed.success) {
    return new Response("Invalid deep-link request", {
      status: 400,
      headers: baseHeaders(req),
    });
  }

  const { bookId, sport, marketType, player, team, event } = parsed.data;

  const resolvedUrl = await resolveBookUrl(bookId, sport, marketType, {
    player,
    team,
    event,
  });

  return new Response(safeResolvedUrl(resolvedUrl), {
    status: 200,
    headers: baseHeaders(req),
  });
}
6. Replace bookmap/client/src/utils/money.ts
export interface FormatCentsOptions {
  showCents?: boolean;
}

export type ParseMoneyResult =
  | { ok: true; cents: number }
  | { ok: false; cents: 0; reason: string };

export function fmtCents(cents: number, options: FormatCentsOptions = {}): string {
  const { showCents = true } = options;

  if (!Number.isFinite(cents)) {
    return "$0.00";
  }

  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
}

export function parseDollarsToCentsStrict(input: string): ParseMoneyResult {
  const value = input.trim();

  if (!value) {
    return { ok: false, cents: 0, reason: "Money input is empty." };
  }

  const normalized = value.replace(/[$,\s]/g, "");

  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return {
      ok: false,
      cents: 0,
      reason: "Enter a positive dollar amount with at most two decimal places.",
    };
  }

  const [dollarPart, centPart = ""] = normalized.split(".");
  const dollars = Number.parseInt(dollarPart, 10);

  if (!Number.isSafeInteger(dollars)) {
    return {
      ok: false,
      cents: 0,
      reason: "Dollar amount is too large.",
    };
  }

  const centsText = centPart.padEnd(2, "0");
  const cents = Number.parseInt(centsText || "0", 10);
  const total = dollars * 100 + cents;

  if (!Number.isSafeInteger(total)) {
    return {
      ok: false,
      cents: 0,
      reason: "Cent amount is too large.",
    };
  }

  return { ok: true, cents: total };
}

/**
 * Backward-compatible helper for existing callers.
 *
 * New form code should prefer parseDollarsToCentsStrict so invalid input can be
 * shown to the user instead of silently becoming $0.
 */
export function parseDollarsToCents(input: string): number {
  const parsed = parseDollarsToCentsStrict(input);
  return parsed.ok ? parsed.cents : 0;
}
7. Add docs/QUALITY_GATES.md
# PaperEdge Quality Gates

PaperEdge handles money-like calculations, bankroll movement, settlement review, and mistake diagnosis. Every change that touches calculations, verification, settlement, import, or bankroll state must pass these gates before merge.

## Required commands

Run from the repository root.

```bash
npm install
npm run test
npm --workspace @paperedge/dashboard run build
npm --workspace @paperedge/verifier run build

If root scripts do not exist yet, use the direct equivalents:

npx vitest run
npm --workspace @paperedge/dashboard run build
npm --workspace @paperedge/verifier run build
Required local manual QA
Dashboard app
npm --workspace @paperedge/dashboard run dev

Verify:

The safety banner is visible.
/ routes to the current primary product surface.
/trades loads.
A trade detail page loads.
Settlement cannot be submitted twice.
Settlement updates actual P/L and bankroll metrics exactly once.
Verifier app
npm --workspace @paperedge/verifier run dev

Verify:

Import or queue page loads.
A verification opportunity can be opened.
Both legs can be manually marked verified.
A stale odds state blocks locking.
Wrong calculator blocks locking.
Locked opportunities appear in the expected downstream view.
Chrome extension

The extension must remain manual-only.

Verify:

Overlay appears only on allowlisted hosts.
Overlay requires an active opportunity.
User manually types observed odds, line, and liquidity.
Extension does not scrape odds.
Extension does not click sportsbook buttons.
Extension does not place bets.
Extension does not read balances.
Extension does not bypass geolocation, KYC, limits, or account controls.
Required tests by risk area
Calculators
American odds conversion.
Cash hedge.
Promo/free-play conversion.
Middle calculation.
Invalid odds rejection.
Rounding behavior.
Verification gates
Same event.
Same market.
Same period.
Same line.
Opposite sides.
Odds verified live.
Correct calculator.
Stake within bankroll.
Rollover understood.
Trackable.

Each gate must have pass, fail, and unknown tests where applicable.

Settlement
Cannot settle already settled trade.
Cannot settle cancelled trade.
Bankroll changes exactly once.
Mistake tag records correctly.
Actual P/L and expected P/L leak are correct.
Failed settlement does not partially update state.
Edge Pulse
Expected P/L aggregation.
Actual P/L aggregation.
Leak aggregation.
Main leak cause mode.
Empty window behavior.
24h / 7d / 30d / all windows.
Merge rule

Do not merge UI work that changes trade math, settlement, or verification until the relevant core tests pass.


---

## 8. Add `docs/SECURITY_AND_SAFETY_BOUNDARIES.md`

```md
# PaperEdge Security and Safety Boundaries

PaperEdge is a local-first manual verification and paper trading review tool.

## Non-negotiable boundaries

PaperEdge must not:

1. Connect to sportsbook accounts.
2. Scrape sportsbook odds, balances, account data, or tickets.
3. Bypass geolocation.
4. Bypass KYC or identity checks.
5. Bypass sportsbook limits or account controls.
6. Click sportsbook buttons.
7. Place wagers.
8. Auto-submit bets.
9. Claim profit is guaranteed.
10. Add a "real money mode" flag.
11. Hide or remove the safety banner.

## Allowed behavior

PaperEdge may:

1. Let the user manually enter a trade.
2. Let the user manually import or paste an opportunity.
3. Calculate hedge stakes from user-provided odds.
4. Compare expected vs actual results.
5. Track paper trades.
6. Track user-entered bankroll snapshots.
7. Show a manual verification checklist.
8. Open user-configured search/deep links.
9. Let the user manually type observed odds, line, and liquidity.
10. Show educational warnings about stale odds, rollover, and bankroll exposure.

## Chrome extension boundary

The extension is allowed to:

- Display a manual overlay.
- Show the active PaperEdge opportunity.
- Let the user type observed odds, line, liquidity, and notes.
- Send the manually typed observation back to the local verifier app.

The extension is not allowed to:

- Read sportsbook page odds automatically.
- Read user account balances.
- Click bet slips.
- Submit wagers.
- Log into accounts.
- Bypass geolocation.
- Bypass KYC.
- Modify sportsbook pages beyond the PaperEdge overlay.

## Local API boundary

Verifier APIs should assume local manual use.

Minimum protections:

- Restrict CORS to localhost and known extension origins.
- Validate all query params with Zod.
- Reject unsafe URL schemes.
- Return `no-store` responses for verifier utility endpoints.
- Avoid storing secrets.
- Avoid account credentials entirely.

## Documentation rule

Any new feature that touches sportsbooks, prediction markets, odds, balances, or settlement must explicitly state whether it is:

- Manual input only.
- Paper trading only.
- Local-only.
- Educational.
- A support view.

When in doubt, choose the safer interpretation.
9. Suggested package.json script patch

Do not blindly replace the whole root package.json without checking the existing file. Add or adapt these scripts at the root:

{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "npm --workspace @paperedge/dashboard run build && npm --workspace @paperedge/verifier run build",
    "quality": "npm run test && npm run build",
    "dev:dashboard": "npm --workspace @paperedge/dashboard run dev",
    "dev:verifier": "npm --workspace @paperedge/verifier run dev"
  }
}
10. Suggested .gitignore additions

Add these if not already present:

node_modules
.next
dist
build
coverage
*.tsbuildinfo

# Local databases
*.db
*.db-journal
*.sqlite
*.sqlite3

# Generated Prisma output if generated during install/build
lib/generated/prisma
packages/database/src/generated/prisma

# Environment files
.env
.env.local
.env.*.local

# OS/editor
.DS_Store
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json

If packages/database/src/generated/prisma is intentionally committed, remove it from this ignore list and document why.

Implementation Steps
Step 1 — Create a safety branch
git checkout -b audit/p0-verification-hardening
Step 2 — Add the verification gate module

Add:

packages/core/src/verification-gates.ts
packages/core/src/verification-gates.test.ts

Run:

npx vitest run packages/core/src/verification-gates.test.ts
Step 3 — Harden observed-odds recalculation

Replace:

packages/core/src/verify.ts

Add:

packages/core/src/verify.test.ts

Run:

npx vitest run packages/core/src/verify.test.ts
Step 4 — Harden deep-link route

Replace:

apps/verifier/app/api/deep-link/route.ts

Manual checks:

npm --workspace @paperedge/verifier run dev

Then test:

curl "http://127.0.0.1:3001/api/deep-link?bookId=test&sport=default&marketType=default"

Expected:

200
text/plain
about:blank or a safe resolved HTTP/HTTPS URL
no wildcard Access-Control-Allow-Origin: *
Step 5 — Add docs

Add:

docs/QUALITY_GATES.md
docs/SECURITY_AND_SAFETY_BOUNDARIES.md
Step 6 — Update root scripts

Update root package.json with the script patch above.

Then run:

npm run quality
Step 7 — Remove stale generated artifacts

Check:

git ls-files | grep -E 'lib/generated/prisma|packages/database/src/generated/prisma|\.db$|\.sqlite'

For any generated file that should not be committed:

git rm -r --cached lib/generated/prisma
git rm -r --cached packages/database/src/generated/prisma

Only remove the generated package path if the app can regenerate it reliably during install/build.

Step 8 — Fix typo

Search:

grep -R "mistageTags" -n apps packages components lib

Rename to:

mistakeTags

Run TypeScript/build afterward.

Testing Instructions
Static checks
npm install
npm run test
npm run build

If root scripts are not present yet:

npx vitest run
npm --workspace @paperedge/dashboard run build
npm --workspace @paperedge/verifier run build
Core unit tests

Run focused tests:

npx vitest run packages/core/src/verify.test.ts
npx vitest run packages/core/src/verification-gates.test.ts
Manual dashboard test
npm --workspace @paperedge/dashboard run dev

Verify:

Safety banner appears.
Trade list loads.
Trade detail loads.
Settlement screen loads.
Settlement cannot be saved with missing required fields.
Already settled/cancelled trades cannot be settled again.
Actual P/L renders with the correct sign.
Mistake tag selector loads after typo fix.
Manual verifier test
npm --workspace @paperedge/verifier run dev

Verify:

Queue/import route loads.
A verification opportunity can be opened.
Deep-link buttons still resolve safe URLs.
Invalid deep-link query returns 400.
Disallowed origins return 403.
Stale odds block locking.
Wrong calculator blocks locking.
Locking requires every required gate to pass.
Manual extension test
Start verifier on port 3001.
Load unpacked extension.
Open a supported host.
Confirm overlay appears only when an active opportunity exists.
Type observed odds manually.
Save observation.
Confirm PaperEdge receives the observation.
Confirm extension does not scrape, click, place wagers, or read balances.
Data correctness test cases

Use known examples and assert exact cents where possible:

Cash arb with +120 and -110.
Promo/free play conversion with +140 and -130.
Low-hold loss logged as a negative entry.
Settlement actual P/L lower than expected creates a leak.
Empty 7-day Edge Pulse window returns zero expected, zero actual, zero leak.
Rollover unknown/N/A passes only when explicitly marked.
What to Work on Next, in Order
1. Verification gates and tests

This is the highest leverage because every other feature depends on trustworthy gate output.

Deliverable:

verification-gates.ts
verification-gates.test.ts
UI wired to disable Log/Lock until all gates pass
2. Deep-link route hardening

This is small and reduces avoidable API risk.

Deliverable:

Zod validation
local-only CORS
safe URL scheme filtering
no-store response
3. Money format migration plan

Do not immediately rewrite the entire database. First write the migration plan and stop new float usage.

Deliverable:

money representation decision
migration steps
helper functions
tests around cents conversion
4. Settlement transaction audit

Settlement is where expected vs actual truth becomes permanent.

Deliverable:

transaction-backed settlement
duplicate settlement tests
bankroll snapshot tests
5. Product surface cleanup

After correctness work, align routes with the build plan.

Deliverable:

Cockpit primary route
Dashboard as support view
import/queue/books/mistakes as supporting tools
removed or hidden dashboard-first distractions
6. Documentation cleanup

After the above, make docs easier for future contributors and AI coding agents.

Deliverable:

docs/README.md
updated PAPEREDGE_BUILD_PLAN.md
clear deprecated/optional doc labels
Final Recommendation

Do not add new betting surfaces, AI suggestions, prediction ranking, sportsbook integrations, account connections, or automation.

The next best move is to make PaperEdge boringly reliable:

Pure verification gates.
Exact money handling.
Safe manual deep links.
Transactional settlement.
One cockpit-first product loop.

That is the shortest path from “featureful local app” to “trusted tool the user can actually rely on.”
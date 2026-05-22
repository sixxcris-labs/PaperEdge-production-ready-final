# Repository Audit and Next Steps

## Current Status (2026-05-21)

This document is historical context. The live source of truth is:
- `docs/active/PROJECT_COMPLETION_TRACKER.md`

Current state from the active tracker:
- Quality gates are green (`npm run validate` passes).
- Money-cents backfill is idempotent (`npm run db:backfill-money-cents` reports `0` updates on re-run).
- P0 tasks are complete.
- P1 tasks are complete except `P1-02`, which remains **Blocked** per user direction.
- P2 items are complete except ongoing tracker maintenance (`P2-01`).

Immediate next executable task:
1. Resume `P1-02` only when requested.
2. Otherwise keep documentation/session evidence current in `docs/active/PROJECT_COMPLETION_TRACKER.md`.

## Start Here

1. Verification gates and tests.
2. Deep-link route hardening.
3. Money format migration plan.
4. Settlement transaction audit.
5. Product surface cleanup.

## Executive Summary



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



## Repository Overview

### Product



PaperEdge is a local/manual decision-support app for sports betting paper trading. The repo documentation defines it as a verification-first trade cockpit, not a dashboard-first betting tracker.



The intended product loop is:



Import or enter a trade.

Verify the market, sides, odds, calculator, stake, bankroll exposure, and rollover assumptions.

Log the trade only when the verification gates pass.

Settle the trade.

Compare expected vs actual outcome.

Record leaks/mistakes automatically.

Show the user one clear weekly edge/leak diagnosis.

### Main repository areas

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

### Stack observed

Next.js app router

React

TypeScript

Prisma 7 with SQLite and better-sqlite3

Zod

Vitest

TanStack Table

Local Chrome extension

Monorepo workspaces: apps/\*, packages/\*

## Audit Findings

### Priority Legend

Priority	Meaning

P0	Work before adding features. Could affect correctness, safety, or product direction.

P1	Work soon. Important for maintainability, security, or dev velocity.

P2	Work after P0/P1. Useful but not blocking the core loop.

P3	Later polish or expansion.

### Findings Table

ID	Priority	Area	Finding	Impact	Effort	Recommendation

F-01	P0	Product architecture	Build plan says / should be the Trade Cockpit and old dashboard-first surfaces should be cut, but the repo still has dashboard/trades/verifier/support surfaces.	High	Medium	Pick the current source of truth. Make Cockpit the primary route and demote dashboard/journal to support views.

F-02	P0	Math correctness	Database schema appears to store balances/stakes/profit as Float.	High	High	Migrate all money to integer cents or Decimal. Integer cents is safest with SQLite.

F-03	P0	Verification	The 10 verification gates are core product logic, but they should exist as explicit pure functions with boundary tests.	High	Medium	Add packages/core/src/verification-gates.ts and tests.

F-04	P0	Core verify logic	recalculateOnObserved accepts arbitrary string calculator IDs, raw odds/stakes, and silently returns null for unsupported states.	High	Low	Harden input validation and add verify.test.ts.

F-05	P0	API security	apps/verifier/app/api/deep-link/route.ts uses wildcard CORS and accepts unvalidated query params.	High	Low	Restrict origins to local app/extension, validate params with Zod, reject unsafe URL schemes.

F-06	P1	Generated artifacts	Repomix includes generated Prisma client files under lib/generated/prisma, despite migration tests expecting database ownership in packages/database.	Medium	Low	Remove generated/stale artifacts from source control if not intentional. Update .gitignore and generation docs.

F-07	P1	Tests	Workspace tests are useful but mostly structural. Money-risking logic needs behavioral tests.	High	Medium	Add tests for calculators, verify recalc, 10 gates, settlement leak inference, and edge pulse aggregation.

F-08	P1	Dev experience	App package scripts only include dev, build, start; root quality gates are not obvious from snippets.	Medium	Low	Add a docs/QUALITY\_GATES.md and root scripts for test, build, quality.

F-09	P1	Settlement	Settlement server action has promising locking checks, but settlement should be transactional across result, bankroll, snapshots, and mistake tags.	High	Medium	Verify and enforce a single Prisma transaction for settlement. Add double-settlement tests.

F-10	P1	Local identity	LOCAL\_USER\_EMAIL = "local@paperedge.app" is hard-coded in server code.	Medium	Low	Fine for local-only MVP, but isolate behind a getLocalUser() helper and document local-only assumptions.

F-11	P1	Extension safety	Manual extension boundary is good, but broad host patterns plus wildcard API CORS could become risky.	Medium	Low	Keep extension manual-only. Require explicit active opportunity. Keep API local-only.

F-12	P1	Domain modeling	Roles/statuses/bonus types appear to be strings rather than closed enums.	Medium	Medium	Add TypeScript domain constants and Zod schemas now; consider Prisma enums later.

F-13	P2	Bookmap	bookmap overlaps with PaperEdge Book Map and bankroll inventory.	Medium	Medium	Decide whether to fold Bookmap into PaperEdge or keep it explicitly separate.

F-14	P2	Money parsing	bookmap/client/src/utils/money.ts silently maps invalid money input to 0 and formats without cents.	Medium	Low	Add strict parse helper and cents-aware formatter.

F-15	P2	Typo / DX	mistageTags typo appears in trade detail page.	Low	Low	Rename to mistakeTags consistently.

F-16	P2	Docs	Multiple plans/addenda exist; optional security and E2E notes may be more important than “optional.”	Medium	Low	Add docs index and promote minimum E2E/security checklist into required quality gates.

F-17	P3	Performance	No obvious frontend performance emergency, but generated files, duplicated surfaces, and broad imports can slow dev/build.	Low	Medium	Remove stale generated output, avoid barrel imports in hot paths, keep shared packages focused.

### Highest-Risk Issues Explained

1\. Money stored as floats



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

Add new \*Cents fields beside existing float fields.

Backfill with Math.round(oldFloat \* 100).

Update core calculations to return cents or convert immediately at boundaries.

Update UI to display cents.

Remove old float fields after data validation.

2\. Verification gates must be first-class product logic



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



3\. Deep-link route needs local-only hardening



The verifier deep-link route currently behaves like a simple utility endpoint, but it is exposed through HTTP and returns URLs. Since it supports sportsbook deep links, it should be conservative:



Validate all query params.

Restrict origins.

Prevent dangerous resolved URL schemes.

Return text/plain.

Disable caching.

Keep it local/manual-only.



A replacement route is included below.



4\. The repo needs a single “current direction” document



The docs are useful, but there are multiple build plans, handoffs, optional improvements, and embedded historical context. For contributors and AI coding agents, this creates drift.



What to do



Create:



docs/README.md

docs/QUALITY\_GATES.md

docs/SECURITY\_AND\_SAFETY\_BOUNDARIES.md



Make docs/PAPEREDGE\_BUILD\_PLAN.md the product source of truth, or explicitly supersede it.



## Priority Roadmap

### P0 - Do this before more feature work

1\. Align the app around the Trade Cockpit



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

2\. Add pure verification gates and tests



Use the complete verification-gates.ts and test file below.



3\. Harden observed-odds recalculation



Replace packages/core/src/verify.ts and add verify.test.ts.



4\. Harden /api/deep-link



Replace apps/verifier/app/api/deep-link/route.ts.



5\. Stop using floats for new money code



Do not start a huge migration before shipping the gates, but stop adding new float-backed money paths.



### P1 - Do next

1\. Add quality gates

Root npm run test.

Root npm run build.

Root npm run quality.

Dashboard build.

Verifier build.

Database generation/seed docs.

Extension manual QA checklist.

2\. Clean generated artifacts

Remove stale lib/generated/prisma if the active generated client belongs under packages/database.

Confirm .gitignore excludes:

.next

node\_modules

generated Prisma output if generated at install/build time

local SQLite dev databases

coverage

build output

3\. Settlement transaction audit



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

4\. Rename typo



Rename mistageTags to mistakeTags.



### P2 - Do after core loop is solid

1\. Decide Bookmap’s future



Choose one:



Fold Bookmap into PaperEdge’s /books.

Keep Bookmap as an experimental sidecar.

Delete/archive it.



Do not let two book-map systems become competing sources of truth.



2\. Promote minimum E2E tests



The optional E2E test plan should become a minimum smoke suite:



Seed local data.

Import opportunity.

Verify both legs manually.

Lock opportunity.

Confirm it appears in dashboard/trades.

Settle trade.

Confirm bankroll/edge metrics update.

3\. Add docs index



Create a short docs index that says:



Start here.

Current source of truth.

Deprecated docs.

Optional docs.

Safety rules.

## Files to Add or Modify

### 1. Replace packages/core/src/verify.ts

import {

&#x20; cashArbHedge,

&#x20; promoHedge,

&#x20; middleHedge,

&#x20; type CashArbResult,

&#x20; type PromoHedgeResult,

&#x20; type MiddleResult,

} from "./calc";



export const SUPPORTED\_CALCULATORS = \[

&#x20; "arbitrage",

&#x20; "promo\_converter",

&#x20; "middle",

] as const;



export type SupportedCalculator = (typeof SUPPORTED\_CALCULATORS)\[number];



export type VerifyRecalcResult =

&#x20; | { type: "arbitrage"; result: CashArbResult }

&#x20; | { type: "promo"; result: PromoHedgeResult }

&#x20; | { type: "middle"; result: MiddleResult }

&#x20; | null;



export interface MiddleRecalcInput {

&#x20; stakeB: number;

&#x20; lineA: number;

&#x20; lineB: number;

}



export class VerifyInputError extends Error {

&#x20; constructor(

&#x20;   public readonly code:

&#x20;     | "INVALID\_CALCULATOR"

&#x20;     | "INVALID\_ODDS"

&#x20;     | "INVALID\_STAKE"

&#x20;     | "MISSING\_MIDDLE\_INPUT",

&#x20;   message: string,

&#x20; ) {

&#x20;   super(message);

&#x20;   this.name = "VerifyInputError";

&#x20; }

}



export function isSupportedCalculator(value: string): value is SupportedCalculator {

&#x20; return SUPPORTED\_CALCULATORS.includes(value as SupportedCalculator);

}



function assertFiniteNumber(label: string, value: number): void {

&#x20; if (!Number.isFinite(value)) {

&#x20;   throw new VerifyInputError("INVALID\_STAKE", `${label} must be a finite number.`);

&#x20; }

}



function assertPositiveStake(label: string, value: number): void {

&#x20; assertFiniteNumber(label, value);



&#x20; if (value <= 0) {

&#x20;   throw new VerifyInputError("INVALID\_STAKE", `${label} must be greater than 0.`);

&#x20; }

}



function assertAmericanOdds(label: string, value: number): void {

&#x20; assertFiniteNumber(label, value);



&#x20; if (value === 0 || (value > -100 \&\& value < 100)) {

&#x20;   throw new VerifyInputError(

&#x20;     "INVALID\_ODDS",

&#x20;     `${label} must be valid American odds, such as -110 or +120.`,

&#x20;   );

&#x20; }

}



/\*\*

&#x20;\* Recalculate a verified opportunity after the user manually observes live odds.

&#x20;\*

&#x20;\* This function intentionally does not read sportsbook pages, scrape values,

&#x20;\* place bets, or infer odds from outside sources. It only recalculates from

&#x20;\* values the user typed into PaperEdge.

&#x20;\*/

export function recalculateOnObserved(

&#x20; requiredCalculator: string,

&#x20; observedOddsA: number,

&#x20; observedOddsB: number,

&#x20; stakeA: number,

&#x20; middle?: MiddleRecalcInput,

): VerifyRecalcResult {

&#x20; if (!isSupportedCalculator(requiredCalculator)) {

&#x20;   return null;

&#x20; }



&#x20; assertAmericanOdds("observedOddsA", observedOddsA);

&#x20; assertAmericanOdds("observedOddsB", observedOddsB);

&#x20; assertPositiveStake("stakeA", stakeA);



&#x20; if (requiredCalculator === "arbitrage") {

&#x20;   return {

&#x20;     type: "arbitrage",

&#x20;     result: cashArbHedge(stakeA, observedOddsA, observedOddsB),

&#x20;   };

&#x20; }



&#x20; if (requiredCalculator === "promo\_converter") {

&#x20;   return {

&#x20;     type: "promo",

&#x20;     result: promoHedge(stakeA, observedOddsA, observedOddsB),

&#x20;   };

&#x20; }



&#x20; if (!middle) {

&#x20;   throw new VerifyInputError(

&#x20;     "MISSING\_MIDDLE\_INPUT",

&#x20;     "Middle recalculation requires stakeB, lineA, and lineB.",

&#x20;   );

&#x20; }



&#x20; assertPositiveStake("middle.stakeB", middle.stakeB);

&#x20; assertFiniteNumber("middle.lineA", middle.lineA);

&#x20; assertFiniteNumber("middle.lineB", middle.lineB);



&#x20; return {

&#x20;   type: "middle",

&#x20;   result: middleHedge(

&#x20;     stakeA,

&#x20;     observedOddsA,

&#x20;     middle.lineA,

&#x20;     middle.stakeB,

&#x20;     observedOddsB,

&#x20;     middle.lineB,

&#x20;   ),

&#x20; };

}

### 2. Add packages/core/src/verify.test.ts

import { describe, expect, it } from "vitest";

import {

&#x20; VerifyInputError,

&#x20; isSupportedCalculator,

&#x20; recalculateOnObserved,

} from "./verify";



describe("verify recalculation", () => {

&#x20; it("recognizes supported calculator IDs", () => {

&#x20;   expect(isSupportedCalculator("arbitrage")).toBe(true);

&#x20;   expect(isSupportedCalculator("promo\_converter")).toBe(true);

&#x20;   expect(isSupportedCalculator("middle")).toBe(true);

&#x20;   expect(isSupportedCalculator("free\_money\_machine")).toBe(false);

&#x20; });



&#x20; it("returns null for unsupported calculator IDs for backward compatibility", () => {

&#x20;   expect(recalculateOnObserved("unknown", 120, -110, 100)).toBeNull();

&#x20; });



&#x20; it("recalculates standard arbitrage observations", () => {

&#x20;   const result = recalculateOnObserved("arbitrage", 120, -110, 100);



&#x20;   expect(result?.type).toBe("arbitrage");

&#x20;   expect(result?.result).toBeTruthy();

&#x20; });



&#x20; it("recalculates promo converter observations", () => {

&#x20;   const result = recalculateOnObserved("promo\_converter", 140, -130, 250);



&#x20;   expect(result?.type).toBe("promo");

&#x20;   expect(result?.result).toBeTruthy();

&#x20; });



&#x20; it("recalculates middle observations when middle inputs are supplied", () => {

&#x20;   const result = recalculateOnObserved("middle", -110, -110, 100, {

&#x20;     stakeB: 100,

&#x20;     lineA: 2.5,

&#x20;     lineB: 3.5,

&#x20;   });



&#x20;   expect(result?.type).toBe("middle");

&#x20;   expect(result?.result).toBeTruthy();

&#x20; });



&#x20; it("throws when middle inputs are missing", () => {

&#x20;   expect(() => recalculateOnObserved("middle", -110, -110, 100)).toThrow(

&#x20;     VerifyInputError,

&#x20;   );

&#x20; });



&#x20; it("rejects zero odds", () => {

&#x20;   expect(() => recalculateOnObserved("arbitrage", 0, -110, 100)).toThrow(

&#x20;     VerifyInputError,

&#x20;   );

&#x20; });



&#x20; it("rejects American odds inside the invalid -99 to +99 range", () => {

&#x20;   expect(() => recalculateOnObserved("arbitrage", 50, -110, 100)).toThrow(

&#x20;     VerifyInputError,

&#x20;   );

&#x20; });



&#x20; it("rejects non-positive stakeA", () => {

&#x20;   expect(() => recalculateOnObserved("arbitrage", 120, -110, 0)).toThrow(

&#x20;     VerifyInputError,

&#x20;   );

&#x20; });



&#x20; it("rejects non-finite stakeA", () => {

&#x20;   expect(() =>

&#x20;     recalculateOnObserved("arbitrage", 120, -110, Number.POSITIVE\_INFINITY),

&#x20;   ).toThrow(VerifyInputError);

&#x20; });

});

### 3. Add packages/core/src/verification-gates.ts

export type GateStatus = "pass" | "fail" | "unknown";



export type VerificationGateId =

&#x20; | "same\_event"

&#x20; | "same\_market"

&#x20; | "same\_period"

&#x20; | "same\_line"

&#x20; | "opposite\_sides"

&#x20; | "odds\_verified\_live"

&#x20; | "correct\_calculator"

&#x20; | "stake\_within\_bankroll"

&#x20; | "rollover\_understood"

&#x20; | "trackable";



export type CalculatorId = "arbitrage" | "promo\_converter" | "middle";



export interface GateResult {

&#x20; id: VerificationGateId;

&#x20; label: string;

&#x20; status: GateStatus;

&#x20; message: string;

}



export interface VerificationLegInput {

&#x20; bookId?: string | null;

&#x20; bookName?: string | null;

&#x20; event?: string | null;

&#x20; market?: string | null;

&#x20; period?: string | null;

&#x20; side?: string | null;

&#x20; oddsAmerican?: number | null;

&#x20; stake?: number | null;

&#x20; line?: number | null;

}



export interface VerificationTradeInput {

&#x20; goal?: string | null;

&#x20; tradeType?: string | null;

&#x20; bonusType?: string | null;

&#x20; calculatorUsed?: string | null;

&#x20; bankroll?: number | null;

&#x20; maxStakePct?: number | null;

&#x20; oddsVerifiedAt?: Date | string | number | null;

&#x20; oddsFreshnessSeconds?: number | null;

&#x20; rolloverAmount?: number | null;

&#x20; rolloverMultiple?: number | null;

&#x20; rolloverUnknownOrNA?: boolean | null;

&#x20; oppositeSideConfirmed?: boolean | null;

&#x20; legA: VerificationLegInput;

&#x20; legB: VerificationLegInput;

}



const GATE\_LABELS: Record<VerificationGateId, string> = {

&#x20; same\_event: "Same event",

&#x20; same\_market: "Same market",

&#x20; same\_period: "Same period",

&#x20; same\_line: "Same line",

&#x20; opposite\_sides: "Opposite sides",

&#x20; odds\_verified\_live: "Odds verified live",

&#x20; correct\_calculator: "Correct calculator",

&#x20; stake\_within\_bankroll: "Stake within bankroll",

&#x20; rollover\_understood: "Rollover understood",

&#x20; trackable: "Trackable",

};



const GATE\_ORDER: VerificationGateId\[] = \[

&#x20; "same\_event",

&#x20; "same\_market",

&#x20; "same\_period",

&#x20; "same\_line",

&#x20; "opposite\_sides",

&#x20; "odds\_verified\_live",

&#x20; "correct\_calculator",

&#x20; "stake\_within\_bankroll",

&#x20; "rollover\_understood",

&#x20; "trackable",

];



function result(

&#x20; id: VerificationGateId,

&#x20; status: GateStatus,

&#x20; message: string,

): GateResult {

&#x20; return {

&#x20;   id,

&#x20;   label: GATE\_LABELS\[id],

&#x20;   status,

&#x20;   message,

&#x20; };

}



function clean(value: unknown): string {

&#x20; return String(value ?? "")

&#x20;   .trim()

&#x20;   .toLowerCase()

&#x20;   .replace(/\\s+/g, " ");

}



function hasText(value: unknown): boolean {

&#x20; return clean(value).length > 0;

}



function finite(value: unknown): value is number {

&#x20; return typeof value === "number" \&\& Number.isFinite(value);

}



function positive(value: unknown): value is number {

&#x20; return finite(value) \&\& value > 0;

}



function normalizeSide(value: unknown): string {

&#x20; return clean(value).replace(/\[^a-z0-9]/g, "");

}



function expectedCalculatorFor(input: VerificationTradeInput): CalculatorId {

&#x20; const goal = clean(input.goal);

&#x20; const tradeType = clean(input.tradeType);

&#x20; const bonusType = clean(input.bonusType);



&#x20; const promoLike =

&#x20;   bonusType.includes("promo") ||

&#x20;   bonusType.includes("free") ||

&#x20;   bonusType.includes("bonus bet") ||

&#x20;   bonusType.includes("bonus\_bet");



&#x20; if (promoLike) return "promo\_converter";



&#x20; if (goal.includes("middle") || tradeType.includes("middle")) {

&#x20;   return "middle";

&#x20; }



&#x20; return "arbitrage";

}



function marketFamily(value: unknown): "spread" | "total" | "moneyline" | "other" {

&#x20; const market = clean(value);



&#x20; if (market.includes("spread") || market.includes("run line") || market.includes("puck line")) {

&#x20;   return "spread";

&#x20; }



&#x20; if (market.includes("total") || market.includes("over under") || market.includes("over/under")) {

&#x20;   return "total";

&#x20; }



&#x20; if (market.includes("moneyline") || market === "ml") {

&#x20;   return "moneyline";

&#x20; }



&#x20; return "other";

}



function sameEvent(input: VerificationTradeInput): GateResult {

&#x20; const a = clean(input.legA.event);

&#x20; const b = clean(input.legB.event);



&#x20; if (!a || !b) {

&#x20;   return result("same\_event", "unknown", "Enter the event on both legs.");

&#x20; }



&#x20; if (a !== b) {

&#x20;   return result("same\_event", "fail", "Both legs must be the exact same event.");

&#x20; }



&#x20; return result("same\_event", "pass", "Both legs use the same event.");

}



function sameMarket(input: VerificationTradeInput): GateResult {

&#x20; const a = clean(input.legA.market);

&#x20; const b = clean(input.legB.market);



&#x20; if (!a || !b) {

&#x20;   return result("same\_market", "unknown", "Enter the market on both legs.");

&#x20; }



&#x20; if (a !== b) {

&#x20;   return result("same\_market", "fail", "Both legs must use the same market.");

&#x20; }



&#x20; return result("same\_market", "pass", "Both legs use the same market.");

}



function samePeriod(input: VerificationTradeInput): GateResult {

&#x20; const a = clean(input.legA.period);

&#x20; const b = clean(input.legB.period);



&#x20; if (!a || !b) {

&#x20;   return result("same\_period", "unknown", "Enter the period on both legs.");

&#x20; }



&#x20; if (a !== b) {

&#x20;   return result("same\_period", "fail", "Both legs must use the same period.");

&#x20; }



&#x20; return result("same\_period", "pass", "Both legs use the same period.");

}



function sameLine(input: VerificationTradeInput): GateResult {

&#x20; const family = marketFamily(input.legA.market || input.legB.market);



&#x20; if (family === "moneyline" || family === "other") {

&#x20;   return result("same\_line", "pass", "No line match is required for this market type.");

&#x20; }



&#x20; const lineA = input.legA.line;

&#x20; const lineB = input.legB.line;



&#x20; if (!finite(lineA) || !finite(lineB)) {

&#x20;   return result("same\_line", "unknown", "Enter the line on both legs.");

&#x20; }



&#x20; if (family === "spread") {

&#x20;   if (lineA !== -lineB) {

&#x20;     return result(

&#x20;       "same\_line",

&#x20;       "fail",

&#x20;       "Spread legs must use opposite-signed matching lines, such as -2.5 and +2.5.",

&#x20;     );

&#x20;   }



&#x20;   return result("same\_line", "pass", "Spread lines are opposite-signed matches.");

&#x20; }



&#x20; if (lineA !== lineB) {

&#x20;   return result(

&#x20;     "same\_line",

&#x20;     "fail",

&#x20;     "Total legs must use the same numeric line, such as Over 8.5 and Under 8.5.",

&#x20;   );

&#x20; }



&#x20; return result("same\_line", "pass", "Total lines match.");

}



function oppositeSides(input: VerificationTradeInput): GateResult {

&#x20; if (input.oppositeSideConfirmed) {

&#x20;   return result("opposite\_sides", "pass", "Opposite sides were explicitly confirmed.");

&#x20; }



&#x20; const a = normalizeSide(input.legA.side);

&#x20; const b = normalizeSide(input.legB.side);



&#x20; if (!a || !b) {

&#x20;   return result("opposite\_sides", "unknown", "Select or enter both sides.");

&#x20; }



&#x20; const pairs = new Set(\[

&#x20;   "over|under",

&#x20;   "under|over",

&#x20;   "yes|no",

&#x20;   "no|yes",

&#x20;   "home|away",

&#x20;   "away|home",

&#x20;   "teama|teamb",

&#x20;   "teamb|teama",

&#x20;   "optiona|optionb",

&#x20;   "optionb|optiona",

&#x20;   "favorite|underdog",

&#x20;   "underdog|favorite",

&#x20; ]);



&#x20; if (pairs.has(`${a}|${b}`)) {

&#x20;   return result("opposite\_sides", "pass", "The sides are recognized opposites.");

&#x20; }



&#x20; return result(

&#x20;   "opposite\_sides",

&#x20;   "unknown",

&#x20;   "Confirm the two sides are true opposite outcomes.",

&#x20; );

}



function oddsVerifiedLive(input: VerificationTradeInput, now: Date): GateResult {

&#x20; if (input.oddsVerifiedAt == null) {

&#x20;   return result(

&#x20;     "odds\_verified\_live",

&#x20;     "unknown",

&#x20;     "Click Re-verify after checking both odds live.",

&#x20;   );

&#x20; }



&#x20; const verifiedAt = new Date(input.oddsVerifiedAt).getTime();



&#x20; if (!Number.isFinite(verifiedAt)) {

&#x20;   return result("odds\_verified\_live", "unknown", "Odds verification time is invalid.");

&#x20; }



&#x20; const freshnessSeconds = input.oddsFreshnessSeconds ?? 30;

&#x20; const ageSeconds = (now.getTime() - verifiedAt) / 1000;



&#x20; if (ageSeconds < 0) {

&#x20;   return result("odds\_verified\_live", "unknown", "Odds verification time is in the future.");

&#x20; }



&#x20; if (ageSeconds > freshnessSeconds) {

&#x20;   return result(

&#x20;     "odds\_verified\_live",

&#x20;     "fail",

&#x20;     `Odds are stale. Re-verify within ${freshnessSeconds} seconds.`,

&#x20;   );

&#x20; }



&#x20; return result("odds\_verified\_live", "pass", "Odds were verified recently.");

}



function correctCalculator(input: VerificationTradeInput): GateResult {

&#x20; const used = clean(input.calculatorUsed);



&#x20; if (!used) {

&#x20;   return result("correct\_calculator", "unknown", "Calculator has not been selected or derived.");

&#x20; }



&#x20; const expected = expectedCalculatorFor(input);



&#x20; if (used !== expected) {

&#x20;   return result(

&#x20;     "correct\_calculator",

&#x20;     "fail",

&#x20;     `Use ${expected} for this goal and bonus type, not ${used}.`,

&#x20;   );

&#x20; }



&#x20; return result("correct\_calculator", "pass", `Calculator matches: ${expected}.`);

}



function stakeWithinBankroll(input: VerificationTradeInput): GateResult {

&#x20; const stakeA = input.legA.stake;

&#x20; const stakeB = input.legB.stake;



&#x20; if (!positive(stakeA) || !positive(stakeB)) {

&#x20;   return result("stake\_within\_bankroll", "unknown", "Enter positive stakes for both legs.");

&#x20; }



&#x20; if (!positive(input.bankroll)) {

&#x20;   return result("stake\_within\_bankroll", "unknown", "Enter bankroll to check exposure.");

&#x20; }



&#x20; const maxPct = input.maxStakePct ?? 5;

&#x20; const maxExposure = input.bankroll \* (maxPct / 100);

&#x20; const totalStake = stakeA + stakeB;



&#x20; if (totalStake > maxExposure) {

&#x20;   return result(

&#x20;     "stake\_within\_bankroll",

&#x20;     "fail",

&#x20;     `Total stake ${totalStake.toFixed(2)} exceeds ${maxPct}% bankroll exposure.`,

&#x20;   );

&#x20; }



&#x20; return result("stake\_within\_bankroll", "pass", "Total stake is within bankroll exposure limit.");

}



function rolloverUnderstood(input: VerificationTradeInput): GateResult {

&#x20; if (input.rolloverUnknownOrNA) {

&#x20;   return result("rollover\_understood", "pass", "Rollover is marked unknown or not applicable.");

&#x20; }



&#x20; const amountSet = finite(input.rolloverAmount) \&\& input.rolloverAmount >= 0;

&#x20; const multipleSet = finite(input.rolloverMultiple) \&\& input.rolloverMultiple >= 0;



&#x20; if (!amountSet || !multipleSet) {

&#x20;   return result(

&#x20;     "rollover\_understood",

&#x20;     "unknown",

&#x20;     "Enter rollover amount and multiple, or mark rollover unknown / N/A.",

&#x20;   );

&#x20; }



&#x20; return result("rollover\_understood", "pass", "Rollover inputs are present.");

}



function trackable(input: VerificationTradeInput): GateResult {

&#x20; const missing: string\[] = \[];



&#x20; if (!hasText(input.legA.bookId) \&\& !hasText(input.legA.bookName)) missing.push("Book A");

&#x20; if (!hasText(input.legB.bookId) \&\& !hasText(input.legB.bookName)) missing.push("Book B");

&#x20; if (!hasText(input.legA.event)) missing.push("event");

&#x20; if (!hasText(input.legA.market)) missing.push("market");

&#x20; if (!hasText(input.legA.period)) missing.push("period");

&#x20; if (!hasText(input.legA.side)) missing.push("side A");

&#x20; if (!hasText(input.legB.side)) missing.push("side B");

&#x20; if (!finite(input.legA.oddsAmerican)) missing.push("odds A");

&#x20; if (!finite(input.legB.oddsAmerican)) missing.push("odds B");

&#x20; if (!positive(input.legA.stake)) missing.push("stake A");

&#x20; if (!positive(input.legB.stake)) missing.push("stake B");



&#x20; if (missing.length > 0) {

&#x20;   return result("trackable", "fail", `Missing required tracking fields: ${missing.join(", ")}.`);

&#x20; }



&#x20; return result("trackable", "pass", "Trade has enough data to track.");

}



export function evaluateVerificationGate(

&#x20; id: VerificationGateId,

&#x20; input: VerificationTradeInput,

&#x20; now = new Date(),

): GateResult {

&#x20; switch (id) {

&#x20;   case "same\_event":

&#x20;     return sameEvent(input);

&#x20;   case "same\_market":

&#x20;     return sameMarket(input);

&#x20;   case "same\_period":

&#x20;     return samePeriod(input);

&#x20;   case "same\_line":

&#x20;     return sameLine(input);

&#x20;   case "opposite\_sides":

&#x20;     return oppositeSides(input);

&#x20;   case "odds\_verified\_live":

&#x20;     return oddsVerifiedLive(input, now);

&#x20;   case "correct\_calculator":

&#x20;     return correctCalculator(input);

&#x20;   case "stake\_within\_bankroll":

&#x20;     return stakeWithinBankroll(input);

&#x20;   case "rollover\_understood":

&#x20;     return rolloverUnderstood(input);

&#x20;   case "trackable":

&#x20;     return trackable(input);

&#x20;   default: {

&#x20;     const exhaustive: never = id;

&#x20;     return exhaustive;

&#x20;   }

&#x20; }

}



export function evaluateVerificationGates(

&#x20; input: VerificationTradeInput,

&#x20; now = new Date(),

): GateResult\[] {

&#x20; return GATE\_ORDER.map((id) => evaluateVerificationGate(id, input, now));

}



export function allVerificationGatesPass(

&#x20; input: VerificationTradeInput,

&#x20; now = new Date(),

): boolean {

&#x20; return evaluateVerificationGates(input, now).every((gate) => gate.status === "pass");

}

### 4. Add packages/core/src/verification-gates.test.ts

import { describe, expect, it } from "vitest";

import {

&#x20; allVerificationGatesPass,

&#x20; evaluateVerificationGate,

&#x20; evaluateVerificationGates,

&#x20; type VerificationTradeInput,

} from "./verification-gates";



const NOW = new Date("2026-05-20T12:00:00.000Z");



function passingTrade(overrides: Partial<VerificationTradeInput> = {}): VerificationTradeInput {

&#x20; const base: VerificationTradeInput = {

&#x20;   goal: "profit",

&#x20;   tradeType: "arbitrage",

&#x20;   bonusType: "cash",

&#x20;   calculatorUsed: "arbitrage",

&#x20;   bankroll: 10\_000,

&#x20;   maxStakePct: 5,

&#x20;   oddsVerifiedAt: new Date(NOW.getTime() - 10\_000),

&#x20;   oddsFreshnessSeconds: 30,

&#x20;   rolloverAmount: 0,

&#x20;   rolloverMultiple: 0,

&#x20;   rolloverUnknownOrNA: false,

&#x20;   oppositeSideConfirmed: true,

&#x20;   legA: {

&#x20;     bookId: "book-a",

&#x20;     bookName: "Book A",

&#x20;     event: "Team A vs Team B",

&#x20;     market: "moneyline",

&#x20;     period: "full game",

&#x20;     side: "home",

&#x20;     oddsAmerican: 120,

&#x20;     stake: 100,

&#x20;     line: null,

&#x20;   },

&#x20;   legB: {

&#x20;     bookId: "book-b",

&#x20;     bookName: "Book B",

&#x20;     event: "Team A vs Team B",

&#x20;     market: "moneyline",

&#x20;     period: "full game",

&#x20;     side: "away",

&#x20;     oddsAmerican: -110,

&#x20;     stake: 110,

&#x20;     line: null,

&#x20;   },

&#x20; };



&#x20; return {

&#x20;   ...base,

&#x20;   ...overrides,

&#x20;   legA: { ...base.legA, ...(overrides.legA ?? {}) },

&#x20;   legB: { ...base.legB, ...(overrides.legB ?? {}) },

&#x20; };

}



describe("verification gates", () => {

&#x20; it("passes all gates for a complete clean trade", () => {

&#x20;   const trade = passingTrade();



&#x20;   expect(allVerificationGatesPass(trade, NOW)).toBe(true);

&#x20; });



&#x20; it("fails same event when events differ", () => {

&#x20;   const gate = evaluateVerificationGate(

&#x20;     "same\_event",

&#x20;     passingTrade({ legB: { event: "Different Event" } }),

&#x20;     NOW,

&#x20;   );



&#x20;   expect(gate.status).toBe("fail");

&#x20; });



&#x20; it("returns unknown for missing event", () => {

&#x20;   const gate = evaluateVerificationGate(

&#x20;     "same\_event",

&#x20;     passingTrade({ legA: { event: "" } }),

&#x20;     NOW,

&#x20;   );



&#x20;   expect(gate.status).toBe("unknown");

&#x20; });



&#x20; it("passes spread line when signs are opposite", () => {

&#x20;   const gate = evaluateVerificationGate(

&#x20;     "same\_line",

&#x20;     passingTrade({

&#x20;       legA: { market: "spread", line: -2.5 },

&#x20;       legB: { market: "spread", line: 2.5 },

&#x20;     }),

&#x20;     NOW,

&#x20;   );



&#x20;   expect(gate.status).toBe("pass");

&#x20; });



&#x20; it("fails spread line when signs are not opposite", () => {

&#x20;   const gate = evaluateVerificationGate(

&#x20;     "same\_line",

&#x20;     passingTrade({

&#x20;       legA: { market: "spread", line: -2.5 },

&#x20;       legB: { market: "spread", line: -2.5 },

&#x20;     }),

&#x20;     NOW,

&#x20;   );



&#x20;   expect(gate.status).toBe("fail");

&#x20; });



&#x20; it("passes total line when the same numeric line is used", () => {

&#x20;   const gate = evaluateVerificationGate(

&#x20;     "same\_line",

&#x20;     passingTrade({

&#x20;       legA: { market: "total", side: "over", line: 8.5 },

&#x20;       legB: { market: "total", side: "under", line: 8.5 },

&#x20;       oppositeSideConfirmed: false,

&#x20;     }),

&#x20;     NOW,

&#x20;   );



&#x20;   expect(gate.status).toBe("pass");

&#x20; });



&#x20; it("fails stale odds", () => {

&#x20;   const gate = evaluateVerificationGate(

&#x20;     "odds\_verified\_live",

&#x20;     passingTrade({ oddsVerifiedAt: new Date(NOW.getTime() - 31\_000) }),

&#x20;     NOW,

&#x20;   );



&#x20;   expect(gate.status).toBe("fail");

&#x20; });



&#x20; it("fails when the wrong calculator is used for promo/free play", () => {

&#x20;   const gate = evaluateVerificationGate(

&#x20;     "correct\_calculator",

&#x20;     passingTrade({

&#x20;       bonusType: "promo free play",

&#x20;       calculatorUsed: "arbitrage",

&#x20;     }),

&#x20;     NOW,

&#x20;   );



&#x20;   expect(gate.status).toBe("fail");

&#x20; });



&#x20; it("fails when stake exposure is above bankroll limit", () => {

&#x20;   const gate = evaluateVerificationGate(

&#x20;     "stake\_within\_bankroll",

&#x20;     passingTrade({

&#x20;       bankroll: 1\_000,

&#x20;       maxStakePct: 5,

&#x20;       legA: { stake: 100 },

&#x20;       legB: { stake: 100 },

&#x20;     }),

&#x20;     NOW,

&#x20;   );



&#x20;   expect(gate.status).toBe("fail");

&#x20; });



&#x20; it("passes rollover gate when rollover is marked unknown or not applicable", () => {

&#x20;   const gate = evaluateVerificationGate(

&#x20;     "rollover\_understood",

&#x20;     passingTrade({

&#x20;       rolloverAmount: null,

&#x20;       rolloverMultiple: null,

&#x20;       rolloverUnknownOrNA: true,

&#x20;     }),

&#x20;     NOW,

&#x20;   );



&#x20;   expect(gate.status).toBe("pass");

&#x20; });



&#x20; it("fails trackable when required fields are missing", () => {

&#x20;   const gate = evaluateVerificationGate(

&#x20;     "trackable",

&#x20;     passingTrade({ legA: { stake: null } }),

&#x20;     NOW,

&#x20;   );



&#x20;   expect(gate.status).toBe("fail");

&#x20; });



&#x20; it("always returns exactly ten gates in product order", () => {

&#x20;   const gates = evaluateVerificationGates(passingTrade(), NOW);



&#x20;   expect(gates.map((gate) => gate.id)).toEqual(\[

&#x20;     "same\_event",

&#x20;     "same\_market",

&#x20;     "same\_period",

&#x20;     "same\_line",

&#x20;     "opposite\_sides",

&#x20;     "odds\_verified\_live",

&#x20;     "correct\_calculator",

&#x20;     "stake\_within\_bankroll",

&#x20;     "rollover\_understood",

&#x20;     "trackable",

&#x20;   ]);

&#x20; });

});

### 5. Replace apps/verifier/app/api/deep-link/route.ts

import { z } from "zod";

import { resolveBookUrl } from "@/lib/deep-links";



const QuerySchema = z.object({

&#x20; bookId: z.string().trim().min(1).max(128),

&#x20; sport: z.string().trim().min(1).max(64).default("default"),

&#x20; marketType: z.string().trim().min(1).max(64).default("default"),

&#x20; player: z.string().trim().max(200).optional(),

&#x20; team: z.string().trim().max(200).optional(),

&#x20; event: z.string().trim().max(300).optional(),

});



function isAllowedOrigin(origin: string | null): boolean {

&#x20; if (!origin) return true;



&#x20; try {

&#x20;   const parsed = new URL(origin);



&#x20;   if (parsed.protocol === "chrome-extension:") {

&#x20;     return true;

&#x20;   }



&#x20;   const localHosts = new Set(\["localhost", "127.0.0.1"]);



&#x20;   if (!localHosts.has(parsed.hostname)) {

&#x20;     return false;

&#x20;   }



&#x20;   return parsed.port === "3000" || parsed.port === "3001" || parsed.port === "";

&#x20; } catch {

&#x20;   return false;

&#x20; }

}



function baseHeaders(req: Request): Headers {

&#x20; const headers = new Headers();

&#x20; const origin = req.headers.get("origin");



&#x20; headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");

&#x20; headers.set("Access-Control-Allow-Headers", "Content-Type");

&#x20; headers.set("Cache-Control", "no-store");

&#x20; headers.set("Content-Type", "text/plain; charset=utf-8");

&#x20; headers.set("X-Content-Type-Options", "nosniff");



&#x20; if (origin \&\& isAllowedOrigin(origin)) {

&#x20;   headers.set("Access-Control-Allow-Origin", origin);

&#x20;   headers.set("Vary", "Origin");

&#x20; } else if (!origin) {

&#x20;   headers.set("Access-Control-Allow-Origin", "http://127.0.0.1:3001");

&#x20; }



&#x20; return headers;

}



function safeResolvedUrl(value: string | null): string {

&#x20; if (!value) return "about:blank";

&#x20; if (value === "about:blank") return value;



&#x20; try {

&#x20;   const parsed = new URL(value);



&#x20;   if (parsed.protocol !== "https:" \&\& parsed.protocol !== "http:") {

&#x20;     return "about:blank";

&#x20;   }



&#x20;   if (parsed.username || parsed.password) {

&#x20;     return "about:blank";

&#x20;   }



&#x20;   return parsed.toString();

&#x20; } catch {

&#x20;   return "about:blank";

&#x20; }

}



export async function OPTIONS(req: Request) {

&#x20; if (!isAllowedOrigin(req.headers.get("origin"))) {

&#x20;   return new Response("Forbidden origin", { status: 403 });

&#x20; }



&#x20; return new Response(null, {

&#x20;   status: 204,

&#x20;   headers: baseHeaders(req),

&#x20; });

}



export async function GET(req: Request) {

&#x20; if (!isAllowedOrigin(req.headers.get("origin"))) {

&#x20;   return new Response("Forbidden origin", { status: 403 });

&#x20; }



&#x20; const { searchParams } = new URL(req.url);

&#x20; const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));



&#x20; if (!parsed.success) {

&#x20;   return new Response("Invalid deep-link request", {

&#x20;     status: 400,

&#x20;     headers: baseHeaders(req),

&#x20;   });

&#x20; }



&#x20; const { bookId, sport, marketType, player, team, event } = parsed.data;



&#x20; const resolvedUrl = await resolveBookUrl(bookId, sport, marketType, {

&#x20;   player,

&#x20;   team,

&#x20;   event,

&#x20; });



&#x20; return new Response(safeResolvedUrl(resolvedUrl), {

&#x20;   status: 200,

&#x20;   headers: baseHeaders(req),

&#x20; });

}

### 6. Replace bookmap/client/src/utils/money.ts

export interface FormatCentsOptions {

&#x20; showCents?: boolean;

}



export type ParseMoneyResult =

&#x20; | { ok: true; cents: number }

&#x20; | { ok: false; cents: 0; reason: string };



export function fmtCents(cents: number, options: FormatCentsOptions = {}): string {

&#x20; const { showCents = true } = options;



&#x20; if (!Number.isFinite(cents)) {

&#x20;   return "$0.00";

&#x20; }



&#x20; return (cents / 100).toLocaleString("en-US", {

&#x20;   style: "currency",

&#x20;   currency: "USD",

&#x20;   minimumFractionDigits: showCents ? 2 : 0,

&#x20;   maximumFractionDigits: showCents ? 2 : 0,

&#x20; });

}



export function parseDollarsToCentsStrict(input: string): ParseMoneyResult {

&#x20; const value = input.trim();



&#x20; if (!value) {

&#x20;   return { ok: false, cents: 0, reason: "Money input is empty." };

&#x20; }



&#x20; const normalized = value.replace(/\[$,\\s]/g, "");



&#x20; if (!/^\\d+(\\.\\d{0,2})?$/.test(normalized)) {

&#x20;   return {

&#x20;     ok: false,

&#x20;     cents: 0,

&#x20;     reason: "Enter a positive dollar amount with at most two decimal places.",

&#x20;   };

&#x20; }



&#x20; const \[dollarPart, centPart = ""] = normalized.split(".");

&#x20; const dollars = Number.parseInt(dollarPart, 10);



&#x20; if (!Number.isSafeInteger(dollars)) {

&#x20;   return {

&#x20;     ok: false,

&#x20;     cents: 0,

&#x20;     reason: "Dollar amount is too large.",

&#x20;   };

&#x20; }



&#x20; const centsText = centPart.padEnd(2, "0");

&#x20; const cents = Number.parseInt(centsText || "0", 10);

&#x20; const total = dollars \* 100 + cents;



&#x20; if (!Number.isSafeInteger(total)) {

&#x20;   return {

&#x20;     ok: false,

&#x20;     cents: 0,

&#x20;     reason: "Cent amount is too large.",

&#x20;   };

&#x20; }



&#x20; return { ok: true, cents: total };

}



/\*\*

&#x20;\* Backward-compatible helper for existing callers.

&#x20;\*

&#x20;\* New form code should prefer parseDollarsToCentsStrict so invalid input can be

&#x20;\* shown to the user instead of silently becoming $0.

&#x20;\*/

export function parseDollarsToCents(input: string): number {

&#x20; const parsed = parseDollarsToCentsStrict(input);

&#x20; return parsed.ok ? parsed.cents : 0;

}

### 7. Add docs/QUALITY_GATES.md

\# PaperEdge Quality Gates



PaperEdge handles money-like calculations, bankroll movement, settlement review, and mistake diagnosis. Every change that touches calculations, verification, settlement, import, or bankroll state must pass these gates before merge.



\## Required commands



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





\---



### 8. Add `docs/SECURITY_AND_SAFETY_BOUNDARIES.md`



```md

\# PaperEdge Security and Safety Boundaries



PaperEdge is a local-first manual verification and paper trading review tool.



\## Non-negotiable boundaries



PaperEdge must not:



1\. Connect to sportsbook accounts.

2\. Scrape sportsbook odds, balances, account data, or tickets.

3\. Bypass geolocation.

4\. Bypass KYC or identity checks.

5\. Bypass sportsbook limits or account controls.

6\. Click sportsbook buttons.

7\. Place wagers.

8\. Auto-submit bets.

9\. Claim profit is guaranteed.

10\. Add a "real money mode" flag.

11\. Hide or remove the safety banner.



\## Allowed behavior



PaperEdge may:



1\. Let the user manually enter a trade.

2\. Let the user manually import or paste an opportunity.

3\. Calculate hedge stakes from user-provided odds.

4\. Compare expected vs actual results.

5\. Track paper trades.

6\. Track user-entered bankroll snapshots.

7\. Show a manual verification checklist.

8\. Open user-configured search/deep links.

9\. Let the user manually type observed odds, line, and liquidity.

10\. Show educational warnings about stale odds, rollover, and bankroll exposure.



\## Chrome extension boundary



The extension is allowed to:



\- Display a manual overlay.

\- Show the active PaperEdge opportunity.

\- Let the user type observed odds, line, liquidity, and notes.

\- Send the manually typed observation back to the local verifier app.



The extension is not allowed to:



\- Read sportsbook page odds automatically.

\- Read user account balances.

\- Click bet slips.

\- Submit wagers.

\- Log into accounts.

\- Bypass geolocation.

\- Bypass KYC.

\- Modify sportsbook pages beyond the PaperEdge overlay.



\## Local API boundary



Verifier APIs should assume local manual use.



Minimum protections:



\- Restrict CORS to localhost and known extension origins.

\- Validate all query params with Zod.

\- Reject unsafe URL schemes.

\- Return `no-store` responses for verifier utility endpoints.

\- Avoid storing secrets.

\- Avoid account credentials entirely.



\## Documentation rule



Any new feature that touches sportsbooks, prediction markets, odds, balances, or settlement must explicitly state whether it is:



\- Manual input only.

\- Paper trading only.

\- Local-only.

\- Educational.

\- A support view.



When in doubt, choose the safer interpretation.

### 9. Suggested package.json script patch



Do not blindly replace the whole root package.json without checking the existing file. Add or adapt these scripts at the root:



{

&#x20; "scripts": {

&#x20;   "test": "vitest run",

&#x20;   "test:watch": "vitest",

&#x20;   "build": "npm --workspace @paperedge/dashboard run build \&\& npm --workspace @paperedge/verifier run build",

&#x20;   "quality": "npm run test \&\& npm run build",

&#x20;   "dev:dashboard": "npm --workspace @paperedge/dashboard run dev",

&#x20;   "dev:verifier": "npm --workspace @paperedge/verifier run dev"

&#x20; }

}

### 10. Suggested .gitignore additions



Add these if not already present:



node\_modules

.next

dist

build

coverage

\*.tsbuildinfo



\# Local databases

\*.db

\*.db-journal

\*.sqlite

\*.sqlite3



\# Generated Prisma output if generated during install/build

lib/generated/prisma

packages/database/src/generated/prisma



\# Environment files

.env

.env.local

.env.\*.local



\# OS/editor

.DS\_Store

.vscode/\*

!.vscode/extensions.json

!.vscode/settings.json



If packages/database/src/generated/prisma is intentionally committed, remove it from this ignore list and document why.



## Implementation Steps

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



curl "http://127.0.0.1:3001/api/deep-link?bookId=test\&sport=default\&marketType=default"



Expected:



200

text/plain

about:blank or a safe resolved HTTP/HTTPS URL

no wildcard Access-Control-Allow-Origin: \*

Step 5 — Add docs



Add:



docs/QUALITY\_GATES.md

docs/SECURITY\_AND\_SAFETY\_BOUNDARIES.md

Step 6 — Update root scripts



Update root package.json with the script patch above.



Then run:



npm run quality

Step 7 — Remove stale generated artifacts



Check:



git ls-files | grep -E 'lib/generated/prisma|packages/database/src/generated/prisma|\\.db$|\\.sqlite'



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



## Testing Instructions

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

## What to Work on Next, in Order

1\. Verification gates and tests



This is the highest leverage because every other feature depends on trustworthy gate output.



Deliverable:



verification-gates.ts

verification-gates.test.ts

UI wired to disable Log/Lock until all gates pass

2\. Deep-link route hardening



This is small and reduces avoidable API risk.



Deliverable:



Zod validation

local-only CORS

safe URL scheme filtering

no-store response

3\. Money format migration plan



Do not immediately rewrite the entire database. First write the migration plan and stop new float usage.



Deliverable:



money representation decision

migration steps

helper functions

tests around cents conversion

4\. Settlement transaction audit



Settlement is where expected vs actual truth becomes permanent.



Deliverable:



transaction-backed settlement

duplicate settlement tests

bankroll snapshot tests

5\. Product surface cleanup



After correctness work, align routes with the build plan.



Deliverable:



Cockpit primary route

Dashboard as support view

import/queue/books/mistakes as supporting tools

removed or hidden dashboard-first distractions

6\. Documentation cleanup



After the above, make docs easier for future contributors and AI coding agents.



Deliverable:



docs/README.md

updated PAPEREDGE\_BUILD\_PLAN.md

clear deprecated/optional doc labels

## Final Recommendation



Do not add new betting surfaces, AI suggestions, prediction ranking, sportsbook integrations, account connections, or automation.



The next best move is to make PaperEdge boringly reliable:



Pure verification gates.

Exact money handling.

Safe manual deep links.

Transactional settlement.

One cockpit-first product loop.



That is the shortest path from “featureful local app” to “trusted tool the user can actually rely on.”
